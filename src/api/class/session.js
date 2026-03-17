/* eslint-disable no-unsafe-optional-chaining */
const { WhatsAppInstance } = require('../class/instance')
// const logger = require('pino')()
const logger = require('../../api/utils/console')
const config = require('../../config/config')

class Session {
    async restoreSessions() {
        const restoredSessions = []
        const db = global.mongoClient.db('whatsapp-api')

        const collections = await db.listCollections().toArray()

        for (const collection of collections) {
            const key = collection.name

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

        logger.info(`🎯 Total de ${restoredSessions.length} sessões restauradas com Socket.io`)
        return restoredSessions
    }
    
    // Método para criar nova instância (se precisar)
    async createInstance(key, webhookEnabled, webhookUrl, options = {}) {
        logger.info(`🆕 Criando nova instância: ${key}`)
        
        const instance = new WhatsAppInstance(
            key,
            webhookEnabled,
            webhookUrl,
            options,
            global.io // ← Passa o io aqui também!
        )
        
        await instance.init()
        
        WhatsAppInstances[key] = instance
        
        logger.info(`✅ Instância ${key} criada com sucesso`)
        
        return instance
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
                    timestamp: new Date().toISOString()
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
}

exports.Session = Session