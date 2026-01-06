// server/config/modbus.config.js

// Definición de señales Modbus basada en Alarmas_extrusion
// Conversiones:
// f10: valor / 10
// u16: valor directo (unsigned 16 bit)
// fpWS: Float con Word Swap (CDAB)

const MODBUS_CONFIG = {
    tk1: {
        ip: '192.168.1.69',
        port: 502,
        id: 1,
        signals: [
            { name: 'velocidad_lineo', address: 1090, type: 'f10' },      // line_speed
            { name: 'presion_seguridad', address: 2111, type: 'u16' },    // before_filter_pv
            { name: 'presion_trabajo', address: 2121, type: 'u16' },      // after_filter_pv
            { name: 'presion_cabeza', address: 2130, type: 'u16' }        // pump_press_pv
        ]
    },
    tk2: {
        ip: '192.168.1.70',
        port: 502,
        id: 1,
        signals: [
            { name: 'velocidad_lineo', address: 1090, type: 'f10' },      // line_speed
            { name: 'presion_seguridad', address: 2111, type: 'u16' },    // before_filter_pv
            { name: 'presion_trabajo', address: 2121, type: 'u16' },      // after_filter_pv
            { name: 'presion_cabeza', address: 2130, type: 'u16' }        // pump_press_pv
        ]
    },
    sima: {
        ip: '192.168.1.123',
        port: 502,
        id: 1,
        signals: [
            { name: 'velocidad_lineo', address: 36, type: 'fpWS', len: 2 },       // line_speed
            { name: 'presion_seguridad', address: 40, type: 'fpWS', len: 2 },     // before_filter_pv
            { name: 'presion_trabajo', address: 42, type: 'fpWS', len: 2 },       // after_filter_pv
            { name: 'presion_cabeza', address: 44, type: 'fpWS', len: 2 }         // pump_press_pv
        ]
    }
};

module.exports = MODBUS_CONFIG;
