// apps/Alarmas_extrusion/server/alarm-config.js
module.exports = {
  // Umbrales de velocidad (coinciden con front)
  RUN_MIN_SPEED: 15,   // RUN si line_speed ≥ 15
  ALARM_MIN_SPEED: 30, // Evaluar alarmas de proceso solo si line_speed ≥ 30

  // Niveles de alarma (portería, tiempos y tipo de comparación)
  // type: 'relative' ⇒ (pv – sp) vs threshold | 'absolute' ⇒ pv vs threshold
  // timeSec: retardo antes de disparar (0 = inmediato)
  levelsByMachine: {
    /* ==============================  TK-1  ============================== */
    tk1: {
      /* Extrusoras 1-10 */
      heater_h1_pv:  { LL:{type:'relative',threshold:-5, timeSec:900}, HH:{type:'relative',threshold: 5, timeSec:900} },
      heater_h2_pv:  { LL:{type:'relative',threshold:-5, timeSec:900}, HH:{type:'relative',threshold: 5, timeSec:900} },
      heater_h3_pv:  { LL:{type:'relative',threshold:-5, timeSec:900}, HH:{type:'relative',threshold: 5, timeSec:900} },
      heater_h4_pv:  { LL:{type:'relative',threshold:-5, timeSec:900}, HH:{type:'relative',threshold: 5, timeSec:900} },
      heater_h5_pv:  { LL:{type:'relative',threshold:-5, timeSec:900}, HH:{type:'relative',threshold: 5, timeSec:900} },
      heater_h6_pv:  { LL:{type:'relative',threshold:-5, timeSec:900}, HH:{type:'relative',threshold: 5, timeSec:900} },
      heater_h7_pv:  { LL:{type:'relative',threshold:-5, timeSec:900}, HH:{type:'relative',threshold: 5, timeSec:900} },
      heater_h8_pv:  { LL:{type:'relative',threshold:-5, timeSec:900}, HH:{type:'relative',threshold: 5, timeSec:900} },
      heater_h9_pv:  { LL:{type:'relative',threshold:-5, timeSec:900}, HH:{type:'relative',threshold: 5, timeSec:900} },
      heater_h10_pv: { LL:{type:'relative',threshold:-5, timeSec:900}, HH:{type:'relative',threshold: 5, timeSec:900} },

      /* Presión antes de filtro */
      before_filter_pv: { HH:{type:'absolute',threshold:150,timeSec:0} },

      /* Presión después de filtro */
      after_filter_pv: {
        LL:{type:'relative',threshold:-1,timeSec:300},
        HH:{type:'relative',threshold: 1,timeSec:300}
      },

      /* Presión de bomba */
      pump_press_pv: {
        H :{type:'absolute',threshold:200,timeSec:0},
        HH:{type:'absolute',threshold:220,timeSec:0}
      },

      /* Horno estabilizador */
      horno_estab_h1_pv:{ LL:{type:'relative',threshold:-5,timeSec:900}, HH:{type:'relative',threshold: 5,timeSec:900} },
      horno_estab_h2_pv:{ LL:{type:'relative',threshold:-5,timeSec:900}, HH:{type:'relative',threshold: 5,timeSec:900} },

      /* Tanque de enfriamiento */
      tanque_enfri_pv:  { LL:{type:'relative',threshold:-10,timeSec:900} },

      /* Horno de estiro */
      horno_estiro_h1_pv:{
        LL:{type:'relative',threshold:-4,timeSec:300},
        L :{type:'relative',threshold:-3,timeSec:300},
        H :{type:'relative',threshold: 3,timeSec:300},
        HH:{type:'relative',threshold: 4,timeSec:300}
      },
      horno_estiro_h2_pv:{
        LL:{type:'relative',threshold:-4,timeSec:300},
        L :{type:'relative',threshold:-3,timeSec:300},
        H :{type:'relative',threshold: 3,timeSec:300},
        HH:{type:'relative',threshold: 4,timeSec:300}
      },

      /* Chiller */
      chiller_pv: { HH:{type:'relative',threshold: 2,timeSec:3600} },

      /* Tina de agua */
      tina_agua_pv: { H:{type:'absolute',threshold:26,timeSec:0}, HH:{type:'absolute',threshold:28,timeSec:0} }
    },

    /* ==============================  TK-2  ============================== */
    tk2: {
      /* Extrusoras 1-10 */
      heater_h1_pv:  { LL:{type:'relative',threshold:-5, timeSec:900}, HH:{type:'relative',threshold: 5, timeSec:900} },
      heater_h2_pv:  { LL:{type:'relative',threshold:-5, timeSec:900}, HH:{type:'relative',threshold: 5, timeSec:900} },
      heater_h3_pv:  { LL:{type:'relative',threshold:-5, timeSec:900}, HH:{type:'relative',threshold: 5, timeSec:900} },
      heater_h4_pv:  { LL:{type:'relative',threshold:-5, timeSec:900}, HH:{type:'relative',threshold: 5, timeSec:900} },
      heater_h5_pv:  { LL:{type:'relative',threshold:-5, timeSec:900}, HH:{type:'relative',threshold: 5, timeSec:900} },
      heater_h6_pv:  { LL:{type:'relative',threshold:-5, timeSec:900}, HH:{type:'relative',threshold: 5, timeSec:900} },
      heater_h7_pv:  { LL:{type:'relative',threshold:-5, timeSec:900}, HH:{type:'relative',threshold: 5, timeSec:900} },
      heater_h8_pv:  { LL:{type:'relative',threshold:-5, timeSec:900}, HH:{type:'relative',threshold: 5, timeSec:900} },
      heater_h9_pv:  { LL:{type:'relative',threshold:-5, timeSec:900}, HH:{type:'relative',threshold: 5, timeSec:900} },
      heater_h10_pv: { LL:{type:'relative',threshold:-5, timeSec:900}, HH:{type:'relative',threshold: 5, timeSec:900} },

      /* Presión antes de filtro */
      before_filter_pv: { HH:{type:'absolute',threshold:150,timeSec:0} },

      /* Presión después de filtro */
      after_filter_pv: {
        LL:{type:'relative',threshold:-1,timeSec:300},
        HH:{type:'relative',threshold: 1,timeSec:300}
      },

      /* Presión de bomba */
      pump_press_pv: {
        H :{type:'absolute',threshold:200,timeSec:0},
        HH:{type:'absolute',threshold:220,timeSec:0}
      },

      /* Horno estabilizador */
      horno_estab_h1_pv:{ LL:{type:'relative',threshold:-5,timeSec:900}, HH:{type:'relative',threshold: 5,timeSec:900} },
      horno_estab_h2_pv:{ LL:{type:'relative',threshold:-5,timeSec:900}, HH:{type:'relative',threshold: 5,timeSec:900} },

      /* Tanque de enfriamiento */
      tanque_enfri_pv:  { LL:{type:'relative',threshold:-10,timeSec:900} },

      /* Horno de estiro */
      horno_estiro_h1_pv:{
        LL:{type:'relative',threshold:-4,timeSec:300},
        L :{type:'relative',threshold:-3,timeSec:300},
        H :{type:'relative',threshold: 3,timeSec:300},
        HH:{type:'relative',threshold: 4,timeSec:300}
      },
      horno_estiro_h2_pv:{
        LL:{type:'relative',threshold:-4,timeSec:300},
        L :{type:'relative',threshold:-3,timeSec:300},
        H :{type:'relative',threshold: 3,timeSec:300},
        HH:{type:'relative',threshold: 4,timeSec:300}
      },

      /* Chiller */
      chiller_pv: { HH:{type:'relative',threshold: 2,timeSec:3600} },

      /* Tina de agua */
      tina_agua_pv: { H:{type:'absolute',threshold:26,timeSec:0}, HH:{type:'absolute',threshold:28,timeSec:0} }
    },

    /* ==============================  SIMA  ============================== */
    sima: {
      /* Extrusoras / zonas */
      temp_h1_pv:     { LL:{type:'relative',threshold:-5, timeSec:900}, HH:{type:'relative',threshold: 5, timeSec:900} },
      temp_h2_pv:     { LL:{type:'relative',threshold:-5, timeSec:900}, HH:{type:'relative',threshold: 5, timeSec:900} },
      temp_h3_pv:     { LL:{type:'relative',threshold:-5, timeSec:900}, HH:{type:'relative',threshold: 5, timeSec:900} },
      temp_h4_pv:     { LL:{type:'relative',threshold:-5, timeSec:900}, HH:{type:'relative',threshold: 5, timeSec:900} },
      temp_h5_pv:     { LL:{type:'relative',threshold:-5, timeSec:900}, HH:{type:'relative',threshold: 5, timeSec:900} },
      temp_h6_pv:     { LL:{type:'relative',threshold:-5, timeSec:900}, HH:{type:'relative',threshold: 5, timeSec:900} },
      temp_flange_pv: { LL:{type:'relative',threshold:-5, timeSec:900}, HH:{type:'relative',threshold: 5, timeSec:900} },
      temp_conn1_pv:  { LL:{type:'relative',threshold:-5, timeSec:900}, HH:{type:'relative',threshold: 5, timeSec:900} },
      temp_filter_pv: { LL:{type:'relative',threshold:-5, timeSec:900}, HH:{type:'relative',threshold: 5, timeSec:900} },
      temp_conn2_pv:  { LL:{type:'relative',threshold:-5, timeSec:900}, HH:{type:'relative',threshold: 5, timeSec:900} },
      temp_pump_pv:   { LL:{type:'relative',threshold:-5, timeSec:900}, HH:{type:'relative',threshold: 5, timeSec:900} },
      temp_head_pv:   { LL:{type:'relative',threshold:-5, timeSec:900}, HH:{type:'relative',threshold: 5, timeSec:900} },
      temp_nozzle_pv: { LL:{type:'relative',threshold:-5, timeSec:900}, HH:{type:'relative',threshold: 5, timeSec:900} },

      /* Presión antes de filtro */
      before_filter_pv: { H:{type:'absolute',threshold:180,timeSec:0}, HH:{type:'absolute',threshold:185,timeSec:0} },

      /* Presión después de filtro */
      after_filter_pv: {
        LL:{type:'relative',threshold:-1,timeSec:300},
        HH:{type:'relative',threshold: 1,timeSec:300}
      },

      /* Presión de bomba */
      pump_press_pv: {
        H :{type:'absolute',threshold:200,timeSec:0},
        HH:{type:'absolute',threshold:220,timeSec:0}
      },

      /* Horno estabilizador */
      t1_pv:{ LL:{type:'relative',threshold:-5,timeSec:900}, HH:{type:'relative',threshold: 5,timeSec:900} },
      t2_pv:{ LL:{type:'relative',threshold:-5,timeSec:900}, HH:{type:'relative',threshold: 5,timeSec:900} },

      /* Tanque de enfriamiento */
      tanque_enfri_pv: { LL:{type:'relative',threshold:-5,timeSec:0}, HH:{type:'relative',threshold: 5,timeSec:0} },

      /* Horno de estiro */
      t3_pv:{
        LL:{type:'relative',threshold:-4,timeSec:300},
        L :{type:'relative',threshold:-3,timeSec:300},
        H :{type:'relative',threshold: 3,timeSec:300},
        HH:{type:'relative',threshold: 4,timeSec:300}
      },
      t4_pv:{
        LL:{type:'relative',threshold:-4,timeSec:300},
        L :{type:'relative',threshold:-3,timeSec:300},
        H :{type:'relative',threshold: 3,timeSec:300},
        HH:{type:'relative',threshold: 4,timeSec:300}
      },

      /* Chiller */
      chiller_pv: { H:{type:'relative',threshold: 4,timeSec:0}, HH:{type:'relative',threshold: 8,timeSec:0} },

      /* Tina de agua */
      tina_agua_pv: { H:{type:'absolute',threshold:26,timeSec:0}, HH:{type:'absolute',threshold:28,timeSec:0} }
    }
  },

  // Alias legibles para reportes/Telegram
  displayName: {
    heater_h1_pv:'Temp Extrusora 1', heater_h2_pv:'Temp Extrusora 2', heater_h3_pv:'Temp Extrusora 3',
    heater_h4_pv:'Temp Extrusora 4', heater_h5_pv:'Temp Extrusora 5', heater_h6_pv:'Temp Filtro',
    heater_h7_pv:'Temp Bomba',       heater_h8_pv:'Temp Conexión',    heater_h9_pv:'Temp Cabeza',
    heater_h10_pv:'Temp Caja Filtro',
    before_filter_pv:'P. Seguridad',  after_filter_pv:'P. Trabajo',  pump_press_pv:'P. Cabeza',
    horno_estab_h1_pv:'Horno Estab H1', horno_estab_h2_pv:'Horno Estab H2',
    horno_estiro_h1_pv:'Horno Estiro H1', horno_estiro_h2_pv:'Horno Estiro H2',
    tanque_enfri_pv:'T. Pre-Calentamiento', tina_agua_pv:'Tina Agua', chiller_pv:'Chiller',
    temp_h1_pv:'Temp EXT1', temp_h2_pv:'Temp EXT2', temp_h3_pv:'Temp EXT3', temp_h4_pv:'Temp EXT4',
    temp_h5_pv:'Temp EXT5', temp_h6_pv:'Temp EXT6', temp_flange_pv:'Temp Flange', temp_conn1_pv:'Temp Conn1',
    temp_filter_pv:'Temp Filtro', temp_conn2_pv:'Temp Conn2', temp_pump_pv:'Temp Bomba', temp_head_pv:'Temp Cabeza',
    temp_nozzle_pv:'Temp Tobera',
    t1_pv:'Temp Horno Estab1', t2_pv:'Temp Horno Estab2', t3_pv:'Temp Horno Estiro1', t4_pv:'Temp Horno Estiro2'
  }
};
