/* ------------------------------------------------------------------
 *  renderer.js – HMI Retorcidos  (TK-1, TK-2, SIMA)
 *  ▸ Muestra datos live (PLC + SQL)
 *  ▸ Variadores (TK1/TK2) en cliente
 *  ▸ Alarmas de proceso: llegan desde el SERVER por Socket.IO
 *  ▸ OFFLINE → 20 s sin datos Modbus (solo TK-1/TK-2)
 * ------------------------------------------------------------------ */

/* ──────────────────────────────────────────────────────────────────
 *  1. Helpers de estilo
 * ────────────────────────────────────────────────────────────────── */
const CLASS_LIVE  = 'ok';
const CLASS_SET   = 'ft';
const CLASS_EMPTY = 'na';
const CLASS_WARN  = 'warn';  // naranja
const CLASS_ERROR = 'error'; // rojo

function setText(id, value, stateClass = CLASS_LIVE) {
  const el = document.getElementById(id);
  if (!el) return;
  const empty = value == null || value === '' || value === 'Sin datos';
  el.textContent = empty ? 'Sin datos' : value;
  if (el.classList.contains(CLASS_WARN) || el.classList.contains(CLASS_ERROR)) return;
  el.classList.remove(CLASS_LIVE, CLASS_SET, CLASS_EMPTY);
  el.classList.add(empty ? CLASS_EMPTY : stateClass);
}

/* ──────────────────────────────────────────────────────────────────
 *  2. Mapa PLC   →  sufijo DOM    (¡¡incluye TODAS las señales!!)
 * ────────────────────────────────────────────────────────────────── */
const liveMap = {
  extruder_hz: 'extruder_hz', gear_pump_hz: 'gear_pump_hz',
  gear_pump_rpm:'gear_pump_rpm', line_speed:'line_speed', line_speed_act: 'line_speed',
  estiraje:'est',
  take_a_speed:'take_a_speed',   take_b_speed:'take_b_speed',
  take_a_hz:'take_a_hz',         take_b_hz:'take_b_hz',    take_c_hz:'take_c_hz',

  before_filter_pv:'before_filter_pv', after_filter_pv:'after_filter_pv',
  after_filter_sv:'after_filter_sv',   pump_press_pv:'pump_press_pv',

  heater_h1_pv:'heater_h1_pv', heater_h2_pv:'heater_h2_pv', heater_h3_pv:'heater_h3_pv',
  heater_h4_pv:'heater_h4_pv', heater_h5_pv:'heater_h5_pv', heater_h6_pv:'heater_h6_pv',
  heater_h7_pv:'heater_h7_pv', heater_h8_pv:'heater_h8_pv', heater_h9_pv:'heater_h9_pv',
  heater_h10_pv:'heater_h10_pv',

  heater_h1_sv:'heater_h1_sv', heater_h2_sv:'heater_h2_sv', heater_h3_sv:'heater_h3_sv',
  heater_h4_sv:'heater_h4_sv', heater_h5_sv:'heater_h5_sv', heater_h6_sv:'heater_h6_sv',
  heater_h7_sv:'heater_h7_sv', heater_h8_sv:'heater_h8_sv', heater_h9_sv:'heater_h9_sv',
  heater_h10_sv:'heater_h10_sv',

  tina_agua_pv:'tina_agua_pv', tina_agua_sv:'tina_agua_sv',

  horno_estab_h1_pv:'horno_estab_h1_pv', horno_estab_h1_sv:'horno_estab_h1_sv',
  horno_estab_h2_pv:'horno_estab_h2_pv', horno_estab_h2_sv:'horno_estab_h2_sv',
  horno_estiro_h1_pv:'horno_estiro_h1_pv', horno_estiro_h1_sv:'horno_estiro_h1_sv',
  horno_estiro_h2_pv:'horno_estiro_h2_pv', horno_estiro_h2_sv:'horno_estiro_h2_sv',

  tanque_enfri_pv:'tanque_enfri_pv', tanque_enfri_sv:'tanque_enfri_sv',

  chiller_pv:'chiller_pv', chiller_sv:'chiller_sv',

  /* ---------- SIMA ---------- */
  temp_h1_sp:'temp_h1_sp', temp_h2_sp:'temp_h2_sp', temp_h3_sp:'temp_h3_sp',
  temp_h4_sp:'temp_h4_sp', temp_h5_sp:'temp_h5_sp', temp_h6_sp:'temp_h6_sp',
  temp_flange_sp:'temp_flange_sp', temp_conn1_sp:'temp_conn1_sp',
  temp_filter_sp:'temp_filter_sp', temp_conn2_sp:'temp_conn2_sp',
  temp_pump_sp:'temp_pump_sp', temp_head_sp:'temp_head_sp', temp_nozzle_sp:'temp_nozzle_sp',

  temp_h1_pv:'temp_h1_pv', temp_h2_pv:'temp_h2_pv', temp_h3_pv:'temp_h3_pv',
  temp_h4_pv:'temp_h4_pv', temp_h5_pv:'temp_h5_pv', temp_h6_pv:'temp_h6_pv',
  temp_flange_pv:'temp_flange_pv', temp_conn1_pv:'temp_conn1_pv',
  temp_filter_pv:'temp_filter_pv', temp_conn2_pv:'temp_conn2_pv',
  temp_pump_pv:'temp_pump_pv', temp_head_pv:'temp_head_pv', temp_nozzle_pv:'temp_nozzle_pv',

  t1_sp:'t1_sp', t2_sp:'t2_sp', t3_sp:'t3_sp', t4_sp:'t4_sp',

  tank_level_set:'tank_level_set', tank_level_act:'tank_level_act',
  pump_tank_set:'pump_tank_set',   pump_tank_act:'pump_tank_act',
  t1_pv: 'horno_estab_h1_pv',
  t2_pv: 'horno_estab_h2_pv',
  t3_pv: 'horno_estiro_h1_pv',
  t4_pv: 'horno_estiro_h2_pv'
};

