// extrusion-web/server/modbus.js
// -----------------------------------------------------------------------------
//  Lectura Modbus-TCP para TK-1, TK-2 y SIMA (versión para servidor web)
//  • Lee todas las señales definidas en `signals` con concurrencia controlada
//  • Agrupa por IP:PORT:ID para minimizar sockets
//  • Back-off exponencial si un esclavo falla reiteradamente
//  • Tamaños de bloque distintos por PLC
//  • Caché “last” para no reportar null de inmediato
//  • Emite por Socket.IO el paquete { tk1:{}, tk2:{}, sima:{} } en 'plc-data'
//  • Expone /api/plc con el último paquete leído
// -----------------------------------------------------------------------------

const ModbusRTU = require('modbus-serial');
const pLimitMod = require('p-limit');
const pLimit    = pLimitMod.default || pLimitMod

// ────────── Parámetros globales ──────────
const TIMEOUT_DEFAULT  = 1500;   // ms TK-1 / TK-2
const TIMEOUT_GATEWAY  = 2000;   // ms 192.168.1.111 (RTU gateway)
const TIMEOUT_SIMA     = 3000;   // ms SIMA
const MAX_REGS_DEFAULT = 125;
const MAX_REGS_GATEWAY =  40;    // gateway solo admite ~60
const MAX_REGS_SIMA    = 120;
const FAIL_LIMIT       =   5;
const BACKOFF_BASE     = 15000;
const BACKOFF_JITTER   =  3000;
const CONCURRENCY      =   5;    // hilos globales
const limit = pLimit(CONCURRENCY);
const CLIENT_IDLE_MS   = 60000;
const FALLBACK_TIMEOUT = 300_000; // 5 minutos
const DEFAULT_POLL_MS  = 1000;
const MAX_ADDR_GAP = 16; // regs; separa bloques si hay huecos grandes


// ────────── Timeout por IP ──────────
const plcTimeout = ip => {
  if (ip === '192.168.1.123') return TIMEOUT_SIMA;
  if (ip === '192.168.1.111') return TIMEOUT_GATEWAY;
  return TIMEOUT_DEFAULT;
};

// ────────── Máx. registros por IP ──────────
const getMaxRegs = ip => {
  if (ip === '192.168.1.123') return MAX_REGS_SIMA;
  if (ip === '192.168.1.111') return MAX_REGS_GATEWAY;
  return MAX_REGS_DEFAULT;
};

// ────────── Conversores ──────────
const int32 = regs => {
  const lo = regs[0] & 0xffff, hi = regs[1] & 0xffff;
  let n = (hi << 16) | lo;
  if (n & 0x80000000) n -= 0x100000000;
  return n;
};
const u16  = regs => regs[0] & 0xffff;
const s16  = regs => {
  const x = regs[0] & 0xffff;
  return (x & 0x8000) ? x - 0x10000 : x;
};
const f10 = regs => +(int32(regs) / 10).toFixed(1);

// conv “u16 dividido por 10”
const u16f10 = regs => {
  const raw = regs[0] & 0xffff;
  return raw / 10;
};

// 4 bytes big-endian → float32
const toFloat32 = regs => {
  const b = Buffer.allocUnsafe(4);
  b.writeUInt16BE(regs[0], 0);
  b.writeUInt16BE(regs[1], 2);
  return +b.readFloatBE(0).toFixed(1);
};

// float32 con word-swap (ABCD ⇢ CDAB)
const fpWS = regs => {
  const b = Buffer.allocUnsafe(4);
  b.writeUInt16BE(regs[1], 0);
  b.writeUInt16BE(regs[0], 2);
  return +b.readFloatBE(0).toFixed(1);
};

