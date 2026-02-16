const express = require('express');
const router = express.Router();
const db = require('../config/database');
const modbusService = require('../services/modbusService');

/**
 * GET /api/health
 * Health check endpoint
 */
router.get('/health', async (req, res) => {
    try {
        // Verificar conexión a bases de datos
        const acabadosPool = await db.getAcabadosPool();
        const medidoresPool = await db.getMedidoresPool();

        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            databases: {
                acabados: acabadosPool ? 'connected' : 'disconnected',
                medidores: medidoresPool ? 'connected' : 'disconnected'
            },
            modbus: {
                tk1: modbusService.getConnectionStatus('tk1'),
                tk2: modbusService.getConnectionStatus('tk2'),
                sima: modbusService.getConnectionStatus('sima')
            }
        });
    } catch (error) {
        res.status(500).json({
            status: 'unhealthy',
            error: error.message
        });
    }
});

/**
 * GET /api/data/:extruder
 * Obtiene datos completos para una extrusora específica
 */
router.get('/data/:extruder', async (req, res) => {
    try {
        const { extruder } = req.params;
        const extruderLower = extruder.toLowerCase();

        // Validar extrusora
        if (!['tk1', 'tk2', 'sima'].includes(extruderLower)) {
            return res.status(400).json({
                error: 'Extrusora inválida. Usa: tk1, tk2 o sima'
            });
        }

        // Obtener datos de producción SQL
        const productionData = await getProductionInfo(extruderLower);
        const fichaData = await getFichaTecnica(productionData.ftcod);
        const observacionesData = await getObservaciones(extruderLower);
        const statusHistoryData = await getStatusHistory(extruderLower);

        // Obtener datos de Modbus (ahora reales)
        const modbusData = modbusService.getModbusData(extruderLower);

        res.json({
            extruder: extruderLower.toUpperCase(),
            timestamp: new Date().toISOString(),
            ...productionData,
            ...fichaData,
            observaciones: observacionesData,
            history: statusHistoryData,
            plc: modbusData
        });
    } catch (error) {
        console.error(`Error obteniendo datos para ${req.params.extruder}:`, error);
        res.status(500).json({
            error: 'Error obteniendo datos',
            message: error.message
        });
    }
});

/**
 * Obtiene información de producción desde SQL
 */
async function getProductionInfo(extruder) {
    try {
        // Mapear extrusora a ctcod
        const ctcodMap = {
            'tk1': 'EXT-TK-01',
            'tk2': 'EXT-TK02',
            'sima': 'EXT-SI-01'
        };

        const ctcod = ctcodMap[extruder];

        // Paso 1: Obtener OT activa desde VIEW_PRD_SCADA005 (Criterio de Alarmas_extrusion)
        const query005 = `
            SELECT TOP 1 otcod, pronom, ftcod
            FROM [Medidores_2023].[dbo].[VIEW_PRD_SCADA005]
            WHERE ctcod = @ctcod
        `;

        const result005 = await db.queryMedidores(query005, { ctcod });

        if (!result005 || !Array.isArray(result005) || result005.length === 0) {
            return {
                ot: null,
                ftcod: null,
                producto: 'Sin producción activa',
                total: 0,
                faltante: 0
            };
        }

        const { otcod, pronom, ftcod } = result005[0];
        console.log(`[${extruder}] OT activa encontrada en SCADA005: ${otcod}, FT: ${ftcod}`);

        // Paso 2: Obtener datos de producción (extpesoneto, caninv) desde VIEW_PRD_SCADA010 usando la OT encontrada Y el ctcod
        const query010 = `
            SELECT TOP 1
                extpesoneto,
                caninv
            FROM [Medidores_2023].[dbo].[VIEW_PRD_SCADA010]
            WHERE otcod = @otcod AND ctcod = @ctcod
            ORDER BY otcod DESC
        `;

        const result010 = await db.queryMedidores(query010, { otcod, ctcod });

        let extpesoneto = 0;
        let caninv = 0;

        if (result010 && Array.isArray(result010) && result010.length > 0) {
            extpesoneto = result010[0].extpesoneto || 0;
            caninv = result010[0].caninv || 0;
        }

        // Calcular faltante: caninv - extpesoneto
        const total = caninv;
        const producido = extpesoneto;
        const faltante = Math.max(0, total - producido);

        // Formatear nombre de producto (agregar salto si es muy largo)
        let productoFormateado = pronom || 'Sin nombre';
        if (productoFormateado.length > 30) {
            // Buscar un espacio cerca de la mitad para el salto
            const mitad = Math.floor(productoFormateado.length / 2);
            let posicionSalto = productoFormateado.indexOf(' ', mitad);
            if (posicionSalto === -1) posicionSalto = mitad;
            productoFormateado = productoFormateado.substring(0, posicionSalto) + '\n' + productoFormateado.substring(posicionSalto + 1);
        }

        return {
            ot: otcod,
            ftcod: ftcod,
            producto: productoFormateado,
            total: Math.round(total * 100) / 100, // 2 decimales
            faltante: Math.round(faltante * 100) / 100 // 2 decimales
        };

    } catch (error) {
        console.error('Error en getProductionInfo:', error);
        return {
            ot: null,
            producto: 'Error cargando datos',
            total: 0,
            faltante: 0
        };
    }
}

