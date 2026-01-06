// apps/Alarmas_extrusion/server/index.js
// Servidor web para HMI Extrusión (TK-1, TK-2, SIMA)
// - Express + Socket.IO
// - Modbus live cada 500 ms
// - Lecturas SQL (ficha técnica / dosificación / info) cada 5 s
// - POST /api/alarms    → inserta alarma + Telegram (LL/HH con anti-spam)
// - GET  /api/alarms    → historial agrupado por episodios
// - Cron 07:00 America/Lima → Excel de alarmas por correo + endpoints de debug

/* ────────────── DEPENDENCIAS ────────────── */
const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const cron = require('node-cron');
const axios = require('axios');
const nodemailer = require('nodemailer');
const ExcelJS = require('exceljs');
const sql = require('mssql');
const { format } = require('date-fns');
const { toZonedTime } = require('date-fns-tz');

/* ────────────── CONFIG / ENV ────────────── */
const PORT = process.env.PORT || 3080;
const TZ = 'America/Lima';

// Prefijo donde vive la app detrás del portal/proxy
const APP_BASE = process.env.APP_BASE || '/';
// Ruta de socket.io bajo el prefijo (debe coincidir con preload.js)
const SIO_PATH = APP_BASE.replace(/\/$/, '') + '/socket.io';

// MS-SQL (usa .env en prod)
const dbConfig = {
  server: process.env.SQL_HOST || '200.14.242.237',
  database: process.env.SQL_DB || 'Acabados_2022',
  user: process.env.SQL_USER || 'sa',
  password: process.env.SQL_PASSWORD || 'F1S4123$',
  options: {
    trustServerCertificate: true,
    cryptoCredentialsDetails: { minVersion: 'TLSv1.2' },
    serverName: ''
  },
  pool: { min: 0, max: 5, idleTimeoutMillis: 30000 }
};

// SMTP (usa .env en prod)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: {
    user: process.env.SMTP_USER || 'automatizacion@fisanet.com.pe',
    pass: process.env.SMTP_PASS || 'ozimiicqfgromorx'
  }
});
const MAIL_TO = process.env.MAIL_TO || 'fabad@fisanet.com.pe';

// Telegram (usa .env en prod)
const TG_TOKEN = process.env.TG_TOKEN || '7668553388:AAEI5MKHVEJFZhUKCiu04xQScTX02C32sS0';
const TG_CHAT_IDS = ['7874886232', '8152305830', '5931564360', '7507833879']
const ELEC_CHAT_ID = TG_CHAT_IDS[0]; // el primero = electricista

/* Anti-spam centralizado */
const SQL_TTL_MS = 60_000;         // inserción a SQL: máx 1/min por (extrusora|dispositivo|tipo)
const TG_TTL_MS = 30 * 60 * 1000; // Telegram para LL/HH: cada 30 min tras el primero

/* ────────────── SERVICIOS ────────────── */
const { initModbus } = require('./modbus');
const {
  readTK1DB, readTK2DB, readSIMADB,
  readFicha, readDosis, insertAlarma
} = require('./sql');

// Motor de alarmas (usa levels de server/alarm-config.js)
const AlarmEngine = require('./alarm-engine');

/* ────────────── Anti-spam compartido ────────────── */
const alertInfo = new Map(); // key -> { lastSql:number, lastTg:number }