// ────────── Tabla de señales ──────────
//  NO elimines ni cambies comentarios: facilitan mantenimiento in-situ.
const signals = [
  /* ============================  TK-1  ============================ */
  { plc:'tk1', ip:'192.168.1.121',port:502, id:9, offset: 32, len:1, conv:f10, key:'gear_pump_rpm' },
  { plc:'tk1', ip:'192.168.1.69', port:502, id:1, offset:2010, len:1, conv:u16, key:'heater_h1_sv'  },
  { plc:'tk1', ip:'192.168.1.69', port:502, id:1, offset:2020, len:1, conv:u16, key:'heater_h2_sv'  },
  { plc:'tk1', ip:'192.168.1.69', port:502, id:1, offset:2030, len:1, conv:u16, key:'heater_h3_sv'  },
  { plc:'tk1', ip:'192.168.1.69', port:502, id:1, offset:2040, len:1, conv:u16, key:'heater_h4_sv'  },
  { plc:'tk1', ip:'192.168.1.69', port:502, id:1, offset:2050, len:1, conv:u16, key:'heater_h5_sv'  },
  { plc:'tk1', ip:'192.168.1.69', port:502, id:1, offset:2060, len:1, conv:u16, key:'heater_h6_sv'  },
  { plc:'tk1', ip:'192.168.1.69', port:502, id:1, offset:2070, len:1, conv:u16, key:'heater_h7_sv'  },
  { plc:'tk1', ip:'192.168.1.69', port:502, id:1, offset:2080, len:1, conv:u16, key:'heater_h8_sv'  },
  { plc:'tk1', ip:'192.168.1.69', port:502, id:1, offset:2090, len:1, conv:u16, key:'heater_h9_sv'  },
  { plc:'tk1', ip:'192.168.1.69', port:502, id:1, offset:2101, len:1, conv:u16, key:'heater_h10_sv' },
  { plc:'tk1', ip:'192.168.1.121',port:502, id:10,offset: 32, len:2, conv:u16, key:'take_a_speed'   },
  { plc:'tk1', ip:'192.168.1.121',port:502, id:11,offset: 32, len:2, conv:u16, key:'take_b_speed'   },
  { plc:'tk1', ip:'192.168.1.69', port:502, id:1, offset:3010, len:1, conv:u16, key:'extruder_hz'   },
  { plc:'tk1', ip:'192.168.1.69', port:502, id:1, offset:3020, len:1, conv:u16, key:'gear_pump_hz'  },
  { plc:'tk1', ip:'192.168.1.69', port:502, id:1, offset:3030, len:1, conv:u16, key:'take_a_hz'     },
  { plc:'tk1', ip:'192.168.1.69', port:502, id:1, offset:3040, len:1, conv:u16, key:'take_b_hz'     },
  { plc:'tk1', ip:'192.168.1.69', port:502, id:1, offset:3070, len:1, conv:u16, key:'take_c_hz'     },

  // --- PV TK-1 ---
  { plc:'tk1', ip:'192.168.1.69', port:502, id:1, offset:2011, len:1, conv:u16, key:'heater_h1_pv' },
  { plc:'tk1', ip:'192.168.1.69', port:502, id:1, offset:2021, len:1, conv:u16, key:'heater_h2_pv' },
  { plc:'tk1', ip:'192.168.1.69', port:502, id:1, offset:2031, len:1, conv:u16, key:'heater_h3_pv' },
  { plc:'tk1', ip:'192.168.1.69', port:502, id:1, offset:2041, len:1, conv:u16, key:'heater_h4_pv' },
  { plc:'tk1', ip:'192.168.1.69', port:502, id:1, offset:2051, len:1, conv:u16, key:'heater_h5_pv' },
  { plc:'tk1', ip:'192.168.1.69', port:502, id:1, offset:2061, len:1, conv:u16, key:'heater_h6_pv' },
  { plc:'tk1', ip:'192.168.1.69', port:502, id:1, offset:2071, len:1, conv:u16, key:'heater_h7_pv' },
  { plc:'tk1', ip:'192.168.1.69', port:502, id:1, offset:2081, len:1, conv:u16, key:'heater_h8_pv' },
  { plc:'tk1', ip:'192.168.1.69', port:502, id:1, offset:2091, len:1, conv:u16, key:'heater_h9_pv' },
  { plc:'tk1', ip:'192.168.1.69', port:502, id:1, offset:2101, len:1, conv:u16, key:'heater_h10_pv'},

  // presiones / línea
  { plc:'tk1', ip:'192.168.1.69', port:502, id:1, offset:2111, len:1, conv:u16, key:'before_filter_pv' },
  { plc:'tk1', ip:'192.168.1.69', port:502, id:1, offset:2121, len:1, conv:u16, key:'after_filter_pv'  },
  { plc:'tk1', ip:'192.168.1.69', port:502, id:1, offset:2122, len:1, conv:u16, key:'after_filter_sv'  },
  { plc:'tk1', ip:'192.168.1.69', port:502, id:1, offset:2130, len:1, conv:u16, key:'pump_press_pv'    },
  { plc:'tk1', ip:'192.168.1.69', port:502, id:1, offset:1090, len:1, conv:f10, key:'line_speed'       },

  // agua / hornos auxiliares TK-1
  { plc:'tk1', ip:'192.168.1.111',port:502, id:17,offset:130,len:1, conv:u16, key:'tina_agua_pv'      },
  { plc:'tk1', ip:'192.168.1.111',port:502, id:17,offset:  0,len:1, conv:u16, key:'tina_agua_sv'      },
  { plc:'tk1', ip:'192.168.1.111',port:502, id:18,offset:130,len:1, conv:u16, key:'horno_estab_h1_pv'},
  { plc:'tk1', ip:'192.168.1.111',port:502, id:18,offset:  0,len:1, conv:u16, key:'horno_estab_h1_sv'},
  { plc:'tk1', ip:'192.168.1.111',port:502, id:19,offset:130,len:1, conv:u16, key:'horno_estab_h2_pv'},
  { plc:'tk1', ip:'192.168.1.111',port:502, id:19,offset:  0,len:1, conv:u16, key:'horno_estab_h2_sv'},
  { plc:'tk1', ip:'192.168.1.111',port:502, id:22,offset:130,len:1, conv:u16, key:'tanque_enfri_pv'   },
  { plc:'tk1', ip:'192.168.1.111',port:502, id:22,offset:  0,len:1, conv:u16, key:'tanque_enfri_sv'   },
  { plc:'tk1', ip:'192.168.1.111',port:502, id:20,offset:130,len:1, conv:u16, key:'horno_estiro_h1_pv'},
  { plc:'tk1', ip:'192.168.1.111',port:502, id:20,offset:  0,len:1, conv:u16, key:'horno_estiro_h1_sv'},
  { plc:'tk1', ip:'192.168.1.111',port:502, id:21,offset:130,len:1, conv:u16, key:'horno_estiro_h2_pv'},
  { plc:'tk1', ip:'192.168.1.111',port:502, id:21,offset:  0,len:1, conv:u16, key:'horno_estiro_h2_sv'},
  { plc:'tk1', ip:'192.168.1.111',port:502, id:8 ,offset:295,len:1,conv:u16f10, key:'chiller_pv'   },
  { plc:'tk1', ip:'192.168.1.111',port:502, id:8 ,offset:16416,len:1,conv:u16f10, key:'chiller_sv'     },

  /* ============================  TK-2  ============================ */
  { plc:'tk2', ip:'192.168.1.70', port:502, id:1, offset:3090, len:1, conv:f10, key:'gear_pump_rpm' },
  { plc:'tk2', ip:'192.168.1.70', port:502, id:1, offset:2010, len:1, conv:u16, key:'heater_h1_sv'  },
  { plc:'tk2', ip:'192.168.1.70', port:502, id:1, offset:2020, len:1, conv:u16, key:'heater_h2_sv'  },
  { plc:'tk2', ip:'192.168.1.70', port:502, id:1, offset:2030, len:1, conv:u16, key:'heater_h3_sv'  },
  { plc:'tk2', ip:'192.168.1.70', port:502, id:1, offset:2040, len:1, conv:u16, key:'heater_h4_sv'  },
  { plc:'tk2', ip:'192.168.1.70', port:502, id:1, offset:2050, len:1, conv:u16, key:'heater_h5_sv'  },
  { plc:'tk2', ip:'192.168.1.70', port:502, id:1, offset:2060, len:1, conv:u16, key:'heater_h6_sv'  },
  { plc:'tk2', ip:'192.168.1.70', port:502, id:1, offset:2070, len:1, conv:u16, key:'heater_h7_sv'  },
  { plc:'tk2', ip:'192.168.1.70', port:502, id:1, offset:2080, len:1, conv:u16, key:'heater_h8_sv'  },
  { plc:'tk2', ip:'192.168.1.70', port:502, id:1, offset:2090, len:1, conv:u16, key:'heater_h9_sv'  },
  { plc:'tk2', ip:'192.168.1.70', port:502, id:1, offset:2100, len:1, conv:u16, key:'heater_h10_sv' },
  { plc:'tk2', ip:'192.168.1.70', port:502, id:1, offset:3100, len:1, conv:u16, key:'take_a_speed'  },
  { plc:'tk2', ip:'192.168.1.70', port:502, id:1, offset:3110, len:1, conv:u16, key:'take_b_speed'  },
  { plc:'tk2', ip:'192.168.1.70', port:502, id:1, offset:3010, len:1, conv:u16, key:'extruder_hz'   },
  { plc:'tk2', ip:'192.168.1.70', port:502, id:1, offset:3020, len:1, conv:u16, key:'gear_pump_hz'  },
  { plc:'tk2', ip:'192.168.1.70', port:502, id:1, offset:3030, len:1, conv:u16, key:'take_a_hz'     },
  { plc:'tk2', ip:'192.168.1.70', port:502, id:1, offset:3040, len:1, conv:u16, key:'take_b_hz'     },
  { plc:'tk2', ip:'192.168.1.70', port:502, id:1, offset:3070, len:1, conv:u16, key:'take_c_hz'     },

  // --- PV TK-2 ---
  { plc:'tk2', ip:'192.168.1.70', port:502, id:1, offset:2011, len:1, conv:u16, key:'heater_h1_pv' },
  { plc:'tk2', ip:'192.168.1.70', port:502, id:1, offset:2021, len:1, conv:u16, key:'heater_h2_pv' },
  { plc:'tk2', ip:'192.168.1.70', port:502, id:1, offset:2031, len:1, conv:u16, key:'heater_h3_pv' },
  { plc:'tk2', ip:'192.168.1.70', port:502, id:1, offset:2041, len:1, conv:u16, key:'heater_h4_pv' },
  { plc:'tk2', ip:'192.168.1.70', port:502, id:1, offset:2051, len:1, conv:u16, key:'heater_h5_pv' },
  { plc:'tk2', ip:'192.168.1.70', port:502, id:1, offset:2061, len:1, conv:u16, key:'heater_h6_pv' },
  { plc:'tk2', ip:'192.168.1.70', port:502, id:1, offset:2071, len:1, conv:u16, key:'heater_h7_pv' },
  { plc:'tk2', ip:'192.168.1.70', port:502, id:1, offset:2081, len:1, conv:u16, key:'heater_h8_pv' },
  { plc:'tk2', ip:'192.168.1.70', port:502, id:1, offset:2091, len:1, conv:u16, key:'heater_h9_pv' },
  { plc:'tk2', ip:'192.168.1.70', port:502, id:1, offset:2101, len:1, conv:u16, key:'heater_h10_pv'},

  // presiones / línea TK-2
  { plc:'tk2', ip:'192.168.1.70', port:502, id:1, offset:2111, len:1, conv:u16, key:'before_filter_pv' },
  { plc:'tk2', ip:'192.168.1.70', port:502, id:1, offset:2121, len:1, conv:u16, key:'after_filter_pv'  },
  { plc:'tk2', ip:'192.168.1.70', port:502, id:1, offset:2122, len:1, conv:u16, key:'after_filter_sv'  },
  { plc:'tk2', ip:'192.168.1.70', port:502, id:1, offset:2130, len:1, conv:u16, key:'pump_press_pv'    },
  { plc:'tk2', ip:'192.168.1.70', port:502, id:1, offset:1090, len:1, conv:f10, key:'line_speed'       },

  // agua / hornos auxiliares TK-2  (tina 4 bytes ÷10)
  { plc:'tk2', ip:'192.168.1.111',port:502, id:40,offset:130,len:1,conv:f10, key:'tina_agua_pv'      },
  { plc:'tk2', ip:'192.168.1.111',port:502, id:40,offset:  0,len:1,conv:f10, key:'tina_agua_sv'      },
  { plc:'tk2', ip:'192.168.1.111',port:502, id:33,offset:130,len:1,conv:u16, key:'horno_estab_h1_pv'},
  { plc:'tk2', ip:'192.168.1.111',port:502, id:33,offset:  0,len:1,conv:u16, key:'horno_estab_h1_sv'},
  { plc:'tk2', ip:'192.168.1.111',port:502, id:34,offset:130,len:1,conv:u16, key:'horno_estab_h2_pv'},
  { plc:'tk2', ip:'192.168.1.111',port:502, id:34,offset:  0,len:1,conv:u16, key:'horno_estab_h2_sv'},
  { plc:'tk2', ip:'192.168.1.111',port:502, id:13,offset:130,len:1,conv:u16, key:'tanque_enfri_pv'   },
  { plc:'tk2', ip:'192.168.1.111',port:502, id:13,offset:  0,len:1,conv:u16, key:'tanque_enfri_sv'   },
  { plc:'tk2', ip:'192.168.1.111',port:502, id:15,offset:130,len:1,conv:u16, key:'horno_estiro_h1_pv'},
  { plc:'tk2', ip:'192.168.1.111',port:502, id:15,offset:  0,len:1,conv:u16, key:'horno_estiro_h1_sv'},
  { plc:'tk2', ip:'192.168.1.111',port:502, id:10,offset:130,len:1,conv:u16, key:'horno_estiro_h2_pv'},
  { plc:'tk2', ip:'192.168.1.111',port:502, id:10,offset:  0,len:1,conv:u16, key:'horno_estiro_h2_sv'},
  { plc:'tk2', ip:'192.168.1.111',port:502, id:7 ,offset:295,len:1,conv:u16f10, key:'chiller_pv'   },
  { plc:'tk2', ip:'192.168.1.111',port:502, id:7 ,offset:16416,len:1,conv:u16f10, key:'chiller_sv'     },

  /* ============================  SIMA  ============================ */
  { plc:'sima', ip:'192.168.1.123',port:502, id:1, offset:20,len:2,conv:fpWS,key:'gear_pump_rpm' },
  { plc:'sima', ip:'192.168.1.123',port:502, id:1, offset:36,len:2,conv:fpWS,key:'line_speed'    },
  { plc:'sima', ip:'192.168.1.123',port:502, id:1, offset:34,len:2,conv:fpWS,key:'extruder_speed_act'},
  { plc:'sima', ip:'192.168.1.123',port:502, id:1, offset:22,len:2,conv:fpWS,key:'rollslow_speed_act'},
  { plc:'sima', ip:'192.168.1.123',port:502, id:1, offset:28,len:2,conv:fpWS,key:'rollfast_speed_act'},
  { plc:'sima', ip:'192.168.1.123',port:502, id:1, offset:46,len:2,conv:fpWS,key:'estiraje'      },
  { plc:'sima', ip:'192.168.1.123',port:502, id:1, offset:40,len:2,conv:fpWS,key:'before_filter_pv'},
  { plc:'sima', ip:'192.168.1.123',port:502, id:1, offset:42,len:2,conv:fpWS,key:'after_filter_pv' },
  { plc:'sima', ip:'192.168.1.123',port:502, id:1, offset:44,len:2,conv:fpWS,key:'pump_press_pv'  },
  { plc:'sima', ip:'192.168.1.111',port:502, id:14,offset:130,len:1,conv:f10, key:'tina_agua_pv'  },
  { plc:'sima', ip:'192.168.1.111',port:502, id:14,offset:  0,len:1,conv:f10, key:'tina_agua_sv'  },

  // --- SP SIMA ---
  { plc:'sima', ip:'192.168.1.123',port:502, id:1, offset:50,len:2,conv:fpWS,key:'temp_h1_sp' },
  { plc:'sima', ip:'192.168.1.123',port:502, id:1, offset:52,len:2,conv:fpWS,key:'temp_h2_sp' },
  { plc:'sima', ip:'192.168.1.123',port:502, id:1, offset:54,len:2,conv:fpWS,key:'temp_h3_sp' },
  { plc:'sima', ip:'192.168.1.123',port:502, id:1, offset:56,len:2,conv:fpWS,key:'temp_h4_sp' },
  { plc:'sima', ip:'192.168.1.123',port:502, id:1, offset:58,len:2,conv:fpWS,key:'temp_h5_sp' },
  { plc:'sima', ip:'192.168.1.123',port:502, id:1, offset:60,len:2,conv:fpWS,key:'temp_h6_sp' },
  { plc:'sima', ip:'192.168.1.123',port:502, id:1, offset:62,len:2,conv:fpWS,key:'temp_flange_sp'},
  { plc:'sima', ip:'192.168.1.123',port:502, id:1, offset:64,len:2,conv:fpWS,key:'temp_conn1_sp'},
  { plc:'sima', ip:'192.168.1.123',port:502, id:1, offset:66,len:2,conv:fpWS,key:'temp_filter_sp'},
  { plc:'sima', ip:'192.168.1.123',port:502, id:1, offset:68,len:2,conv:fpWS,key:'temp_conn2_sp'},
  { plc:'sima', ip:'192.168.1.123',port:502, id:1, offset:70,len:2,conv:fpWS,key:'temp_pump_sp' },
  { plc:'sima', ip:'192.168.1.123',port:502, id:1, offset:72,len:2,conv:fpWS,key:'temp_head_sp' },
  { plc:'sima', ip:'192.168.1.123',port:502, id:1, offset:74,len:2,conv:fpWS,key:'temp_nozzle_sp'},
  { plc:'sima', ip:'192.168.1.123',port:502, id:1, offset:140,len:1,conv:s16,key:'t1_sp'}, //Temp Horno Estabilizacion sup set
  { plc:'sima', ip:'192.168.1.123',port:502, id:1, offset:141,len:1,conv:s16,key:'t2_sp'}, //Temp Horno Estabilizacion inf set
  { plc:'sima', ip:'192.168.1.123',port:502, id:1, offset:142,len:1,conv:s16,key:'t3_sp'}, // Temp Horno Estiro sup set
  { plc:'sima', ip:'192.168.1.123',port:502, id:1, offset:143,len:1,conv:s16,key:'t4_sp'}, //Temp Horno Estiro inf set

  // --- PV SIMA ---
  { plc:'sima', ip:'192.168.1.123',port:502, id:1, offset:80 ,len:2,conv:fpWS,key:'temp_h1_pv' },
  { plc:'sima', ip:'192.168.1.123',port:502, id:1, offset:82 ,len:2,conv:fpWS,key:'temp_h2_pv' },
  { plc:'sima', ip:'192.168.1.123',port:502, id:1, offset:84 ,len:2,conv:fpWS,key:'temp_h3_pv' },
  { plc:'sima', ip:'192.168.1.123',port:502, id:1, offset:86 ,len:2,conv:fpWS,key:'temp_h4_pv' },
  { plc:'sima', ip:'192.168.1.123',port:502, id:1, offset:88 ,len:2,conv:fpWS,key:'temp_h5_pv' },
  { plc:'sima', ip:'192.168.1.123',port:502, id:1, offset:90 ,len:2,conv:fpWS,key:'temp_h6_pv' },
  { plc:'sima', ip:'192.168.1.123',port:502, id:1, offset:92 ,len:2,conv:fpWS,key:'temp_flange_pv'},
  { plc:'sima', ip:'192.168.1.123',port:502, id:1, offset:94 ,len:2,conv:fpWS,key:'temp_conn1_pv'},
  { plc:'sima', ip:'192.168.1.123',port:502, id:1, offset:96 ,len:2,conv:fpWS,key:'temp_filter_pv'},
  { plc:'sima', ip:'192.168.1.123',port:502, id:1, offset:98 ,len:2,conv:fpWS,key:'temp_conn2_pv'},
  { plc:'sima', ip:'192.168.1.123',port:502, id:1, offset:100,len:2,conv:fpWS,key:'temp_pump_pv' },
  { plc:'sima', ip:'192.168.1.123',port:502, id:1, offset:102,len:2,conv:fpWS,key:'temp_head_pv' },
  { plc:'sima', ip:'192.168.1.123',port:502, id:1, offset:104,len:2,conv:fpWS,key:'temp_nozzle_pv'},
  { plc:'sima', ip:'192.168.1.123',port:502, id:1, offset:144,len:1,conv:s16,key:'t1_pv'}, //Temp Horno Estabilizacion sup act
  { plc:'sima', ip:'192.168.1.123',port:502, id:1, offset:145,len:1,conv:s16,key:'t2_pv'}, //Temp Horno Estabilizacion inf act
  { plc:'sima', ip:'192.168.1.123',port:502, id:1, offset:146,len:1,conv:s16,key:'t3_pv'}, //Temp Horno Estiro sup act
  { plc:'sima', ip:'192.168.1.123',port:502, id:1, offset:147,len:1,conv:s16,key:'t4_pv'}, //Temp Horno Estiro inf act
];

