/**
 * --------------------------------------------------------------------
 *  Servicio de BD – producto/OT, ficha técnica, dosificación y alarmas
 *  para TK-1, TK-2 y SIMA (versión para extrusion-web\server)
 * --------------------------------------------------------------------
 *  Requiere:  npm i mssql
 * --------------------------------------------------------------------
 */
const sql = require('mssql');

// ─────────────────────────────────────────────────────────────────────
// 1) CONFIGURACIÓN DE CONEXIÓN
//    (puedes sobreescribir con variables de entorno si quieres)
// ─────────────────────────────────────────────────────────────────────
const dbConfig = {
  server   : process.env.SQL_SERVER   || '200.14.242.237',
  database : process.env.SQL_DATABASE || 'Acabados_2022',
  user     : process.env.SQL_USER     || 'sa',
  password : process.env.SQL_PASSWORD || 'F1S4123$',
  options  : {
    trustServerCertificate: true,
    cryptoCredentialsDetails: { minVersion: 'TLSv1.2' },
    serverName: ''
  },
  pool     : { min: 0, max: 5, idleTimeoutMillis: 30_000 }
};

let poolPromise;
async function getPool () {
  if (!poolPromise) {
    poolPromise = sql.connect(dbConfig).catch(err => {
      console.error('[SQL] pool error:', err.message);
      poolPromise = undefined;
      throw err;
    });
  }
  return poolPromise;
}

// ---------------------------------------------------------------------
// 2) LECTURA DE PRODUCTO / OT
// ---------------------------------------------------------------------
async function readInfo (ct) {
  try {
    const pool = await getPool();
    const { recordset } = await pool.request()
      .input('ct', sql.VarChar(20), ct)
      .query(`
        SELECT pronom, otcod
          FROM Medidores_2023.dbo.VIEW_PRD_SCADA005
         WHERE ctcod = @ct`);
    if (!recordset[0]) return {};
    const { pronom, otcod } = recordset[0];
    return {
      producto: pronom?.trim() || '',
      ot      : otcod?.trim()   || ''
    };
  } catch (err) {
    console.error('[SQL] readInfo error:', err.message);
    return {};
  }
}

// ---------------------------------------------------------------------
// 3) LECTURA DE FICHA TÉCNICA
// ---------------------------------------------------------------------
const fichaCods = {
  line:'0009', estiraje:'0008', bomba:'0073', seg:'0069',
  trab:'0070', cabeza:'0071', tAgua:'0036', hEstiro1:'0039',hEstiro2:'0039',
  tol1:'0040', tol2:'0041', tol3:'0042', tol4:'0044', chiller:'0062', 
  tEnfriamiento:'0067', hEstab1:'0038' ,hEstab2:'0038'
};

async function readFicha (ct) {
  try {
    const pool  = await getPool();
    const codes = Object.values(fichaCods).map(c => `'${c}'`).join(',');
    const { recordset } = await pool.request()
      .input('ct', sql.VarChar(20), ct)
      .query(`
        SELECT a.caftcod, a.Valor
          FROM Medidores_2023.dbo.VIEW_PRD_SCADA004 a
     INNER JOIN Medidores_2023.dbo.VIEW_PRD_SCADA005 b ON a.ftcod = b.ftcod
         WHERE b.ctcod = @ct AND a.caftcod IN (${codes})`);
    const map = {};
    recordset.forEach(r => { map[r.caftcod] = r.Valor?.trim(); });

    return Object.fromEntries(
      Object.entries(fichaCods).map(([k, code]) => [k, map[code] || ''])
    );
  } catch (err) {
    console.error('[SQL] readFicha error:', err.message);
    return {};
  }
}

// ---------------------------------------------------------------------
// 4) LECTURA DE DOSIFICACIÓN  (con fallback de códigos)
// ---------------------------------------------------------------------
const dosisCandidates = {
  hdpe : ['0051', '0040'],
  vista: ['0052', '0041'],
  uv   : ['0053', '0042'],
  color: ['0054', '0044']
};

async function readDosis (ct) {
  try {
    const pool = await getPool();
    const flatCodes = [...new Set(Object.values(dosisCandidates).flat())];
    const codeList  = flatCodes.map(c => `'${c}'`).join(',');

    const { recordset } = await pool.request()
      .input('ct', sql.VarChar(20), ct)
      .query(`
        SELECT a.caftcod, a.Valor
          FROM Medidores_2023.dbo.VIEW_PRD_SCADA004 a
     INNER JOIN Medidores_2023.dbo.VIEW_PRD_SCADA005 b ON a.ftcod = b.ftcod
         WHERE b.ctcod = @ct AND a.caftcod IN (${codeList})`);

    const raw = {};
    recordset.forEach(r => { raw[r.caftcod] = r.Valor?.trim(); });

    const out = {};
    for (const [field, list] of Object.entries(dosisCandidates)) {
      const pick = list.find(code => raw[code]);
      out[field] = pick ? raw[pick] : '';
    }
    return out;
  } catch (err) {
    console.error('[SQL] readDosis error:', err.message);
    return {};
  }
}

// ---------------------------------------------------------------------
// 5) INSERTAR ALARMA EN BD  (fecha_hora = GETDATE() completo)
// ---------------------------------------------------------------------
async function insertAlarma ({
  extrusora,          // "TK1", "TK2" o "SIMA"
  dispositivo,
  valor_actual,
  valor_sp,
  mensaje,
  tipo                // 'LL','L','H' o 'HH'
}) {
  try {
    const pool = await getPool();
    await pool.request()
      .input('extrusora',    sql.NVarChar(10),  extrusora)
      .input('dispositivo',  sql.NVarChar(100), dispositivo)
      .input('valor_actual', sql.Float,         valor_actual)
      .input('valor_sp',     sql.Float,         valor_sp)
      .input('mensaje',      sql.NVarChar(255), mensaje)
      .input('tipo',         sql.NChar(2),      tipo)
      .query(`
        INSERT INTO dbo.alarma_extrusion
              (extrusora, dispositivo,
               valor_actual, valor_sp,
               mensaje, tipo,
               fecha_hora)
        VALUES
              (@extrusora, @dispositivo,
               @valor_actual, @valor_sp,
               @mensaje, @tipo,
               GETDATE())
      `);
  } catch (err) {
    console.error('[SQL] insertAlarma error:', err.message);
  }
}


// ---------------------------------------------------------------------
// 6) EXPORTS
// ---------------------------------------------------------------------
module.exports = {
  /* lecturas realtime */
  readTK1DB  : () => readInfo('EXT-TK-01'),
  readTK2DB  : () => readInfo('EXT-TK02'),
  readSIMADB : () => readInfo('EXT-SI-01'),

  readFicha,
  readDosis,

  /* inserción de alarmas */
  insertAlarma,

  /* opcionalmente expón el pool para health-checks en tu server */
  getPool
};
