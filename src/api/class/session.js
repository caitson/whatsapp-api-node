/* eslint-disable no-unsafe-optional-chaining */
const { WhatsAppInstance } = require('../class/instance')
// const logger = require('pino')()
const logger = require('../../api/utils/console')
const config = require('../../config/config')

class Session {

    constructor() {
        this.systemCollections = ['chats', 'messages', 'users', 'sessions', 'auth', 'instances']
        this.db = null
    }

    async restoreSessions() {
        const restoredSessions = []
         this.db = global.mongoClient.db('whatsapp-api')

        const collections = await this.db.listCollections().toArray()

        for (const collection of collections) {
            const key = collection.name

             if (this.systemCollections.includes(key)) {
                    logger.info(`⏭️ Ignorando coleção do sistema: ${key}`)
                    continue
                }

            const webhook = config.webhookEnabled ?? undefined
            const webhookUrl = config.webhookUrl ?? undefined

            // 🟢 PASSA O IO GLOBAL PARA A INSTÂNCIA!
            const instance = new WhatsAppInstance(
                key,
                webhook,
                webhookUrl,
                {}, // options
                global.io // ← Socket.io instance
            )

            await instance.init() // AGORA É BLOQUEANTE

            WhatsAppInstances[key] = instance
            restoredSessions.push(key)

            logger.info(`✅ Sessão restaurada: ${key}`)
        }

        logger.info(
            `🎯 Total de ${restoredSessions.length} sessões restauradas com Socket.io`
        )
        return restoredSessions
    }

    // Método para criar nova instância (se precisar)
    // async createInstance(key, webhookEnabled, webhookUrl, options = {}) {
    //     logger.info(`🆕 Criando nova instância: ${key}`)

    //     const instance = new WhatsAppInstance(
    //         key,
    //         webhookEnabled,
    //         webhookUrl,
    //         options,
    //         global.io // ← Passa o io aqui também!
    //     )

    //     await instance.init()

    //     WhatsAppInstances[key] = instance

    //     logger.info(`✅ Instância ${key} criada com sucesso`)

    //     return instance
    // }

    // Session.js
    async createInstance(key, allowWebhook, webhook, options = {}) {
        console.log(`🆕 Criando nova instância: ${key}`)

        // 1. Cria a instância
        const instance = new WhatsAppInstance(
            key,
            allowWebhook,
            webhook,
            options,
            global.io
        )

        // 2. Inicializa (começa a gerar QR)
        await instance.init()

        // 3. SALVA NO BANCO IMEDIATAMENTE (antes do scan!)
        await this.saveInstanceToDb(key, {
            allowWebhook,
            webhook,
            options,
            status: 'awaiting_scan', // ← MARCA COMO AGUARDANDO SCAN
            createdAt: new Date(),
        })

        // 4. Adiciona ao mapa
        WhatsAppInstances[key] = instance

        return instance
    }

    async updateInstanceStatus(key, status) {
        try {
            const db = global.mongoClient.db('whatsapp-api')

            await db.collection('instances').updateOne(
                { key },
                {
                    $set: {
                        status,
                        updatedAt: new Date().toISOString(),
                    },
                }
            )

            console.log(`📝 Instância ${key} atualizada: ${status}`)
            return true
        } catch (error) {
            console.error(`❌ Erro ao atualizar status:`, error)
            return false
        }
    }

    async registerInstance(key, data) {
        console.log('🔍 registerInstance INICIADO para:', key)
        console.log('📦 Dados recebidos:', JSON.stringify(data, null, 2))

        try {
            // 1. Verificar se global.mongoClient existe
            if (!global.mongoClient) {
                logger.error('❌ MongoDB client não inicializado')
                return false
            }

            // 2. Conectar ao banco
            const db = global.mongoClient.db('whatsapp-api')

            const collections = await db.listCollections().toArray()
            const collectionNames = collections.map((c) => c.name)

            const hasInstances = collectionNames.includes('instances')

            if (!hasInstances) {
                await db.createCollection('instances')
            }

            // 5. Preparar dados para inserir
            const updateData = {
                key,
                webhook: data.webhook || false,
                webhookUrl: data.webhookUrl || null,
                status: data.status || 'pending',
                createdAt: data.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            }

            await db
                .collection('instances')
                .updateOne({ key }, { $set: updateData }, { upsert: true })

            logger.info(
                `✅ Instância ${key} registrada no banco com status ${data.status}`
            )
            return true
        } catch (error) {
            logger.error(
                `❌ Erro ao registrar instância ${key}:`,
                error.message
            )
            return false
        }
    }

    // Método para remover instância
    async removeInstance(key) {
        logger.info(`🗑️ Removendo instância: ${key}`)

        const instance = WhatsAppInstances[key]
        if (instance) {
            // Notificar via Socket.io que a instância foi removida
            if (global.io) {
                global.io.emit(`instance:${key}:removed`, {
                    instanceId: key,
                    timestamp: new Date().toISOString(),
                })
            }

            // Limpar recursos
            instance.instance.sock?.ev.removeAllListeners()
            instance.instance.sock?.ws.close()

            delete WhatsAppInstances[key]

            logger.info(`✅ Instância ${key} removida`)
        }

        return true
    }

    async deleteInstance(key) {
        try {
            const db = global.mongoClient.db('whatsapp-api')

            // Remove do mapa
            delete WhatsAppInstances[key]

            // Remove da coleção de instâncias
            await db.collection('instances').deleteOne({ key })

            // Remove a coleção de credenciais (se existir)
            await db
                .collection(key)
                .drop()
                .catch(() => {})

            console.log(`🗑️ Instância ${key} removida`)
            return true
        } catch (error) {
            console.error(`❌ Erro ao remover instância ${key}:`, error)
            return false
        }
    }

    async listInstances() {
        try {
            const db = global.mongoClient.db('whatsapp-api')

            // Busca todas as instâncias registradas
            const instances = await db
                .collection('instances')
                .find()
                .sort({ createdAt: -1 })
                .toArray()

            // Enriquece com dados de conexão atual
            const enriched = instances.map((inst) => ({
                ...inst,
                connected:
                    WhatsAppInstances[inst.key]?.instance?.online || false,
                hasQR: !!WhatsAppInstances[inst.key]?.instance?.qr,
                qrRetry: WhatsAppInstances[inst.key]?.instance?.qrRetry || 0,
            }))

            return enriched
        } catch (error) {
            console.error('❌ Erro ao listar instâncias:', error)
            return []
        }
    }
}

exports.Session = Session
