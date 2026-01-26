const QRCode = require('qrcode')
const pino = require('pino')
const {
    default: makeWASocket,
    DisconnectReason,
} = require('@whiskeysockets/baileys')
const { unlinkSync } = require('fs')
const { v4: uuidv4 } = require('uuid')
const path = require('path')
const processButton = require('../helper/processbtn')
const generateVC = require('../helper/genVc')
const Chat = require('../models/chat.model')
const axios = require('axios')
const config = require('../../config/config')
const downloadMessage = require('../helper/downloadMsg')
const logger = require('pino')()
const useMongoDBAuthState = require('../helper/mongoAuthState')
const DialogflowHandler = require('../../dialogflow/services/dialogflowHandler')

class WhatsAppInstance {
    socketConfig = {
        defaultQueryTimeoutMs: undefined,
        printQRInTerminal: false,
        logger: pino({
            level: config.log.level,
        }),
    }
    key = ''
    authState
    allowWebhook = undefined
    webhook = undefined

    unreadMessages = undefined
    processingUnread = undefined

    dialogflow = undefined

    instance = {
        key: this.key,
        chats: [],
        qr: '',
        messages: [],
        qrRetry: 0,
        customWebhook: '',
    }

    axiosInstance = axios.create({
        baseURL: config.webhookUrl,
    })

    constructor(key, allowWebhook, webhook) {
        this.key = key ? key : uuidv4()
        this.instance.customWebhook = this.webhook ? this.webhook : webhook
        this.allowWebhook = config.webhookEnabled
            ? config.webhookEnabled
            : allowWebhook
        this.unreadMessages = []
        this.processingUnread = false

        this.dialogflow = new DialogflowHandler()

        if (this.allowWebhook && this.instance.customWebhook !== null) {
            this.allowWebhook = true
            this.instance.customWebhook = webhook
            this.axiosInstance = axios.create({
                baseURL: webhook,
            })
        }
    }

    async SendWebhook(type, body, key) {
        console.log('Sending webhook:', { type, body, key })
        if (!this.allowWebhook) return
        this.axiosInstance
            .post('', {
                type,
                body,
                instanceKey: key,
            })
            .catch(() => {})
    }

    async init() {
        this.collection = global.mongoClient
            .db('whatsapp-api')
            .collection(this.key)
        const { state, saveCreds } = await useMongoDBAuthState(this.collection)
        this.authState = { state: state, saveCreds: saveCreds }
        this.socketConfig.auth = this.authState.state
        this.socketConfig.browser = Object.values(config.browser)
        this.instance.sock = makeWASocket(this.socketConfig)
        this.setHandler()
        return this
    }

