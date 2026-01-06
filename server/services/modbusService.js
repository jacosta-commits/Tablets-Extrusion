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
            client = new ModbusRTU();
            await client.connectTCP(config.ip, { port: config.port });
            client.setID(config.id);
            client.setTimeout(2000);
            clients[clientKey] = client;
            console.log(`[Modbus] Conectado a ${extruderKey} (${config.ip})`);
        }

        connectionStatus[extruderKey] = true;

        // Leer cada señal definida
        for (const signal of config.signals) {
            try {
                let res;
                const len = signal.len || 1; // Default length 1 register (2 bytes)

                // Leer Holding Registers (FC03)
                res = await client.readHoldingRegisters(signal.address, len);

                // Convertir datos
                const value = converters[signal.type](res.buffer);
                dataCache[extruderKey][signal.name] = value;

            } catch (readErr) {
                // console.warn(`[Modbus] Error leyendo ${signal.name} de ${extruderKey}:`, readErr.message);
                dataCache[extruderKey][signal.name] = null;
            }
        }

    } catch (err) {
        console.error(`[Modbus] Error conexión ${extruderKey}:`, err.message);
        connectionStatus[extruderKey] = false;

        // Forzar reconexión en el siguiente ciclo
        if (client) {
            client.close();
            delete clients[clientKey];
        }
    }
}

// Iniciar servicio
function startModbusPolling() {
    console.log('Iniciando servicio Modbus...');

    // Polling cada 1 segundo (ajustable)
    setInterval(() => {
        pollPLC('tk1');
        pollPLC('tk2');
        pollPLC('sima');
    }, 1000);
}

function getModbusData(extruder) {
    return dataCache[extruder] || {};
}

function getConnectionStatus() {
    return connectionStatus;
}

module.exports = {
    startModbusPolling,
    getModbusData,
    getConnectionStatus
};
