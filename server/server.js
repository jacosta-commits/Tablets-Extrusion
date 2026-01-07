const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const apiRoutes = require('./routes/api');
const db = require('./config/database');
const modbusService = require('./services/modbusService');

const app = express();
const PORT = process.env.PORT || 3081;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api', apiRoutes);

// Crear servidor HTTP
const server = http.createServer(app);

// Configurar WebSocket
const wss = new WebSocket.Server({ server });

// Almacenar clientes conectados
const clients = new Set();

wss.on('connection', (ws, req) => {
    console.log('✓ Nuevo cliente WebSocket conectado');
    clients.add(ws);

    // Enviar mensaje de bienvenida
    ws.send(JSON.stringify({
        type: 'connection',
        message: 'Conectado al servidor de monitoreo',
        timestamp: new Date().toISOString()
    }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('Mensaje recibido:', data);

            // Manejar diferentes tipos de mensajes
            if (data.type === 'ping') {
                ws.send(JSON.stringify({
                    type: 'pong',
                    timestamp: new Date().toISOString()
                }));
            }
        } catch (error) {
            console.error('Error procesando mensaje WebSocket:', error);
        }
    });

    ws.on('close', () => {
        console.log('✗ Cliente WebSocket desconectado');
        clients.delete(ws);
    });

    ws.on('error', (error) => {
        console.error('Error WebSocket:', error);
        clients.delete(ws);
    });
});

/**
 * Broadcast a todos los clientes conectados
 */
function broadcastToAll(data) {
    const message = JSON.stringify(data);
    clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

/**
 * Función para enviar refresh a todos los clientes
 */
function broadcastRefresh() {
    console.log(`📢 Broadcasting refresh a ${clients.size} clientes`);
    broadcastToAll({
        type: 'refresh',
        message: 'Actualizar vista',
        timestamp: new Date().toISOString()
    });
}

// Hacer disponible la función de broadcast en las rutas
app.locals.broadcastRefresh = broadcastRefresh;

// Ruta principal - servir index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Inicializar conexiones de base de datos
async function initializeDatabases() {
    try {
        await db.getAcabadosPool();
        await db.getMedidoresPool();
        console.log('✓ Todas las bases de datos conectadas');
    } catch (error) {
        console.error('✗ Error inicializando bases de datos:', error.message);
        console.log('⚠ El servidor continuará sin conexión a BD');
    }
}

// Iniciar servidor
// Iniciar servicio Modbus (Polling)
modbusService.startModbusPolling();

server.listen(PORT, async () => {
    console.log('\n╔════════════════════════════════════════════╗');
    console.log('║   Sistema de Monitoreo de Extrusoras     ║');
    console.log('╚════════════════════════════════════════════╝\n');
    console.log(`🚀 Servidor HTTP escuchando en puerto ${PORT}`);
    console.log(`🔌 WebSocket disponible en ws://localhost:${PORT}`);
    console.log(`🌐 Abrir: http://localhost:${PORT}\n`);

    // Inicializar bases de datos
    await initializeDatabases();

    console.log('✓ Sistema listo\n');
});

// Manejo de cierre graceful
process.on('SIGTERM', async () => {
    console.log('\n⚠ SIGTERM recibido, cerrando servidor...');

    // Cerrar todas las conexiones WebSocket
    clients.forEach((client) => {
        client.close();
    });

    // Cerrar conexiones de base de datos
    await db.closeAll();

    // Cerrar servidor HTTP
    server.close(() => {
        console.log('✓ Servidor cerrado correctamente');
        process.exit(0);
    });
});

process.on('SIGINT', async () => {
    console.log('\n⚠ SIGINT recibido, cerrando servidor...');

    clients.forEach((client) => {
        client.close();
    });

    await db.closeAll();

    server.close(() => {
        console.log('✓ Servidor cerrado correctamente');
        process.exit(0);
    });
});

module.exports = app;
