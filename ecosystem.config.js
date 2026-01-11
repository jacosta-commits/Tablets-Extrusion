module.exports = {
    apps: [
        // Aplicación Web Principal - Extrusoras Tablets
        {
            name: 'extrusion-web',
            script: './server/server.js',
            cwd: './',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '500M',
            env: {
                NODE_ENV: 'production',
                PORT: 3081
            },
            error_file: './logs/web-error.log',
            out_file: './logs/web-out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            merge_logs: true
        }
    ]
};
