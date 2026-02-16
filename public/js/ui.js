/**
 * UI Module - Controla interfaz limpia y profesional
 */

const UI = (function () {
    let currentExtruder = 'tk1';
    let elements = {};
    let updateInterval = null; // Intervalo para actualizar tiempos en tiempo real

    /**
     * Inicializa el módulo
     */
    function init() {
        // Referencias DOM
        elements.extruderTitle = document.getElementById('extruderTitle');
        elements.selectorBtn = document.getElementById('selectorBtn');
        elements.selectorMenu = document.getElementById('selectorMenu');
        elements.menuOptions = document.querySelectorAll('.menu-option');
        elements.statusDot = document.getElementById('statusDot');
        elements.statusText = document.getElementById('statusText');

        // Header
        elements.productName = document.getElementById('productName');

        // Info
        elements.totalValue = document.getElementById('totalValue');
        elements.faltanteValue = document.getElementById('faltanteValue');
        elements.otValue = document.getElementById('otValue');

        // Datos
        elements.observacionesTable = document.getElementById('observacionesTable');
        elements.lineoValue = document.getElementById('lineoValue');
        elements.seguridadValue = document.getElementById('seguridadValue');
        elements.trabajoValue = document.getElementById('trabajoValue');
        elements.cabezaValue = document.getElementById('cabezaValue');

        // Ficha Tecnica
        elements.fichaTecnica1 = document.getElementById('fichaTecnica1');
        elements.fichaTecnica2 = document.getElementById('fichaTecnica2');
        elements.fichaTecnica3 = document.getElementById('fichaTecnica3');
        elements.fichaTecnica4 = document.getElementById('fichaTecnica4');

        // Historial
        elements.historyTable = document.getElementById('historyTable');

        // Footer buttons container
        elements.footerButtons = document.getElementById('footerButtons');

        setupEvents();
        initializeFooterButtons();

        // Cargar extrusora guardada o usar default
        const savedExtruder = localStorage.getItem('selectedExtruder');
        if (savedExtruder) {
            console.log('Restoring saved extruder:', savedExtruder);
            selectExtruder(savedExtruder);
        } else {
            console.log('Using default extruder:', currentExtruder);
            loadData();
        }

        console.log('✓ UI inicializado');
    }

    /**
     * Inicializa botones del footer desde config
     */
    function initializeFooterButtons() {
        if (!window.CONFIG || !window.CONFIG.FOOTER_BUTTONS) {
            console.warn('No footer buttons config found');
            return;
        }

        const enabledButtons = window.CONFIG.FOOTER_BUTTONS.filter(btn => btn.enabled);

        if (enabledButtons.length === 0) {
            elements.footerButtons.style.display = 'none';
            return;
        }

        elements.footerButtons.innerHTML = '';

        enabledButtons.forEach(btnConfig => {
            const button = document.createElement('button');
            button.id = btnConfig.id;
            button.className = 'footer-btn';
            button.textContent = btnConfig.label;
            button.disabled = true; // Por defecto deshabilitado

            // Agregar event listener si se habilita en el futuro
            button.addEventListener('click', () => handleFooterButtonClick(btnConfig.id));

            elements.footerButtons.appendChild(button);
        });

        console.log(`✓ ${enabledButtons.length} botones de footer inicializados`);
    }

    /**
     * Handler para clicks en botones del footer
     */
    function handleFooterButtonClick(buttonId) {
        console.log('Footer button clicked:', buttonId);
        // TODO: Implementar lógica específica de cada botón
    }

    /**
     * Habilita un botón específico del footer
     */
    function enableFooterButton(buttonId) {
        const button = document.getElementById(buttonId);
        if (button) {
            button.disabled = false;
        }
    }

    /**
     * Deshabilita un botón específico del footer
     */
    function disableFooterButton(buttonId) {
        const button = document.getElementById(buttonId);
        if (button) {
            button.disabled = true;
        }
    }

    /**
     * Configura eventos
     */
    function setupEvents() {
        // Toggle menú
        elements.selectorBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            elements.selectorMenu.classList.toggle('active');
        });

        // Cerrar menú
        document.addEventListener('click', () => {
            elements.selectorMenu.classList.remove('active');
        });

        // Seleccionar extrusora
        elements.menuOptions.forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const extruderId = option.dataset.id;
                selectExtruder(extruderId);
            });
        });
    }

    /**
     * Selecciona una extrusora
     */
    async function selectExtruder(extruderId) {
        // Permitir re-selección si es para inicialización, pero evitar trabajo extra si ya está activa y cargada
        if (currentExtruder === extruderId && elements.extruderTitle.textContent.includes(extruderId.toUpperCase()) && elements.historyTable.innerHTML !== '') {
            elements.selectorMenu.classList.remove('active');
            return;
        }

        currentExtruder = extruderId;
        localStorage.setItem('selectedExtruder', extruderId); // Persistir selección

        // Actualizar título
        const names = {
            'tk1': 'EXTRUSORA - TK1',
            'tk2': 'EXTRUSORA - TK2',
            'sima': 'EXTRUSORA - SIMA'
        };
        elements.extruderTitle.textContent = names[extruderId] || `EXTRUSORA - ${extruderId.toUpperCase()}`;

        // Actualizar menú activo
        elements.menuOptions.forEach(option => {
            if (option.dataset.id === extruderId) {
                option.classList.add('active');
            } else {
                option.classList.remove('active');
            }
        });

        elements.selectorMenu.classList.remove('active');

        // Cargar datos
        await loadData();
    }

    /**
     * Carga datos de la extrusora
     */
    async function loadData() {
        try {
            const data = await window.API.getExtruderData(currentExtruder);

            if (data) {
                updateDisplay(data);
            }
        } catch (error) {
            console.error('Error cargando datos:', error);
        }
    }

    /**
     * Actualiza la visualización
     */
    function updateDisplay(data) {
        // Nombre del producto (con soporte para saltos de línea)
        if (data.producto) {
            // Reemplazar saltos de línea con espacios para aprovechar el ancho
            elements.productName.textContent = data.producto.replace(/\\n/g, ' ');
        }

        // Info row - con formato de 2 decimales
        if (data.total !== undefined && data.total !== null) {
            elements.totalValue.textContent = `${data.total.toFixed(2)} kg`;
        } else {
            elements.totalValue.textContent = '##### kg';
        }

        if (data.faltante !== undefined && data.faltante !== null) {
            elements.faltanteValue.textContent = `${data.faltante.toFixed(2)} kg`;
        } else {
            elements.faltanteValue.textContent = '##### kg';
        }

        elements.otValue.textContent = data.ot || '#####';

        // Observaciones (siempre actualizar para manejar estado vacío)
        updateObservaciones(data.observaciones || []);

        // Historial
        updateHistory(data.history || []);

        // Velocidad Lineo
        if (data.plc && data.plc.velocidad_lineo !== undefined) {
            elements.lineoValue.textContent = Math.round(data.plc.velocidad_lineo);
        }

        // Presiones
        if (data.plc) {
            if (data.plc.presion_seguridad !== undefined) {
                elements.seguridadValue.textContent = Math.round(data.plc.presion_seguridad);
            }
            if (data.plc.presion_trabajo !== undefined) {
                elements.trabajoValue.textContent = Math.round(data.plc.presion_trabajo);
            }
            if (data.plc.presion_cabeza !== undefined) {
                elements.cabezaValue.textContent = Math.round(data.plc.presion_cabeza);
            }
        }

        // Ficha Tecnica (Valores Standard)
        if (data.velocidad_lineo_std !== undefined) elements.fichaTecnica1.textContent = data.velocidad_lineo_std;
        if (data.presion_seguridad_std !== undefined) elements.fichaTecnica2.textContent = data.presion_seguridad_std;
        if (data.presion_trabajo_std !== undefined) elements.fichaTecnica3.textContent = data.presion_trabajo_std;
        if (data.presion_cabeza_std !== undefined) elements.fichaTecnica4.textContent = data.presion_cabeza_std;
    }

    /**
     * Actualiza tabla de observaciones
     */
    function updateObservaciones(observaciones) {
        elements.observacionesTable.innerHTML = '';

        if (!observaciones || observaciones.length === 0) {
            return;
        }

        observaciones.forEach(obs => {
            const row = document.createElement('tr');

            // Formatear fecha
            let fechaStr = obs.fecha;
            try {
                const date = new Date(obs.fecha);
                fechaStr = date.toLocaleString('es-ES', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false // 24h format
                });
            } catch (e) {
                console.warn('Error formateando fecha:', e);
            }

            row.innerHTML = `
                <td>${fechaStr}</td>
                <td>${obs.usuario || '-'}</td>
                <td>${obs.prioridad || '-'}</td>
                <td>${obs.observacion || '-'}</td>
            `;
            elements.observacionesTable.appendChild(row);
        });
    }

    /**
     * Actualiza tabla de historial de estados
     * Columnas:
     * 1. Inicio Parada
     * 2. Tiempo Calentamiento
     * 3. Inicio Producción
     * 4. Total Parada
     */
    function updateHistory(history) {
        if (!elements.historyTable) return;

        // Limpiar intervalo previo si existe
        if (updateInterval) {
            clearInterval(updateInterval);
            updateInterval = null;
        }

        elements.historyTable.innerHTML = '';

        if (!history || history.length === 0) {
            return;
        }

        // Formatear fechas/horas (24h)
        const formatTime = (dateStr) => {
            try {
                const date = new Date(dateStr);
                return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
            } catch (e) { return '--:--'; }
        };

        const formatDate = (dateStr) => {
            try {
                const date = new Date(dateStr);
                return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });
            } catch (e) { return '--/--'; }
        };

        // ─────────────────────────────────────────────────────────────
        // LÓGICA DE AGRUPAMIENTO (STATE MACHINE)
        // ─────────────────────────────────────────────────────────────

        // 1. Ordenar cronológicamente (más antiguo primero) para procesar flujo
        const sortedHistory = [...history].sort((a, b) => new Date(a.inicio) - new Date(b.inicio));

        const cycles = [];
        let currentCycle = null;

        for (let i = 0; i < sortedHistory.length; i++) {
            const event = sortedHistory[i];
            const eventType = event.estado; // 'Produciendo', 'Maquina Parada', 'Calentamiento'

            // --- ESTADO: PRODUCIENDO ---
            if (eventType === 'Produciendo') {
                // Si hay un ciclo abierto, lo cerramos con este evento de producción
                if (currentCycle) {
                    currentCycle.prod = event;
                    currentCycle.end = event.inicio; // El ciclo termina cuando empieza la producción
                    cycles.push(currentCycle);
                    currentCycle = null; // Reset
                }
                // Si no hay ciclo abierto, ignoramos la producción (es el estado normal)
            }

            // --- ESTADO: PARADA ---
            else if (eventType.includes('Parada')) {
                // Si ya estamos en un ciclo...
                if (currentCycle) {
                    // Si veníamos de Calentamiento y volvemos a Parada (Parada -> Calentamiento -> Parada)
                    // SIGNIFICA: El intento de arranque falló o se detuvo. 
                    // ACCIÓN: Cerrar el ciclo anterior y empezar uno nuevo.
                    if (currentCycle.heat) {
                        currentCycle.end = event.inicio; // El ciclo anterior termina aquí
                        cycles.push(currentCycle);

                        // Iniciar NUEVO ciclo de parada
                        currentCycle = {
                            stop: event,
                            heat: null,
                            prod: null,
                            end: null
                        };
                    }
                    // Si veníamos de Parada (Parada -> Parada), es solo una actualización del mismo estado, ignorar o actualizar
                }
                // Si NO hay ciclo abierto, iniciamos uno nuevo
                else {
                    currentCycle = {
                        stop: event,
                        heat: null,
                        prod: null,
                        end: null
                    };
                }
            }

            // --- ESTADO: CALENTAMIENTO ---
            else if (eventType.includes('Calentamiento')) {
                // Si hay un ciclo de parada abierto, le agregamos el calentamiento
                if (currentCycle) {
                    // Solo registramos el PRIMER calentamiento del ciclo
                    if (!currentCycle.heat) {
                        currentCycle.heat = event;
                    }
                }
                // Si NO hay ciclo (raro, empezar directo en calentamiento?), creamos uno
                else {
                    currentCycle = {
                        stop: null, // No hubo parada registrada antes
                        heat: event,
                        prod: null,
                        end: null
                    };
                }
            }
        }

        // Si quedó un ciclo abierto al final (ciclo actual en curso)
        if (currentCycle) {
            cycles.push(currentCycle);
        }

        // ─────────────────────────────────────────────────────────────
        // RENDERIZADO
        // ─────────────────────────────────────────────────────────────

        // Invertir para mostrar lo más reciente arriba
        cycles.reverse();

        cycles.forEach((cycle, index) => {
            const row = document.createElement('tr');

            // --- COLUMNA 1: INICIO PARADA ---
            let col1 = '-';
            let stopStart = null;
            if (cycle.stop) {
                stopStart = new Date(cycle.stop.inicio);
                col1 = `${formatDate(cycle.stop.inicio)} ${formatTime(cycle.stop.inicio)}`;
            } else if (cycle.heat) {
                // Fallback si empezó directo en calentamiento
                stopStart = new Date(cycle.heat.inicio);
                col1 = `${formatDate(cycle.heat.inicio)} ${formatTime(cycle.heat.inicio)}*`;
            }

            // --- COLUMNA 2: TIEMPO CALENTAMIENTO ---
            let col2 = '-';
            let heatStart = null;
            if (cycle.heat) {
                heatStart = new Date(cycle.heat.inicio);

                // Si el ciclo terminó (ya sea por producción o por nueva parada)
                if (cycle.end) {
                    const end = new Date(cycle.end);
                    const diffMs = end - heatStart;
                    const diffMins = Math.floor(diffMs / 60000);
                    const hours = Math.floor(diffMins / 60);
                    const mins = diffMins % 60;
                    col2 = `${hours}h ${mins}m`;
                }
                // Si está activo
                else {
                    // Es el ciclo más reciente y está activo
                    if (index === 0) {
                        col2 = `<span id="active-heating-duration" class="text-accent">Calculando...</span>`;
                    } else {
                        col2 = 'En curso'; // No debería pasar si ordenamos bien
                    }
                }
            }

            // --- COLUMNA 3: INICIO PRODUCCIÓN ---
            let col3 = '-';
            if (cycle.prod) {
                col3 = `${formatDate(cycle.prod.inicio)} ${formatTime(cycle.prod.inicio)}`;
            } else if (cycle.end) {
                // Terminó pero no por producción (ej. nueva parada)
                col3 = `${formatDate(cycle.end)} ${formatTime(cycle.end)} (Parada)`;
            } else {
                col3 = 'En curso';
            }

            // --- COLUMNA 4: TOTAL PARADA ---
            let col4 = '-';
            if (stopStart) {
                if (cycle.end) {
                    const end = new Date(cycle.end);
                    const diffMs = end - stopStart;
                    const diffMins = Math.floor(diffMs / 60000);
                    const hours = Math.floor(diffMins / 60);
                    const mins = diffMins % 60;
                    col4 = `${hours}h ${mins}m`;
                } else {
                    // Activo
                    if (index === 0) {
                        col4 = `<span id="active-total-duration" class="text-accent">Calculando...</span>`;
                    } else {
                        col4 = 'En curso';
                    }
                }
            }

            row.innerHTML = `
                <td>${col1}</td>
                <td>${col2}</td>
                <td>${col3}</td>
                <td>${col4}</td>
            `;

            elements.historyTable.appendChild(row);

            // Configurar actualizaciones en tiempo real si es el primer elemento y está activo
            if (index === 0 && !cycle.end) {
                const updateDurations = () => {
                    const now = new Date();

                    // Actualizar Total Parada
                    if (stopStart) {
                        const diffMs = now - stopStart;
                        const diffMins = Math.floor(diffMs / 60000);
                        const hours = Math.floor(diffMins / 60);
                        const mins = diffMins % 60;
                        const el = document.getElementById('active-total-duration');
                        if (el) el.textContent = `${hours}h ${mins}m`;
                    }

                    // Actualizar Tiempo Calentamiento
                    if (heatStart) {
                        const diffMs = now - heatStart;
                        const diffMins = Math.floor(diffMs / 60000);
                        const hours = Math.floor(diffMins / 60);
                        const mins = diffMins % 60;
                        const el = document.getElementById('active-heating-duration');
                        if (el) el.textContent = `${hours}h ${mins}m`;
                    }
                };

                updateInterval = setInterval(updateDurations, 10000); // Cada 10s
                setTimeout(updateDurations, 0); // Ejecutar ya
            }
        });
    }

    function updateConnectionStatus(connected) {
        if (connected) {
            elements.statusDot.classList.remove('disconnected');
            elements.statusText.textContent = 'Conectado';
        } else {
            elements.statusDot.classList.add('disconnected');
            elements.statusText.textContent = 'Desconectado';
        }
    }

    /**
     * Obtiene extrusora actual
     */
    function getCurrentExtruder() {
        return currentExtruder;
    }

    return {
        init,
        loadData,
        updateConnectionStatus,
        getCurrentExtruder,
        enableFooterButton,
        disableFooterButton
    };
})();

window.UI = UI;