    setHandler() {
        const sock = this.instance.sock
        // on credentials update save state
        sock?.ev.on('creds.update', this.authState.saveCreds)

        // on socket closed, opened, connecting
        sock?.ev.on('connection.update', async (update) => {
            //console.log('Event: Connection update:', update)

            const { connection, lastDisconnect, qr } = update

            if (connection === 'connecting') return

            if (connection === 'close') {
                // reconnect if not logged out
                if (
                    lastDisconnect?.error?.output?.statusCode !==
                    DisconnectReason.loggedOut
                ) {
                    await this.init()
                } else {
                    await this.collection.drop().then((r) => {
                        logger.info('STATE: Droped collection')
                    })
                    this.instance.online = false
                }

                if (
                    [
                        'all',
                        'connection',
                        'connection.update',
                        'connection:close',
                    ].some((e) => config.webhookAllowedEvents.includes(e))
                )
                    await this.SendWebhook(
                        'connection',
                        {
                            connection: connection,
                        },
                        this.key
                    )
            } else if (connection === 'open') {
                if (config.mongoose.enabled) {
                    let alreadyThere = await Chat.findOne({
                        key: this.key,
                    }).exec()
                    if (!alreadyThere) {
                        const saveChat = new Chat({ key: this.key })
                        await saveChat.save()
                    }
                }
                this.instance.online = true
                if (
                    [
                        'all',
                        'connection',
                        'connection.update',
                        'connection:open',
                    ].some((e) => config.webhookAllowedEvents.includes(e))
                )
                    await this.SendWebhook(
                        'connection',
                        {
                            connection: connection,
                        },
                        this.key
                    )
            }

            if (qr) {
                QRCode.toDataURL(qr).then((url) => {
                    this.instance.qr = url
                    this.instance.qrRetry++
                    if (this.instance.qrRetry >= config.instance.maxRetryQr) {
                        // close WebSocket connection
                        this.instance.sock.ws.close()
                        // remove all events
                        this.instance.sock.ev.removeAllListeners()
                        this.instance.qr = ' '
                        this.instance.messages = 'QR Code expired'
                        logger.info('socket connection terminated')
                    }
                })
            }
        })

        // sending presence
        sock?.ev.on('presence.update', async (json) => {
            //console.log('Event: Presence update:', json)

            if (
                ['all', 'presence', 'presence.update'].some((e) =>
                    config.webhookAllowedEvents.includes(e)
                )
            )
                await this.SendWebhook('presence', json, this.key)
        })

        // on receive all chats
        sock?.ev.on('chats.set', async ({ chats }) => {
            console.log('Event: Chats set:', chats)

            this.instance.chats = []
            const recivedChats = chats.map((chat) => {
                return {
                    ...chat,
                    messages: [],
                }
            })
            this.instance.chats.push(...recivedChats)
            await this.updateDb(this.instance.chats)
            await this.updateDbGroupsParticipants()
        })

        // on recive new chat
        sock?.ev.on('chats.upsert', (newChat) => {
            //console.log('Event: Chats upsert:', newChat)

            //console.log('chats.upsert')
            //console.log(newChat)
            const chats = newChat.map((chat) => {
                return {
                    ...chat,
                    messages: [],
                }
            })
            this.instance.chats.push(...chats)
        })

        // on chat change
        sock?.ev.on('chats.update', (changedChat) => {
            //console.log('Event: Chats update:', changedChat)

            //console.log('chats.update')
            //console.log(changedChat)
            changedChat.map((chat) => {
                const index = this.instance.chats.findIndex(
                    (pc) => pc.id === chat.id
                )
                const PrevChat = this.instance.chats[index]
                this.instance.chats[index] = {
                    ...PrevChat,
                    ...chat,
                }
            })
        })

        // on chat delete
        sock?.ev.on('chats.delete', (deletedChats) => {
            //console.log('Event: Chats delete:', deletedChats)

            //console.log('chats.delete')
            //console.log(deletedChats)
            deletedChats.map((chat) => {
                const index = this.instance.chats.findIndex(
                    (c) => c.id === chat
                )
                this.instance.chats.splice(index, 1)
            })
        })

        // on new mssage
        sock?.ev.on('messages.upsert', async (m) => {
            console.log('Event: Messages upsert:', m)

            if (m.type === 'prepend'){
                this.instance.messages.unshift(...m.messages)
                return;
            }
               
            //if (m.type !== 'notify') return

            //console.log(`Received ${m.messages.length} new messages`)

            const newUnreadMessages = []

            for (const msg of m.messages) {
                if (!msg.message) continue

                const messageType = Object.keys(msg.message)[0]
                if (
                    [
                        'protocolMessage',
                        'senderKeyDistributionMessage',
                    ].includes(messageType)
                ) {
                    continue
                }

                // 1. Armazena como não lida
                this.unreadMessages.push(msg)
                //newUnreadMessages.push(msg)
                this.instance.messages.unshift(msg)

                // 2. Processa com Dialogflow se habilitado

                await this.processMessageWithDialogflow(msg)

                if (this.allowWebhook) {
                    const webhookData = {
                        key: this.key,
                        ...msg,
                    }

                    if (
                        ['all', 'messages', 'messages.upsert'].some((e) =>
                            config.webhookAllowedEvents.includes(e)
                        )
                    ) {
                        await this.SendWebhook('message', webhookData, this.key)
                    }
                }
            }

            console.log(
                `Received ${newUnreadMessages.length} new unread messages`
            )

            // if (
            //     config.processUnreadImmediately &&
            //     newUnreadMessages.length > 0
            // ) {
            //     // Processa apenas as novas, não todas
            //     console.log('Processing new unread messages immediately')
            //     const tempQueue = [...newUnreadMessages]
            //     for (const msg of tempQueue) {
            //         await this.processSingleUnreadMessage(msg)

            //         // Webhook se necessário
            //         if (this.allowWebhook) {
            //             const webhookData = {
            //                 key: this.key,
            //                 ...msg,
            //             }

            //             // Seu código de download de mídia aqui (se config.webhookBase64)
            //             if (config.webhookBase64) {
            //                 // ... mantém seu código atual
            //             }

            //             if (
            //                 ['all', 'messages', 'messages.upsert'].some((e) =>
            //                     config.webhookAllowedEvents.includes(e)
            //                 )
            //             ) {
            //                 await this.SendWebhook(
            //                     'message',
            //                     webhookData,
            //                     this.key
            //                 )
            //             }
            //         }
            //     }
            // }
        })

        sock?.ev.on('messages.update', async (messages) => {
            //console.log('Event: Messages update:', messages)
            //console.log('messages.update')
            //console.dir(messages);
        })
        sock?.ws.on('CB:call', async (data) => {
            //console.log('Event: Call event:', data)

            if (data.content) {
                if (data.content.find((e) => e.tag === 'offer')) {
                    const content = data.content.find((e) => e.tag === 'offer')
                    if (
                        ['all', 'call', 'CB:call', 'call:offer'].some((e) =>
                            config.webhookAllowedEvents.includes(e)
                        )
                    )
                        await this.SendWebhook(
                            'call_offer',
                            {
                                id: content.attrs['call-id'],
                                timestamp: parseInt(data.attrs.t),
                                user: {
                                    id: data.attrs.from,
                                    platform: data.attrs.platform,
                                    platform_version: data.attrs.version,
                                },
                            },
                            this.key
                        )
                } else if (data.content.find((e) => e.tag === 'terminate')) {
                    const content = data.content.find(
                        (e) => e.tag === 'terminate'
                    )

                    if (
                        ['all', 'call', 'call:terminate'].some((e) =>
                            config.webhookAllowedEvents.includes(e)
                        )
                    )
                        await this.SendWebhook(
                            'call_terminate',
                            {
                                id: content.attrs['call-id'],
                                user: {
                                    id: data.attrs.from,
                                },
                                timestamp: parseInt(data.attrs.t),
                                reason: data.content[0].attrs.reason,
                            },
                            this.key
                        )
                }
            }
        })

        sock?.ev.on('groups.upsert', async (newChat) => {
            //console.log('groups.upsert')
            //console.log(newChat)
            this.createGroupByApp(newChat)
            if (
                ['all', 'groups', 'groups.upsert'].some((e) =>
                    config.webhookAllowedEvents.includes(e)
                )
            )
                await this.SendWebhook(
                    'group_created',
                    {
                        data: newChat,
                    },
                    this.key
                )
        })

        sock?.ev.on('groups.update', async (newChat) => {
            //console.log('groups.update')
            //console.log(newChat)
            this.updateGroupSubjectByApp(newChat)
            if (
                ['all', 'groups', 'groups.update'].some((e) =>
                    config.webhookAllowedEvents.includes(e)
                )
            )
                await this.SendWebhook(
                    'group_updated',
                    {
                        data: newChat,
                    },
                    this.key
                )
        })

        sock?.ev.on('group-participants.update', async (newChat) => {
            //console.log('group-participants.update')
            //console.log(newChat)
            this.updateGroupParticipantsByApp(newChat)
            if (
                [
                    'all',
                    'groups',
                    'group_participants',
                    'group-participants.update',
                ].some((e) => config.webhookAllowedEvents.includes(e))
            )
                await this.SendWebhook(
                    'group_participants_updated',
                    {
                        data: newChat,
                    },
                    this.key
                )
        })
    }

