const sql = require('mssql');
require('dotenv').config();

const config = {
    server: process.env.SQL_SERVER,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DATABASE_1,
    options: {
        encrypt: false,
        trustServerCertificate: true,
        useUTC: false
    }
};

async function inspectTable() {
    try {
        console.log('Inspeccionando estructura de la tabla ext_vf...');
        await sql.connect(config);
        console.log('✓ Conectado\n');

        // Ver todas las columnas
        const query = `
            SELECT COLUMN_NAME, DATA_TYPE
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'ext_vf'
            ORDER BY COLUMN_NAME
        `;

        const result = await sql.query(query);

        console.log('Columnas de la tabla ext_vf:');
        console.log('='.repeat(50));
        result.recordset.forEach(row => {
            console.log(`${row.COLUMN_NAME.padEnd(40)} | ${row.DATA_TYPE}`);
        });

        // Ahora ver una fila completa para TK1
        console.log('\n\nViendo registro más reciente con todas las columnas:');
        console.log('='.repeat(50));

        const query2 = `
            SELECT TOP 1 *
            FROM [Acabados_2022].[dbo].[ext_vf]
            WHERE Time_Stamp >= '2026-01-09 16:00:00'
            ORDER BY Time_Stamp DESC
        `;

        const result2 = await sql.query(query2);

        if (result2.recordset.length > 0) {
            const row = result2.recordset[0];
            console.log('\nValores de la fila más reciente:');
            for (const [key, value] of Object.entries(row)) {
                if (key.toLowerCase().includes('cal') || key.toLowerCase().includes('heat')) {
                    console.log(`>>> ${key}: ${value} (${typeof value})`);
                } else {
                    console.log(`    ${key}: ${value}`);
                }
            }
        }

        await sql.close();
        console.log('\n✓ Inspección completada');

    } catch (error) {
        console.error('Error:', error);
    }
}

inspectTable();
