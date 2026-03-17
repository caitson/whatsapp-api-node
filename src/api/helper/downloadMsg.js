const { downloadContentFromMessage } = require('@whiskeysockets/baileys')
const fs = require('fs').promises
const path = require('path')

const logger = require('../../api/utils/console')
const config = require('../../config/config')

module.exports = async function downloadMessage(msg, msgType) {
    let buffer = Buffer.from([])
    try {
        const stream = await downloadContentFromMessage(msg, msgType)
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk])
        }
    } catch (error){
        return console.log('error downloading file-message :: ',error.output)
    }
    return buffer.toString('base64')
}

// module.exports = async function saveImage(mediaData, message) {
//     try {
//         // 1. Converter para buffer
//         const buffer = convertMediaToBuffer(mediaData)

//         // 2. Validar se é imagem
//         if (!isValidImage(buffer)) {
//             logger.warn('Invalid image data received')
//             // Tenta salvar mesmo assim, mas com aviso
//         }

//         // 3. Detectar extensão real
//         const realExtension = getExtensionFromBuffer(buffer)
//         logger.info(`Detected real extension: ${realExtension}`)

//         // 4. Gerar nome do arquivo
//         const filename = generateFilename(message, realExtension)
//         const filePath = path.join(this.basePath, filename)

//         // 5. Garantir diretório
//         await ensureDirectoryExists(filePath)

//         // 6. Salvar arquivo
//         await fs.writeFile(filePath, buffer)
//         logger.info(
//             `Image saved successfully: ${filePath} (${buffer.length} bytes)`
//         )

//         // 7. Verificar se o arquivo foi salvo corretamente
//         const stats = await fs.stat(filePath)
//         if (stats.size === 0) {
//             throw new Error('File was saved but is empty')
//         }

//         // 8. Upload se necessário
//         if (config.file.toUpload) {
//             await this.uploadToServer(filePath, filename)
//         }

//         return {
//             path: filePath,
//             filename: filename,
//             size: stats.size,
//             extension: realExtension,
//             // buffer: buffer, // Retornar buffer para uso posterior se necessário
//         }
//     } catch (error) {
//         logger.error('Error saving image:', error)
//         throw error
//     }
// }

function getExtensionFromBuffer(buffer) {
    try {
      // JPEG
      if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return 'jpg';
      }
      // PNG
      if (
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47
      ) {
        return 'png';
      }
      // GIF
      if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
        return 'gif';
      }
      // WEBP
      if (
        buffer[0] === 0x52 &&
        buffer[1] === 0x49 &&
        buffer[2] === 0x46 &&
        buffer[3] === 0x46
      ) {
        return 'webp';
      }

      return 'bin';
    } catch (error) {
      logger.error('Error detecting extension from buffer:', error);
      return 'bin';
    }
  }

function isValidImage(buffer) {
    try {
        // Verifica magic numbers para formatos comuns
        const magicNumbers = {
            jpeg: [0xff, 0xd8, 0xff],
            png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
            gif: [0x47, 0x49, 0x46],
            webp: [0x52, 0x49, 0x46, 0x46],
        }

        for (const [format, magic] of Object.entries(magicNumbers)) {
            let match = true
            for (let i = 0; i < magic.length; i++) {
                if (buffer[i] !== magic[i]) {
                    match = false
                    break
                }
            }
            if (match) {
                logger.debug(`Valid ${format} image detected`)
                return true
            }
        }

        return false
    } catch (error) {
        logger.error('Error validating image:', error)
        return false
    }
}

function generateFilename(message, extension) {
    const timestamp = Date.now()
    const cleanFrom = message.from.replace('@c.us', '').replace(/[^0-9]/g, '')

    let baseName = `${cleanFrom}_som_${timestamp}`

    // Se houver nome original, usar
    if (message.filename) {
        const originalName = path.basename(
            message.filename,
            path.extname(message.filename)
        )
        baseName = `${cleanFrom}_${originalName}_${timestamp}`
    }

    return `${baseName}.${extension}`
}

function convertMediaToBuffer(mediaData) {
    try {
        // Se já for buffer, retorna
        if (Buffer.isBuffer(mediaData)) {
            return mediaData
        }

        // Se for string base64 (com ou sem prefixo)
        if (typeof mediaData === 'string') {
            // Remove prefixo data:image/...;base64, se existir
            const base64Data = mediaData.includes('base64,')
                ? mediaData.split('base64,')[1]
                : mediaData

            return Buffer.from(base64Data, 'base64')
        }

        // Se for outro tipo, tenta converter
        return Buffer.from(mediaData)
    } catch (error) {
        logger.error('Error converting media to buffer:', error)
        throw new Error('Failed to convert media data')
    }
}

async function ensureDirectoryExists(filePath) {
    const dir = path.dirname(filePath)
    try {
        await fs.access(dir)
    } catch {
        await fs.mkdir(dir, { recursive: true })
        logger.info(`Created directory: ${dir}`)
    }
}