    async processMessageWithDialogflow(messageData) {
        try {
            console.log('🤖 Processando com Dialogflow...')

            // Processa com Dialogflow
            const dialogflowResult = await this.dialogflow.processMessage(
                messageData
            )

            if (!dialogflowResult.success) {
                console.log(
                    '⏭️ Dialogflow não processou:',
                    dialogflowResult.error
                )
                return
            }

            console.log('✅ Dialogflow:', {
                intent: dialogflowResult.intent,
                confidence: dialogflowResult.confidence,
                hasResponse: !!dialogflowResult.response,
            })

            // Se tiver resposta, envia para WhatsApp
            if (
                dialogflowResult.response &&
                dialogflowResult.response.trim() !== ''
            ) {
                await this.sendDialogflowResponse(
                    messageData.key.remoteJid,
                    dialogflowResult.response
                )
            }
        } catch (error) {
            console.error('❌ Erro ao processar com Dialogflow:', error)
        }
    }

    async sendDialogflowResponse(to, text) {
        try {
            console.log('📤 Enviando resposta do Dialogflow:', {
                to: to,
                textLength: text.length,
            })

            const result = await this.sendTextMessage(to, text)

            console.log('✅ Resposta enviada:', {
                messageId: result?.key?.id,
            })

            return result
        } catch (error) {
            console.error('❌ Erro ao enviar resposta:', error)
            return null
        }
    }