// Mapa inverso: sufijo DOM -> [claves PLC que lo pueden alimentar]
const revLiveMap = Object.entries(liveMap).reduce((acc, [k, suf]) => {
  (acc[suf] ||= []).push(k);
  return acc;
}, {});

/* ──────────────────────────────────────────────────────────────────
 *  3. Alias legibles (para tablas y variadores)
 * ────────────────────────────────────────────────────────────────── */
const displayName = {
  heater_h1_pv:'Temp Extrusora 1', heater_h2_pv:'Temp Extrusora 2', heater_h3_pv:'Temp Extrusora 3',
  heater_h4_pv:'Temp Extrusora 4', heater_h5_pv:'Temp Extrusora 5', heater_h6_pv:'Temp Filtro',
  heater_h7_pv:'Temp Bomba',       heater_h8_pv:'Temp Conexión',    heater_h9_pv:'Temp Cabeza',
  heater_h10_pv:'Temp Caja Filtro',

  before_filter_pv:'P. Seguridad',
  after_filter_pv:'P. Trabajo',
  pump_press_pv:'P. Cabeza',

  horno_estab_h1_pv:'Horno Estab H1', horno_estab_h2_pv:'Horno Estab H2',
  horno_estiro_h1_pv:'Horno Estiro H1', horno_estiro_h2_pv:'Horno Estiro H2',
  tanque_enfri_pv:'T. Pre-Calentamiento', tina_agua_pv:'Tina Agua', chiller_pv:'Chiller',

  temp_h1_pv:'Temp EXT1', temp_h2_pv:'Temp EXT2', temp_h3_pv:'Temp EXT3',
  temp_h4_pv:'Temp EXT4', temp_h5_pv:'Temp EXT5', temp_h6_pv:'Temp EXT6',
  temp_flange_pv:'Temp Flange', temp_conn1_pv:'Temp Conn1',
  temp_filter_pv:'Temp Filtro', temp_conn2_pv:'Temp Conn2',
  temp_pump_pv:'Temp Bomba', temp_head_pv:'Temp Cabeza', temp_nozzle_pv:'Temp Tobera',
  tank_level_act:'Nivel Tanque', pump_tank_act:'Bomba Tanque',
  t1_pv: 'Temp Horno Estab1', t2_pv: 'Temp Horno Estab2',
  t3_pv: 'Temp Horno Estiro1', t4_pv: 'Temp Horno Estiro2'
};

