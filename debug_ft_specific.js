const db = require('./server/config/database');

async function test() {
    try {
        console.log('Conectando...');
        await db.getMedidoresPool();

        const ftcod = 'Z4UNI0500C40-TK03';
        const codes = "'0009','0069','0070','0071'";

        console.log('Consultando FT:', ftcod);

        const query = `
            SELECT caftcod, Valor
            FROM Medidores_2023.dbo.VIEW_PRD_SCADA004
            WHERE ftcod = @ftcod AND caftcod IN (${codes})
        `;

        const result = await db.queryMedidores(query, { ftcod });
        console.log('Resultados:', result);

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

test();
