/**
 * Módulo WebSocket - Maneja la conexión en tiempo real con el servidor
 */

const WebSocketClient = (function () {
    let ws = null;
    let reconnectAttempts = 0;
    let reconnectTimeout = null;
    let isConnected = false;

    const CONFIG = window.CONFIG;
    const eventHandlers = {
        open: [],
        close: [],
        message: [],
        error: [],
        refresh: []
    };

    /**
     * Conecta al servidor WebSocket
     */
    function connect() {
        try {
            console.log('🔌 Conectando a WebSocket:', CONFIG.WS_URL);
            ws = new WebSocket(CONFIG.WS_URL);

            ws.onopen = handleOpen;
            ws.onclose = handleClose;
            ws.onmessage = handleMessage;
            ws.onerror = handleError;
        } catch (error) {
            console.error('Error creando WebSocket:', error);
            scheduleReconnect();
        }
    }

    /**
     * Maneja apertura de conexión
     */
    function handleOpen(event) {
        console.log('✓ WebSocket conectado');
        isConnected = true;
        reconnectAttempts = 0;

        // Limpiar timeout de reconexión si existe
        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
        }

        // Notificar a todos los handlers
        eventHandlers.open.forEach(handler => handler(event));
    }

    /**
     * Maneja cierre de conexión
     */
    function handleClose(event) {
        console.log('✗ WebSocket desconectado');
        isConnected = false;
        ws = null;

        eventHandlers.close.forEach(handler => handler(event));

        // Intentar reconectar
        scheduleReconnect();
    }

    /**
     * Maneja mensajes entrantes
     */
    function handleMessage(event) {
        try {
            const data = JSON.parse(event.data);
            console.log('📨 Mensaje WebSocket:', data);

            // Notificar a handlers generales
            eventHandlers.message.forEach(handler => handler(data));

            // Manejar tipos específicos de mensaje
            if (data.type === 'refresh') {
                console.log('🔄 Comando de refresh recibido');
                eventHandlers.refresh.forEach(handler => handler(data));
            }
        } catch (error) {
            console.error('Error procesando mensaje WebSocket:', error);
        }
    }

    /**
     * Maneja errores
     */
    function handleError(error) {
        console.error('❌ Error WebSocket:', error);
        eventHandlers.error.forEach(handler => handler(error));
    }

    /**
     * Programa un intento de reconexión
     */
    function scheduleReconnect() {
        if (reconnectAttempts >= CONFIG.WS_MAX_RECONNECT_ATTEMPTS) {
            console.error('❌ Máximo de intentos de reconexión alcanzado');
            return;
        }

        reconnectAttempts++;
        console.log(`🔄 Reintentando conexión en ${CONFIG.WS_RECONNECT_INTERVAL}ms (intento ${reconnectAttempts}/${CONFIG.WS_MAX_RECONNECT_ATTEMPTS})`);

        reconnectTimeout = setTimeout(() => {
            connect();
        }, CONFIG.WS_RECONNECT_INTERVAL);
    }

    /**
     * Envía un mensaje al servidor
     */
    function send(data) {
        if (!isConnected || !ws) {
            console.warn('⚠ WebSocket no conectado, no se puede enviar mensaje');
            return false;
        }

        try {
            const message = typeof data === 'string' ? data : JSON.stringify(data);
            ws.send(message);
            return true;
        } catch (error) {
            console.error('Error enviando mensaje:', error);
            return false;
        }
    }

    /**
     * Registra un handler para un evento
     */
    function on(eventType, handler) {
        if (eventHandlers[eventType]) {
            eventHandlers[eventType].push(handler);
        }
    }

    /**
     * Remueve un handler de un evento
     */
    function off(eventType, handler) {
        if (eventHandlers[eventType]) {
            eventHandlers[eventType] = eventHandlers[eventType].filter(h => h !== handler);
        }
    }

    /**
     * Desconecta el WebSocket
     */
    function disconnect() {
        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
        }

        if (ws) {
            ws.close();
            ws = null;
        }

        isConnected = false;
    }

    /**
     * Obtiene el estado de la conexión
     */
    function getConnectionState() {
        return {
            connected: isConnected,
            reconnectAttempts: reconnectAttempts
        };
    }

    // Exportar API pública
    return {
        connect,
        disconnect,
        send,
        on,
        off,
        getConnectionState
    };
})();

// Hacer WebSocketClient disponible globalmente
window.WebSocketClient = WebSocketClient;
