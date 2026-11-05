// dialogflow/services/dialogflowHandler.js
const dialogflow = require('@google-cloud/dialogflow')
const { v4: uuidv4 } = require('uuid')
const logger = require('../../api/utils/console')
const DialogFlowConfig = require('../../../src/api/models/dialogflow.mode')

class DialogflowHandler {
    constructor(instanceKey = null) {
        this.instanceKey = instanceKey
        this.projectId = null
        this.privateKey = null
        this.clientEmail = null
        this.languageCode = 'pt-BR'
        this.sessionClient = null
        this.enabled = false
        this.initialized = false
    }

    async init() {
        if (this.instanceKey) {
            await this.loadInstanceConfig(this.instanceKey)
        } else {
            this.loadGlobalConfig()
        }
        return this
    }

    loadGlobalConfig() {
        this.projectId = process.env.GOOGLE_PROJECT_ID
        this.privateKey = process.env.GOOGLE_PRIVATE_KEY
        this.clientEmail = process.env.GOOGLE_CLIENT_EMAIL
        this.languageCode = process.env.DF_LANGUAGE_CODE || 'pt-BR'

        if (!this.projectId || !this.privateKey || !this.clientEmail) {
            logger.warn('⚠️ Variáveis globais do Dialogflow não configuradas')
            this.enabled = false
            this.initialized = false
            return
        }

        this.initializeClient()
    }

    async loadInstanceConfig(instanceKey) {
        try {
            const config = await DialogFlowConfig.findOne({
                instance_key: instanceKey,
                enabled: true,
            })

            if (!config) {
                logger.warn(
                    `⚠️ Instância ${instanceKey} sem configuração Dialogflow`
                )
                this.loadGlobalConfig()
                return
            }

            this.projectId = config.googleProjectId
            this.privateKey = config.googlePrivateKey
            this.clientEmail = config.googleClientEmail
            this.languageCode = config.languageCode || 'pt-BR'

            this.initializeClient()
            logger.info(
                `✅ Dialogflow configurado para instância ${instanceKey}: ${this.projectId}`
            )
        } catch (error) {
            logger.error(
                `❌ Erro ao carregar configuração da instância ${instanceKey}:`,
                error
            )
            this.loadGlobalConfig()
        }
    }

    initializeClient() {
        try {
            const formattedPrivateKey = this.privateKey.replace(/\\n/g, '\n')

            const { JWT } = require('google-auth-library')

            const jwtClient = new JWT({
                email: this.clientEmail,
                key: formattedPrivateKey,
                scopes: ['https://www.googleapis.com/auth/cloud-platform'],
            })

            this.sessionClient = new dialogflow.SessionsClient({
                auth: jwtClient, 
                projectId: this.projectId,
            })

            this.enabled = true
            this.initialized = true
            logger.info(
                `✅ Cliente Dialogflow inicializado para projeto: ${this.projectId}`
            )
        } catch (error) {
            logger.error('❌ Erro ao inicializar cliente Dialogflow:', error)
            this.enabled = false
            this.initialized = false
        }
    }

    async reloadConfig(instanceKey) {
        this.instanceKey = instanceKey
        await this.loadInstanceConfig(instanceKey)
    }

    async processMessage(messageData) {
        if (!this.enabled || !this.initialized) {
            logger.warn(
                `⏭️ Dialogflow desativado para instância ${
                    this.instanceKey || 'global'
                }`
            )
            return {
                success: false,
                error: 'Dialogflow not configured',
                responses: [],
            }
        }

        try {
            const text = this.extractText(messageData)

            if (!text || text.trim() === '') {
                return {
                    success: false,
                    error: 'No text to process',
                    responses: [],
                }
            }

            const sender = messageData.key.remoteJid.split('@')[0]
            // Usar sender + instanceKey para sessões únicas por instância
            const sessionId = `${this.instanceKey || 'global'}_${
                sender || uuidv4()
            }`
            const sessionPath = this.sessionClient.projectAgentSessionPath(
                this.projectId,
                sessionId
            )

            const request = {
                session: sessionPath,
                queryInput: {
                    text: {
                        text: text,
                        languageCode: this.languageCode,
                    },
                },
            }

            //logger.info(`📤 [${this.projectId}] Enviando: ${text}`)
            const responses = await this.sessionClient.detectIntent(request)
            const result = responses[0].queryResult

            // logger.info(`📥 [${this.projectId}] Resposta: ${result.fulfillmentText}`)
            const allResponses = this.extractAllResponses(result)

            return {
                success: true,
                responses: allResponses,
                intent: result.intent?.displayName,
                confidence: result.intentDetectionConfidence,
                projectId: this.projectId,
                fulfillmentText: result.fulfillmentText,
            }
        } catch (error) {
            logger.error(`❌ Erro no Dialogflow (${this.projectId}):`, error)
            return {
                success: false,
                error: error.message,
                responses: [],
            }
        }
    }

    extractText(messageData) {
        if (!messageData.message) return null

        const messageType = Object.keys(messageData.message)[0]

        switch (messageType) {
            case 'conversation':
                return messageData.message.conversation

            case 'extendedTextMessage':
                return messageData.message.extendedTextMessage?.text

            case 'imageMessage':
                return messageData.message.imageMessage?.caption || ''

            case 'videoMessage':
                return messageData.message.videoMessage?.caption || ''

            case 'audioMessage':
                return '[Áudio recebido]'

            case 'documentMessage':
                return (
                    messageData.message.documentMessage?.caption ||
                    '[Documento]'
                )

            case 'locationMessage':
                return '[Localização]'

            case 'contactMessage':
                return '[Contato]'

            default:
                logger.debug(`ℹ️ Tipo não tratado: ${messageType}`)
                return null
        }
    }

    extractAllResponses(queryResult) {
        const responses = []

        if (
            queryResult.fulfillmentMessages &&
            Array.isArray(queryResult.fulfillmentMessages)
        ) {
            const intent = queryResult.intent?.displayName
            queryResult.fulfillmentMessages.forEach((msg, index) => {
                switch (msg.platform) {
                    case 'PLATFORM_UNSPECIFIED': {
                        const textMessages = msg.text?.text || []
                        textMessages.forEach((text, textIndex) => {
                            if (text && text.trim() !== '') {
                                responses.push({
                                    type: 'text',
                                    content: text,
                                    source: 'fulfillmentMessages.text',
                                    index: index,
                                    textIndex: textIndex,
                                    intent: intent,
                                })
                            }
                        })
                        break
                    }

                    case 'payload': {
                        responses.push({
                            type: 'payload',
                            content: msg.payload,
                            source: 'fulfillmentMessages.payload',
                            index: index,
                            intent: intent,
                        })
                        break
                    }

                    default: {
                        logger.warn(
                            `Item ${index}: tipo não processado - ${msg.platform}`
                        )
                        break
                    }
                }
            })
        }

        if (responses.length === 0) {
            if (
                queryResult.fulfillmentText &&
                queryResult.fulfillmentText.trim() !== ''
            ) {
                responses.push({
                    type: 'text',
                    content: queryResult.fulfillmentText,
                    source: 'fulfillmentText',
                })
            } else {
                logger.warn('Nenhuma resposta encontrada')
            }
        }
        return responses
    }

    isEnabled() {
        return this.enabled && this.initialized
    }

    getInfo() {
        return {
            instanceKey: this.instanceKey,
            enabled: this.enabled,
            initialized: this.initialized,
            projectId: this.projectId,
            languageCode: this.languageCode,
            configured: !!(
                this.projectId &&
                this.privateKey &&
                this.clientEmail
            ),
        }
    }
}

module.exports = DialogflowHandler