/** Inserta alarma con anti-spam (lo usa el motor y el endpoint POST /api/alarms) */
async function upsertAlarmWithAntiSpam(data) {
  const payload = data || {}; // { extrusora, dispositivo, tipo, mensaje, valor_actual, valor_sp }
  const extrusora = String(payload.extrusora || '').toUpperCase();
  const dispositivo = String(payload.dispositivo || '');
  const tipo = String((payload.tipo ?? payload.level ?? '')).toUpperCase();
  if (!extrusora || !dispositivo || !tipo) return { ok: false, error: 'Payload inválido' };

  const key = `${extrusora}|${dispositivo}|${tipo}`;
  const now = Date.now();
  const rec = alertInfo.get(key) || { lastSql: 0, lastTg: 0 };

  let didSQL = false;
  let didTG = false;
  let tgWho = null; // 'all' | 'elec' | null

  // 1) SQL con TTL 1/min
  if (now - rec.lastSql >= SQL_TTL_MS) {
    await insertAlarma({
      extrusora,
      dispositivo,
      valor_actual: Number(payload.valor_actual),
      valor_sp: Number(payload.valor_sp),
      mensaje: payload.mensaje,
      tipo
    });
    rec.lastSql = now;
    didSQL = true;
  }

  // 2) Telegram solo HH/LL
  const isEdge = tipo === 'HH' || tipo === 'LL';
  if (isEdge) {
    const msg = `🚨 ${extrusora} | ${dispositivo} | ${payload.mensaje} (Valor ${payload.valor_actual} / SP ${payload.valor_sp})`;
    if (rec.lastTg === 0) {
      await sendTelegram(msg);                // primer disparo → a todos
      rec.lastTg = now; didTG = true; tgWho = 'all';
    } else if (now - rec.lastTg >= TG_TTL_MS && ELEC_CHAT_ID) {
      await sendTelegram(msg, [ELEC_CHAT_ID]); // ≥30 min → solo electricista
      rec.lastTg = now; didTG = true; tgWho = 'elec';
    }
  }

  alertInfo.set(key, rec);
  return {
    ok: true,
    didSQL, didTG, tgWho,
    nextSqlInMs: Math.max(0, SQL_TTL_MS - (now - rec.lastSql)),
    nextTgInMs: Math.max(0, TG_TTL_MS - (now - rec.lastTg))
  };
}

/* ────────────── APP / HTTP / SOCKET.IO ────────────── */
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  path: SIO_PATH,
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json());

// Todo lo público y APIs cuelgan del prefijo
const r = express.Router();

/** Caches para bootstrap inmediato */
const LAST_PLC = { tk1: {}, tk2: {}, sima: {} };
const LAST_DB = { tk1: {}, tk2: {}, sima: {} };

/* Instancia ÚNICA del motor (usa Socket.IO para emitir eventos y el helper para guardar/avisar) */
const alarmEngine = new AlarmEngine({ io, insertAlarmFn: upsertAlarmWithAntiSpam });

/** Intercepta io.emit para capturar lo último enviado y alimentar el motor */
const _ioEmit = io.emit.bind(io);
io.emit = function (event, payload) {
  try {
    if (event === 'plc-data' && payload && typeof payload === 'object') {
      LAST_PLC.tk1 = { ...(payload.tk1 || {}) };
      LAST_PLC.tk2 = { ...(payload.tk2 || {}) };
      LAST_PLC.sima = { ...(payload.sima || {}) };
      try { alarmEngine.feed(payload); } catch (e) { console.error('[alarm-engine]', e.message || e); }
    } else if (event === 'db-data' && payload && typeof payload === 'object') {
      LAST_DB.tk1 = { ...(payload.tk1 || {}) };
      LAST_DB.tk2 = { ...(payload.tk2 || {}) };
      LAST_DB.sima = { ...(payload.sima || {}) };
    }
  } catch { }
  return _ioEmit(event, payload);
};

/* Estáticos: UI */
const WEB_ROOT = path.resolve(__dirname, '..', 'public');
r.use(express.static(WEB_ROOT));

/* Salud */
r.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

/* ────────────── TELEGRAM helpers ────────────── */
async function sendTelegram(text, ids = TG_CHAT_IDS) {
  if (!TG_TOKEN) {
    console.warn('[TG] Token vacío; se omite envío.');
    return { sent: false, reason: 'NO_TOKEN' };
  }
  const results = [];
  for (const id of ids) {
    try {
      const r = await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
        chat_id: id, text
      });
      results.push({ id, ok: true, status: r.status });
      console.log('[TG] enviado →', id);
    } catch (e) {
      const desc = e.response?.data?.description || e.message;
      results.push({ id, ok: false, error: desc });
      console.error('[TG] error →', id, e.response?.data || e.message);
    }
  }
  return { sent: true, results };
}

/* ────────────── DEBUG endpoints ────────────── */
// 1) Info del bot (getMe)
r.get('/api/debug/getme', async (_req, res) => {
  try {
    if (!TG_TOKEN) return res.status(400).json({ ok: false, error: 'NO_TOKEN' });
    const r2 = await axios.get(`https://api.telegram.org/bot${TG_TOKEN}/getMe`);
    res.json(r2.data);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.response?.data || e.message });
  }
});

