const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    server: process.env.SQL_SERVER,
    database: process.env.SQL_DATABASE_2, // Medidores_2023
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function testConnection() {
    try {
        console.log('Conectando a SQL Server...');
        let pool = await sql.connect(config);
        console.log('Conectado!');

        // Inspect VIEW_PRD_SCADA010
        console.log('\n--- Inspeccionando VIEW_PRD_SCADA010 ---');
        try {
            const result = await pool.request().query('SELECT TOP 1 * FROM [Medidores_2023].[dbo].[VIEW_PRD_SCADA010]');
            if (result.recordset.length > 0) {
                console.log('Columnas disponibles SCADA010:');
                console.log(JSON.stringify(Object.keys(result.recordset[0]), null, 2));
            } else {
                console.log('La vista está vacía, no se pueden listar columnas por registro.');
            }
        } catch (err) {
            console.error('Error al inspeccionar VIEW_PRD_SCADA010:', err.message);
        }

        /*
        // Inspect VIEW_PRD_SCADA005
        console.log('\n--- Inspeccionando VIEW_PRD_SCADA005 ---');
        try {
            const result = await pool.request().query('SELECT TOP 1 * FROM [Medidores_2023].[dbo].[VIEW_PRD_SCADA005]');
            if (result.recordset.length > 0) {
                console.log('Columnas disponibles SCADA005:');
                console.log(JSON.stringify(Object.keys(result.recordset[0]), null, 2));
            } else {
                console.log('La vista está vacía.');
            }
        } catch (err) {
            console.error('Error al inspeccionar VIEW_PRD_SCADA005:', err.message);
        }
        */

        pool.close();
    } catch (err) {
        console.error('Error general:', err);
    }
}

testConnection();
