// apps/Alarmas_extrusion/public/preload.js
// Bridge web → expone window.electronAPI similar a tu app Electron.
// ⚠️ En index.html CARGA antes el cliente de Socket.IO:
//    <script src="/apps/extrusion/socket.io/socket.io.js"></script>
//    (ajusta el prefijo si cambias APP_BASE)

(() => {
  /* ───────────────────────── Config ───────────────────────── */
  // Todo lo que salga del portal para esta app vive bajo /apps/extrusion
  // (si el día de mañana cambia el prefijo, basta sobreescribir window.__APP_BASE__)
  const APP_BASE = (window.__APP_BASE__ !== undefined ? window.__APP_BASE__ : '/apps/extrusion');

  // URL base absoluta para construir endpoints
  const APP_BASE_URL = new URL(
    // asegura una sola barra final
    APP_BASE.replace(/\/$/, '') + '/',
    window.location.origin
  );

  /* ───────────────────────── Validación ───────────────────────── */
  if (typeof window.io !== 'function') {
    console.error('[preload] Falta el cliente de Socket.IO. Agrega <script src="' +
      APP_BASE.replace(/\/$/, '') + '/socket.io/socket.io.js"></script> antes de preload.js');
    // Creamos un stub para evitar que el renderer reviente
    window.electronAPI = {
      onPlcData: () => { },
      onDbData: () => { },
      onAlarmFired: () => { },
      onAlarmCleared: () => { },
      insertAlarm: async () => ({ ok: false, error: 'NO_SOCKETIO' }),
      getHistoricalAlarms: async () => [],
      ping: async () => ({ ok: false }),
      __version: 'web-preload/1.4.0-snapshot'
    };
    return;
  }

  /* ───────────────────── Conexión Socket.IO ───────────────────── */
  const socket = io('/', {
    path: window.__SOCKET_PATH__ || (APP_BASE.replace(/\/$/, '') + '/socket.io'),
    transports: ['polling'],   // ← solo polling (estable detrás del proxy)
    upgrade: false,            // ← no intentes WS directo
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
    reconnectionDelayMax: 4000,
    timeout: 10000
  });

  const DEBUG = true; // cambia a false si no quieres logs

  // Logs de estado
  socket.on('connect', () => {
    if (DEBUG) console.log('[IO] conectado:', socket.id);
    maybeLoadSnapshot();
  });
  socket.on('disconnect', (r) => {
    if (DEBUG) console.log('[IO] desconectado:', r);
  });
  socket.on('reconnect_attempt', (n) => {
    if (DEBUG) console.log('[IO] reintento #', n);
  });
  socket.on('reconnect', () => {
    if (DEBUG) console.log('[IO] reconnect (socket)');
    maybeLoadSnapshot();
  });
  socket.io.on('reconnect', () => {
    if (DEBUG) console.log('[IO] reconnect (manager)');
    maybeLoadSnapshot();
  });
  socket.on('connect_error', (err) => {
    console.warn('[IO] connect_error:', err?.message || err);
  });

  /* ─────────────────── Helpers & normalización ─────────────────── */
  const safe = v => (v && typeof v === 'object') ? v : {};
  const safeTriple = (payload) => {
    const { tk1 = {}, tk2 = {}, sima = {} } = payload || {};
    return { tk1: safe(tk1), tk2: safe(tk2), sima: safe(sima) };
  };

  // Construye URLs dentro de /apps/extrusion
  const buildUrl = (path, params = {}) => {
    // Permite pasar tanto 'api/...' como '/api/...'
    const p = String(path || '').replace(/^\//, '');
    const u = new URL(p, APP_BASE_URL);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, v);
    });
    return u.toString();
  };

  const safeCall = (cb, data, tag) => {
    try { cb(data); }
    catch (e) { console.error(`[preload] callback ${tag} error:`, e); }
  };

  /* ─────────────── Snapshot inmediato (bootstrap) ─────────────── */
  let _plcCb = null;
  let _dbCb = null;
  let _alarmFiredCb = null;
  let _snapshotInFlight = false;

  async function loadSnapshot() {
    try {
      _snapshotInFlight = true;
      const r = await fetch(buildUrl('/api/snapshot'));
      const j = await r.json().catch(() => ({}));

      // PLC
      if (j && j.plc && _plcCb) {
        const pack = safeTriple(j.plc);
        if (DEBUG) console.log('[BOOT] snapshot plc', {
          tk1: Object.keys(pack.tk1).length,
          tk2: Object.keys(pack.tk2).length,
          sima: Object.keys(pack.sima).length
        });
        safeCall(_plcCb, pack, 'onPlcData(snapshot)');
      }

      // DB
      if (j && j.db && _dbCb) {
        const out = { tk1: safe(j.db.tk1), tk2: safe(j.db.tk2), sima: safe(j.db.sima) };
        if (DEBUG) console.log('[BOOT] snapshot db', {
          tk1: Object.keys(out.tk1).length,
          tk2: Object.keys(out.tk2).length,
          sima: Object.keys(out.sima).length
        });
        safeCall(_dbCb, out, 'onDbData(snapshot)');
      }
      // ALARMAS activas (replay inicial)
      if (Array.isArray(j?.alarms) && _alarmFiredCb) {
        if (DEBUG) console.log('[BOOT] snapshot alarms', j.alarms.length);
        j.alarms.forEach(a => safeCall(_alarmFiredCb, a, 'onAlarmFired(snapshot)'));
      }
    } catch (e) {
      if (DEBUG) console.warn('[BOOT] snapshot error:', e.message || e);
    } finally {
      _snapshotInFlight = false;
    }
  }

  function maybeLoadSnapshot() {
    // Solo cuando haya al menos un callback registrado; evita pedir varias veces en paralelo
    if ((_plcCb || _dbCb) && !_snapshotInFlight) {
      loadSnapshot();
    }
  }

  /* ───────────────────────── API pública ───────────────────────── */
  window.electronAPI = {
    /** Suscripción a datos Modbus live (plc-data) */
    onPlcData(cb) {
      _plcCb = cb; // guardar para poder enviar snapshot por HTTP
      socket.off('plc-data');
      socket.on('plc-data', (payload) => {
        const pack = safeTriple(payload);
        if (DEBUG) {
          console.log('[PLC] recibido',
            {
              tk1: Object.keys(pack.tk1).length,
              tk2: Object.keys(pack.tk2).length,
              sima: Object.keys(pack.sima).length
            });
        }
        safeCall(cb, pack, 'onPlcData');
      });

      // Si ya hay conexión activa, intenta snapshot inmediato
      if (socket.connected) maybeLoadSnapshot();
    },

    /** Suscripción a datos SQL (ficha técnica / dosificación / info) */
    onDbData(cb) {
      _dbCb = cb; // guardar para snapshot por HTTP
      socket.off('db-data');
      socket.on('db-data', (payload) => {
        const data = safe(payload);
        // Normaliza siempre a { tk1:{}, tk2:{}, sima:{} }
        const out = {
          tk1: safe(data.tk1),
          tk2: safe(data.tk2),
          sima: safe(data.sima)
        };
        if (DEBUG) {
          const c = {
            tk1: Object.keys(out.tk1 || {}).length,
            tk2: Object.keys(out.tk2 || {}).length,
            sima: Object.keys(out.sima || {}).length
          };
          console.log('[DB] recibido', c);
        }
        safeCall(cb, out, 'onDbData');
      });

      // Si ya hay conexión activa, intenta snapshot inmediato
      if (socket.connected) maybeLoadSnapshot();
    },

    /** Inserta una alarma (el backend decide si envía Telegram con anti-spam) */
    async insertAlarm(payload) {
      try {
        const r = await fetch(buildUrl('/api/alarms'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload || {})
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        if (DEBUG) console.log('[API] insertAlarm ok', j);
        return j;
      } catch (e) {
        console.error('[API] insertAlarm error:', e.message || e);
        throw e;
      }
    },

    /** Historial de alarmas → devuelve SIEMPRE un array como en Electron */
    async getHistoricalAlarms(from, to) {
      try {
        const r = await fetch(buildUrl('/api/alarms', { from, to }));
        const j = await r.json().catch(() => ({}));
        // El backend web responde { ok, data:[...] } — normalizamos a []
        const arr = Array.isArray(j) ? j : (Array.isArray(j?.data) ? j.data : []);
        if (DEBUG) console.log('[API] historial items:', arr.length);
        return arr;
      } catch (e) {
        console.error('[API] historial error:', e.message || e);
        return [];
      }
    },

    /** Eventos del motor de alarmas (server-side) */
    onAlarmFired(cb) {
      _alarmFiredCb = cb;                // ← guardar para usar con snapshot
      socket.off('alarm-fired');
      socket.on('alarm-fired', cb);
    },
    onAlarmCleared(cb) { socket.off('alarm-cleared'); socket.on('alarm-cleared', cb); },

    /** Opcional: pequeño ping para diagnósticos desde consola */
    async ping() {
      try {
        const r = await fetch(buildUrl('/health'));
        return await r.json();
      } catch {
        return { ok: false };
      }
    },

    /** Solo informativo */
    __version: 'web-preload/1.4.0-snapshot'
  };
})();
