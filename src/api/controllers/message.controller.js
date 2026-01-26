
// exports.Text = async (req, res) => {
//     const data = await global.WhatsAppInstances[req.query.key].sendTextMessage(
//         req.body.id,
//         req.body.message
//     )
//     return res.status(201).json({ error: false, data: data })
// }

exports.Text = async (req, res) => {    
    const { id, message } = req.body
    
    if (!id || !message || id.trim() === '' || message.trim() === '') {
        return res.status(400).json({
            error: true,
            message: 'id and message are required'
        })
    }
    
    const key = req.query.key

    if (!WhatsAppInstances[key]) {
        console.error(`Instance ${key} not found`)
        return res.status(404).json({
            error: true,
            message: `Instance ${key} not found`,
            availableInstances: Object.keys(WhatsAppInstances)
        })
    }
    
    const instance = WhatsAppInstances[key]
    
    if (!instance.instance?.online) {
        console.error(`Instance ${key} is not online`)
        return res.status(400).json({
            error: true,
            message: 'WhatsApp is not connected',
            online: false
        })
    }
    
    try {
        const data = await instance.sendTextMessage(id, message)
        console.log('Message sent successfully!', {
            messageId: data?.key?.id,
            to: id
        })
        
        return res.status(201).json({ 
            error: false, 
            data: data,
            message: 'Message sent successfully'
        })
    } catch (error) {
        return res.status(500).json({
            error: true,
            code: 500,
            message: `Error: ${error.message}`,
            details: error.stack
        })
    }
}

// exports.UnreadMessages = async (req, res) => {
//     console.log('Fetching unread messages...')
//      try {
//         const instance = WhatsAppInstances[req.query.key]
//         if (!instance) {
//             return res.status(404).json({ error: 'Instance not found' })
//         }
        
//         const unreadMessages = await WhatsAppInstances[req.query.key].processUnreadMessages()
//         console.log(`Fetched ${unreadMessages} unread messages`)
//        return res.json(unreadMessages)
        
//     } catch (error) {
//         console.error('Error fetching unread messages:', error)
//        return res.status(500).json({ error: error.message })
//     }
// }

// No seu controller (message.controller.js)
exports.UnreadMessages = async (req, res) => {
    console.log('Fetching unread messages...')
    
    try {
        const key = req.query.key
        const instance = WhatsAppInstances[key]
        
        if (!instance) {
            return res.status(404).json({ 
                error: true, 
                message: 'Instance not found',
                availableInstances: Object.keys(WhatsAppInstances)
            })
        }
        
        if (!instance.instance?.online) {
            return res.status(400).json({
                error: true,
                message: 'Instance is not connected',
                online: false
            })
        }
        
        // Opção 1: Processar e retornar mensagens não lidas
        const process = req.body.process || false
        let result
        
        if (process) {
            // Processa as mensagens (marca como lidas, envia webhooks)
            result = await instance.processUnreadMessages()
        } else {
            // Apenas retorna as mensagens não lidas sem processar
            result = await instance.getAllUnreadMessages()
        }
        
        console.log(`Fetched ${result.total || result || 0} unread messages`)
        
        return res.json({
            error: false,
            data: result,
            timestamp: new Date().toISOString()
        })
        
    } catch (error) {
        console.error('Error fetching unread messages:', error)
        return res.status(500).json({ 
            error: true, 
            message: error.message,
            //stack: config.env === 'development' ? error.stack : undefined
        })
    }
}


exports.Image = async (req, res) => {
    const data = await WhatsAppInstances[req.query.key].sendMediaFile(
        req.body.id,
        req.file,
        'image',
        req.body?.caption
    )
    return res.status(201).json({ error: false, data: data })
}

exports.Video = async (req, res) => {
    const data = await WhatsAppInstances[req.query.key].sendMediaFile(
        req.body.id,
        req.file,
        'video',
        req.body?.caption
    )
    return res.status(201).json({ error: false, data: data })
}

exports.Audio = async (req, res) => {
    const data = await WhatsAppInstances[req.query.key].sendMediaFile(
        req.body.id,
        req.file,
        'audio'
    )
    return res.status(201).json({ error: false, data: data })
}

exports.Document = async (req, res) => {
    const data = await WhatsAppInstances[req.query.key].sendMediaFile(
        req.body.id,
        req.file,
        'document',
        '',
        req.body.filename
    )
    return res.status(201).json({ error: false, data: data })
}

exports.Mediaurl = async (req, res) => {
    const data = await WhatsAppInstances[req.query.key].sendUrlMediaFile(
        req.body.id,
        req.body.url,
        req.body.type, // Types are [image, video, audio, document]
        req.body.mimetype, // mimeType of mediaFile / Check Common mimetypes in `https://mzl.la/3si3and`
        req.body.caption
    )
    return res.status(201).json({ error: false, data: data })
}

exports.Button = async (req, res) => {
    // console.log(res.body)
    const data = await WhatsAppInstances[req.query.key].sendButtonMessage(
        req.body.id,
        req.body.btndata
    )
    return res.status(201).json({ error: false, data: data })
}

exports.Contact = async (req, res) => {
    const data = await WhatsAppInstances[req.query.key].sendContactMessage(
        req.body.id,
        req.body.vcard
    )
    return res.status(201).json({ error: false, data: data })
}

exports.List = async (req, res) => {
    const data = await WhatsAppInstances[req.query.key].sendListMessage(
        req.body.id,
        req.body.msgdata
    )
    return res.status(201).json({ error: false, data: data })
}

exports.MediaButton = async (req, res) => {
    const data = await WhatsAppInstances[req.query.key].sendMediaButtonMessage(
        req.body.id,
        req.body.btndata
    )
    return res.status(201).json({ error: false, data: data })
}

exports.SetStatus = async (req, res) => {
    const presenceList = [
        'unavailable',
        'available',
        'composing',
        'recording',
        'paused',
    ]
    if (presenceList.indexOf(req.body.status) === -1) {
        return res.status(400).json({
            error: true,
            message:
                'status parameter must be one of ' + presenceList.join(', '),
        })
    }

    const data = await WhatsAppInstances[req.query.key]?.setStatus(
        req.body.status,
        req.body.id
    )
    return res.status(201).json({ error: false, data: data })
}

exports.Read = async (req, res) => {
    const data = await WhatsAppInstances[req.query.key].readMessage(req.body.msg)
    return res.status(201).json({ error: false, data: data })
}

exports.React = async (req, res) => {
    const data = await WhatsAppInstances[req.query.key].reactMessage(req.body.id, req.body.key, req.body.emoji)
    return res.status(201).json({ error: false, data: data })
}