/* ──────────────────────────────────────────────────────────────────
 *  4. Máquinas & OFFLINE
 * ────────────────────────────────────────────────────────────────── */
const machines        = ['tk1','tk2','sima'];
const offlineMachines = ['tk1','tk2'];
const LAST_UPDATE_MS  = { tk1:0, tk2:0, sima:0 };
const TIMEOUT_MS      = 20000;

// Cache del último paquete NO vacío por máquina
const LAST_GOOD = { tk1:{}, tk2:{}, sima:{} };

// Debounce para evitar RUN↔STOP instantáneo
const RUN_DEBOUNCE_MS = 3000;
const RUN_STATE = {
  tk1: { val:false, since:0 },
  tk2: { val:false, since:0 },
  sima:{ val:true,  since:0 }  // SIMA suele estar “en marcha”
};

function withDebouncedRun(machine, now, instant) {
  const st = RUN_STATE[machine];
  if (instant === st.val) { st.since = 0; return st.val; }
  if (!st.since) { st.since = now; return st.val; }
  if (now - st.since >= RUN_DEBOUNCE_MS) { st.val = instant; st.since = 0; }
  return st.val;
}

/* Helper: detectar si un id pertenece a SQL (producto/OT, ficha técnica o dosificación) */
function isSqlFieldId (m, elId) {
  if (elId === `${m}-prod` || elId === `${m}-ot`) return true;
  const suf = elId.startsWith(`${m}-`) ? elId.slice((`${m}-`).length) : '';
  if (Object.values(setMap   || {}).includes(suf)) return true;
  if (Object.values(dosisMap || {}).includes(suf)) return true;
  return false;
}

function clearProcessAlarmsUI(machine) {
  // Quita filas parpadeantes y colores de todas las PV conocidas
  Object.keys(displayName).forEach(pvKey => {
    const cell = document.getElementById(`${machine}-${liveMap[pvKey]}`);
    if (cell) {
      const row = cell.closest('tr');
      if (row) row.classList.remove('alarm-row-warn', 'alarm-row-error');
      cell.classList.remove('ok','ft','na','warn','error');
      cell.classList.add('ok');
    }
  });
  // Quita ítems de lista activos
  const ul = document.getElementById(`${machine}-alarms`);
  const map = activeAlarms[machine];
  for (const [pvKey, li] of map.entries()) { if (li) li.remove(); }
  map.clear();
}

function markOffline(m) {
  if (m === 'sima') return; // si quieres, nunca vacíes SIMA
  const card = document.getElementById(`${m}-card`);
  if (!card) return;
  card.classList.add('stopped');
  clearProcessAlarmsUI(m);
  card.querySelectorAll(`span[id^="${m}-"], td[id^="${m}-"]`).forEach(el => {
    if (isSqlFieldId(m, el.id)) return; // ← conservar SQL
    el.textContent = 'Sin datos';
    el.classList.remove(CLASS_LIVE, CLASS_SET, CLASS_WARN, CLASS_ERROR);
    el.classList.add(CLASS_EMPTY);
  });
}

setInterval(() => {
  const now = Date.now();
  offlineMachines.forEach(m => {
    if (now - LAST_UPDATE_MS[m] > TIMEOUT_MS) markOffline(m);
  });
}, 5000);

/* ──────────────────────────────────────────────────────────────────
 *  5. Estado de alarmas (solo UI)
 * ────────────────────────────────────────────────────────────────── */