async function getFichaTecnica(ftcod) {
    try {
        if (!ftcod) {
            return {
                velocidad_lineo_std: "0",
                presion_seguridad_std: "0",
                presion_trabajo_std: "0",
                presion_cabeza_std: "0"
            };
        }

        // Códigos de ficha técnica (basado en Alarmas_extrusion/server/sql.js)
        // 0009: Velocidad Linea
        // 0069: Presion Seguridad
        // 0070: Presion Trabajo
        // 0071: Presion Cabeza
        const codes = "'0009','0069','0070','0071'";

        const query = `
            SELECT caftcod, Valor
            FROM Medidores_2023.dbo.VIEW_PRD_SCADA004
            WHERE ftcod = @ftcod AND caftcod IN (${codes})
        `;

        const result = await db.queryMedidores(query, { ftcod });

        const ficha = {
            velocidad_lineo_std: "0",
            presion_seguridad_std: "0",
            presion_trabajo_std: "0",
            presion_cabeza_std: "0"
        };

        if (result && Array.isArray(result)) {
            result.forEach(row => {
                console.log(`[FT Debug] Code: ${row.caftcod}, Val: '${row.Valor}', Type: ${typeof row.Valor}`);
                if (typeof row.Valor === 'string') {
                    console.log('Char codes:', row.Valor.split('').map(c => c.charCodeAt(0)));
                }
                let val = row.Valor || "0";

                // Limpiar valor: extraer "Numero (Rango)" y descartar texto extra
                // Ejemplo: "50 (10-70) TAPA CERRADA" -> "50 (10-70)"
                if (typeof val === 'string') {
                    val = val.trim();
                    const match = val.match(/^([\d\.]+)\s*(\([^\)]+\))/);
                    if (match) {
                        val = `${match[1]} ${match[2]}`;
                    } else {
                        // Si no hay rango, intentar sacar solo el número inicial
                        const numMatch = val.match(/^[\d\.]+/);
                        if (numMatch) {
                            val = numMatch[0];
                        }
                    }
                }
                console.log(`[FT Debug] Processed val: '${val}', Type: ${typeof val}`);

                switch (row.caftcod) {
                    case '0009': ficha.velocidad_lineo_std = val; break;
                    case '0069': ficha.presion_seguridad_std = val; break;
                    case '0070': ficha.presion_trabajo_std = val; break;
                    case '0071': ficha.presion_cabeza_std = val; break;
                }
            });
        }

        return ficha;

    } catch (error) {
        console.error('Error en getFichaTecnica:', error);
        return {
            velocidad_lineo_std: "0",
            presion_seguridad_std: "0",
            presion_trabajo_std: "0",
            presion_cabeza_std: "0"
        };
    }
}

/**
 * GET /api/data/acabados
 * Query genérica a Acabados_2022
 */
router.get('/data/acabados', async (req, res) => {
    try {
        res.json({
            database: 'Acabados_2022',
            message: 'Endpoint preparado - definir query específica',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            error: 'Error consultando Acabados_2022',
            message: error.message
        });
    }
});

/**
 * GET /api/data/medidores
 * Query genérica a Medidores_2023
 */
router.get('/data/medidores', async (req, res) => {
    try {
        res.json({
            database: 'Medidores_2023',
            message: 'Endpoint preparado - definir query específica',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            error: 'Error consultando Medidores_2023',
            message: error.message
        });
    }
});

/**
 * POST /api/update/refresh
 * Trigger para refrescar todas las vistas de operator/supervisor
 */
router.post('/update/refresh', (req, res) => {
    try {
        req.app.locals.broadcastRefresh();
        res.json({
            success: true,
            message: 'Refresh broadcast enviado a todos los clientes',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            error: 'Error enviando refresh',
            message: error.message
        });
    }
});

/**
 * GET /api/plc/status/:extruder
 * Estado de conexión PLC para una extrusora
 */
router.get('/plc/status/:extruder', async (req, res) => {
    try {
        const { extruder } = req.params;
        const status = modbusService.getConnectionStatus(extruder.toLowerCase());
        res.json(status);
    } catch (error) {
        res.status(500).json({
            error: 'Error obteniendo estado PLC',
            message: error.message
        });
    }
});

/**
 * GET /api/extruders
 * Lista de extrusoras disponibles
 */
