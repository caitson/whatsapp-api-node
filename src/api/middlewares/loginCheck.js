function loginVerification(req, res, next) {
    const key = req.query['key']?.toString()
    if (!key) {
        return res
            .status(403)
            .send({ error: true, message: 'no key query was present' })
    }

    const instance = WhatsAppInstances[key]

      if (!instance) {
        return res
            .status(403)
            .send({ error: true, message: 'invalid key supplied' })
    }
    
   const isOnline = instance.instance?.online === true
    
    if (!isOnline) {
        return res
            .status(401)
            .send({ 
                error: true, 
                message: "phone isn't connected or still connecting",
                details: `Instance ${key} online status: ${isOnline}`,
                suggestion: "Check /instance/status?key=" + key
            })
    }
    
    next()
}

module.exports = loginVerification
