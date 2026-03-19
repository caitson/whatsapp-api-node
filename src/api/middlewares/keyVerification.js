function keyVerification(req, res, next) {
    // Tenta pegar o key do path parameter primeiro, depois da query
    const key = req.params.key || req.query['key']?.toString()
    
    if (!key) {
        return res
            .status(403)
            .send({ error: true, message: 'no key was provided' })
    }
    
    const instance = WhatsAppInstances[key]
    if (!instance) {
        return res
            .status(403)
            .send({ error: true, message: 'invalid key supplied' })
    }
    next()
}

module.exports = keyVerification