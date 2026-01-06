const sql = require('mssql');
require('dotenv').config();

// Configuración base compartida
const baseConfig = {
  server: process.env.SQL_SERVER || '200.14.242.237',
  user: process.env.SQL_USER || 'sa',
  password: process.env.SQL_PASSWORD || 'F1S4123$',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
    connectTimeout: 30000,
    requestTimeout: 30000
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

// Pool para Acabados_2022
const acabadosConfig = {
  ...baseConfig,
  database: process.env.SQL_DATABASE_1 || 'Acabados_2022'
};

// Pool para Medidores_2023
const medidoresConfig = {
  ...baseConfig,
  database: process.env.SQL_DATABASE_2 || 'Medidores_2023'
};

let acabadosPool = null;
let medidoresPool = null;

/**
 * Obtiene o crea el pool de conexiones para Acabados_2022
 */
async function getAcabadosPool() {
  if (!acabadosPool) {
    try {
      acabadosPool = await sql.connect(acabadosConfig);
      console.log('✓ Conectado a base de datos: Acabados_2022');
    } catch (err) {
      console.error('✗ Error conectando a Acabados_2022:', err.message);
      throw err;
    }
  }
  return acabadosPool;
}

/**
 * Obtiene o crea el pool de conexiones para Medidores_2023
 */
async function getMedidoresPool() {
  if (!medidoresPool) {
    try {
      medidoresPool = await new sql.ConnectionPool(medidoresConfig).connect();
      console.log('✓ Conectado a base de datos: Medidores_2023');
    } catch (err) {
      console.error('✗ Error conectando a Medidores_2023:', err.message);
      throw err;
    }
  }
  return medidoresPool;
}

/**
 * Ejecuta una query en Acabados_2022
 */
async function queryAcabados(queryString, params = {}) {
  try {
    const pool = await getAcabadosPool();
    const request = pool.request();
    
    // Añadir parámetros si existen
    Object.keys(params).forEach(key => {
      request.input(key, params[key]);
    });
    
    const result = await request.query(queryString);
    return result.recordset;
  } catch (err) {
    console.error('Error en queryAcabados:', err.message);
    throw err;
  }
}

/**
 * Ejecuta una query en Medidores_2023
 */
async function queryMedidores(queryString, params = {}) {
  try {
    const pool = await getMedidoresPool();
    const request = pool.request();
    
    // Añadir parámetros si existen
    Object.keys(params).forEach(key => {
      request.input(key, params[key]);
    });
    
    const result = await request.query(queryString);
    return result.recordset;
  } catch (err) {
    console.error('Error en queryMedidores:', err.message);
    throw err;
  }
}

/**
 * Cierra todas las conexiones
 */
async function closeAll() {
  try {
    if (acabadosPool) {
      await acabadosPool.close();
      acabadosPool = null;
      console.log('✓ Conexión cerrada: Acabados_2022');
    }
    if (medidoresPool) {
      await medidoresPool.close();
      medidoresPool = null;
      console.log('✓ Conexión cerrada: Medidores_2023');
    }
  } catch (err) {
    console.error('Error cerrando conexiones:', err.message);
  }
}

module.exports = {
  getAcabadosPool,
  getMedidoresPool,
  queryAcabados,
  queryMedidores,
  closeAll
};
