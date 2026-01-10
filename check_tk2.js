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

async function checkTK2() {
    try {
        console.log('Verificando TK2...');
        await sql.connect(config);
        console.log('✓ Conectado\n');

        const query = `
            SELECT Time_Stamp, tk2_estado_maquina, tk2_calentamiento
            FROM [Acabados_2022].[dbo].[ext_vf]
            WHERE Time_Stamp BETWEEN GETDATE()-1 AND GETDATE() 
            ORDER BY Time_Stamp DESC
        `;

        const result = await sql.query(query);

        console.log(`✓ Encontrados ${result.recordset.length} registros\n`);

        const withHeating = result.recordset.filter(r => r.tk2_calentamiento == 1);
        console.log(`✓ Registros con calentamiento=1: ${withHeating.length}\n`);

        console.log('Primeros 20 registros:');
        console.log('='.repeat(80));
        result.recordset.slice(0, 20).forEach((row, i) => {
            const ts = row.Time_Stamp.toISOString().slice(0, 19).replace('T', ' ');
            const estado = (row.tk2_estado_maquina || '').padEnd(18);
            const heat = row.tk2_calentamiento;
            console.log(`${i.toString().padStart(2)}. ${ts} | ${estado} | cal=${heat}`);
        });

        if (withHeating.length > 0) {
            console.log('\n\nRegistros CON CALENTAMIENTO=1:');
            console.log('='.repeat(80));
            withHeating.slice(0, 10).forEach((row, i) => {
                const ts = row.Time_Stamp.toISOString().slice(0, 19).replace('T', ' ');
                console.log(`${i}. ${ts} | ${row.tk2_estado_maquina} | calentamiento=${row.tk2_calentamiento}`);
            });
        }

        await sql.close();
        console.log('\n✓ Consulta completada');

    } catch (error) {
        console.error('Error:', error);
    }
}

checkTK2();