const activeAlarms = { tk1:new Map(), tk2:new Map(), sima:new Map() }; // pvKey -> <li>

/* Variadores (Hz) — por máquina (se mantienen en cliente) */
const VARIADOR_KEYS_BY_M = {
  tk1: ['extruder_hz','take_a_hz','take_b_hz','take_c_hz'], // TK-1: SIN gear_pump_hz
  tk2: ['extruder_hz','gear_pump_hz','take_a_hz','take_b_hz','take_c_hz']
};
const ALL_VARIADORES = Array.from(new Set([
  ...VARIADOR_KEYS_BY_M.tk1, ...VARIADOR_KEYS_BY_M.tk2
]));
function clearVariadorAlarms(machine) {
  ALL_VARIADORES.forEach(k => {
    const li = activeAlarms[machine].get(k);
    if (li) { li.remove(); activeAlarms[machine].delete(k); }
    const suf = liveMap[k];
    const cell = document.getElementById(`${machine}-${suf}`);
    if (cell) {
      const row = cell.closest('tr');
      if (row) row.classList.remove('alarm-row-warn', 'alarm-row-error');
      cell.classList.remove('ok','ft','na','warn','error');
      cell.classList.add('ok');
    }
  });
}

/* Helper: colorear celda/fila según nivel (server events) */
function colorPVCell(machine, pvKey, level) {
  const suf = liveMap[pvKey];
  if (!suf) return;
  const cell = document.getElementById(`${machine}-${suf}`);
  if (!cell) return;

  cell.classList.remove('ok','ft','na','warn','error');
  if (level === 'L' || level === 'H') {
    cell.classList.add('warn');
  } else if (level === 'LL' || level === 'HH') {
    cell.classList.add('error');
  } else {
    cell.classList.add('ok');
  }

  const row = cell.closest('tr');
  if (!row) return;
  row.classList.remove('alarm-row-warn','alarm-row-error');
  if (level === 'L' || level === 'H')   row.classList.add('alarm-row-warn');
  if (level === 'LL' || level === 'HH') row.classList.add('alarm-row-error');
}

/* Aplicar alarma de PROCESO recibida del server */
function applyProcessAlarm(machine, { pvKey, level, dispositivo, valor_actual, valor_sp }) {
  const isWarn = (level === 'L' || level === 'H');

  // (1) colorear celda/fila
  colorPVCell(machine, pvKey, level);

  // (2) HH/LL van en la lista; H/L no
  const ul = document.getElementById(`${machine}-alarms`);
  if (!ul) return;

  if (isWarn) {
    // quitar <li> si estuviera
    const li = activeAlarms[machine].get(pvKey);
    if (li) { li.remove(); activeAlarms[machine].delete(pvKey); }
    return;
  }

  const tag  = dispositivo || displayName[pvKey] || pvKey;
  const desc = (level === 'LL') ? `Valor mín superado (< ${valor_sp})`
              : (level === 'HH') ? `Valor máx superado (> ${valor_sp})`
              : (level === 'L')  ? `Valor bajo (< ${valor_sp})`
              : (level === 'H')  ? `Valor alto (> ${valor_sp})` : '';

  let li = activeAlarms[machine].get(pvKey);
  if (!li) {
    li = document.createElement('li');
    li.dataset.trigger = new Date().toLocaleTimeString('es-ES', { hour12: false });
    activeAlarms[machine].set(pvKey, li);
  }
  li.className   = CLASS_ERROR;
  li.textContent = `${li.dataset.trigger} | ${tag} | ${valor_actual} | ${desc}`;
  ul.prepend(li);
}

/* Despejar alarma de PROCESO (server) */
function clearProcessAlarm(machine, pvKey) {
  const li = activeAlarms[machine].get(pvKey);
  if (li) { li.remove(); activeAlarms[machine].delete(pvKey); }
  colorPVCell(machine, pvKey, null);
}

