const mongoose = require('mongoose')

const conversationStateSchema = new mongoose.Schema(
    {
        instanceKey: { type: String, required: true, index: true },
        remoteJid: { type: String, required: true, index: true },
        
        state: {
            type: String,
            enum: ['bot', 'awaiting_human', 'human'],
            default: 'bot',
            index: true,
        },
        transferredAt: Date,
        transferredBy: {
            type: String,
            enum: ['user_request', 'intent_failure', 'admin', null],
        },
        assignedTo: String,
        lastBotMessageAt: Date,
        lastHumanMessageAt: Date,
        failureCount: { type: Number, default: 0 },
        context: mongoose.Schema.Types.Mixed,
    },
    { timestamps: true }
)

conversationStateSchema.index(
    { instanceKey: 1, remoteJid: 1 },
    { unique: true }
)

module.exports = mongoose.model('ConversationState', conversationStateSchema)