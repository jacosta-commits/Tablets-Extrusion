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

async function debugData() {
    try {
        console.log('Conectando...');
        let pool = await sql.connect(config);
        console.log('Conectado.');

        const ctcod = 'EXT-TK-01';
        console.log(`\nBuscando datos para: '${ctcod}'`);

        // 2. Buscar OT activa en SCADA005 (como hace Alarmas_extrusion)
        const query005 = `
            SELECT pronom, otcod
            FROM [Medidores_2023].[dbo].[VIEW_PRD_SCADA005]
            WHERE ctcod = '${ctcod}'
        `;
        console.log('\nEjecutando query SCADA005 (Active OT):', query005);
        const res005 = await pool.request().query(query005);
        console.log('Resultados SCADA005:');
        console.log(JSON.stringify(res005.recordset, null, 2));

        if (res005.recordset.length > 0) {
            const activeOT = res005.recordset[0].otcod;
            console.log(`\nOT Activa encontrada: '${activeOT}'`);

            // 3. Buscar datos de producción en SCADA010 usando esa OT
            const query010 = `
                SELECT TOP 1 otcod, pronom, extpesoneto, caninv
                FROM [Medidores_2023].[dbo].[VIEW_PRD_SCADA010]
                WHERE otcod = '${activeOT}'
                ORDER BY otcod DESC
            `;
            console.log('Buscando en SCADA010 con Active OT:', query010);
            const res010 = await pool.request().query(query010);
            console.log('Resultados SCADA010:');
            console.log(JSON.stringify(res010.recordset, null, 2));
        } else {
            console.log('No se encontró OT activa en SCADA005.');
        }

        pool.close();
    } catch (err) {
        console.error('Error:', err);
    }
}

debugData();
