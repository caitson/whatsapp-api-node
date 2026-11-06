const Message = require('../models/message.model')
const ConversationState = require('../models/conversation-state.model')

// GET /api/message/history?key=...&remoteJid=...&limit=50&before=...
exports.History = async (req, res) => {
    try {
        const key = req.query.key || req.body.key
        const remoteJid = req.query.remoteJid || req.body.remoteJid
        if (!key || !remoteJid) {
            return res.status(400).json({ error: true, message: 'key and remoteJid required' })
        }
        const limit = Math.min(parseInt(req.query.limit) || 50, 200)
        const before = req.query.before ? new Date(req.query.before) : null
        
        const filter = { instanceKey: key, remoteJid }
        if (before) filter.timestamp = { $lt: before }
        
        const messages = await Message.find(filter)
            .sort({ timestamp: -1 })
            .limit(limit)
            .lean()
        
        return res.json({ error: false, data: messages.reverse() })
    } catch (e) {
        return res.status(500).json({ error: true, message: e.message })
    }
}

// GET /api/message/conversations?key=...&limit=50&skip=0
exports.Conversations = async (req, res) => {
    try {
        const key = req.query.key || req.body.key
        if (!key) {
            return res.status(400).json({ error: true, message: 'key required' })
        }
        const limit = Math.min(parseInt(req.query.limit) || 50, 100)
        const skip = parseInt(req.query.skip) || 0
        
        const pipeline = [
            { $match: { instanceKey: key } },
            { $sort: { timestamp: -1 } },
            {
                $group: {
                    _id: '$remoteJid',
                    lastMessage: { $first: '$$ROOT' },
                    messageCount: { $sum: 1 },
                    firstAt: { $min: '$timestamp' },
                    lastAt: { $max: '$timestamp' },
                    pushName: { $first: '$pushName' },
                },
            },
            { $sort: { lastAt: -1 } },
            { $skip: skip },
            { $limit: limit },
        ]
        
        const conversations = await Message.aggregate(pipeline)
        
        // Optionally join state
        const remoteJids = conversations.map(c => c._id)
        const states = await ConversationState.find({
            instanceKey: key,
            remoteJid: { $in: remoteJids },
        }).lean()
        const stateMap = new Map(states.map(s => [s.remoteJid, s]))
        
        const data = conversations.map(c => ({
            remoteJid: c._id,
            pushName: c.pushName,
            messageCount: c.messageCount,
            firstAt: c.firstAt,
            lastAt: c.lastAt,
            lastMessage: c.lastMessage,
            state: stateMap.get(c._id)?.state || 'bot',
        }))
        
        return res.json({ error: false, data })
    } catch (e) {
        return res.status(500).json({ error: true, message: e.message })
    }
}

// GET /api/message/conversations/:remoteJid?key=...
exports.ConversationDetail = async (req, res) => {
    try {
        const key = req.query.key || req.body.key
        const remoteJid = req.params.remoteJid
        if (!key) {
            return res.status(400).json({ error: true, message: 'key required' })
        }
        
        const [state, messages, stats] = await Promise.all([
            ConversationState.findOne({ instanceKey: key, remoteJid }).lean(),
            Message.find({ instanceKey: key, remoteJid }).sort({ timestamp: -1 }).limit(50).lean(),
            Message.aggregate([
                { $match: { instanceKey: key, remoteJid } },
                {
                    $group: {
                        _id: '$direction',
                        count: { $sum: 1 },
                    },
                },
            ]),
        ])
        
        return res.json({
            error: false,
            data: {
                remoteJid,
                state: state || { state: 'bot' },
                messageCounts: stats.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {}),
                messages: messages.reverse(),
            },
        })
    } catch (e) {
        return res.status(500).json({ error: true, message: e.message })
    }
}

// GET /api/message/stats?key=...&from=...&to=...
exports.Stats = async (req, res) => {
    try {
        const key = req.query.key || req.body.key
        if (!key) {
            return res.status(400).json({ error: true, message: 'key required' })
        }
        const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 7 * 24 * 3600 * 1000)
        const to = req.query.to ? new Date(req.query.to) : new Date()
        
        const match = {
            instanceKey: key,
            timestamp: { $gte: from, $lte: to },
        }
        
        const [byDay, byIntent, byDirection, totals] = await Promise.all([
            Message.aggregate([
                { $match: match },
                {
                    $group: {
                        _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
                        count: { $sum: 1 },
                    },
                },
                { $sort: { _id: 1 } },
            ]),
            Message.aggregate([
                { $match: { ...match, intent: { $exists: true, $ne: null } } },
                { $group: { _id: '$intent', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 20 },
            ]),
            Message.aggregate([
                { $match: match },
                { $group: { _id: '$direction', count: { $sum: 1 } } },
            ]),
            Message.countDocuments(match),
        ])
        
        return res.json({
            error: false,
            data: {
                range: { from, to },
                total: totals,
                byDirection: byDirection.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {}),
                byDay,
                topIntents: byIntent,
            },
        })
    } catch (e) {
        return res.status(500).json({ error: true, message: e.message })
    }
}