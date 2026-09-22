const { WhatsAppInstance } = require('../class/instance')
const fs = require('fs')
const path = require('path')
const config = require('../../config/config')
const Message = require('../models/message.model')

const { Session } = require('../class/session')
const consoleLogger = require('../utils/console')

const DialogFlowConfig = require('../../api/models/dialogflow.mode')

// exports.init = async (req, res) => {
//     const key = req.query.key
//     const webhook = !req.query.webhook ? false : req.query.webhook
//     const webhookUrl = !req.query.webhookUrl ? null : req.query.webhookUrl
//     const appUrl = config.appUrl || req.protocol + '://' + req.headers.host
//     const instance = new WhatsAppInstance(key, webhook, webhookUrl, global.io)
    
//     if (WhatsAppInstances[key]) {
//         return res.status(400).json({
//             error: true,
//             message: `Instância ${key} já existe`,
//         })
//     }

//     try {
//     await session.registerInstance(key, {
//         webhook,
//         webhookUrl,
//         status: 'initializing',
//         createdAt: new Date().toISOString(),
//     })
//     } catch (error) {
//         return res.status(500).json({
//             error: true,
//             message: 'Erro ao registrar instância',
//             details: error.message,
//         })
//     }

//     const data = await instance.init()
//     WhatsAppInstances[data.key] = instance
//     await session.updateInstanceStatus(key, 'awaiting_scan')
//     res.json({
//         error: false,
//         message: 'Initializing successfully',
//         key: data.key,
//         webhook: {
//             enabled: webhook,
//             webhookUrl: webhookUrl,
//         },
//         qrcode: {
//             url: appUrl + '/instance/qr?key=' + data.key,
//         },
//         browser: config.browser,
//     })
// }

exports.init = async (req, res) => {
    const key = req.query.key
    //const description = req.query.description || `Instância ${key}` 
    const webhook = !req.query.webhook ? false : req.query.webhook
    const webhookUrl = !req.query.webhookUrl ? null : req.query.webhookUrl
    const appUrl = config.appUrl || req.protocol + '://' + req.headers.host

    // if (WhatsAppInstances[key]) {
    //     return res.status(400).json({
    //         error: true,
    //         message: `Instância ${key} já existe`,
    //     })
    // }

    try {
        const instance = new WhatsAppInstance(key, webhook, webhookUrl, global.io)
        const data = await instance.init(false)

        WhatsAppInstances[data.key] = instance

        res.json({
            error: false,
            message: 'Initializing successfully',
            key: data.key,
            webhook: {
                enabled: webhook,
                webhookUrl: webhookUrl,
            },
            qrcode: {
                url: appUrl + '/instance/qr?key=' + data.key,
            },
            browser: config.browser,
        })

    } catch (error) {

        if (WhatsAppInstances[key]) {
            delete WhatsAppInstances[key]
        }
        
        console.error('❌ Erro ao inicializar instância:', error)
        return res.status(500).json({
            error: true,
            message: 'Erro ao criar instância',
            details: error.message,
        })
    }
}

exports.qr = async (req, res) => {
    try {
        const qrcode = await WhatsAppInstances[req.query.key]?.instance.qr
        res.render('qrcode', {
            qrcode: qrcode,
        })
    } catch (error) {
        console.log('qrcode Error::: >>', error)
        res.json({
            qrcode: '',
        })
    }
}

// exports.qrbase64 = async (req, res) => {
//     try {
//         const qrcode = await WhatsAppInstances[req.query.key]?.instance.qr
//         res.json({
//             error: false,
//             message: 'QR Base64 fetched successfully',
//             qrcode: qrcode,
//         })
//     } catch (error) {
//         console.log('QRCODE qrbase64: error :::>', error)
//         res.json({
//             qrcode: '',
//         })
//     }
// }

// instance.controller.js
exports.qrbase64 = async (req, res) => {
    try {
        const instance = WhatsAppInstances[req.query.key]
        
        if (!instance) {
            return res.status(404).json({
                error: true,
                message: 'Instância não encontrada',
                qrcode: ''
            })
        }

        const qrcode = instance.instance?.qr || ''
        const qrRetry = instance.instance?.qrRetry || 0
        const maxRetry = config.instance?.maxRetryQr || 3
        const isOnline = instance.instance?.online || false
        
        // 🟢 Se já está online, não precisa de QR
        if (isOnline) {
            return res.json({
                error: false,
                message: 'Instância já está conectada',
                qrcode: '',
                status: 'connected',
                isOnline: true
            })
        }

        // 🟢 Se excedeu tentativas, informa que expirou
        if (qrRetry >= maxRetry) {
            return res.json({
                error: false,
                message: 'QR Code expirado. Clique em "Tentar Novamente" para reiniciar.',
                qrcode: '',
                status: 'expired',
                qrRetry,
                maxRetry
            })
        }

        // 🟢 QR válido ou aguardando
        res.json({
            error: false,
            message: qrcode ? 'QR Code gerado' : 'Aguardando QR Code...',
            qrcode: qrcode,
            status: qrcode ? 'ready' : 'waiting',
            qrRetry,
            maxRetry
        })

    } catch (error) {
        console.error('❌ Erro no qrbase64:', error)
        res.json({
            error: true,
            message: 'Erro ao obter QR Code',
            qrcode: '',
            status: 'error'
        })
    }
}