// ────────── Back-off (por IP) ──────────
const backoff = {}; // { 'ip:port': { fails, until } }

// ────────── Agrupar señales por conexión (IP + PORT + ID) ──────────
const connGroups = Object.values(
  signals.reduce((acc, sig) => {
    const type = sig.type || 'holding';
    const k    = `${sig.ip}:${sig.port}:${sig.id}:${type}`;
    if (!acc[k]) acc[k] = { ip:sig.ip, port:sig.port, id:sig.id, type, defs:[] };
    acc[k].defs.push(sig);
    return acc;
  }, {})
);

// ────────── Concurrencia global con p-limit ──────────
const hostLimiters = {}; // { 'ip:port': pLimit(1) }
const getHostLimiter = (ip,port) => (hostLimiters[`${ip}:${port}`] ||= pLimit(1));

// ────────── Pool de clientes Modbus-TCP ──────────
const clients = {}; // { 'ip:port': { client, lastUsed } }

// ────────── Drop del cliente en caso de error de conexión ──────────
function dropClient(ip, port) {
  const k = `${ip}:${port}`;
  const rec = clients[k];
  if (rec) {
    try { rec.client.close(); } catch {}
    delete clients[k];
  }
}


async function getClient(ip, port) {
  const k = `${ip}:${port}`;
  const rec = clients[k];
  if (rec && rec.client.isOpen) {
    rec.lastUsed = Date.now();
    rec.client.setTimeout(plcTimeout(ip));
    return rec.client;
  }
  const c = new ModbusRTU();
  c.setTimeout(plcTimeout(ip));
  await c.connectTCP(ip, { port });
  clients[k] = { client:c, lastUsed:Date.now() };
  return c;
}