router.get('/extruders', (req, res) => {
    res.json({
        extruders: [
            { id: 'tk1', name: 'Extrusora TK1', active: true },
            { id: 'tk2', name: 'Extrusora TK2', active: true },
            { id: 'sima', name: 'Extrusora SIMA', active: true }
        ]
    });
});

async function getObservaciones(extruder) {
    try {
        const ctcodMap = {
            'tk1': 'EXT-TK-01',
            'tk2': 'EXT-TK02',
            'sima': 'EXT-SI-01'
        };
        const ctcod = ctcodMap[extruder];

        // Consultar últimas 24 horas
        const query = `
            SELECT prinom, manobs, fecusucre, codusucre
            FROM Medidores_2023.dbo.VIEW_PRD_SCADA011
            WHERE ctcod = @ctcod 
            AND fecusucre >= DATEADD(hour, -24, GETDATE())
            ORDER BY fecusucre DESC
        `;

        const result = await db.queryMedidores(query, { ctcod });

        if (!result || !Array.isArray(result)) {
            return [];
        }

        return result.map(row => ({
            prioridad: row.prinom,
            observacion: row.manobs,
            fecha: row.fecusucre,
            usuario: row.codusucre
        }));

    } catch (error) {
        console.error('Error en getObservaciones:', error);
        return [];
    }
}

async function getStatusHistory(extruder) {
    try {
        // Mapeo de columnas según extrusora
        const colMap = {
            'tk1': { state: 'tk1_estado_maquina', heat: 'tk1_calentamiento' },
            'tk2': { state: 'tk2_estado_maquina', heat: 'tk2_calentamiento' },
            'sima': { state: 'sima_estado_maquina', heat: 'sima_calentamiento' }
        };

        const cols = colMap[extruder];
        if (!cols) return [];

        // Consultar últimas 24 horas minuto a minuto
        const query = `
            SELECT Time_Stamp, ${cols.state} as estado, ${cols.heat} as calentamiento
            FROM [Acabados_2022].[dbo].[ext_vf]
            WHERE Time_Stamp >= DATEADD(hour, -24, GETDATE())
            ORDER BY Time_Stamp DESC
        `;

        const result = await db.queryAcabados(query);

        if (!result || !Array.isArray(result) || result.length === 0) {
            return [];
        }

        // Procesar y agrupar estados consecutivos
        const history = [];
        let currentEvent = null;

        // Recorremos inversamente (del más reciente al más antiguo) para construir la historia cronológica
        // O mejor: el query ya viene DESC (reciente primero). 
        // Para agrupar rangos, es más fácil ir del más antiguo al más nuevo.
        // Así que invertimos el array o cambiamos el ORDER BY. Cambiemos el orden de iteración.
        const rows = [...result].reverse(); // Ahora está cronológico (antiguo -> nuevo)

        rows.forEach((row, index) => {
            // Determinar estado actual
            let rawState = row.estado;
            let isHeating = row.calentamiento === 1;

            let finalState = 'Desconocido';
            if (isHeating) {
                finalState = 'Calentamiento';
            } else if (rawState === 'Produciendo') {
                finalState = 'Produciendo';
            } else {
                finalState = 'Parada'; // O usar el texto original 'Maquina parada'
            }

            const timestamp = new Date(row.Time_Stamp);

            if (!currentEvent) {
                // Primer evento
                currentEvent = {
                    state: finalState,
                    start: timestamp,
                    end: timestamp
                };
            } else {
                // Verificar si es continuidad del evento anterior
                // Mismo estado Y diferencia de tiempo <= 2 minutos (para tolerar pequeños saltos)
                const diffMinutes = (timestamp - currentEvent.end) / 1000 / 60;

                if (currentEvent.state === finalState && diffMinutes <= 2) {
                    // Extender evento actual
                    currentEvent.end = timestamp;
                } else {
                    // Cerrar evento anterior y empezar uno nuevo
                    history.push(currentEvent);
                    currentEvent = {
                        state: finalState,
                        start: timestamp,
                        end: timestamp
                    };
                }
            }
        });

        // Empujar el último evento
        if (currentEvent) {
            history.push(currentEvent);
        }

        // Calcular duraciones y formatear para el frontend
        // Devolvemos en orden inverso (más reciente primero) para la tabla
        return history.map(event => {
            const durationMs = event.end - event.start;
            // Sumamos 1 minuto porque si empieza 8:00 y termina 8:00 cuenta como 1 minuto de registro
            const durationMinutes = Math.floor(durationMs / 1000 / 60) + 1;

            return {
                estado: event.state,
                inicio: event.start,
                fin: event.end,
                duracion: `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m`
            };
        }).reverse();

    } catch (error) {
        console.error('Error en getStatusHistory:', error);
        return [];
    }
}

module.exports = router;
