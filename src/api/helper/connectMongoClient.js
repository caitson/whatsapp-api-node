const { MongoClient } = require('mongodb')
const logger = require('../../api/utils/console')

module.exports = async function connectToCluster(uri) {
    let mongoClient

    try {
        mongoClient = new MongoClient(uri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        })
        //console.info('STATE: Connecting to MongoDB')
        await mongoClient.connect()
        logger.info('Successfully connected to MongoDB')
        return mongoClient
    } catch (error) {
        //console.error('STATE: Connection to MongoDB failed!', error)
        process.exit()
    }
}