    async processUnreadMessages() {
        if (this.processingUnread || this.unreadMessages.length === 0) {
            return {
                processed: 0,
                messages: [],
                status: this.processingUnread
                    ? 'already_processing'
                    : 'no_messages',
            }
        }

        this.processingUnread = true

        const processedMessages = []

        while (this.unreadMessages.length > 0) {
            const msg = this.unreadMessages.shift()

            // Processa a mensagem
            const processed = await this.processSingleUnreadMessage(msg)
            processedMessages.push(processed)

            // Seu processamento normal aqui (webhook, etc.)
            if (this.allowWebhook) {
                await this.SendWebhook(
                    'message',
                    {
                        key: this.key,
                        ...msg,
                        isUnread: true,
                    },
                    this.key
                )
            }

            // Marcar como lida apenas após processamento
            if (config.markMessagesRead) {
                await this.instance.sock.readMessages([
                    {
                        remoteJid: msg.key.remoteJid,
                        id: msg.key.id,
                        participant: msg.key?.participant,
                    },
                ])
            }
        }

        this.processingUnread = false

        return {
            processed: processedMessages.length,
            messages: processedMessages,
            status: 'success',
        }
    }

    async processSingleUnreadMessage(msg) {
        const processedMsg = {
            key: msg.key,
            message: msg.message,
            timestamp: msg.messageTimestamp,
            from: msg.key.remoteJid,
            type: Object.keys(msg.message)[0],
        }

        console.log('Processing unread message:', processedMsg)
        // Adicionar texto se for conversa
        if (processedMsg.type === 'conversation') {
            processedMsg.text = msg.message.conversation
        }

        return processedMsg
    }

    async getAllUnreadMessages() {
        try {
            // Retorna as mensagens não lidas armazenadas
            const unread = [...this.unreadMessages]

            // Se quiser também buscar do WhatsApp (opcional)
            let fromServer = []
            if (config.fetchFromServer) {
                const chats = await this.instance.sock.fetchChats({ limit: 50 })
                const unreadChats = chats.filter((chat) => chat.unreadCount > 0)

                console.log(
                    `Fetching unread messages from ${unreadChats} chats from server`
                )

                for (const chat of unreadChats) {
                    try {
                        const messages = await this.instance.sock.loadMessages(
                            chat.id,
                            Math.min(chat.unreadCount, 50)
                        )
                        console.log(
                            `Fetched ${messages.length} messages from chat ${chat.id}`
                        )
                        fromServer.push({
                            chatId: chat.id,
                            chatName: chat.name,
                            unreadCount: chat.unreadCount,
                            messages: messages.slice(0, chat.unreadCount),
                        })
                    } catch (error) {
                        console.error(
                            `Error fetching from chat ${chat.id}:`,
                            error
                        )
                    }
                }
            }

            return {
                cached: {
                    count: unread.length,
                    messages: unread.map((msg) => ({
                        id: msg.key.id,
                        from: msg.key.remoteJid,
                        timestamp: msg.messageTimestamp,
                        type: Object.keys(msg.message)[0],
                    })),
                },
                fromServer: fromServer,
                total:
                    unread.length +
                    fromServer.reduce(
                        (sum, chat) => sum + chat.messages.length,
                        0
                    ),
            }
        } catch (error) {
            console.error('Error in getAllUnreadMessages:', error)
            return { error: error.message }
        }
    }

