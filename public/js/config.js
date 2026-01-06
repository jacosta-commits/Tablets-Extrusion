/**
 * Configuración de la aplicación cliente
 */

// Obtener el protocolo y host actual
const protocol = window.location.protocol;
const host = window.location.host;
const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';

const CONFIG = {
    // API Configuration
    API_BASE_URL: `${protocol}//${host}/api`,

    // WebSocket Configuration
    WS_URL: `${wsProtocol}//${host}`,
    WS_RECONNECT_INTERVAL: 3000, // ms
    WS_MAX_RECONNECT_ATTEMPTS: 10,

    // Update Configuration
    UPDATE_INTERVAL: 5000, // ms - intervalo para obtener datos

    // Extruders
    EXTRUDERS: {
        TK1: { id: 'tk1', name: 'Extrusora TK1' },
        TK2: { id: 'tk2', name: 'Extrusora TK2' },
        SIMA: { id: 'sima', name: 'Extrusora SIMA' }
    },

    // Default extruder
    DEFAULT_EXTRUDER: 'tk1',

    // Footer Buttons Configuration
    // Cambiar enabled a false para ocultar un botón
    // Agregar o quitar objetos para cambiar cantidad de botones
    FOOTER_BUTTONS: [
        { id: 'btn1', label: 'Botón 1', enabled: false },
        { id: 'btn2', label: 'Botón 2', enabled: false },
        { id: 'btn3', label: 'Botón 3', enabled: false },
        { id: 'btn4', label: 'Botón 4', enabled: false },
        { id: 'btn5', label: 'Botón 5', enabled: false },
        { id: 'btn6', label: 'Botón 6', enabled: false },
        { id: 'btn7', label: 'Botón 7', enabled: false }
    ]
};

// Hacer CONFIG disponible globalmente
window.CONFIG = CONFIG;
