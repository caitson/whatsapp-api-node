const dialogflow = require('@google-cloud/dialogflow')
const { v4: uuidv4 } = require('uuid')
const logger = require('../../api/utils/console')

class DialogflowHandler {
    constructor() {
        this.projectId = process.env.GOOGLE_PROJECT_ID
        this.privateKey = process.env.GOOGLE_PRIVATE_KEY
        this.clientEmail = process.env.GOOGLE_CLIENT_EMAIL
        this.languageCode = process.env.DF_LANGUAGE_CODE || 'pt-BR'

        if (!this.projectId || !this.privateKey || !this.clientEmail) {
            logger.warn('⚠️ Variáveis do Dialogflow não configuradas')
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
            logger.info('DialogflowHandler inicializado')
        } catch (error) {
            logger.error('❌ Erro ao inicializar Dialogflow:', error)
            this.enabled = false
        }
    }

    async processMessage(messageData) {
        if (!this.enabled) {
            logger.warn('⏭️ Dialogflow desativado')
            return {
                success: false,
                error: 'Dialogflow not configured',
            }
        }

        try {
            const text = this.extractText(messageData)

            if (!text || text.trim() === '') {
                return {
                    success: false,
                    error: 'No text to process',
                }
            }

            const sender = messageData.key.remoteJid.split('@')[0]
            const sessionId = sender || uuidv4()
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

            const responses = await this.sessionClient.detectIntent(request)
            const result = responses[0].queryResult

            const allResponses = this.extractAllResponses(result)

            return allResponses;
       
        } catch (error) {
            logger.error('Erro no Dialogflow:', error)
            return {
                success: false,
                error: error.message,
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
                console.log(`ℹ️ Tipo não tratado: ${messageType}`)
                return null
        }
    }

    extractAllResponses(queryResult) {

        const responses = []

        if (queryResult.fulfillmentMessages && Array.isArray(queryResult.fulfillmentMessages)) {
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

    // formatResponse(responses) {

    //     console.log('   📝 Formatando respostas :: ',responses)
    //     if (responses.length === 0) {
    //         console.log('⚠️ Nenhuma resposta para formatar')
    //         return ''
    //     }

    //     const textResponses = responses.filter((r) => r.type === 'text')

    //     console.log('   📝 Respostas de texto filtradas :: ',textResponses.length)

    //     if (textResponses.length === 0) {
    //         console.log('⚠️ Nenhuma resposta de texto para formatar')
    //         return ''
    //     }

    //     if (textResponses.length > 1) {
    //         console.log('   📝 Múltiplas respostas de texto encontradas :: ',textResponses)
    //         const formatted = textResponses.map((r) => r.content).join('\n\n')


    //         return formatted
    //     }
    //     console.log('   📝 Resposta única de texto encontrada', textResponses)
    //     const singleResponse = textResponses[0].content
    //     return singleResponse
    // }

    // formatResponseEndSendToWhatsApp(responses) {
    //     console.log('   📝 Formatando respostas :: ',responses)
    //     if (responses.length === 0) {
    //         console.log('⚠️ Nenhuma resposta para formatar')
    //         return;
    //     }

    //     const textResponses = responses.filter((r) => r.type === 'text')

    //     console.log('   📝 Respostas de texto filtradas :: ',textResponses.length)

    //     if (textResponses.length === 0) {
    //         console.log('⚠️ Nenhuma resposta de texto para formatar')
    //         return;
    //     }

    //     if (textResponses.length > 0) {
    //         console.log('   📝 Múltiplas respostas de texto encontradas :: ',textResponses)
    //         textResponses.map((r) =>{
    //             console.log('   📝 Enviando para o WhatsApp :: ',r.content)
                
    //         })
    //     }
    // }

    // processFulfillmentMessage(msg, index, responses) {

    //     switch (msg.platform) {
    //         case 'PLATFORM_UNSPECIFIED':
    //             this.processTextMessage(msg, index, responses)
    //             break

    //         case 'payload':
    //             this.processPayloadMessage(msg, index, responses)
    //             break

    //         default:
    //             console.log(`   ℹ️ Tipo não processado: ${msg.platform}`)
    //             break
    //     }
    // }

    processTextMessage(msg, index, responses) {
        const textMessages = msg.text?.text || []
        if (textMessages.length > 0) {
            console.log(
                `   📝 Encontrado ${textMessages.length} texto(s) no item ${index}`
            )
        }

        textMessages.forEach((text, textIndex) => {
            if (text && text.trim() !== '') {
                responses.push({
                    type: 'text',
                    content: text,
                    source: 'fulfillmentMessages.text',
                    index: index,
                    textIndex: textIndex,
                })
            }
        })
    }

    processPayloadMessage(msg, index, responses) {
        responses.push({
            type: 'payload',
            content: msg.payload,
            source: 'fulfillmentMessages.payload',
            index: index,
        })
    }

}

module.exports = DialogflowHandler
