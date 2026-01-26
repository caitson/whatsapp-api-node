// middlewares/parseBody.js
function parseBody(req, res, next) {
    console.log('=== PARSEBODY MIDDLEWARE ===')
    console.log('Content-Type:', req.headers['content-type'])
    console.log('Original body:', req.body)
    
    // Se o body já foi parseado pelo express.json() ou express.urlencoded()
    if (req.body && typeof req.body === 'object') {
        console.log('Body already parsed by Express')
        return next()
    }
    
    // Se não houver body ou for string vazia, tente parsear manualmente
    let rawData = ''
    req.on('data', chunk => {
        rawData += chunk.toString()
    })
    
    req.on('end', () => {
        console.log('Raw data received:', rawData)
        
        try {
            if (rawData && rawData.trim() !== '') {
                // Se for JSON
                if (req.headers['content-type'] === 'application/json') {
                    req.body = JSON.parse(rawData)
                    console.log('Parsed as JSON:', req.body)
                } 
                // Se for form-urlencoded
                else if (req.headers['content-type'] === 'application/x-www-form-urlencoded') {
                    const params = new URLSearchParams(rawData)
                    req.body = {}
                    for (const [key, value] of params.entries()) {
                        req.body[key] = value
                    }
                    console.log('Parsed as Form Data:', req.body)
                }
                // Se não especificar, tente JSON primeiro
                else if (rawData.trim().startsWith('{') || rawData.trim().startsWith('[')) {
                    req.body = JSON.parse(rawData)
                    console.log('Auto-detected as JSON:', req.body)
                } else {
                    // Assume form data
                    const params = new URLSearchParams(rawData)
                    req.body = {}
                    for (const [key, value] of params.entries()) {
                        req.body[key] = value
                    }
                    console.log('Auto-detected as Form Data:', req.body)
                }
            } else {
                req.body = {}
                console.log('Empty body, set to empty object')
            }
            
            next()
        } catch (error) {
            console.error('Failed to parse body:', error)
            res.status(400).json({
                error: true,
                message: 'Invalid request body format',
                details: error.message,
                suggestion: 'Send JSON: {"id":"number","message":"text"}'
            })
        }
    })
}

module.exports = parseBody