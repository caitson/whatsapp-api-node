const DialogflowService = require('./dialogflowService');

class EventProcessor {
    constructor() {
        this.stats = {
            processed: 0,
            errors: 0,
            lastProcessed: null
        };
        
        // Inicializa o Dialogflow
        this.dialogflow = new DialogflowService();
        
        // Cache de sessões ativas
        this.sessions = new Map();
    }

    static async process(event) {
        const processor = new EventProcessor();
        return await processor.handleEvent(event);
    }

    async handleEvent(event) {
        try {
            console.log('🔄 Processando evento:', event.type);
            
            this.stats.processed++;
            this.stats.lastProcessed = new Date();

            // Processa diferentes tipos de eventos
            switch (event.type) {
                case 'message':
                    return await this.handleMessage(event.body);
                
                case 'connection':
                    return await this.handleConnection(event.body);
                
                case 'presence':
                    return await this.handlePresence(event.body);
                
                default:
                    console.log(`⚠️ Tipo de evento não tratado: ${event.type}`);
                    return { status: 'unhandled_event', type: event.type };
            }

        } catch (error) {
            this.stats.errors++;
            console.error('❌ Erro ao processar evento:', error);
            throw error;
        }
    }

    /**
     * Processa mensagens do WhatsApp
     */
    async handleMessage(messageData) {
        const text = this.extractTextFromMessage(messageData);
        
        if (!text) {
            console.log('⏭️ Mensagem sem texto, ignorando');
            return { status: 'no_text', processed: false };
        }

        // Obtém o ID do remetente (sem o @s.whatsapp.net)
        const senderId = messageData.key.remoteJid.split('@')[0];
        
        const dialogflowResponse = await this.dialogflow.processMessage(text, senderId);
        
        if (!dialogflowResponse.success) {
            console.error('❌ Dialogflow falhou:', dialogflowResponse.error);
            return { 
                status: 'dialogflow_error', 
                error: dialogflowResponse.error 
            };
        }

        console.log('✅ Dialogflow respondeu:', {
            intent: dialogflowResponse.intent,
            confidence: dialogflowResponse.confidence,
            text: dialogflowResponse.fulfillmentText
        });

        // Prepara resposta para o controller
        return {
            status: 'processed',
            processed: true,
            text: text,
            dialogflow: {
                intent: dialogflowResponse.intent,
                confidence: dialogflowResponse.confidence,
                response: dialogflowResponse.fulfillmentText,
                hasResponse: !!dialogflowResponse.fulfillmentText,
                parameters: dialogflowResponse.parameters
            },
            // Retorna também os dados para enviar resposta via WhatsApp
            whatsappResponse: {
                to: messageData.key.remoteJid,
                text: dialogflowResponse.fulfillmentText || 'Desculpe, não entendi.',
                sessionId: senderId
            }
        };
    }

    /**
     * Extrai texto de diferentes tipos de mensagens
     */
    extractTextFromMessage(messageData) {
        if (!messageData.message) return null;

        const messageType = Object.keys(messageData.message)[0];
        
        switch (messageType) {
            case 'conversation':
                return messageData.message.conversation;
            
            case 'extendedTextMessage':
                return messageData.message.extendedTextMessage?.text;
            
            case 'imageMessage':
                return messageData.message.imageMessage?.caption;
            
            case 'videoMessage':
                return messageData.message.videoMessage?.caption;
            
            default:
                console.log(`ℹ️ Tipo de mensagem não tratado: ${messageType}`);
                return null;
        }
    }

    async handleConnection(connectionData) {
        console.log('🔌 Evento de conexão:', connectionData.connection);
        return { status: 'connection_processed', connection: connectionData.connection };
    }

    async handlePresence(presenceData) {
        console.log('👤 Evento de presença:', presenceData);
        return { status: 'presence_processed' };
    }

    static getStats() {
        const processor = new EventProcessor();
        return processor.stats;
    }
}

module.exports = EventProcessor;