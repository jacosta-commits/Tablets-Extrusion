// apps/Alarmas_extrusion/server/alarm-engine.js
const { RUN_MIN_SPEED, ALARM_MIN_SPEED, levelsByMachine, displayName } = require('./alarm-config');

const now = () => Date.now();
const MSG = lvl => ({
  LL: v => `Valor mín superado (< ${v})`,
  L : v => `Valor bajo (< ${v})`,
  H : v => `Valor alto (> ${v})`,
  HH: v => `Valor máx superado (> ${v})`
}[lvl]);

// Mapa PV→sufijo para encontrar los SP/SV correspondientes
const svKey = k => (k.endsWith('_pv') ? k.replace('_pv', '_sv') : k.replace('_pv','_sp'));

function isRunning(m, d) {
  if (m === 'sima') {
    const ex = (+d.extruder_speed_act) > 0;
    const rs = (+d.rollslow_speed_act) > 0;
    const rf = (+d.rollfast_speed_act) > 0;
    const ls = (+d.line_speed_act || +d.line_speed) > (RUN_MIN_SPEED - 1);
    return ex && rs && rf && ls;
  }
  if (m === 'tk1') {
    const ex = (+d.extruder_hz) > 0;
    const tb = (+d.take_b_hz)  > 0;
    const tc = (+d.take_c_hz)  > 0;
    const ls = (+d.line_speed) > (RUN_MIN_SPEED - 1);
    return ex && tb && tc && ls;
  }
  if (m === 'tk2') {
    const ex = (+d.extruder_hz)  > 0;
    const gp = (+d.gear_pump_hz) > 0;
    const ta = (+d.take_a_hz)    > 0;
    const tb = (+d.take_b_hz)    > 0;
    const tc = (+d.take_c_hz)    > 0;
    const ls = (+d.line_speed)   > (RUN_MIN_SPEED - 1);
    return ex && gp && ta && tb && tc && ls;
  }
  return false;
}

class AlarmEngine {
  constructor({ io, insertAlarmFn }) {
    this.io = io;
    this.insertAlarmFn = insertAlarmFn || (()=>{});
    this.startTimes = { tk1:new Map(), tk2:new Map(), sima:new Map() }; // key: pv_lvl -> ts
    this.pendingLvl = { tk1:new Map(), tk2:new Map(), sima:new Map() }; // pvKey -> lvl
    this.firedLvl   = { tk1:new Map(), tk2:new Map(), sima:new Map() }; // pvKey -> lvl
    this.activePayloads = { tk1:new Map(), tk2:new Map(), sima:new Map() }; // pvKey -> payload
  }

  // Llama con { tk1:{...}, tk2:{...}, sima:{...} } en cada tick PLC
  feed(plcPack) {
    ['tk1','tk2','sima'].forEach(m => this._evalMachine(m, plcPack[m] || {}));
  }

  _emit(type, payload) {
    // type: 'alarm-fired' | 'alarm-cleared'
    this.io.emit(type, payload);
  }

