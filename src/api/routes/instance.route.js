const express = require('express')
const controller = require('../controllers/instance.controller')
const keyVerify = require('../middlewares/keyCheck')
const loginVerify = require('../middlewares/loginCheck')
const keyVerification = require('../middlewares/keyVerification')

const router = express.Router()
router.route('/init').get(controller.init)
router.route('/qr').get(keyVerify, controller.qr)
router.route('/qrbase64').get(keyVerify, controller.qrbase64)
router.route('/info').get(keyVerify, controller.info)
router.route('/restore').get(controller.restore)
router.route('/logout').delete(keyVerify, loginVerify, controller.logout)
router.route('/delete').delete(keyVerify, controller.delete)
router.route('/list').get(controller.list)
router.route('/messages').get(controller.messages)

router.route('/:key/dialogflow').get(keyVerification, controller.getDialogFlowConfig)
router.route('/:key/dialogflow').post(keyVerification, controller.saveDialogFlowConfig)
router.route('/:key/dialogflow').put(keyVerification, controller.updateDialogFlowConfig)
router.route('/:key/dialogflow').delete(keyVerification, controller.deleteDialogFlowConfig)
router.route('/:key/dialogflow/check').get(keyVerification, controller.checkDialogFlowConfig)

router.route('/:key/check-config').get(keyVerify, controller.checkInstanceConfig)

module.exports = router