    async deleteInstance(key) {
        try {
            await Chat.findOneAndDelete({ key: key })
        } catch (e) {
            logger.error('Error updating document failed')
        }
    }

    async getInstanceDetail(key) {
        return {
            instance_key: key,
            phone_connected: this.instance?.online,
            webhookUrl: this.instance.customWebhook,
            user: this.instance?.online ? this.instance.sock?.user : {},
        }
    }

    // getWhatsAppId(id) {
    //     if (id.includes('@g.us') || id.includes('@s.whatsapp.net')) return id
    //     return id.includes('-') ? `${id}@g.us` : `${id}@s.whatsapp.net`
    // }

    getWhatsAppId(id) {
        console.log('getWhatsAppId input:', id)

        // Se já tiver qualquer domínio WhatsApp, retorna como está
        if (
            id.includes('@g.us') ||
            id.includes('@s.whatsapp.net') ||
            id.includes('@c.us')
        ) {
            console.log('Already has WhatsApp domain, returning as-is:', id)
            return id
        }

        // Limpa o número
        let cleanId = id.replace(/[^\d-]/g, '')
        console.log('Cleaned ID:', cleanId)

        // Se tiver hífen, é grupo
        if (cleanId.includes('-')) {
            const result = `${cleanId}@g.us`
            console.log('Formatted as group:', result)
            return result
        }

        // Para números pessoais
        const result = `${cleanId}@s.whatsapp.net`
        console.log('Formatted as personal:', result)
        return result
    }

    // async verifyId(id) {
    //     if (id.includes('@g.us')) return true
    //     const [result] = await this.instance.sock?.onWhatsApp(id)
    //     if (result?.exists) return true
    //     throw new Error('no account exists')
    // }

    async verifyId(id) {
        console.log('=== VERIFYID METHOD ===')
        console.log('Verifying ID:', id)

        // Se já tiver domínio, usa como está
        const checkId = id.includes('@') ? id : `${id}@s.whatsapp.net`
        console.log('Checking ID:', checkId)

        // Se for grupo, não precisa verificar
        if (checkId.includes('@g.us')) {
            console.log('Is group, skipping verification')
            return true
        }

        try {
            console.log('Calling onWhatsApp for:', checkId)
            const [result] = await this.instance.sock.onWhatsApp(checkId)
            console.log('Verification result:', result)

            if (result?.exists) {
                console.log('ID exists on WhatsApp')
                return true
            } else {
                console.log('ID does not exist on WhatsApp')
                throw new Error(`no account exists for ${checkId}`)
            }
        } catch (error) {
            console.error('Error in verifyId:', error.message)
            throw error
        }
    }

    // async sendTextMessage(to, message) {
    //     await this.verifyId(this.getWhatsAppId(to))
    //     const data = await this.instance.sock?.sendMessage(
    //         this.getWhatsAppId(to),
    //         { text: message }
    //     )
    //     return data
    // }

    async sendTextMessage(to, message) {
        try {
            const whatsappId = this.getWhatsAppId(to)
            if (!this.instance.sock) {
                throw new Error('Socket not available')
            }

            const data = await this.instance.sock.sendMessage(whatsappId, {
                text: message,
            })
            return data
        } catch (error) {
            if (error.message.includes('no account exists')) {
                const whatsappId = this.getWhatsAppId(to)
                return await this.instance.sock?.sendMessage(whatsappId, {
                    text: message,
                })
            }

            throw error
        }
    }

    async sendMediaFile(to, file, type, caption = '', filename) {
        await this.verifyId(this.getWhatsAppId(to))
        const data = await this.instance.sock?.sendMessage(
            this.getWhatsAppId(to),
            {
                mimetype: file.mimetype,
                [type]: file.buffer,
                caption: caption,
                ptt: type === 'audio' ? true : false,
                fileName: filename ? filename : file.originalname,
            }
        )
        return data
    }

    async sendUrlMediaFile(to, url, type, mimeType, caption = '') {
        await this.verifyId(this.getWhatsAppId(to))

        const data = await this.instance.sock?.sendMessage(
            this.getWhatsAppId(to),
            {
                [type]: {
                    url: url,
                },
                caption: caption,
                mimetype: mimeType,
            }
        )
        return data
    }

