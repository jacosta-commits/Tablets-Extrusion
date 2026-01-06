const db = require('./server/config/database');

async function test() {
    try {
        console.log('Conectando...');
        await db.getAcabadosPool();

        const query = `SELECT TOP 1 * FROM [Acabados_2022].[dbo].[ext_vf]`;
        const result = await db.queryAcabados(query);

        if (result && result.length > 0) {
            console.log('Columnas encontradas:', Object.keys(result[0]));
        } else {
            console.log('No se encontraron datos en ext_vf');
        }

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

test();