/* ──────────────────────────────────────────────────────────────────
 *  6. PLC Live (pintado + variadores en cliente)
 * ────────────────────────────────────────────────────────────────── */
const RUN_MIN_SPEED   = 15; // TK1/TK2: RUN si line_speed ≥ 15
const ALARM_MIN_SPEED = 30; // Gate visual para variadores

function isRunning(m, d) {
  if (m === 'sima') {
    const ex = (+d.extruder_speed_act) > 0;
    const rs = (+d.rollslow_speed_act) > 0;
    const rf = (+d.rollfast_speed_act) > 0;
    const ls = (+d.line_speed_act || +d.line_speed) > 14;
    return ex && rs && rf && ls;
  }
  if (m === 'tk1') {
    const ex = (+d.extruder_hz) > 0;
    const tb = (+d.take_b_hz)  > 0;
    const tc = (+d.take_c_hz)  > 0;
    const ls = (+d.line_speed) > 14;
    return ex && tb && tc && ls;
  }
  if (m === 'tk2') {
    const ex = (+d.extruder_hz)  > 0;
    const gp = (+d.gear_pump_hz) > 0;
    const ta = (+d.take_a_hz)    > 0;
    const tb = (+d.take_b_hz)    > 0;
    const tc = (+d.take_c_hz)    > 0;
    const ls = (+d.line_speed)   > 14;
    return ex && gp && ta && tb && tc && ls;
  }
  return false;
}

window.electronAPI.onPlcData(({ tk1, tk2, sima }) => {
  const now  = Date.now();
  const plc  = { tk1, tk2, sima };

  machines.forEach(m => {
    const d    = plc[m] || {};
    const card = document.getElementById(`${m}-card`);
    if (!card) return;

    // Si el paquete trae algo, marcamos tiempo y actualizamos el último bueno
    if (d && Object.keys(d).length > 0) {
      LAST_UPDATE_MS[m] = now;
      Object.assign(LAST_GOOD[m], d);
    }

    // Fuente de verdad para UI
    const src = (Object.keys(d).length > 0) ? d : LAST_GOOD[m];

    // RUN/STOP con debounce
    const instantRun = isRunning(m, src);
    const running    = withDebouncedRun(m, now, instantRun);
    card.classList.toggle('stopped', !running);

    const lineSpeedForGate = m === 'sima'
      ? (+src.line_speed_act || +src.line_speed || 0)
      : (+src.line_speed || 0);

    const canCheckVariadores = (m === 'tk1' || m === 'tk2') && (lineSpeedForGate >= ALARM_MIN_SPEED);

    /* ---------- Variadores (cliente) ---------- */
    if (canCheckVariadores) {
      const mensajes = {
        extruder_hz:  'Variador de Extrusor está apagado',
        gear_pump_hz: 'Variador de Bomba está apagado',
        take_a_hz:    'Variador de Rodillo Lento está apagado',
        take_b_hz:    'Variador de Rodillo Rápido está apagado',
        take_c_hz:    'Variador de Rodillo de Arrastre está apagado'
      };
      const keys = VARIADOR_KEYS_BY_M[m] || [];
      const missing = keys.filter(key => (src[key] == null || src[key] <= 0));

      if (missing.length >= 3) {
        // 3+ apagados ⇒ parada sin listar alarmas de variador
        card.classList.add('stopped');
        clearVariadorAlarms(m);
      } else if (missing.length > 0) {
        const ul = document.getElementById(`${m}-alarms`);
        missing.forEach(key => {
          const suf = liveMap[key];
          const el  = document.getElementById(`${m}-${suf}`);
          if (el) el.classList.add(CLASS_ERROR);

          let li = activeAlarms[m].get(key);
          if (!li) {
            li = document.createElement('li');
            li.className   = CLASS_ERROR;
            li.textContent = mensajes[key];
            ul.prepend(li);
            activeAlarms[m].set(key, li);

            // Persistencia de variadores solo desde cliente
            window.electronAPI.insertAlarm({
              extrusora    : m.toUpperCase(),
              dispositivo  : mensajes[key].replace(' está apagado',''),
              valor_actual : 0,
              valor_sp     : 0,
              mensaje      : mensajes[key],
              tipo         : 'HH'
            });
          }
        });
        // limpiar variadores que YA no están faltando
        keys.filter(k => !missing.includes(k)).forEach(k => {
          const li = activeAlarms[m].get(k);
          if (li) { li.remove(); activeAlarms[m].delete(k); }
          const suf = liveMap[k];
          const cell = document.getElementById(`${m}-${suf}`);
          if (cell) {
            const row = cell.closest('tr');
            if (row) row.classList.remove('alarm-row-warn', 'alarm-row-error');
            cell.classList.remove('ok','ft','na','warn','error');
            cell.classList.add('ok');
          }
        });

      } else {
        clearVariadorAlarms(m);
      }
    } else {
      clearVariadorAlarms(m);
    }

    /* ---------- Pintar valores live ---------- */
    Object.entries(src).forEach(([k, val]) => {
      let v = val;
      const H2_FAULT_THRESHOLD = 200;
      if ((k === 'horno_estiro_h2_pv' || k === 't4_pv') && (+v >= H2_FAULT_THRESHOLD)) v = 'H. AGUA';
      const suf = liveMap[k];
      if (suf) setText(`${m}-${suf}`, v, CLASS_LIVE);
    });
    // Limpiar si no llegó ningún alias y la máquina está OFFLINE (>20s)
    for (const [suf, keys] of Object.entries(revLiveMap)) {
      const elId = `${m}-${suf}`;
      if (!document.getElementById(elId)) continue;
      const hasAny  = keys.some(k => k in src);
      const offline = (Date.now() - LAST_UPDATE_MS[m]) > TIMEOUT_MS;
      if (!hasAny && offline) setText(elId, null, CLASS_EMPTY);
    }
  });
});