exports.info = async (req, res) => {
    const instance = WhatsAppInstances[req.query.key]
    let data
    try {
        data = await instance.getInstanceDetail(req.query.key)
    } catch (error) {
        data = {}
    }
    return res.json({
        error: false,
        message: 'Instance fetched successfully',
        instance_data: data,
    })
}

exports.restore = async (req, res, next) => {
    try {
        const session = new Session()
        let restoredSessions = await session.restoreSessions()
        return res.json({
            error: false,
            message: 'All instances restored',
            data: restoredSessions,
        })
    } catch (error) {
        next(error)
    }
}

exports.logout = async (req, res) => {
    let errormsg
    try {
        await WhatsAppInstances[req.query.key].instance?.sock?.logout()
    } catch (error) {
        errormsg = error
    }
    return res.json({
        error: false,
        message: 'logout successfull',
        errormsg: errormsg ? errormsg : null,
    })
}

exports.delete = async (req, res) => {
    let errormsg
    try {
        await WhatsAppInstances[req.query.key].deleteInstance(req.query.key)
        delete WhatsAppInstances[req.query.key]
    } catch (error) {
        errormsg = error
    }
    return res.json({
        error: false,
        message: 'Instance deleted successfully',
        data: errormsg ? errormsg : null,
    })
}

exports.list = async (req, res) => {
    if (req.query.active) {
        const db = global.mongoClient.db('whatsapp-api')
        const result = await db.listCollections().toArray()
          const systemCollection = [
            'chats',
            'messages',
            'users',
            'sessions',
            'auth',
            'dialogflowconfigs',
        ]
        
        const instances = result
            .filter(collection => !systemCollection.includes(collection.name))
            .map(collection => collection.name)

        return res.json({
            error: false,
            message: 'All active instance',
            data: instances,
        })
    }

    const instancePromises = Object.keys(WhatsAppInstances).map(async (key) =>
        WhatsAppInstances[key].getInstanceDetail(key)
    )

    const data = await Promise.all(instancePromises)
    return res.json({
        error: false,
        message: 'All instance.... listed',
        data: data,
    })
}

exports.messages = async (req, res) => {
    try {
        const { key, remoteJid, limit = 50, page = 1 } = req.query

        const query = {}
        if (key) query.key = key
        if (remoteJid) query.remoteJid = remoteJid

        const messages = await Message.find(query)
            .sort({ timestamp: -1 })
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))

        const total = await Message.countDocuments(query)
        console.log('Total messages found: ', total)
        res.json({
            data: messages,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit)),
            },
        })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}


exports.saveDialogFlowConfig = async (req, res) => {
    try {
        const { key } = req.params
        const {
            googlePrivateKey,
            googleClientEmail,
            googleProjectId,
            languageCode,
            enabled
        } = req.body

        // Validações básicas
        if (!googlePrivateKey || !googleClientEmail || !googleProjectId) {
            return res.status(400).json({
                error: true,
                message: 'Credenciais do DialogFlow incompletas'
            })
        }

        // Verificar se a instância existe
        const instance = WhatsAppInstances[key]
        if (!instance) {
            return res.status(404).json({
                error: true,
                message: 'Instância não encontrada'
            })
        }

        // Verificar se já existe configuração
        const existing = await DialogFlowConfig.findOne({ instance_key: key })
        if (existing) {
            return res.status(400).json({
                error: true,
                message: 'Configuração já existe para esta instância'
            })
        }

        // Criar nova configuração
        const config = new DialogFlowConfig({
            instance_key: key,
            googlePrivateKey,
            googleClientEmail,
            googleProjectId,
            languageCode: languageCode || 'pt',
            enabled: enabled !== undefined ? enabled : true
        })

        await config.save()

        // Atualizar a instância com a configuração (se necessário)
        if (instance.instance) {
            instance.instance.dialogflowConfig = config
        }

        res.json({
            error: false,
            message: 'Configuração do DialogFlow salva com sucesso',
            data: {
                instance_key: key,
                googleProjectId: config.googleProjectId,
                languageCode: config.languageCode,
                enabled: config.enabled
            }
        })

    } catch (error) {
        console.error('❌ Erro ao salvar configuração DialogFlow:', error)
        res.status(500).json({
            error: true,
            message: 'Erro ao salvar configuração',
            details: error.message
        })
    }
}


