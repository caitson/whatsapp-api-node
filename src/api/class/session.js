/* eslint-disable no-unsafe-optional-chaining */
const { WhatsAppInstance } = require('../class/instance')
const logger = require('pino')()
const config = require('../../config/config')

class Session {
    async restoreSessionsHold() {
        let restoredSessions = new Array()
        let allCollections = []
        try {
            const db = global.mongoClient.db('whatsapp-api')
            const result = await db.listCollections().toArray()
            console.log('Result :: ',result)
            result.forEach((collection) => {
                allCollections.push(collection.name)
            })

            allCollections.map((key) => {
                const query = {}
                db.collection(key)
                    .find(query)
                    .toArray(async (err, result) => {
                        if (err) throw err
                        const webhook = !config.webhookEnabled
                            ? undefined
                            : config.webhookEnabled
                        const webhookUrl = !config.webhookUrl
                            ? undefined
                            : config.webhookUrl
                        const instance = new WhatsAppInstance(
                            key,
                            webhook,
                            webhookUrl
                        )
                        await instance.init()
                        WhatsAppInstances[key] = instance
                    })
                restoredSessions.push(key)
            })
        } catch (e) {
            logger.error('Error restoring sessions')
            logger.error(e)
        }
        return restoredSessions
    }

    async restoreSessions() {
        const restoredSessions = []
        const db = global.mongoClient.db('whatsapp-api')

        const collections = await db.listCollections().toArray()

        for (const collection of collections) {
            const key = collection.name

            const webhook = config.webhookEnabled ?? undefined
            const webhookUrl = config.webhookUrl ?? undefined

            const instance = new WhatsAppInstance(key, webhook, webhookUrl)

            await instance.init() // AGORA É BLOQUEANTE

            WhatsAppInstances[key] = instance
            restoredSessions.push(key)
        }

        return restoredSessions
    }
}

exports.Session = Session
