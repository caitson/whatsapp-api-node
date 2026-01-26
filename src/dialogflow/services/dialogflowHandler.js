// services/DialogflowHandler.js
const dialogflow = require('@google-cloud/dialogflow')
const { v4: uuidv4 } = require('uuid')

class DialogflowHandler {
    constructor() {
        this.projectId = process.env.GOOGLE_PROJECT_ID
        this.privateKey = process.env.GOOGLE_PRIVATE_KEY
        this.clientEmail = process.env.GOOGLE_CLIENT_EMAIL
        this.languageCode = process.env.DF_LANGUAGE_CODE || 'pt-BR'

        if (!this.projectId || !this.privateKey || !this.clientEmail) {
            console.warn('⚠️ Variáveis do Dialogflow não configuradas')
            this.enabled = false
            return
        }

        try {

            // Configura o cliente do Dialogflow
            this.sessionClient = new dialogflow.SessionsClient({
                credentials: {
                    client_email: this.clientEmail,
                    private_key: this.privateKey,
                },
                projectId: this.projectId,
            })
            this.enabled = true
            console.log('✅ DialogflowHandler inicializado')
        } catch (error) {
            console.error('❌ Erro ao inicializar Dialogflow:', error)
            this.enabled = false
        }
    }

    /**
     * Extrai texto de uma mensagem do WhatsApp
     */
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
                console.log(`ℹ️ Tipo não tratado: ${messageType}`)
                return null
        }
    }

    /**
     * Processa mensagem com Dialogflow
     */
    async processMessage(messageData) {
        if (!this.enabled) {
            console.log('⏭️ Dialogflow desativado')
            return {
                success: false,
                error: 'Dialogflow not configured',
            }
        }

        try {
            // Extrai texto
            const text = this.extractText(messageData)

            if (!text || text.trim() === '') {
                return {
                    success: false,
                    error: 'No text to process',
                }
            }

            // Usa o número do remetente como sessionId
            const sender = messageData.key.remoteJid.split('@')[0]
            const sessionId = sender || uuidv4()

            console.log('📤 Enviando para Dialogflow:', {
                text: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
                sender: sender,
                sessionId: sessionId,
            })

            // Configura a sessão
            const sessionPath = this.sessionClient.projectAgentSessionPath(
                this.projectId,
                sessionId
            )

            const request = {
                session: sessionPath,
                queryInput: {
                    text: {
                        text: text,
                        languageCode: 'pt-BR',
                    },
                },
            }

            // Chama Dialogflow
            const responses = await this.sessionClient.detectIntent(request)
            const result = responses[0].queryResult

            console.log('📥 Dialogflow respondeu:', {
                intent: result.intent?.displayName || 'Nenhum',
                confidence: result.intentDetectionConfidence,
                hasResponse: !!result.fulfillmentText,
            })

            return {
                success: true,
                text: text,
                intent: result.intent?.displayName,
                confidence: result.intentDetectionConfidence,
                response: result.fulfillmentText,
                parameters: result.parameters?.fields || {},
                raw: result,
            }
        } catch (error) {
            console.error('❌ Erro no Dialogflow:', error)
            return {
                success: false,
                error: error.message,
            }
        }
    }

    /**
     * Processa um evento de boas-vindas
     */
    async processWelcomeEvent(senderId) {
        if (!this.enabled) return null

        try {
            const sessionPath = this.sessionClient.projectAgentSessionPath(
                this.projectId,
                senderId
            )

            const request = {
                session: sessionPath,
                queryInput: {
                    event: {
                        name: 'WELCOME',
                        languageCode: 'pt-BR',
                    },
                },
            }

            const responses = await this.sessionClient.detectIntent(request)
            const result = responses[0].queryResult

            return {
                success: true,
                response: result.fulfillmentText,
            }
        } catch (error) {
            console.error('❌ Erro no evento WELCOME:', error)
            return null
        }
    }
}

module.exports = DialogflowHandler
