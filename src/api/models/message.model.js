const mongoose = require('mongoose')

const messageSchema = new mongoose.Schema({
  instanceKey: { 
    type: String, 
    required: true,
    index: true 
  },
  remoteJid: { 
    type: String, 
    required: true,
    index: true 
  },
  participantJid: String, // Para grupos
  pushName: String,
  messageId: { 
    type: String, 
    unique: true 
  },
  messageType: String, // 'text', 'image', 'audio', etc
  content: mongoose.Schema.Types.Mixed, // Conteúdo da mensagem
  response: mongoose.Schema.Types.Mixed, // Resposta do Dialogflow
  direction: { 
    type: String, 
    enum: ['incoming', 'outgoing'],
    required: true 
  },
  timestamp: { 
    type: Date, 
    default: Date.now,
    index: true 
  },
  status: {
    type: String,
    enum: ['received', 'processed', 'sent', 'delivered', 'read'],
    default: 'received'
  },
  metadata: mongoose.Schema.Types.Mixed // Informações extras
});

// Índices compostos para consultas eficientes
messageSchema.index({ instanceKey: 1, timestamp: -1 });
messageSchema.index({ remoteJid: 1, timestamp: -1 });

const Message = mongoose.model('Message', messageSchema);
module.exports = Message;