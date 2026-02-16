/**
 * Módulo API - Maneja todas las comunicaciones HTTP con el servidor
 */

const API = (function () {
    const baseURL = window.CONFIG.API_BASE_URL;

    /**
     * Realiza una petición fetch con manejo de errores
     */
    async function request(endpoint, options = {}) {
        const url = `${baseURL}${endpoint}`;

        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        };

        // Add timeout support
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

        const config = {
            ...defaultOptions,
            ...options,
            signal: controller.signal
        };

        try {
            const response = await fetch(url, config);
            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            }

            return await response.text();
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                console.error(`API Timeout [${endpoint}]`);
            } else {
                console.error(`API Error [${endpoint}]:`, error);
            }
            throw error;
        }
    }

    /**
     * GET request
     */
    async function get(endpoint) {
        return request(endpoint, { method: 'GET' });
    }

    /**
     * POST request
     */
    async function post(endpoint, data = {}) {
        return request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    // ========== API Endpoints ==========

    /**
     * Obtiene el estado de salud del servidor
     */
    async function getHealth() {
        return get('/health');
    }

    /**
     * Obtiene datos para una extrusora específica
     */
    async function getExtruderData(extruderId) {
        return get(`/data/${extruderId}`);
    }

    /**
     * Obtiene datos de Acabados_2022
     */
    async function getAcabadosData() {
        return get('/data/acabados');
    }

    /**
     * Obtiene datos de Medidores_2023
     */
    async function getMedidoresData() {
        return get('/data/medidores');
    }

    /**
     * Envía comando de refresh a todos los clientes
     */
    async function triggerRefresh() {
        return post('/update/refresh');
    }

    /**
     * Obtiene estado de PLC para una extrusora
     */
    async function getPLCStatus(extruderId) {
        return get(`/plc/status/${extruderId}`);
    }

    /**
     * Obtiene lista de extrusoras disponibles
     */
    async function getExtruders() {
        return get('/extruders');
    }

    // Exportar API pública
    return {
        get,
        post,
        getHealth,
        getExtruderData,
        getAcabadosData,
        getMedidoresData,
        triggerRefresh,
        getPLCStatus,
        getExtruders
    };
})();

// Hacer API disponible globalmente
window.API = API;