// Cerrar sockets inactivos
setInterval(() => {
  const now = Date.now();
  for (const [k, rec] of Object.entries(clients)) {
    if (now - rec.lastUsed > CLIENT_IDLE_MS) {
      try { rec.client.close(); } catch {}
      delete clients[k];
    }
  }
}, CLIENT_IDLE_MS);

// ────────── Helper: particiona defs en bloques ≤ maxRegs ──────────
function chunkDefs(defs, maxRegs) {
  const sorted = defs.slice().sort((a,b)=>a.offset-b.offset);
  const chunks = [];
  let cur = null;
  for (const d of sorted) {
    const start = d.offset;
    const end   = d.offset + d.len - 1;
    const bigGap = cur && (start - cur.maxOff) > MAX_ADDR_GAP;
    if (!cur || (end - cur.minOff + 1) > maxRegs || bigGap) {
      if (cur) chunks.push(cur);
      cur = { defs:[d], minOff:start, maxOff:end };
    } else {
      cur.defs.push(d);
      cur.minOff = Math.min(cur.minOff, start);
      cur.maxOff = Math.max(cur.maxOff, end);
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

// ────────── Intenta Holding y luego Input ──────────
async function tryRead(client, off, count) {
  try {
    return await client.readHoldingRegisters(off, count);
  } catch {
    return client.readInputRegisters(off, count);
  }
}

// ────────── Lectura de un grupo (una conexión) ──────────
async function readGroup({ ip, port, id, defs }) {
  const bkKey = `${ip}:${port}:${id}`;
  const bo = (backoff[bkKey] ||= { fails:0, until:0 });
  if (Date.now() < bo.until) return {};

  try {
    const client = await getClient(ip, port);
    client.setID(id);

    const merged = {};
    const maxRegs = getMaxRegs(ip);

    for (const ch of chunkDefs(defs, maxRegs)) {
      try {
        const resp = await tryRead(client, ch.minOff, ch.maxOff - ch.minOff + 1);

        for (const d of ch.defs) {
          const slice = resp.data.slice(
            d.offset - ch.minOff,
            d.offset - ch.minOff + d.len
          );
          (merged[d.plc] ||= {})[d.key] = d.conv(slice);
        }
      } catch (e) {
        console.warn(`[Modbus] Error ${ip}:${port} ID=${id} regs ${ch.minOff}-${ch.maxOff}`, e.modbusCode ?? e.message);

        // Reintento fino por señal: si el bloque falla, intento leer cada offset individual
        for (const d of ch.defs) {
          try {
            const r1 = await tryRead(client, d.offset, d.len);
            (merged[d.plc] ||= {})[d.key] = d.conv(r1.data);
          } catch {
            (merged[d.plc] ||= {})[d.key] = null;
          }
        }
      }
    }

    bo.fails = 0; bo.until = 0; // reset back-off
    return merged;

  } catch (err) {
    // ⇒ si falló esta conexión, soltamos el socket para forzar reconexión limpia
    dropClient(ip, port);

    bo.fails++;
    if (bo.fails >= FAIL_LIMIT) {
      const extra = Math.floor((Math.random()*2 - 1) * BACKOFF_JITTER);
      bo.until = Date.now() + BACKOFF_BASE + extra;
      console.error(`[Modbus] Back-off ${ip}:${port} ID=${id} durante ${BACKOFF_BASE+extra} ms`);
    }
    return {};
  }
}

// ────────── readAll – lee todos los PLC y devuelve objeto agregado ──────────
const last     = { tk1: {}, tk2: {}, sima: {} };
const lastSeen = { tk1: 0,   tk2: 0,   sima: 0 };

async function readAll() {
  const result = { tk1: {}, tk2: {}, sima: {} };
  const ahora = Date.now();

  await Promise.all(
    connGroups.map(grp => limit(async () => {
      const perHost = getHostLimiter(grp.ip, grp.port);
      const part = await perHost(() => readGroup(grp));

      for (const plc of ['tk1','tk2','sima']) {
        // si llegaron datos para este plc, actualizamos lastSeen
        if (part[plc] && Object.keys(part[plc]).length > 0) {
          lastSeen[plc] = ahora;
        }

        if (!part[plc]) continue;
        Object.entries(part[plc]).forEach(([k, v]) => {
          if (v !== null && v !== undefined) {
            // lectura válida: guardamos y cacheamos
            result[plc][k] = v;
            last[plc][k]   = v;
          } else {
            // lectura fallida: ¿fallback permitido?
            if (ahora - lastSeen[plc] <= FALLBACK_TIMEOUT && last[plc][k] !== undefined) {
              result[plc][k] = last[plc][k];
            } else {
              // más de 5 min sin señal: limpio cache y muestro "Sin datos" (undefined)
              last[plc][k]   = undefined;
              result[plc][k] = undefined;
            }
          }
        });
      }
    }))
  );

  // Fallback de PLC completo si este ciclo no aportó nada
  ['tk1','tk2','sima'].forEach(plc => {
    if (Object.keys(result[plc]).length === 0 &&
        (ahora - lastSeen[plc] <= FALLBACK_TIMEOUT)) {
      result[plc] = { ...last[plc] };
    }
  });

  // Estiraje derivado (TK-1 / TK-2) si hay velocidades válidas
  ['tk1','tk2'].forEach(plc => {
    const a = result[plc].take_a_speed;
    const b = result[plc].take_b_speed;
    result[plc].estiraje = (!a || a === 0) ? undefined : +(b/a).toFixed(1);
  });

  return result;
}

// ────────── Bucle de sondeo + Socket.IO + Endpoint REST ──────────
function initModbus({ io, app, pollMs = DEFAULT_POLL_MS } = {}) {
  let timer = null;
  let running = false;
  let lastPacket = { tk1:{}, tk2:{}, sima:{} };

  const tick = async () => {
    if (running) return;        // evita solapes si una lectura se demora
    running = true;
    try {
      const data = await readAll();
      lastPacket = data;
      if (io) io.emit('plc-data', data);
    } catch (err) {
      console.error('[Modbus] error en tick:', err?.message || err);
    } finally {
      running = false;
    }
  };

  // primer disparo inmediato
  tick();
  timer = setInterval(tick, Math.max(250, pollMs|0));

  // endpoint REST opcional
  if (app && typeof app.get === 'function') {
    app.get('/api/plc', (_req, res) => res.json(lastPacket));
  }

  // función de parada
  const stop = () => {
    if (timer) { clearInterval(timer); timer = null; }
    // cerrar todos los sockets modbus
    for (const [k, rec] of Object.entries(clients)) {
      try { rec.client.close(); } catch {}
      delete clients[k];
    }
  };

  return { stop, getLast: () => lastPacket };
}

module.exports = {
  initModbus,
  readAll
};
