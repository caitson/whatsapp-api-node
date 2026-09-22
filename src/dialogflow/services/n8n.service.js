// services/n8n.service.js
const axios = require('axios');
const config = require('../config');

class N8nService {
  constructor() {
    this.baseUrl = config.n8n.webhookUrl;
    this.webhookPath = config.n8n.webhookPath;
    this.timeout = config.n8n.timeout || 30000;
  }

  /**
   * Envia mensagem para o n8n e retorna a resposta
   */
  async sendToN8n(message, from, userInfo = {}) {
    try {
      const payload = {
        from: from,
        message: message,
        messageType: 'text',
        timestamp: new Date().toISOString(),
        businessName: config.businessName || 'My Business',
        userInfo: {
          name: userInfo.name || '',
          phone: userInfo.phone || from,
        },
        sessionId: from,
        chatInput: message,
      };

      console.log(`📤 Enviando para n8n: ${message}`);

      // Faz a requisição para o n8n
      const response = await axios.post(
        `${this.baseUrl}/${this.webhookPath}`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: this.timeout,
        },
      );

      // Extrai a resposta do n8n
      const n8nResponse = response.data;
      console.log(`📥 Resposta do n8n:`, n8nResponse);

      // Verifica se a resposta tem o formato esperado
      let replyMessage = null;

      // Tenta extrair a mensagem de diferentes formatos possíveis
      if (n8nResponse.output) {
        replyMessage = n8nResponse.output;
      } else if (n8nResponse.message) {
        replyMessage = n8nResponse.message;
      } else if (n8nResponse.response) {
        replyMessage = n8nResponse.response;
      } else if (n8nResponse.text) {
        replyMessage = n8nResponse.text;
      } else if (typeof n8nResponse === 'string') {
        replyMessage = n8nResponse;
      }

      // Se não encontrou mensagem, usa um fallback
      if (!replyMessage) {
        console.warn('⚠️ Resposta do n8n sem mensagem:', n8nResponse);
        replyMessage = 'Desculpe, não consegui processar sua mensagem.';
      }

      return {
        success: true,
        message: replyMessage,
        rawResponse: n8nResponse,
        intent: n8nResponse.intent || 'unknown',
      };
    } catch (error) {
      console.error('❌ Erro ao chamar n8n:', error.message);

      // Tratamento de erros específicos
      if (error.code === 'ECONNREFUSED') {
        return {
          success: false,
          message: 'Serviço n8n indisponível. Tente novamente mais tarde.',
          error: error.message,
        };
      } else if (error.response) {
        // O servidor respondeu com status de erro
        console.error('Resposta de erro do n8n:', error.response.data);
        return {
          success: false,
          message: 'Erro ao processar no n8n.',
          error: error.response.data,
        };
      } else if (error.request) {
        // Não houve resposta
        return {
          success: false,
          message: 'Sem resposta do servidor. Tente novamente.',
          error: error.message,
        };
      }

      return {
        success: false,
        message: 'Erro ao processar sua mensagem.',
        error: error.message,
      };
    }
  }

  /**
   * Envia mensagem para n8n com suporte a múltiplos formatos de resposta
   */
  async sendToN8nAdvanced(message, from, userInfo = {}, context = {}) {
    try {
      const payload = {
        from: from,
        message: message,
        messageType: 'text',
        timestamp: new Date().toISOString(),
        businessName: config.businessName || 'My Business',
        userInfo: userInfo,
        context: context,
        sessionId: from,
        chatInput: message,
      };

      console.log(`📤 Enviando para n8n: ${message}`);

      const response = await axios.post(
        `${this.baseUrl}${this.webhookPath}`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: this.timeout,
        },
      );

      const n8nResponse = response.data;
      console.log(`📥 Resposta do n8n:`, n8nResponse);

      // Suporte a múltiplos formatos de resposta
      const replyMessage = this.extractMessage(n8nResponse);

      return {
        success: true,
        message: replyMessage || 'Desculpe, não entendi. Pode repetir?',
        rawResponse: n8nResponse,
        intent: n8nResponse.intent || 'unknown',
        confidence: n8nResponse.confidence || 0.8,
      };
    } catch (error) {
      console.error('❌ Erro ao chamar n8n:', error.message);
      return {
        success: false,
        message: 'Erro ao processar sua mensagem. Tente novamente.',
        error: error.message,
      };
    }
  }

  /**
   * Extrai mensagem da resposta do n8n em diferentes formatos
   */
  extractMessage(response) {
    // Lista de possíveis campos onde a mensagem pode estar
    const possibleFields = [
      'output',
      'message',
      'response',
      'text',
      'reply',
      'answer',
      'result',
      'body.message',
      'body.output',
    ];

    for (const field of possibleFields) {
      const value = this.getNestedValue(response, field);
      if (value) {
        return value;
      }
    }

    // Se for uma string
    if (typeof response === 'string') {
      return response;
    }

    // Se for um objeto com propriedade 'json'
    if (response.json && response.json.message) {
      return response.json.message;
    }

    return null;
  }

  /**
   * Obtém valor aninhado de um objeto usando notação de ponto
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : null;
    }, obj);
  }
}

module.exports = new N8nService();