  _evalMachine(m, d) {
    const running = isRunning(m, d);
    const line = m === 'sima' ? (+d.line_speed_act || +d.line_speed || 0) : (+d.line_speed || 0);
    const canEval = running && line >= ALARM_MIN_SPEED;

    if (!canEval) {
      // limpia estados (solo proceso; variadores/otras lógicas quedan en tu server donde corresponda)
      for (const pvKey of Object.keys(levelsByMachine[m] || {})) {
        this._clear(m, pvKey);
      }
      return;
    }

    for (const [pvKey, lvls] of Object.entries(levelsByMachine[m] || {})) {
      const pv = +d[pvKey];
      // ¿Algún nivel es 'relative'? Entonces sí necesitamos SV.
      const needSV = Object.values(lvls || {}).some(cfg => cfg && cfg.type === 'relative');
      const svRaw  = d[svKey(pvKey)];
      const sv     = (svRaw === undefined || svRaw === null) ? NaN : +svRaw;

      // filtros especiales (mismos que tenías en front)
      if ((m === 'tk1' || m === 'tk2') && pvKey === 'horno_estiro_h2_pv' && (+d.horno_estiro_h2_pv >= 200)) {
        this._clear(m, pvKey); continue;
      }
      if (m === 'sima' && pvKey === 't4_pv' && (+d.t4_pv >= 200)) {
        this._clear(m, pvKey); continue;
      }
      const isCajaFiltro =
        ((m === 'tk1' || m === 'tk2') && pvKey === 'heater_h10_pv') ||
        (m === 'sima' && pvKey === 'temp_filter_pv');
      if (isCajaFiltro && (+d.after_filter_pv || 0) < 118) {
        this._clear(m, pvKey); continue;
      }

      // Validaciones mínimas de datos
      if (Number.isNaN(pv) || (needSV && Number.isNaN(sv))) { this._clear(m, pvKey); continue; }

      const diff = pv - sv;
      const ok = lvl => {
        const cfg = lvls[lvl];
        if (!cfg) return false;
        if (cfg.type === 'relative') {
          return (lvl === 'LL' || lvl === 'L') ? (diff <= cfg.threshold) : (diff >= cfg.threshold);
        }
        // absolute
        return (lvl === 'LL' || lvl === 'L') ? (pv <= cfg.threshold) : (pv >= cfg.threshold);
      };

      let cand = null;
      if      (ok('HH')) cand = 'HH';
      else if (ok('H'))  cand = 'H';
      else if (ok('LL')) cand = 'LL';
      else if (ok('L'))  cand = 'L';

      if (!cand) { this._clear(m, pvKey); continue; }

      const key = `${pvKey}_${cand}`;
      const prevCand = this.pendingLvl[m].get(pvKey);

      if (prevCand !== cand) {
        // cambia severidad → reinicia cronómetro y quita item visible si era HH/LL
        this.pendingLvl[m].set(pvKey, cand);
        this.startTimes[m].set(key, now());
      }

      const secs = (lvls[cand]?.timeSec ?? 0);
      const t0   = this.startTimes[m].get(key) ?? now();
      if (secs === 0 || (now() - t0) >= secs*1000) {
        // dispara (único por PV hasta que cambie/se borre)
        const lastFired = this.firedLvl[m].get(pvKey);
        if (lastFired !== cand) {
          this.firedLvl[m].set(pvKey, cand);

          const cfg    = lvls[cand] || {};
          const refVal = cfg.type === 'relative' ? sv : cfg.threshold;

          const payload = {
            extrusora: m.toUpperCase(),
            pvKey,
            level: cand,                  // 'L','LL','H','HH'
            tipo: cand,                   // ← usado por el anti-spam/Telegram
            dispositivo: displayName[pvKey] || pvKey,
            valor_actual: pv,
            valor_sp: refVal,             // SV si relative; threshold si absolute
            mensaje: MSG(cand)(refVal)
          };

          this.activePayloads[m].set(pvKey, payload); // guardar activa
          // Persistencia/Telegram: sólo una vez al pasar a este nivel
          this.insertAlarmFn(payload).catch?.(()=>{});

          // Evento único para todos los clientes
          this._emit('alarm-fired', payload);
        }
      }
    }
  }

  _clear(m, pvKey) {
    if (this.pendingLvl[m].has(pvKey) || this.firedLvl[m].has(pvKey)) {
      this.pendingLvl[m].delete(pvKey);
      for (const lvl of ['HH','H','LL','L']) this.startTimes[m].delete(`${pvKey}_${lvl}`);
      if (this.firedLvl[m].has(pvKey)) {
        const level = this.firedLvl[m].get(pvKey);
        this.firedLvl[m].delete(pvKey);
        this.activePayloads[m].delete(pvKey);
        this._emit('alarm-cleared', { extrusora: m.toUpperCase(), pvKey, level });
      }
    }
  }

  /** Devuelve un array con todas las alarmas actualmente activas */
  getActive() {
    const out = [];
    for (const m of ['tk1','tk2','sima']) {
      for (const p of this.activePayloads[m].values()) out.push(p);
    }
    return out;
  }
}

module.exports = AlarmEngine;
