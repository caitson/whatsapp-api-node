const dotenv = require('dotenv')
const mongoose = require('mongoose')
const logger = require('./api/utils/console')
const http = require('http')
const { Server } = require('socket.io')
dotenv.config()

const app = require('./config/express')
const config = require('./config/config')

const { Session } = require('./api/class/session')
const connectToCluster = require('./api/helper/connectMongoClient')

let server
let io // Instância do Socket.io

if (config.mongoose.enabled) {
    mongoose.set('strictQuery', true)
    mongoose.connect(config.mongoose.url, config.mongoose.options).then(() => {
        logger.info('Connected to MongoDB')
    })
}

// Criar servidor HTTP a partir do app Express
server = http.createServer(app)

// Configurar Socket.io
io = new Server(server, {
    cors: {
        origin: ['http://localhost:4200', 'http://localhost:4201'], // URLs do seu frontend Angular
        methods: ['GET', 'POST'],
        credentials: true,
    },
    transports: ['websocket', 'polling'], // Fallback para polling se websocket não funcionar
})

// Middleware de autenticação para Socket.io (opcional)
io.use((socket, next) => {
    const token = socket.handshake.auth.token
    // Validar token JWT aqui se necessário
    // if (validToken(token)) {
    //     return next();
    // }
    // return next(new Error('Authentication error'));
    next() // Por enquanto, permite todas conexões
})

// Tornar io acessível globalmente
global.io = io

// Gerenciar conexões Socket.io
io.on('connection', (socket) => {
    logger.info(`🟢 Cliente Socket.io conectado: ${socket.id}`)

    // Cliente pode se inscrever em uma instância específica
    socket.on('subscribe:instance', (instanceId) => {
        socket.join(`instance:${instanceId}`)
        logger.info(
            `📡 Cliente ${socket.id} inscrito na instância ${instanceId}`
        )
    })

    // Cliente pode cancelar inscrição
    socket.on('unsubscribe:instance', (instanceId) => {
        socket.leave(`instance:${instanceId}`)
        logger.info(
            `📡 Cliente ${socket.id} cancelou inscrição da instância ${instanceId}`
        )
    })

    // Cliente pode se inscrever em notificações de admin
    socket.on('subscribe:admin', () => {
        socket.join('admin')
        logger.info(`👑 Cliente ${socket.id} inscrito em notificações admin`)
    })

    socket.on('disconnect', () => {
        logger.info(`🔴 Cliente Socket.io desconectado: ${socket.id}`)
    })
})

// Iniciar servidor
server.listen(config.port, async () => {
    logger.info(`🚀 Servidor rodando na porta ${config.port}`)
    logger.info(`🔌 Socket.io disponível em ws://localhost:${config.port}`)

    global.mongoClient = await connectToCluster(config.mongoose.url)

    if (config.restoreSessionsOnStartup) {
        logger.info(`🔄 Restaurando sessões...`)
        const session = new Session()
        let restoreSessions = await session.restoreSessions()
        logger.info(`✅ ${restoreSessions.length} sessão(ões) restaurada(s)`)
    }
})

// Handler de erros
const exitHandler = () => {
    if (server) {
        server.close(() => {
            logger.info('Server closed')
            process.exit(1)
        })
    } else {
        process.exit(1)
    }
}

const unexpectedErrorHandler = (error) => {
    console.error('❌ Erro inesperado capturado:', error)

    if (
        error === 1006 ||
        error?.code === 1006 ||
        error?.message?.includes('1006')
    ) {
        logger.warn('⚠️ Erro de conexão WebSocket 1006 - reconectando...')
        return
    }

    console.log('Mensagem:', error.message)
    console.log('Stack:', error.stack)
    console.log('Nome do erro:', error.name)

    if (error.cause) {
        console.log('Causa:', error.cause)
    }

    if (error.code) {
        console.log('Código:', error.code)
    }

    logger.error('❌ Erro inesperado capturado:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
    })

    logger.error('Erro inesperado:', error)
    exitHandler()
}

process.on('uncaughtException', unexpectedErrorHandler)
process.on('unhandledRejection', unexpectedErrorHandler)

process.on('SIGTERM', () => {
    logger.info('SIGTERM received')
    if (server) {
        server.close()
    }
})

module.exports = { server, io }
