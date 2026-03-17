const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
}

const consoleLogger = {
    log: (msg) => console.log(`${colors.bright}✓${colors.reset} ${msg}`),
    info: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
    error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
    warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
    debug: (msg) => console.log(`${colors.blue}🔍${colors.reset} ${msg}`),
    success: (msg) => console.log(`${colors.green}✅${colors.reset} ${msg}`),
    server: (msg) => console.log(`${colors.cyan}🚀${colors.reset} ${msg}`),
    db: (msg) => console.log(`${colors.magenta}💾${colors.reset} ${msg}`),
    whatsapp: (msg) => console.log(`${colors.green}📱${colors.reset} ${msg}`)
}

module.exports = consoleLogger