/* ──────────────────────────────────────────────────────────────────
 *  7. Eventos de ALARMAS desde el SERVER
 * ────────────────────────────────────────────────────────────────── */
window.electronAPI.onAlarmFired(({ extrusora, pvKey, level, dispositivo, valor_actual, valor_sp }) => {
  const m = String(extrusora || '').toLowerCase(); // 'tk1' | 'tk2' | 'sima'
  if (!machines.includes(m)) return;
  applyProcessAlarm(m, { pvKey, level, dispositivo, valor_actual, valor_sp });
});

window.electronAPI.onAlarmCleared(({ extrusora, pvKey /*, level */ }) => {
  const m = String(extrusora || '').toLowerCase();
  if (!machines.includes(m)) return;
  clearProcessAlarm(m, pvKey);
});

/* ──────────────────────────────────────────────────────────────────
 *  8. Datos SQL (Ficha técnica + dosificación)
 * ────────────────────────────────────────────────────────────────── */
const setMap = {
  line:'line-set', estiraje:'est-set', bomba:'bomb-set',
  seg:'seg-set', trab:'trab-set', cabeza:'cab-set',
  chiller:'chiller-set', tAgua:'tagua-set',
  hEstab1:'hestab1-set', hEstab2:'hestab2-set',
  hEstiro1:'hestiro1-set', hEstiro2:'hestiro2-set',
  tEnfriamiento:'tenfriamiento-set',
  tol1:'tol1', tol2:'tol2', tol3:'tol3', tol4:'tol4'
};
const dosisMap = { hdpe:'hdpe', vista:'vista', uv:'uv', color:'color' };

window.electronAPI.onDbData(({ tk1, tk2, sima }) => {
  const db = { tk1, tk2, sima };
  machines.forEach(m => {
    const box   = db[m] || {};
    const info  = box.info  || {};
    const ficha = box.ficha || {};
    const dos   = box.dosis || {};

    setText(`${m}-prod`, info.producto || '', CLASS_SET);
    setText(`${m}-ot`,   info.ot       || '', CLASS_SET);

    Object.entries(setMap).forEach(([f,s]) =>
      setText(`${m}-${s}`, ficha[f] || '', CLASS_SET)
    );
    Object.entries(dosisMap).forEach(([f,s]) =>
      setText(`${m}-${s}`, dos[f] || '', CLASS_SET)
    );
  });
});

