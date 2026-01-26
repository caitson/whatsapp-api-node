class WhatsAppResponseService {
    constructor(whatsappInstances) {
        this.instances = whatsappInstances;
    }

    /**
     * Envia resposta para o WhatsApp
     * @param {string} instanceKey - Chave da instância do WhatsApp
     * @param {object} responseData - Dados da resposta
     */
    async sendResponse(instanceKey, responseData) {
        try {
            const instance = this.instances[instanceKey];
            
            if (!instance) {
                console.error(`❌ Instância ${instanceKey} não encontrada`);
                return { success: false, error: 'Instance not found' };
            }

            if (!instance.instance?.online) {
                console.error(`❌ Instância ${instanceKey} não está online`);
                return { success: false, error: 'Instance not connected' };
            }

            const { to, text } = responseData;
            
            if (!text || text.trim() === '') {
                console.log('⏭️ Texto vazio, não enviando resposta');
                return { success: false, error: 'Empty response text' };
            }

            console.log('📤 Enviando resposta para WhatsApp:', {
                to: to,
                textLength: text.length,
                instance: instanceKey
            });

            // Envia a mensagem
            const result = await instance.sendTextMessage(to, text);
            
            console.log('✅ Resposta enviada com sucesso:', {
                messageId: result?.key?.id,
                to: to
            });

            return {
                success: true,
                messageId: result?.key?.id,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ Erro ao enviar resposta para WhatsApp:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Processa resposta do Dialogflow e envia para WhatsApp
     */
    async processDialogflowResponse(instanceKey, messageData, dialogflowResult) {
        if (!dialogflowResult.fulfillmentText) {
            console.log('⏭️ Dialogflow não retornou texto de resposta');
            return null;
        }

        const responseData = {
            to: messageData.key.remoteJid,
            text: dialogflowResult.fulfillmentText
        };

        return await this.sendResponse(instanceKey, responseData);
    }
}

module.exports = WhatsAppResponseService;