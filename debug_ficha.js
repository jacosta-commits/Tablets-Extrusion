const db = require('./server/config/database');

async function test() {
    try {
        console.log('Conectando...');
        await db.getMedidoresPool();

        const ctcod = 'EXT-TK-01'; // TK1
        const codes = "'0009','0069','0070','0071'";

        // Primero obtener OT activa
        const queryOT = `SELECT TOP 1 otcod FROM Medidores_2023.dbo.VIEW_PRD_SCADA005 WHERE ctcod = @ctcod`;
        const resOT = await db.queryMedidores(queryOT, { ctcod });

        if (!resOT || resOT.length === 0) {
            console.log('No hay OT activa');
            return;
        }
        const otcod = resOT[0].otcod;
        console.log('OT Activa:', otcod);

        // Consultar Ficha Tecnica
        const query = `
            SELECT a.caftcod, a.Valor
            FROM Medidores_2023.dbo.VIEW_PRD_SCADA004 a
            INNER JOIN Medidores_2023.dbo.VIEW_PRD_SCADA005 b ON a.ftcod = b.ftcod
            WHERE b.ctcod = @ctcod AND a.caftcod IN (${codes})
        `;

        const result = await db.queryMedidores(query, { ctcod });
        console.log('Resultados Raw:', result);

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

test();