    async DownloadProfile(of) {
        await this.verifyId(this.getWhatsAppId(of))
        const ppUrl = await this.instance.sock?.profilePictureUrl(
            this.getWhatsAppId(of),
            'image'
        )
        return ppUrl
    }

    async getUserStatus(of) {
        await this.verifyId(this.getWhatsAppId(of))
        const status = await this.instance.sock?.fetchStatus(
            this.getWhatsAppId(of)
        )
        return status
    }

    async blockUnblock(to, data) {
        await this.verifyId(this.getWhatsAppId(to))
        const status = await this.instance.sock?.updateBlockStatus(
            this.getWhatsAppId(to),
            data
        )
        return status
    }

    async sendButtonMessage(to, data) {
        await this.verifyId(this.getWhatsAppId(to))
        const result = await this.instance.sock?.sendMessage(
            this.getWhatsAppId(to),
            {
                templateButtons: processButton(data.buttons),
                text: data.text ?? '',
                footer: data.footerText ?? '',
                viewOnce: true,
            }
        )
        return result
    }

    async sendContactMessage(to, data) {
        await this.verifyId(this.getWhatsAppId(to))
        const vcard = generateVC(data)
        const result = await this.instance.sock?.sendMessage(
            await this.getWhatsAppId(to),
            {
                contacts: {
                    displayName: data.fullName,
                    contacts: [{ displayName: data.fullName, vcard }],
                },
            }
        )
        return result
    }

    async sendListMessage(to, data) {
        await this.verifyId(this.getWhatsAppId(to))
        const result = await this.instance.sock?.sendMessage(
            this.getWhatsAppId(to),
            {
                text: data.text,
                sections: data.sections,
                buttonText: data.buttonText,
                footer: data.description,
                title: data.title,
                viewOnce: true,
            }
        )
        return result
    }

    async sendMediaButtonMessage(to, data) {
        await this.verifyId(this.getWhatsAppId(to))

        const result = await this.instance.sock?.sendMessage(
            this.getWhatsAppId(to),
            {
                [data.mediaType]: {
                    url: data.image,
                },
                footer: data.footerText ?? '',
                caption: data.text,
                templateButtons: processButton(data.buttons),
                mimetype: data.mimeType,
                viewOnce: true,
            }
        )
        return result
    }

    async setStatus(status, to) {
        await this.verifyId(this.getWhatsAppId(to))

        const result = await this.instance.sock?.sendPresenceUpdate(status, to)
        return result
    }

    // change your display picture or a group's
    async updateProfilePicture(id, url) {
        try {
            const img = await axios.get(url, { responseType: 'arraybuffer' })
            const res = await this.instance.sock?.updateProfilePicture(
                id,
                img.data
            )
            return res
        } catch (e) {
            //console.log(e)
            return {
                error: true,
                message: 'Unable to update profile picture',
            }
        }
    }

    // get user or group object from db by id
    async getUserOrGroupById(id) {
        try {
            let Chats = await this.getChat()
            const group = Chats.find((c) => c.id === this.getWhatsAppId(id))
            if (!group)
                throw new Error(
                    'unable to get group, check if the group exists'
                )
            return group
        } catch (e) {
            logger.error(e)
            logger.error('Error get group failed')
        }
    }

    // Group Methods
    parseParticipants(users) {
        return users.map((users) => this.getWhatsAppId(users))
    }

    async updateDbGroupsParticipants() {
        try {
            let groups = await this.groupFetchAllParticipating()
            let Chats = await this.getChat()
            if (groups && Chats) {
                for (const [key, value] of Object.entries(groups)) {
                    let group = Chats.find((c) => c.id === value.id)
                    if (group) {
                        let participants = []
                        for (const [
                            key_participant,
                            participant,
                        ] of Object.entries(value.participants)) {
                            participants.push(participant)
                        }
                        group.participant = participants
                        if (value.creation) {
                            group.creation = value.creation
                        }
                        if (value.subjectOwner) {
                            group.subjectOwner = value.subjectOwner
                        }
                        Chats.filter((c) => c.id === value.id)[0] = group
                    }
                }
                await this.updateDb(Chats)
            }
        } catch (e) {
            logger.error(e)
            logger.error('Error updating groups failed')
        }
    }

