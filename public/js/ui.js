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
                    minute: '2-digit'
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
     * Columnas Dinámicas:
     * 1. Inicio Parada (Siempre)
     * 2. Inicio Calentamiento (si activo) O Inicio Producción (si completado)
     * 3. Tiempo Calentamiento (si activo) O Tiempo Total Parada (si completado)
     */
    function updateHistory(history) {
        if (!elements.historyTable) return;

        // Limpiar intervalo previo si existe
        if (updateInterval) {
            clearInterval(updateInterval);
            updateInterval = null;
        }

        console.log('History received:', history); // Debugging

        elements.historyTable.innerHTML = '';

        if (!history || history.length === 0) {
            return;
        }

        // Formatear fechas/horas
        const formatTime = (dateStr) => {
            try {
                const date = new Date(dateStr);
                return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: true });
            } catch (e) { return '--:--'; }
        };

        const formatDate = (dateStr) => {
            try {
                const date = new Date(dateStr);
                return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });
            } catch (e) { return '--/--'; }
        };

        // Agrupar eventos en CICLOS de disrupción
        // Un ciclo es: Parada/Calentamiento → Producción
        const cycles = [];

        for (let i = 0; i < history.length; i++) {
            const event = history[i];

            // Si encontramos producción, buscar hacia atrás eventos de parada/calentamiento
            if (event.estado === 'Produciendo') {
                let cycle = {
                    prod: event,
                    stop: null,
                    heat: null
                };

                // Buscar hacia atrás (eventos más viejos) parada/calentamiento
                // dentro de una ventana de ~10 minutos antes de la producción
                const prodStart = new Date(event.inicio);
                let j = i + 1;

                while (j < history.length) {
                    const prevEvent = history[j];
                    const prevEnd = new Date(prevEvent.fin);
                    const gapMinutes = (prodStart - prevEnd) / 1000 / 60;

                    // Si el evento anterior terminó hace más de 10 minutos, no es parte del ciclo
                    if (gapMinutes > 10) break;

                    // Agregar al ciclo si es parada o calentamiento
                    if (prevEvent.estado.includes('Parada')) {
                        if (!cycle.stop) cycle.stop = prevEvent;
                    }
                    if (prevEvent.estado.includes('Calentamiento')) {
                        if (!cycle.heat) cycle.heat = prevEvent;
                    }

                    j++;

                    // Si ya encontramos ambos, podemos parar
                    if (cycle.stop && cycle.heat) break;
                }

                cycles.push(cycle);
            }
            // Si es parada/calentamiento sin producción después (parada en curso)
            else if (i === 0 && (event.estado.includes('Parada') || event.estado.includes('Calentamiento'))) {
                let cycle = {
                    prod: null,
                    stop: null,
                    heat: null
                };

                // Buscar todos los eventos de parada/calentamiento consecutivos
                let j = 0;
                while (j < history.length && history[j].estado !== 'Produciendo') {
                    const e = history[j];
                    if (e.estado.includes('Parada') && !cycle.stop) {
                        cycle.stop = e;
                    }
                    if (e.estado.includes('Calentamiento') && !cycle.heat) {
                        cycle.heat = e;
                    }
                    j++;
                }

                cycles.push(cycle);
            }
        }

        // Actualizar encabezados dinámicamente según el estado del primer ciclo (el más reciente)
        const headerCol2 = document.getElementById('header-col-2');
        const headerCol3 = document.getElementById('header-col-3');

        // Determinar estado actual basado en el primer ciclo
        const isProducing = cycles.length > 0 && cycles[0].prod;

        if (isProducing) {
            // Si el último ciclo ya está en producción
            if (headerCol2) headerCol2.textContent = 'Inicio Producción';
            if (headerCol3) headerCol3.textContent = 'Tiempo Total Parada';
        } else {
            // Si el último ciclo está en parada o calentamiento
            if (headerCol2) headerCol2.textContent = 'Inicio Calentamiento';
            if (headerCol3) headerCol3.textContent = 'Tiempo Calentamiento';
        }

        // Renderizar ciclos
        cycles.forEach((cycle, index) => {
            const row = document.createElement('tr');

            // Columna 1: Inicio Parada
            let col1 = '-';
            if (cycle.stop) {
                col1 = `${formatDate(cycle.stop.inicio)} ${formatTime(cycle.stop.inicio)}`;
            }

            // Columna 2: Inicio Calentamiento (si activo) o Inicio Producción (si completado)
            let col2 = '-';
            // Columna 3: Tiempo Calentamiento (si activo) o Tiempo Total Parada (si completado)
            let col3 = '-';

            if (cycle.prod) {
                // CICLO COMPLETADO (Producción iniciada)
                col2 = `${formatDate(cycle.prod.inicio)} ${formatTime(cycle.prod.inicio)}`;

                // Calcular tiempo total parada (desde inicio parada hasta inicio producción)
                if (cycle.stop) {
                    const diffMs = new Date(cycle.prod.inicio) - new Date(cycle.stop.inicio);
                    const diffMins = Math.floor(diffMs / 60000);
                    const hours = Math.floor(diffMins / 60);
                    const mins = diffMins % 60;
                    col3 = `${hours}h ${mins}m`;
                } else if (cycle.heat) {
                    // Si no hubo parada pero sí calentamiento (raro pero posible)
                    const diffMs = new Date(cycle.prod.inicio) - new Date(cycle.heat.inicio);
                    const diffMins = Math.floor(diffMs / 60000);
                    const hours = Math.floor(diffMins / 60);
                    const mins = diffMins % 60;
                    col3 = `${hours}h ${mins}m`;
                }
            } else {
                // CICLO ACTIVO (En Parada o Calentamiento)
                if (cycle.heat) {
                    col2 = `${formatDate(cycle.heat.inicio)} ${formatTime(cycle.heat.inicio)}`;

                    // Calcular duración dinámica si es el ciclo más reciente (index 0)
                    if (index === 0) {
                        const startTime = new Date(cycle.heat.inicio);

                        // Función para calcular y mostrar duración
                        const updateDuration = () => {
                            const now = new Date();
                            const diffMs = now - startTime;
                            const diffMins = Math.floor(diffMs / 60000);
                            const hours = Math.floor(diffMins / 60);
                            const mins = diffMins % 60;
                            const durationStr = `${hours}h ${mins}m`;

                            const cell = document.getElementById('active-heat-duration');
                            if (cell) cell.textContent = durationStr;
                        };

                        // Valor inicial
                        const now = new Date();
                        const diffMs = now - startTime;
                        const diffMins = Math.floor(diffMs / 60000);
                        const hours = Math.floor(diffMins / 60);
                        const mins = diffMins % 60;
                        col3 = `<span id="active-heat-duration">${hours}h ${mins}m</span>`;

                        // Iniciar intervalo de actualización (cada 10 segundos para mayor respuesta)
                        updateInterval = setInterval(updateDuration, 10000);
                    } else {
                        // Si no es el ciclo actual, mostrar duración estática
                        col3 = cycle.heat.duracion || '-';
                    }
                }
            }

            row.innerHTML = `
                <td>${col1}</td>
                <td>${col2}</td>
                <td>${col3}</td>
            `;

            elements.historyTable.appendChild(row);
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
