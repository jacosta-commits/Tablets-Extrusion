# Sistema de Monitoreo de Extrusoras

Sistema web para monitoreo y control de extrusoras con integración SQL Server y PLC/Modbus.

## 🚀 Características

- ✅ Panel de actualización remota de vistas
- ✅ Selector dinámico de extrusoras (TK1, TK2, SIMA)
- ✅ Integración con SQL Server (Acabados_2022, Medidores_2023)
- ✅ WebSocket para actualizaciones en tiempo real
- ✅ Interfaz moderna con glassmorphism y gradientes
- ✅ Arquitectura modular y escalable
- 🔜 Integración Modbus/PLC (preparada para implementación)

## 📋 Requisitos

- Node.js v16 o superior
- Acceso a SQL Server (200.14.242.237)
- Navegador moderno (Chrome, Firefox, Edge)

## 🔧 Instalación

1. **Instalar dependencias:**
```bash
npm install
```

2. **Configurar variables de entorno:**
```bash
# Copiar archivo de ejemplo
copy .env.example .env

# Editar .env con tus credenciales (ya están preconfiguradas)
```

3. **Iniciar el servidor:**
```bash
npm start
```

4. **Abrir en navegador:**
```
http://localhost:3000
```

## 📁 Estructura del Proyecto

```
Tablets/
├── server/                  # Backend
│   ├── config/
│   │   ├── database.js     # Conexiones SQL Server
│   │   └── modbus.config.js # Configuración Modbus
│   ├── services/
│   │   └── modbusService.js # Servicio Modbus (stub)
│   ├── routes/
│   │   └── api.js          # Rutas API REST
│   └── server.js           # Servidor Express principal
├── public/                  # Frontend
│   ├── css/
│   │   ├── variables.css   # Sistema de diseño
│   │   └── styles.css      # Estilos principales
│   ├── js/
│   │   ├── config.js       # Configuración cliente
│   │   ├── api.js          # Módulo API
│   │   ├── websocket.js    # Cliente WebSocket
│   │   ├── ui.js           # Lógica de UI
│   │   └── app.js          # Punto de entrada
│   └── index.html          # HTML principal
├── package.json
├── .env.example
└── README.md
```

## 🔌 API Endpoints

### Health Check
```
GET /api/health
```

### Datos por Extrusora
```
GET /api/data/:extruder    # tk1, tk2, sima
```

### Trigger Refresh Remoto
```
POST /api/update/refresh
```

### Estado PLC
```
GET /api/plc/status/:extruder
```

### Lista de Extrusoras
```
GET /api/extruders
```

## 🌐 WebSocket

El servidor WebSocket corre en el mismo puerto que HTTP.

**Eventos:**
- `connection` - Conexión establecida
- `refresh` - Comando de actualización remota
- `pong` - Respuesta a ping

## 🎨 Tecnologías

- **Backend:** Node.js, Express, mssql, ws (WebSocket)
- **Frontend:** HTML5, CSS3 (Vanilla), JavaScript (ES6+)
- **Bases de Datos:** SQL Server 2022
- **Protocolo PLC:** Modbus TCP (preparado para implementación)

## 📊 Bases de Datos

### Acabados_2022
Base de datos principal para datos de acabados.

### Medidores_2023
Base de datos para medidores y contadores.

**Credenciales:**
- Server: 200.14.242.237
- User: sa
- Password: F1S4123$

## 🔄 Integración Modbus (Futuro)

El sistema está preparado para integración Modbus/PLC:

- Configuración de señales en `server/config/modbus.config.js`
- Servicio Modbus en `server/services/modbusService.js`
- Por ahora usa datos mock para desarrollo
- Listo para implementación con `jsmodbus`

**Señales configuradas para TK1:**
- gear_pump_rpm
- heater_h1-h10_sv
- take_a/b/c_speed
- extruder_hz, gear_pump_hz, take_a/b/c_hz

## 🚦 Scripts Disponibles

```bash
npm start      # Inicia el servidor en modo producción
npm run dev    # Inicia el servidor con hot-reload (Node.js 18+)
```

## 🛠️ Desarrollo

### Agregar una nueva extrusora:

1. Agregar señales en `server/config/modbus.config.js`
2. Agregar opción en el dropdown del HTML
3. Actualizar `CONFIG.EXTRUDERS` en `public/js/config.js`

### Conectar con SQL Server:

Usa las funciones en `server/config/database.js`:

```javascript
const db = require('./config/database');

// Query a Acabados_2022
const data = await db.queryAcabados('SELECT * FROM tabla');

// Query a Medidores_2023
const data = await db.queryMedidores('SELECT * FROM tabla');
```

### Implementar Modbus real:

1. Descomentar código en `server/services/modbusService.js`
2. Implementar conexión TCP con jsmodbus
3. Configurar polling de señales
4. Actualizar modo de 'mock' a 'live'

## 📱 Uso

1. **Seleccionar Extrusora:** Click en el título para cambiar entre TK1, TK2, SIMA
2. **Actualizar Vistas:** Presionar el botón "Actualizar Todas las Vistas"
3. **Monitor de Conexión:** Indicador en la esquina superior derecha muestra el estado

## 🔐 Seguridad

- Variables de entorno para credenciales
- CORS habilitado para desarrollo
- WebSocket con reconexión automática
- SQL injection protection con queries parametrizadas

## 📄 Licencia

ISC

## 👤 Autor

FISA - Sistema de Monitoreo de Extrusoras

---

**Nota:** Este sistema está en desarrollo activo. La integración Modbus será implementada en fases futuras.
