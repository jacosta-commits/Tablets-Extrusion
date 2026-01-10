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

async function checkSpecificRows() {
    try {
        console.log('Verificando filas específicas de la imagen del usuario...');
        await sql.connect(config);
        console.log('✓ Conectado\n');

        // Buscar la fila 990 mencionada en la imagen (16:39:00 con calentamiento=1)
        const query = `
            SELECT TOP 100
                Time_Stamp,
                tk1_estado_maquina,
                tk1_calentamiento
            FROM [Acabados_2022].[dbo].[ext_vf]
            WHERE Time_Stamp >= '2026-01-09 16:00:00'
                AND Time_Stamp <= '2026-01-10 00:00:00'
            ORDER BY Time_Stamp DESC
        `;

        console.log('Buscando registros del 2026-01-09 16:00 a 2026-01-10 00:00...\n');
        const result = await sql.query(query);

        console.log(`✓ Encontrados ${result.recordset.length} registros\n`);
        console.log('Primeras 20 filas:');
        console.log('='.repeat(80));

        result.recordset.slice(0, 20).forEach((row, i) => {
            const timestamp = row.Time_Stamp.toISOString().slice(0, 19).replace('T', ' ');
            const estado = (row.tk1_estado_maquina || '').padEnd(20);
            console.log(`${i.toString().padStart(3)}. ${timestamp} | ${estado} | calentamiento=${row.tk1_calentamiento}`);
        });

        console.log('\nBuscando SOLO los que tienen calentamiento=1:');
        const heating = result.recordset.filter(r => r.tk1_calentamiento == 1);
        console.log(`✓ Encontrados ${heating.length} registros con calentamiento=1`);

        if (heating.length > 0) {
            heating.forEach((row, i) => {
                const timestamp = row.Time_Stamp.toISOString().slice(0, 19).replace('T', ' ');
                console.log(`${i}. ${timestamp} | ${row.tk1_estado_maquina} | calentamiento=${row.tk1_calentamiento}`);
            });
        }

        await sql.close();
        console.log('\n✓ Consulta completada');

    } catch (error) {
        console.error('Error:', error);
    }
}

checkSpecificRows();