    async createNewGroup(name, users) {
        try {
            const group = await this.instance.sock?.groupCreate(
                name,
                users.map(this.getWhatsAppId)
            )
            return group
        } catch (e) {
            logger.error(e)
            logger.error('Error create new group failed')
        }
    }

    async addNewParticipant(id, users) {
        try {
            const res = await this.instance.sock?.groupAdd(
                this.getWhatsAppId(id),
                this.parseParticipants(users)
            )
            return res
        } catch {
            return {
                error: true,
                message:
                    'Unable to add participant, you must be an admin in this group',
            }
        }
    }

    async makeAdmin(id, users) {
        try {
            const res = await this.instance.sock?.groupMakeAdmin(
                this.getWhatsAppId(id),
                this.parseParticipants(users)
            )
            return res
        } catch {
            return {
                error: true,
                message:
                    'unable to promote some participants, check if you are admin in group or participants exists',
            }
        }
    }

    async demoteAdmin(id, users) {
        try {
            const res = await this.instance.sock?.groupDemoteAdmin(
                this.getWhatsAppId(id),
                this.parseParticipants(users)
            )
            return res
        } catch {
            return {
                error: true,
                message:
                    'unable to demote some participants, check if you are admin in group or participants exists',
            }
        }
    }

    async getAllGroups() {
        let Chats = await this.getChat()
        return Chats.filter((c) => c.id.includes('@g.us')).map((data, i) => {
            return {
                index: i,
                name: data.name,
                jid: data.id,
                participant: data.participant,
                creation: data.creation,
                subjectOwner: data.subjectOwner,
            }
        })
    }

    async leaveGroup(id) {
        try {
            let Chats = await this.getChat()
            const group = Chats.find((c) => c.id === id)
            if (!group) throw new Error('no group exists')
            return await this.instance.sock?.groupLeave(id)
        } catch (e) {
            logger.error(e)
            logger.error('Error leave group failed')
        }
    }

    async getInviteCodeGroup(id) {
        try {
            let Chats = await this.getChat()
            const group = Chats.find((c) => c.id === id)
            if (!group)
                throw new Error(
                    'unable to get invite code, check if the group exists'
                )
            return await this.instance.sock?.groupInviteCode(id)
        } catch (e) {
            logger.error(e)
            logger.error('Error get invite group failed')
        }
    }

    async getInstanceInviteCodeGroup(id) {
        try {
            return await this.instance.sock?.groupInviteCode(id)
        } catch (e) {
            logger.error(e)
            logger.error('Error get invite group failed')
        }
    }

    // get Chat object from db
    async getChat(key = this.key) {
        let dbResult = await Chat.findOne({ key: key }).exec()
        let ChatObj = dbResult.chat
        return ChatObj
    }

    // create new group by application
    async createGroupByApp(newChat) {
        try {
            let Chats = await this.getChat()
            let group = {
                id: newChat[0].id,
                name: newChat[0].subject,
                participant: newChat[0].participants,
                messages: [],
                creation: newChat[0].creation,
                subjectOwner: newChat[0].subjectOwner,
            }
            Chats.push(group)
            await this.updateDb(Chats)
        } catch (e) {
            logger.error(e)
            logger.error('Error updating document failed')
        }
    }

    async updateGroupSubjectByApp(newChat) {
        //console.log(newChat)
        try {
            if (newChat[0] && newChat[0].subject) {
                let Chats = await this.getChat()
                Chats.find((c) => c.id === newChat[0].id).name =
                    newChat[0].subject
                await this.updateDb(Chats)
            }
        } catch (e) {
            logger.error(e)
            logger.error('Error updating document failed')
        }
    }

