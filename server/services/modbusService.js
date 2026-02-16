const ModbusRTU = require('modbus-serial');
const MODBUS_CONFIG = require('../config/modbus.config');

// Cache de datos
let dataCache = {
    tk1: {},
    tk2: {},
    sima: {}
};

// Estado de conexión
let connectionStatus = {
    tk1: false,
    tk2: false,
    sima: false
};

// Clientes Modbus
const clients = {};

// Helper para conversiones
const converters = {
    f10: (buffer) => {
        if (buffer.length < 2) return 0;
        return parseFloat((buffer.readUInt16BE(0) / 10).toFixed(1));
    },
    u16: (buffer) => {
        if (buffer.length < 2) return 0;
        return buffer.readUInt16BE(0);
    },
    fpWS: (buffer) => {
        // Float con Word Swap (CDAB)
        if (buffer.length < 4) return 0;
        const b = Buffer.allocUnsafe(4);
        b.writeUInt16BE(buffer.readUInt16BE(2), 0); // Swap words
        b.writeUInt16BE(buffer.readUInt16BE(0), 2);
        return parseFloat(b.readFloatBE(0).toFixed(1));
    }
};

// Función para conectar y leer de un PLC
async function pollPLC(extruderKey) {
    const config = MODBUS_CONFIG[extruderKey];
    if (!config) return;

    const clientKey = `${config.ip}:${config.port}`;
    let client = clients[clientKey];

    try {
        if (!client) {
            console.log(`[Modbus] Intentando conectar a ${extruderKey} (${config.ip})...`);
            client = new ModbusRTU();
            await client.connectTCP(config.ip, { port: config.port });
            client.setID(config.id);
            client.setTimeout(5000); // Aumentar timeout a 5s
            clients[clientKey] = client;
            console.log(`[Modbus] ✓ Conectado a ${extruderKey}`);
        }

        connectionStatus[extruderKey] = true;

        // Leer cada señal definida
        for (const signal of config.signals) {
            try {
                const len = signal.len || 1; // Default length 1 register (2 bytes)

                // Leer Holding Registers (FC03)
                const res = await client.readHoldingRegisters(signal.address, len);

                // Convertir datos
                const value = converters[signal.type](res.buffer);
                dataCache[extruderKey][signal.name] = value;

            } catch (readErr) {
                console.warn(`[Modbus] Error leyendo ${signal.name} de ${extruderKey}:`, readErr.message);
                // Si falla la lectura de un registro, asumimos problema de conexión serio si son varios
                // Pero por ahora solo marcamos null este valor
                dataCache[extruderKey][signal.name] = null;
                throw readErr; // Re-lanzar para forzar reconexión si falla lectura
            }
        }

    } catch (err) {
        console.error(`[Modbus] Error ciclo ${extruderKey}:`, err.message);
        connectionStatus[extruderKey] = false;

        // Forzar reconexión en el siguiente ciclo
        if (client) {
            try {
                client.close();
            } catch (e) { /* ignore */ }
            delete clients[clientKey];
        }
    }
}

// Loop de polling independiente para cada extrusora
async function startPollingLoop(extruderKey) {
    while (true) {
        try {
            await pollPLC(extruderKey);
        } catch (error) {
            console.error(`[Modbus] Error fatal en loop ${extruderKey}:`, error);
        }

        // Esperar antes del siguiente ciclo
        // Si hubo error (desconectado), esperar más (5s) para no saturar
        // Si todo bien, esperar 1s
        const waitTime = connectionStatus[extruderKey] ? 1000 : 5000;
        await new Promise(resolve => setTimeout(resolve, waitTime));
    }
}

// Iniciar servicio
function startModbusPolling() {
    console.log('Iniciando servicio Modbus (Polling robusto)...');

    // Iniciar loops independientes
    startPollingLoop('tk1');
    startPollingLoop('tk2');
    startPollingLoop('sima');
}

function getModbusData(extruder) {
    return dataCache[extruder] || {};
}

function getConnectionStatus(extruder) {
    if (extruder) return connectionStatus[extruder];
    return connectionStatus;
}

module.exports = {
    startModbusPolling,
    getModbusData,
    getConnectionStatus
};
