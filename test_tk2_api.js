const fetch = require('node-fetch');

async function testTK2API() {
    try {
        console.log('Consultando API para TK2...\n');

        const response = await fetch('http://localhost:3081/api/extruder/tk2');
        const data = await response.json();

        console.log('Response status:', response.status);
        console.log('\nHistory data:');
        console.log('='.repeat(80));

        if (data.history && Array.isArray(data.history)) {
            console.log(`Total events: ${data.history.length}\n`);

            data.history.slice(0, 15).forEach((event, i) => {
                console.log(`Event ${i}:`);
                console.log(`  Estado: ${event.estado}`);
                console.log(`  Inicio: ${event.inicio}`);
                console.log(`  Fin: ${event.fin}`);
                console.log(`  Duración: ${event.duracion}`);
                console.log('');
            });

            // Buscar eventos de calentamiento
            const heatingEvents = data.history.filter(e =>
                e.estado.includes('Calentamiento') || e.estado.includes('Parada+Calentamiento')
            );

            console.log(`\nEventos con CALENTAMIENTO: ${heatingEvents.length}`);
            if (heatingEvents.length > 0) {
                heatingEvents.slice(0, 5).forEach((event, i) => {
                    console.log(`  ${i}. ${event.estado} - ${event.inicio} - ${event.duracion}`);
                });
            }
        } else {
            console.log('No history data found');
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

testTK2API();