    async updateGroupParticipantsByApp(newChat) {
        //console.log(newChat)
        try {
            if (newChat && newChat.id) {
                let Chats = await this.getChat()
                let chat = Chats.find((c) => c.id === newChat.id)
                let is_owner = false
                if (chat) {
                    if (chat.participant == undefined) {
                        chat.participant = []
                    }
                    if (chat.participant && newChat.action == 'add') {
                        for (const participant of newChat.participants) {
                            chat.participant.push({
                                id: participant,
                                admin: null,
                            })
                        }
                    }
                    if (chat.participant && newChat.action == 'remove') {
                        for (const participant of newChat.participants) {
                            // remove group if they are owner
                            if (chat.subjectOwner == participant) {
                                is_owner = true
                            }
                            chat.participant = chat.participant.filter(
                                (p) => p.id != participant
                            )
                        }
                    }
                    if (chat.participant && newChat.action == 'demote') {
                        for (const participant of newChat.participants) {
                            if (
                                chat.participant.filter(
                                    (p) => p.id == participant
                                )[0]
                            ) {
                                chat.participant.filter(
                                    (p) => p.id == participant
                                )[0].admin = null
                            }
                        }
                    }
                    if (chat.participant && newChat.action == 'promote') {
                        for (const participant of newChat.participants) {
                            if (
                                chat.participant.filter(
                                    (p) => p.id == participant
                                )[0]
                            ) {
                                chat.participant.filter(
                                    (p) => p.id == participant
                                )[0].admin = 'superadmin'
                            }
                        }
                    }
                    if (is_owner) {
                        Chats = Chats.filter((c) => c.id !== newChat.id)
                    } else {
                        Chats.filter((c) => c.id === newChat.id)[0] = chat
                    }
                    await this.updateDb(Chats)
                }
            }
        } catch (e) {
            logger.error(e)
            logger.error('Error updating document failed')
        }
    }

    async groupFetchAllParticipating() {
        try {
            const result =
                await this.instance.sock?.groupFetchAllParticipating()
            return result
        } catch (e) {
            logger.error('Error group fetch all participating failed')
        }
    }

    // update promote demote remove
    async groupParticipantsUpdate(id, users, action) {
        try {
            const res = await this.instance.sock?.groupParticipantsUpdate(
                this.getWhatsAppId(id),
                this.parseParticipants(users),
                action
            )
            return res
        } catch (e) {
            //console.log(e)
            return {
                error: true,
                message:
                    'unable to ' +
                    action +
                    ' some participants, check if you are admin in group or participants exists',
            }
        }
    }

    // update group settings like
    // only allow admins to send messages
    async groupSettingUpdate(id, action) {
        try {
            const res = await this.instance.sock?.groupSettingUpdate(
                this.getWhatsAppId(id),
                action
            )
            return res
        } catch (e) {
            //console.log(e)
            return {
                error: true,
                message:
                    'unable to ' + action + ' check if you are admin in group',
            }
        }
    }

    async groupUpdateSubject(id, subject) {
        try {
            const res = await this.instance.sock?.groupUpdateSubject(
                this.getWhatsAppId(id),
                subject
            )
            return res
        } catch (e) {
            //console.log(e)
            return {
                error: true,
                message:
                    'unable to update subject check if you are admin in group',
            }
        }
    }

    async groupUpdateDescription(id, description) {
        try {
            const res = await this.instance.sock?.groupUpdateDescription(
                this.getWhatsAppId(id),
                description
            )
            return res
        } catch (e) {
            //console.log(e)
            return {
                error: true,
                message:
                    'unable to update description check if you are admin in group',
            }
        }
    }

    // update db document -> chat
    async updateDb(object) {
        try {
            await Chat.updateOne({ key: this.key }, { chat: object })
        } catch (e) {
            logger.error('Error updating document failed')
        }
    }

    async readMessage(msgObj) {
        try {
            const key = {
                remoteJid: msgObj.remoteJid,
                id: msgObj.id,
                participant: msgObj?.participant, // required when reading a msg from group
            }
            const res = await this.instance.sock?.readMessages([key])
            return res
        } catch (e) {
            logger.error('Error read message failed')
        }
    }

    async reactMessage(id, key, emoji) {
        try {
            const reactionMessage = {
                react: {
                    text: emoji, // use an empty string to remove the reaction
                    key: key,
                },
            }
            const res = await this.instance.sock?.sendMessage(
                this.getWhatsAppId(id),
                reactionMessage
            )
            return res
        } catch (e) {
            logger.error('Error react message failed')
        }
    }
}

exports.WhatsAppInstance = WhatsAppInstance
