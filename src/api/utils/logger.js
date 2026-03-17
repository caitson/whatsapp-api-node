// src/utils/logger.js
const pino = require('pino')

const logger = pino({
    level: 'info',
    base: null, // Remove pid e hostname
    timestamp: false, // Remove timestamp
    formatters: {
        level: () => ({}), // Remove o campo level
    },
    messageKey: 'msg', // Mantém a mensagem
})

module.exports = logger