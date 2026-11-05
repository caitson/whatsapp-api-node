const mongoose = require('mongoose')

const DialogFlowConfigSchema = new mongoose.Schema({
    instance_key: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    googlePrivateKey: {
        type: String,
        required: true
    },
    googleClientEmail: {
        type: String,
        required: true
    },
    googleProjectId: {
        type: String,
        required: true
    },
    languageCode: {
        type: String,
        required: true,
        default: 'pt'
    },
    enabled: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
})

DialogFlowConfigSchema.pre('save', function(next) {
    this.updatedAt = Date.now()
    //next()
})

module.exports = mongoose.model('DialogFlowConfig', DialogFlowConfigSchema)