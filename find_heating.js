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

async function findHeatingRecords() {
    try {
        console.log('Buscando registros con calentamiento=1...');
        await sql.connect(config);
        console.log('✓ Conectado\n');

        // Buscar registros con calentamiento = 1
        const query = `
            SELECT TOP 50
                Time_Stamp,
                tk1_estado_maquina as estado,
                tk1_calentamiento as calentamiento
            FROM [Acabados_2022].[dbo].[ext_vf]
            WHERE Time_Stamp >= DATEADD(hour, -24, GETDATE())
                AND tk1_calentamiento = 1
            ORDER BY Time_Stamp DESC
        `;

        console.log('Ejecutando query para calentamiento=1...\n');
        const result = await sql.query(query);

        if (result.recordset.length === 0) {
            console.log('❌ NO se encontraron registros con tk1_calentamiento=1 en las últimas 24 horas');
            console.log('\nBuscando cualquier valor diferente de 0...\n');

            const query2 = `
                SELECT TOP 10
                    Time_Stamp,
                    tk1_estado_maquina as estado,
                    tk1_calentamiento as calentamiento
                FROM [Acabados_2022].[dbo].[ext_vf]
                WHERE Time_Stamp >= DATEADD(hour, -24, GETDATE())
                    AND tk1_calentamiento != 0
                ORDER BY Time_Stamp DESC
            `;

            const result2 = await sql.query(query2);

            if (result2.recordset.length === 0) {
                console.log('❌ NO se encontraron registros con tk1_calentamiento!=0');
                console.log('\nMostrando distribución de valores de calentamiento:\n');

                const query3 = `
                    SELECT 
                        tk1_calentamiento as valor,
                        COUNT(*) as cantidad
                    FROM [Acabados_2022].[dbo].[ext_vf]
                    WHERE Time_Stamp >= DATEADD(hour, -24, GETDATE())
                    GROUP BY tk1_calentamiento
                    ORDER BY cantidad DESC
                `;

                const result3 = await sql.query(query3);
                console.log('Valores encontrados:');
                result3.recordset.forEach(row => {
                    console.log(`  Valor: ${row.valor} (${typeof row.valor}) -> Cantidad: ${row.cantidad} registros`);
                });
            } else {
                console.log(`✓ Encontrados ${result2.recordset.length} registros con valor != 0:`);
                result2.recordset.forEach((row, i) => {
                    console.log(`\n  [${i}] ${row.Time_Stamp}`);
                    console.log(`      Estado: ${row.estado}`);
                    console.log(`      Calentamiento: ${row.calentamiento} (${typeof row.calentamiento})`);
                });
            }
        } else {
            console.log(`✓ Encontrados ${result.recordset.length} registros con calentamiento=1:`);
            result.recordset.forEach((row, i) => {
                console.log(`\n  [${i}] ${row.Time_Stamp}`);
                console.log(`      Estado: ${row.estado}`);
                console.log(`      Calentamiento: ${row.calentamiento} (${typeof row.calentamiento})`);
            });
        }

        await sql.close();
        console.log('\n✓ Consulta completada');

    } catch (error) {
        console.error('Error:', error);
    }
}

findHeatingRecords();
