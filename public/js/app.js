/**
 * Aplicación Principal - Orquesta todos los módulos
 */

(function () {
    console.log('🚀 Iniciando Monitor de Extrusoras...');

    let autoRefreshInterval = null;

    /**
     * Inicializa la aplicación
     */
    async function init() {
        try {
            // 1. Inicializar UI
            window.UI.init();

            // 2. Conectar WebSocket
            window.WebSocketClient.connect();
            setupWebSocketHandlers();

            // 3. Cargar datos iniciales
            await window.UI.loadData();

            // 4. Iniciar actualización automática cada 5 segundos
            startAutoRefresh();

            console.log('✓ Aplicación iniciada correctamente');

        } catch (error) {
            console.error('❌ Error inicializando aplicación:', error);
        }
    }

    /**
     * Configura handlers de WebSocket
     */
    function setupWebSocketHandlers() {
        window.WebSocketClient.on('open', () => {
            console.log('✓ WebSocket conectado');
            window.UI.updateConnectionStatus(true);
        });

        window.WebSocketClient.on('close', () => {
            console.log('✗ WebSocket desconectado');
            window.UI.updateConnectionStatus(false);
        });

        window.WebSocketClient.on('error', (error) => {
            console.error('❌ WebSocket error:', error);
            window.UI.updateConnectionStatus(false);
        });
    }

    /**
     * Inicia actualización automática de datos
     */
    function startAutoRefresh() {
        // Actualizar cada 5 segundos
        autoRefreshInterval = setInterval(async () => {
            try {
                await window.UI.loadData();
            } catch (error) {
                console.error('Error en auto-refresh:', error);
            }
        }, 5000); // 5 segundos

        console.log('✓ Auto-refresh iniciado (cada 5s)');
    }

    /**
     * Detiene actualización automática
     */
    function stopAutoRefresh() {
        if (autoRefreshInterval) {
            clearInterval(autoRefreshInterval);
            autoRefreshInterval = null;
            console.log('✗ Auto-refresh detenido');
        }
    }

    /**
     * Cleanup al cerrar
     */
    window.addEventListener('beforeunload', () => {
        stopAutoRefresh();
        window.WebSocketClient.disconnect();
    });

    // Iniciar cuando el DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
