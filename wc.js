"use strict"
const EventEmitter = require('events').EventEmitter

const rp = require('request-promise')
const r = require('request')
const rt = require('./request-tool')
const fs = require('fs')
const lp = require('./language-packs')
const Constant = require('./constant')
const uuid = require("uuid/v1")

module.exports = class extends EventEmitter {
    constructor(id) {
        super()
        this.uuid = id || uuid()
        this.wxuin
        this.wxsid
        this.webwx_data_ticket
        this.syncKey
        this.user
        this.contactList
        this.initContact
        this.qrUrl
        this.skey
        this.pass_ticket
        this.syncKeyList
        this.break = false
        this.r = r
        this.jar = rp.jar()
        this.rp = rp.defaults({ jar: this.jar })
        this.lp = lp.cn
        this.host = 'https://wx2.qq.com'
        this.cdnHost = 'http://120.78.93.110:1001/iws'
        this.deviceID = 'e401182249799540'
        this.debug('new wc created')
    }

    login() {
        /**
         * Js is not supported tail-recursive, errores can't be catch in one place
         */
        this.debug('login')
        this.generalTry(this.getQr)
    }

    async getQr() {
        let body = await this.rp.get(`https://login.wx2.qq.com/jslogin?appid=wx782c26e4c19acffb&redirect_uri=https://wx2.qq.com/cgi-bin/mmwebwx-bin/webwxnewloginpage&fun=new&lang=zh_CN&_=${new Date().getTime()}`)
        let qrCodeId = rt.parse(body)['window.QRLogin.uuid']
        this.qrUrl = `https://login.weixin.qq.com/qrcode/${qrCodeId}`
        this.emit(Constant.MsgOutType.Qr, { url: this.qrUrl })
        this.debug('get qr', { url: this.qrUrl })
        // await this.rp.get(this.qrUrl).pipe(fs.createWriteStream('./qrcode.png'))
        this.info(this.lp.requireScan, { url: this.qrUrl })
        this.generalTry(this.requireScan, qrCodeId)
    }

    async requireScan(qrCodeId, status) {
        let body = await this.rp.get(`https://login.wx2.qq.com/cgi-bin/mmwebwx-bin/login?loginicon=true&uuid=${qrCodeId}&tip=1&r=${new Date().getTime()}&_=${new Date().getTime()}`)
        let loginStatus = rt.parse(body)['window.code']
        this.debug('login status', { loginStatus })
        switch (loginStatus) {
            case '408':
                this.generalTry(this.requireScan, qrCodeId, 408)
                return
            case '201':
                if (status != 201) {
                    this.emit(Constant.MsgOutType.Scanned)
                    this.info(this.lp.scanSuccess, { qrCodeId })
                }
                await new Promise(resolve => setTimeout(resolve, 3000))
                this.generalTry(this.requireScan, qrCodeId, 201)
                return
            case '200':
                let redirect = rt.parse(body)['window.redirect_uri']
                this.info(this.lp.loginSuccess, { qrCodeId, redirect })
                this.generalTry(this.redirect, redirect)
                return
            default:
                throw new Error('invalid widow.code when login: ' + loginStatus)
        }
    }

    async redirect(url) {
        let body = await this.rp.get(`${url}&fun=new&version=v2`)
        this.pass_ticket = rt.findNode(body, 'pass_ticket')
        this.skey = rt.findNode(body, 'skey')
        true && ({ wxuin: this.wxuin, wxsid: this.wxsid, webwx_data_ticket: this.webwx_data_ticket } = rt.parse(this.jar.getCookieString(this.host)))
        this.generalTry(this.init)
    }

    resendInit() {
        // this.emit(Constant.MsgOutType.Qr, this.qrUrl)
        this.debug('resend init', { user: this.user })
        this.emit(Constant.MsgOutType.Init, this.user)
        this.emit(Constant.MsgOutType.Qr, { url: this.qrUrl })
    }

    async init() {
        let body = await this.rp.post({
            url: `https://wx2.qq.com/cgi-bin/mmwebwx-bin/webwxinit?r=${new Date().getTime()}&pass_ticket=${this.pass_ticket}`,
            headers: this.generalHeaders(),
            body: JSON.stringify({
                "BaseRequest": {
                    "Uin": this.wxuin,
                    "Sid": this.wxsid,
                    "Skey": this.skey,
                    "DeviceID": this.deviceID
                }
            })
        })
        body = JSON.parse(body)
        this.updateSyncKey(body.SyncKey)
        this.user = body.User
        this.initContact = body.ContactList
        await this.generalTry(this.cacheHeadImg, [this.user])
        await this.generalTry(this.cacheHeadImg, this.initContact)
        this.debug('init', { user: this.user, initContact: this.initContact })
        this.emit(Constant.MsgOutType.Init, this.user)
        this.persistence()
        await this.getContact()
        this.generalTry(this.syncCheck)
    }

    persistence() {

    }

    async generalTry(operation, ...args) {
        try {
            if (this.break) return
            return await operation.call(this, ...args)
        } catch (e) {
            this.offLine()
            this.error('wc break', this.user ? { userName: this.user.UserName, NickName: this.user.NickName, Uin: this.user.Uin, e } : { e })
            this.destory()
            this.emit('error', e.message)
        }
    }

    async destory() {
        this.generalTry(async () => {
            this.break = true
            await this.generalTry(this.deleteHeadImg, [this.user])
            await this.generalTry(this.deleteHeadImg, this.initContact)
            await this.generalTry(this.deleteHeadImg, this.contactList)
            this.info('destory success')
        })
    }

    async getContact() {
        /**
         * Used by foreigner so catch error here
         */
        return this.generalTry(async () => {
            let contactList = await this.rp.get({
                url: `https://wx2.qq.com/cgi-bin/mmwebwx-bin/webwxgetcontact?lang=zh_CN&pass_ticket=${this.pass_ticket}&r=${new Date().getTime()}&seq=0&skey=${this.skey}`,
                headers: this.generalHeaders()
            })
            contactList = JSON.parse(contactList)
            this.contactList = contactList.MemberList
            await this.generalTry(this.cacheHeadImg, this.contactList)
            this.debug('contact list', { contactList: this.contactList })
            return this.contactList
        })
    }

    async syncCheck() {
        let body = await this.rp.get({
            url: `https://webpush.wx2.qq.com/cgi-bin/mmwebwx-bin/synccheck?r=${new Date().getTime()}&skey=${this.skey}&sid=${this.wxsid}&uin=${this.wxuin}&deviceid=${this.deviceID}&synckey=${this.syncKey}&_=${new Date().getTime()}`,
            headers: this.generalHeaders(),
            encoding: 'utf-8'
        })
        this.info('sync checkt result', { body })
        let { retcode, selector } = JSON.parse(rt.parse(body)['window.synccheck'].replace(/(\w+):/isg, '"$1":'))
        if (selector != 0) {
            if (selector === 7) {
                await this.sync()
            }
            await this.sync()
        }
        if (retcode != 0) {
            throw new Error(`retcode ${retcode} is invalid`)
        }
        this.generalTry(this.syncCheck)
    }

    async sync() {
        let body = await this.rp.post({
            /**
             * url: `https://wx2.qq.com/cgi-bin/mmwebwx-bin/webwxsync?sid=${this.wxsid}&skey=${this.skey}&lang=zh_CN&pass_ticket=${this.pass_ticket}`,
             */
            url: `https://wx2.qq.com/cgi-bin/mmwebwx-bin/webwxsync?sid=${this.wxsid}&skey=${this.skey}`,
            headers: this.generalHeaders(),
            body: JSON.stringify({
                "BaseRequest": {
                    "Uin": this.wxuin,
                    "Sid": this.wxsid,
                    "Skey": this.skey,
                    "DeviceID": this.deviceID
                },
                "SyncKey": this.syncKeyList,
                "rr": new Date().getTime()
            })
        })
        body = JSON.parse(body)
        this.updateSyncKey(body.SyncKey)
        this.debug('receive message', { msg: body.AddMsgList })
        if (body.AddMsgList.length === 0) return
        body.AddMsgList.forEach(msg => {
            /**
             * There need a re-get contact logic because of the update of user's contact list.
             */
            msg.From = this.contactList.find(c => c.UserName === msg.FromUserName)
            msg.To = this.contactList.find(c => c.UserName === msg.ToUserName)
            // let index = msg.Content.indexOf('<br/>')
            // index === -1 ? index = 0 : index += 5
            // this.sendMessage('filehelper', msg.Content.substring(index, msg.Content.length))
        })
        this.emit(Constant.MsgOutType.Msg, { msgList: body.AddMsgList })
    }

    async sendMessage(toUserName, msg) {
        return this.generalTry(async () => {
            let localID = this.getLocalId()
            this.debug('prepare to send message', { toUserName, msg })
            let body = await this.rp.post({
                url: `https://wx2.qq.com/cgi-bin/mmwebwx-bin/webwxsendmsg?lang=zh_CN&pass_ticket=${this.pass_ticket}`,
                headers: this.generalHeaders(),
                body: JSON.stringify({
                    "BaseRequest": {
                        "Uin": this.wxuin,
                        "Sid": this.wxsid,
                        "Skey": this.skey,
                        "DeviceID": this.deviceID
                    },
                    "Msg": {
                        "Type": 1,
                        "Content": msg,
                        "FromUserName": this.user.UserName,
                        "ToUserName": toUserName,
                        "LocalID": localID,
                        "ClientMsgId": localID
                    },
                    "Scene": 0
                })
            })
            body = JSON.parse(body)
            this.debug('send msg result', { body })
            return body.BaseResponse.Ret === 0
        })
    }

    async cacheHeadImg(contactList) {
        let headers = this.generalHeaders()
        return Promise.all(contactList.map(c =>
            new Promise(resolve => {
                let tempHeadImg = this.cdnHost + c.HeadImgUrl.replace(/[?&=]/g, '_')
                this.r.get({
                    url: this.host + c.HeadImgUrl,
                    headers
                }).pipe(this.r.post(tempHeadImg)).on('response', resp => {
                    if (resp.statusCode !== 200) this.error('cache head img failed', { code: resp.statusCode })
                    this.debug('cache head img success', { userName: c.UserName, url: tempHeadImg })
                    c.HeadImgUrl = tempHeadImg
                    resolve()
                }).on('error', error => {
                    this.error('cache head img error', { error })
                    resolve()
                })
            })
        ))
    }

    async deleteHeadImg(contactList) {
        return Promise.all(contactList.map(c =>
            new Promise(resolve => {
                this.r.delete(c.HeadImgUrl).on('response', resp => {
                    if (resp.statusCode !== 200) this.error('delete head img failed', { code: resp.statusCode })
                    this.debug('delete head img success', { userName: c.UserName, url: c.HeadImgUrl })
                    resolve()
                }).on('error', error => {
                    this.error('delete head img error', { error })
                    resolve()
                })
            })
        ))
    }

    offLine() {
        this.break = true
    }

    onLine() {
        this.break = false
        this.generalTry(this.syncCheck)
    }

    updateSyncKey(syncKeyList) {
        this.syncKeyList = syncKeyList
        this.syncKey = this.syncKeyList.List.map(sk => `${sk.Key}_${sk.Val}`).join('|')
    }

    generalHeaders() {
        return {
            Cookie: this.getCookieString()
        }
    }

    getCookieString() {
        return rt.cookieStringify(rt.parse(this.jar.getCookieString(this.host)))
    }

    getLocalId() {
        return new Date().getTime() * 10000 + Math.floor(Math.random() * 10000)
    }

    info(msg, data = {}) {
        Object.assign(data, { uuid: this.uuid })
    }

    error(msg, data = {}) {
        Object.assign(data, { uuid: this.uuid })
    }

    warn(msg, data = {}) {
        Object.assign(data, { uuid: this.uuid })
    }

    debug(msg, data = {}) {
        Object.assign(data, { uuid: this.uuid })
    }
}