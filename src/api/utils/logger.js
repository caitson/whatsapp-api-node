const pino = require('pino')

const logger = pino({
    level: 'info',
    base: null, 
    timestamp: false,
    formatters: {
        level: () => ({}),
    },
    messageKey: 'msg',
})

module.exports = logger