// 2) Envío manual de Telegram para pruebas
r.get('/api/debug/telegram', async (req, res) => {
  const ids = (req.query.to || '').split(',').map(s => s.trim()).filter(Boolean);
  const text = req.query.text || '🧪 Prueba desde extrusion-web';
  try {
    const out = await sendTelegram(text, ids.length ? ids : TG_CHAT_IDS);
    res.json({ ok: true, ...out });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 3) Simular una alarma completa (reusa el endpoint real)
r.post('/api/debug/alarm', async (req, res) => {
  try {
    const base = `http://localhost:${PORT}${APP_BASE}`;
    const resp = await axios.post(`${base}/api/alarms`, req.body, { validateStatus: () => true });
    res.status(resp.status).json(resp.data);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

r.get('/api/snapshot', (_req, res) => {
  res.json({ plc: LAST_PLC, db: LAST_DB, alarms: alarmEngine.getActive?.() || [] });
});

/* ────────────── SOCKET.IO ────────────── */
io.on('connection', socket => {
  console.log('[IO] cliente conectado:', socket.id);
  try {
    const hasPLC = Object.keys(LAST_PLC.tk1).length ||
      Object.keys(LAST_PLC.tk2).length ||
      Object.keys(LAST_PLC.sima).length;
    if (hasPLC) socket.emit('plc-data', LAST_PLC);

    const hasDB = Object.keys(LAST_DB.tk1).length ||
      Object.keys(LAST_DB.tk2).length ||
      Object.keys(LAST_DB.sima).length;
    if (hasDB) socket.emit('db-data', LAST_DB);
    const actives = alarmEngine.getActive?.() || [];
    actives.forEach(a => socket.emit('alarm-fired', a));
  } catch { }
  socket.on('disconnect', () => console.log('[IO] cliente desconectado:', socket.id));
});

// Inicia el lazo Modbus con antisolape y expone /api/plc bajo el router con prefijo
const modbus = initModbus({ io, app: r, pollMs: 500 });

// Cierre limpio
process.on('SIGINT', () => {
  try { modbus.stop(); } catch { }
  server.close(() => process.exit(0));
});

/* ────────────── SQL LIVE (cada 5 s) ────────────── */
async function loadSqlData() {
  try {
    const [f1, f2, f3] = await Promise.all([
      readFicha('EXT-TK-01'), readFicha('EXT-TK02'), readFicha('EXT-SI-01')
    ]);
    const [d1, d2, d3] = await Promise.all([
      readDosis('EXT-TK-01'), readDosis('EXT-TK02'), readDosis('EXT-SI-01')
    ]);
    const [i1, i2, i3] = await Promise.all([
      typeof readTK1DB === 'function' ? readTK1DB() : {},
      typeof readTK2DB === 'function' ? readTK2DB() : {},
      typeof readSIMADB === 'function' ? readSIMADB() : {}
    ]);

    io.emit('db-data', {
      tk1: { info: i1 || {}, ficha: f1 || {}, dosis: d1 || {} },
      tk2: { info: i2 || {}, ficha: f2 || {}, dosis: d2 || {} },
      sima: { info: i3 || {}, ficha: f3 || {}, dosis: d3 || {} }
    });
  } catch (e) {
    console.error('[SQL live]', e.message || e);
  }
}
setInterval(loadSqlData, 5000);

/* ────────────── API: Insertar alarma + Telegram con anti-spam ────────────── */
r.post('/api/alarms', async (req, res) => {
  try {
    const out = await upsertAlarmWithAntiSpam(req.body || {});
    if (!out.ok) return res.status(400).json(out);
    res.json(out);
  } catch (e) {
    console.error('[insert-alarm]', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ────────────── API: Historial por episodios ────────────── */
r.get('/api/alarms', async (req, res) => {
  try {
    const { from, to } = req.query; // YYYY-MM-DD
    if (!from || !to) return res.status(400).json({ ok: false, error: 'from y to son requeridos (YYYY-MM-DD)' });

    const fromDate = new Date(`${from}T00:00:00`);
    const toDate = new Date(`${to}T23:59:59`);

    const pool = await sql.connect(dbConfig);
    const { recordset } = await pool.request()
      .input('fromDate', sql.DateTime, fromDate)
      .input('toDate', sql.DateTime, toDate)
      .query(`
        SELECT  extrusora,
                dispositivo,
                valor_actual,
                valor_sp,
                DATEADD(MINUTE, DATEDIFF(MINUTE, 0, fecha_hora), 0) AS fecha_min
          FROM dbo.alarma_extrusion
         WHERE fecha_hora BETWEEN @fromDate AND @toDate
         ORDER BY extrusora, dispositivo, fecha_min
      `);

    // Agrupar contiguos por minuto
    const evts = [];
    let cur = null;
    for (const r of recordset) {
      const ts = new Date(r.fecha_min);
      if (!cur ||
        r.extrusora !== cur.extrusora ||
        r.dispositivo !== cur.dispositivo ||
        ts - cur.lastTs > 60_000) {
        if (cur) evts.push(cur);
        cur = {
          extrusora: r.extrusora,
          dispositivo: r.dispositivo,
          firstTs: ts,
          lastTs: ts,
          maxPV: r.valor_actual,
          minPV: r.valor_actual,
          setpoint: r.valor_sp
        };
      } else {
        cur.lastTs = ts;
        if (r.valor_actual > cur.maxPV) cur.maxPV = r.valor_actual;
        if (r.valor_actual < cur.minPV) cur.minPV = r.valor_actual;
      }
    }
    if (cur) evts.push(cur);

    const payload = evts
      .map(e => {
        const highAlarm = e.maxPV - e.setpoint >= e.setpoint - e.minPV;
        const inicioISO = e.firstTs.toISOString();
        const finISO = e.lastTs.toISOString();
        const durMs = (e.lastTs - e.firstTs);
        const duracion = `${Math.floor(durMs / 60000)}m ${Math.round((durMs % 60000) / 1000)}s`;
        return {
          extrusora: e.extrusora,
          dispositivo: e.dispositivo,
          valor_registrado: highAlarm ? e.maxPV : e.minPV,
          valor_seteado: e.setpoint,
          inicio: inicioISO,
          fin: finISO,
          duracion
        };
      })
      .sort((a, b) => new Date(b.inicio) - new Date(a.inicio));

    res.json({ ok: true, data: payload });
  } catch (e) {
    console.error('[historial]', e);
    res.status(500).json({ ok: false, error: e.message, data: [] });
  }
});

/* ────────────── Helper: Excel (+5 h visuales) ────────────── */
async function buildExcel(events) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Alarmas');

  ws.columns = [
    { header: 'Extrusora', key: 'ex', width: 12 },
    { header: 'Dispositivo', key: 'dev', width: 25 },
    { header: 'Valor Extremo', key: 'pv', width: 14 },
    { header: 'Valor Seteado', key: 'sv', width: 14 },
    { header: 'Inicio de Alarma', key: 'ini', width: 20 },
    { header: 'Fin de Alarma', key: 'fin', width: 20 },
    { header: 'Duración', key: 'dur', width: 16 },
    { header: 'Intensidad', key: 'tipo', width: 12 }
  ];

  const OFFSET_MS = 5 * 60 * 60 * 1000; // +5 h visuales
  const safeFmt = iso => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return format(new Date(d.getTime() + OFFSET_MS), 'dd/MM/yyyy HH:mm');
  };

  for (const e of events) {
    const diff = Math.abs((e.valor_registrado ?? 0) - (e.valor_seteado ?? 0));
    const tipo = diff >= 8 ? 'HH/LL' : diff >= 4 ? 'H/L' : 'N/A';

    ws.addRow({
      ex: e.extrusora,
      dev: e.dispositivo,
      pv: e.valor_registrado,
      sv: e.valor_seteado,
      ini: safeFmt(e.inicio),
      fin: safeFmt(e.fin),
      dur: e.duracion,
      tipo
    });
  }

  ws.getRow(1).font = { bold: true };
  return wb.xlsx.writeBuffer();
}

/* ────────────── CRON: 07:00 Lima — Excel de alarmas de ayer ────────────── */
cron.schedule('0 7 * * *', async () => {
  try {
    console.log('[CRON] Generando y enviando Excel diario…');
    const nowZ = toZonedTime(new Date(), TZ);
    const y = new Date(nowZ.getTime() - 24 * 60 * 60 * 1000);
    const from = format(y, 'yyyy-MM-dd');
    const to = format(y, 'yyyy-MM-dd');

    // Reutiliza la misma consulta que /api/alarms
    const pool = await sql.connect(dbConfig);
    const { recordset } = await pool.request()
      .input('fromDate', sql.DateTime, new Date(`${from}T00:00:00`))
      .input('toDate', sql.DateTime, new Date(`${to}T23:59:59`))
      .query(`
        SELECT  extrusora,
                dispositivo,
                valor_actual,
                valor_sp,
                DATEADD(MINUTE, DATEDIFF(MINUTE, 0, fecha_hora), 0) AS fecha_min
          FROM dbo.alarma_extrusion
         WHERE fecha_hora BETWEEN @fromDate AND @toDate
         ORDER BY extrusora, dispositivo, fecha_min
      `);

    // Agrupar igual:
    const evts = [];
    let cur = null;
    for (const r of recordset) {
      const ts = new Date(r.fecha_min);
      if (!cur ||
        r.extrusora !== cur.extrusora ||
        r.dispositivo !== cur.dispositivo ||
        ts - cur.lastTs > 60_000) {
        if (cur) evts.push(cur);
        cur = {
          extrusora: r.extrusora,
          dispositivo: r.dispositivo,
          firstTs: ts,
          lastTs: ts,
          maxPV: r.valor_actual,
          minPV: r.valor_actual,
          setpoint: r.valor_sp
        };
      } else {
        cur.lastTs = ts;
        if (r.valor_actual > cur.maxPV) cur.maxPV = r.valor_actual;
        if (r.valor_actual < cur.minPV) cur.minPV = r.valor_actual;
      }
    }
    if (cur) evts.push(cur);

    const events = evts.map(e => {
      const highAlarm = e.maxPV - e.setpoint >= e.setpoint - e.minPV;
      return {
        extrusora: e.extrusora,
        dispositivo: e.dispositivo,
        valor_registrado: highAlarm ? e.maxPV : e.minPV,
        valor_seteado: e.setpoint,
        inicio: e.firstTs.toISOString(),
        fin: e.lastTs.toISOString(),
        duracion: `${Math.floor((e.lastTs - e.firstTs) / 60000)}m ${Math.round(((e.lastTs - e.firstTs) % 60000) / 1000)}s`
      };
    });

    const buf = await buildExcel(events);

    await transporter.verify();
    await transporter.sendMail({
      from: process.env.SMTP_USER || 'automatizacion@fisanet.com.pe',
      to: MAIL_TO,
      subject: `Alarmas Extrusión – ${from}`,
      text: `Adjunto reporte de alarmas de ${from}.`,
      attachments: [{ filename: `alarmas_${from}.xlsx`, content: Buffer.from(buf) }]
    });

    console.log('[CRON] Correo enviado.');
  } catch (e) {
    console.error('[CRON] Error:', e.message || e);
  }
}, { timezone: TZ });

/* ────────────── Fallback SPA (dentro del prefijo) ────────────── */
// Excluye /api y /socket.io para no romper API ni Socket.IO.
r.get(/^(?!\/(?:api|socket\.io)\/).*/, (_req, res) => {
  res.sendFile(path.join(WEB_ROOT, 'index.html'));
});

// Monta el router bajo el prefijo (¡IMPORTANTE!)
app.use(APP_BASE, r);

/* ────────────── START ────────────── */
server.listen(PORT, () => {
  const tokenMask = TG_TOKEN ? TG_TOKEN.slice(0, 10) + '…' : '(vacío)';
  console.log(`▶ Server escuchando en http://localhost:${PORT}${APP_BASE}`);
  console.log(`↪ Socket.IO path: ${SIO_PATH}`);
  console.log(`[TG] Bot token: ${tokenMask} | chatIDs: ${TG_CHAT_IDS.join(', ')}`);
});

// Errores no capturados
process.on('unhandledRejection', err => console.error('[unhandledRejection]', err));
process.on('uncaughtException', err => console.error('[uncaughtException]', err));
