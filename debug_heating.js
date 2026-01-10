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

async function debugHeating() {
    try {
        console.log('Conectando a la base de datos...');
        await sql.connect(config);
        console.log('✓ Conectado\n');

        const query = `
            SELECT TOP 20
                Time_Stamp,
                tk1_estado_maquina as estado,
                tk1_calentamiento as calentamiento
            FROM [Acabados_2022].[dbo].[ext_vf]
            WHERE Time_Stamp >= DATEADD(hour, -24, GETDATE())
            ORDER BY Time_Stamp DESC
        `;

        console.log('Ejecutando query...\n');
        const result = await sql.query(query);

        console.log('Resultados (últimas 20 filas):');
        console.log('=========================================');

        result.recordset.forEach((row, i) => {
            console.log(`\nFila ${i}:`);
            console.log(`  Time_Stamp: ${row.Time_Stamp}`);
            console.log(`  Estado: ${row.estado}`);
            console.log(`  Calentamiento (raw): ${row.calentamiento}`);
            console.log(`  Calentamiento (type): ${typeof row.calentamiento}`);
            console.log(`  Calentamiento == 1: ${row.calentamiento == 1}`);
            console.log(`  Calentamiento === 1: ${row.calentamiento === 1}`);
            console.log(`  Calentamiento === true: ${row.calentamiento === true}`);
            console.log(`  Calentamiento (boolean): ${Boolean(row.calentamiento)}`);
        });

        await sql.close();
        console.log('\n✓ Conexión cerrada');

    } catch (error) {
        console.error('Error:', error);
    }
}

debugHeating();