/* ──────────────────────────────────────────────────────────────────
 *  9. Historial de alarmas (modal)
 * ────────────────────────────────────────────────────────────────── */
const historyBtn    = document.getElementById('history-btn');
const closeHistory  = document.getElementById('close-history');
const loadHistory   = document.getElementById('load-history');
const historyModal  = document.getElementById('history-modal');
const fromDateInput = document.getElementById('history-from');
const toDateInput   = document.getElementById('history-to');
const historyTables = document.getElementById('history-tables');

function toggleHistoryModal(show) {
  historyModal.classList.toggle('hidden', !show);
}
function autosizeHistoryModal() {
  const modal  = historyModal.querySelector('.modal-content');
  if (!modal) return;
  const header = modal.querySelector('header');
  const table  = modal.querySelector('.history-table');
  if (!table) return;
  const padLeft  = parseFloat(getComputedStyle(modal).paddingLeft);
  const padRight = parseFloat(getComputedStyle(modal).paddingRight);
  const horizPad = padLeft + padRight;
  const needed = Math.max(header.scrollWidth, table.scrollWidth) + horizPad;
  modal.style.width = `${Math.min(needed, window.innerWidth * 0.96)}px`;
}
function fmtDate (iso) {
  return new Date(iso)
    .toLocaleString('es-PE', {
      day:'2-digit', month:'2-digit', year:'numeric',
      hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:true
    })
    .replace(',', '')
    .replace(/\s+a\. m\./i, ' a.m.')
    .replace(/\s+p\. m\./i, ' p.m.');
}
function renderHistory(events) {
  historyTables.innerHTML = '';
  const byMach = events.reduce((acc, e) => {
    (acc[e.extrusora.toLowerCase()] ||= []).push(e);
    return acc;
  }, {});
  Object.entries(byMach).forEach(([mach, list]) => {
    const h = document.createElement('h2');
    h.textContent = mach.toUpperCase();
    historyTables.appendChild(h);

    const wrap = document.createElement('div');
    wrap.className = 'history-table-wrap';

    const table = document.createElement('table');
    table.className = 'history-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th>Dispositivo</th>
          <th>Valor Registrado</th>
          <th>Valor Seteado</th>
          <th>Inicio</th>
          <th>Fin</th>
          <th>Duración</th>
        </tr>
      </thead>
      <tbody>
        ${list.map(e => `
          <tr>
            <td>${e.dispositivo}</td>
            <td>${e.valor_registrado}</td>
            <td>${e.valor_seteado}</td>
            <td>${fmtDate(e.inicio)}</td>
            <td>${fmtDate(e.fin)}</td>
            <td>${e.duracion}</td>
          </tr>`).join('')}
      </tbody>`;
    wrap.appendChild(table);
    historyTables.appendChild(wrap);
  });
  autosizeHistoryModal();
}

historyBtn.addEventListener('click', () => {
  const now = new Date();
  toDateInput.value   = now.toISOString().slice(0, 10);
  fromDateInput.value = new Date(now - 86_400_000).toISOString().slice(0, 10);
  toggleHistoryModal(true);
  historyBtn.style.display = 'none';
  autosizeHistoryModal();
});
closeHistory.addEventListener('click', () => {
  toggleHistoryModal(false);
  historyBtn.style.display = '';
});
loadHistory.addEventListener('click', async () => {
  const from = fromDateInput.value;
  const to   = toDateInput.value;
  if (!from || !to) { alert('Selecciona ambas fechas'); return; }
  const events = await window.electronAPI.getHistoricalAlarms(from, to);
  renderHistory(events);
});
window.addEventListener('resize', autosizeHistoryModal);
