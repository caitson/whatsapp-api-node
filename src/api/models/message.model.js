const mongoose = require('mongoose')

const messageSchema = new mongoose.Schema(
    {
        instanceKey: { type: String, required: true },
        sessionId:   { type: String, required: true },

        remoteJid:      { type: String, required: true },
        participantJid: String, 
        pushName:       String,
        messageId:      String,

        direction: {
            type: String,
            enum: ['incoming', 'outgoing'],
            required: true,
        },
        messageType: { type: String, default: 'text' },

        content:      mongoose.Schema.Types.Mixed, 
        isMedia:      { type: Boolean, default: false },
        mediaUrl:     String, 
        mediaMimetype: String,

        intent:             String,
        confidence:         Number,
        dialogflowResponse: mongoose.Schema.Types.Mixed, 
        step:               String,

        status: {
            type: String,
            enum: ['received', 'processed', 'sent', 'delivered', 'read', 'failed', 'ignored'],
            default: 'received',
        },
        error: String,

        isFromSupport:  { type: Boolean, default: false },
        supportAgentId: String,

        metadata: mongoose.Schema.Types.Mixed,

        timestamp: { type: Date, default: Date.now }, 
    },
    { timestamps: true }
)

messageSchema.index({ instanceKey: 1, remoteJid: 1, timestamp: -1 })
messageSchema.index({ sessionId: 1, timestamp: -1 })
messageSchema.index({ instanceKey: 1, timestamp: -1 })
messageSchema.index({ instanceKey: 1, intent: 1, timestamp: -1 })
messageSchema.index({ instanceKey: 1, direction: 1, timestamp: -1 })

messageSchema.index(
    { instanceKey: 1, messageId: 1 },
    {
        unique: true,
        partialFilterExpression: { messageId: { $type: 'string', $gt: '' } },
    }
)

const Message = mongoose.model('Message', messageSchema)
module.exports = Message