exports.getDialogFlowConfig = async (req, res) => {
    try {
        const { key } = req.params

        const config = await DialogFlowConfig.findOne({ instance_key: key })
        
        if (!config) {
            return res.status(404).json({
                error: true,
                message: 'Configuração não encontrada para esta instância'
            })
        }

        // Não enviar a chave privada completa por segurança
        res.json({
            error: false,
            message: 'Configuração encontrada',
            data: {
                instance_key: config.instance_key,
                googleProjectId: config.googleProjectId,
                googleClientEmail: config.googleClientEmail,
                languageCode: config.languageCode,
                enabled: config.enabled,
                hasPrivateKey: !!config.googlePrivateKey
            }
        })

    } catch (error) {
        console.error('❌ Erro ao buscar configuração DialogFlow:', error)
        res.status(500).json({
            error: true,
            message: 'Erro ao buscar configuração',
            details: error.message
        })
    }
}

exports.updateDialogFlowConfig = async (req, res) => {
    try {
        const { key } = req.params
        const updateData = req.body

        // Campos que podem ser atualizados
        const allowedUpdates = [
            'googlePrivateKey',
            'googleClientEmail',
            'googleProjectId',
            'languageCode',
            'enabled'
        ]

        // Filtrar apenas campos permitidos
        const updates = {}
        allowedUpdates.forEach(field => {
            if (updateData[field] !== undefined) {
                updates[field] = updateData[field]
            }
        })

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                error: true,
                message: 'Nenhum campo válido para atualização'
            })
        }

        updates.updatedAt = Date.now()

        const config = await DialogFlowConfig.findOneAndUpdate(
            { instance_key: key },
            updates,
            { new: true }
        )

        if (!config) {
            return res.status(404).json({
                error: true,
                message: 'Configuração não encontrada'
            })
        }

        // Atualizar instância em memória
        const instance = WhatsAppInstances[key]
        if (instance?.instance) {
            instance.instance.dialogflowConfig = config
        }

        res.json({
            error: false,
            message: 'Configuração atualizada com sucesso',
            data: {
                instance_key: config.instance_key,
                googleProjectId: config.googleProjectId,
                languageCode: config.languageCode,
                enabled: config.enabled
            }
        })

    } catch (error) {
        console.error('❌ Erro ao atualizar configuração DialogFlow:', error)
        res.status(500).json({
            error: true,
            message: 'Erro ao atualizar configuração',
            details: error.message
        })
    }
}

exports.deleteDialogFlowConfig = async (req, res) => {
    try {
        const { key } = req.params

        const result = await DialogFlowConfig.deleteOne({ instance_key: key })

        if (result.deletedCount === 0) {
            return res.status(404).json({
                error: true,
                message: 'Configuração não encontrada'
            })
        }

        // Remover da instância em memória
        const instance = WhatsAppInstances[key]
        if (instance?.instance) {
            delete instance.instance.dialogflowConfig
        }

        res.json({
            error: false,
            message: 'Configuração deletada com sucesso'
        })

    } catch (error) {
        console.error('❌ Erro ao deletar configuração DialogFlow:', error)
        res.status(500).json({
            error: true,
            message: 'Erro ao deletar configuração',
            details: error.message
        })
    }
}

exports.checkDialogFlowConfig = async (req, res) => {
    try {
        const { key } = req.params

        const config = await DialogFlowConfig.findOne({ instance_key: key })
        
        res.json({
            error: false,
            configured: !!config,
            enabled: config?.enabled || false,
            data: config ? {
                googlePrivateKey: config.googlePrivateKey,
                googleClientEmail: config.googleClientEmail,
                googleProjectId: config.googleProjectId,
                languageCode: config.languageCode,
                enabled: config.enabled
            } : null
        })

    } catch (error) {
        console.error('❌ Erro ao verificar configuração DialogFlow:', error)
        res.status(500).json({
            error: true,
            message: 'Erro ao verificar configuração',
            details: error.message
        })
    }
}

exports.checkInstanceConfig = async (req, res) => {
    try {
        const { key } = req.params

        // Verificar se instância existe
        const instance = WhatsAppInstances[key]
        const instanceExists = !!instance

        // Verificar configuração DialogFlow
        const dfConfig = await DialogFlowConfig.findOne({ instance_key: key })
        const hasDialogFlow = !!dfConfig

        // Verificar status da instância
        let status = 'unknown'
        let isOnline = false
        
        if (instance?.instance) {
            status = instance.instance.connectionStatus || 'disconnected'
            isOnline = instance.instance.online || false
        }

        res.json({
            error: false,
            instance_key: key,
            instanceExists,
            configured: hasDialogFlow,
            dialogflow: {
                configured: hasDialogFlow,
                enabled: dfConfig?.enabled || false,
                projectId: dfConfig?.googleProjectId
            },
            connection: {
                status,
                isOnline
            }
        })

    } catch (error) {
        console.error('❌ Erro ao verificar configuração da instância:', error)
        res.status(500).json({
            error: true,
            message: 'Erro ao verificar configuração',
            details: error.message
        })
    }
}

