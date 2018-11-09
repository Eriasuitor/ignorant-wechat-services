"use strict"
const EventEmitter = require('events').EventEmitter

const rp = require('request-promise')
const rt = require('./request-tool')
const fs = require('fs')
const lp = require('./language-packs')
const Constant = require('./constant')

module.exports = class extends EventEmitter {
    constructor() {
        super()
        this.wxuin
        this.wxsid
        this.webwx_data_ticket
        this.syncKey
        this.user
        this.contactList
        this.qrUrl
        this.skey
        this.pass_ticket
        this.syncKeyList
        this.break = false
        this.jar = rp.jar()
        this.rp = rp.defaults({ jar: this.jar })
        this.lp = lp.cn
        this.host = 'https://wx2.qq.com'
        this.deviceID = 'e401182249799540'
    }

    login() {
        /**
         * Js is not supported tail-recursive, errores can't be catch in one place
         */
        this.generalTry(this.getQr)
    }

    async getQr() {
        let body = await this.rp.get(`https://login.wx2.qq.com/jslogin?appid=wx782c26e4c19acffb&redirect_uri=https://wx2.qq.com/cgi-bin/mmwebwx-bin/webwxnewloginpage&fun=new&lang=zh_CN&_=${new Date().getTime()}`)
        let qrCodeId = rt.parse(body)['window.QRLogin.uuid']
        this.qrUrl = `https://login.weixin.qq.com/qrcode/${qrCodeId}`
        this.emit(Constant.MsgOutType.Qr, this.qrUrl)
        await this.rp.get(this.qrUrl).pipe(fs.createWriteStream('./qrcode.png'))
        this.info(this.lp.requireScan, { url: this.qrUrl })
        return this.generalTry(this.requireScan, qrCodeId)
    }

    async requireScan(qrCodeId, status) {
        let body = await this.rp.get(`https://login.wx2.qq.com/cgi-bin/mmwebwx-bin/login?loginicon=true&uuid=${qrCodeId}&tip=1&r=${new Date().getTime()}&_=${new Date().getTime()}`)
        let loginStatus = rt.parse(body)['window.code']
        this.debug('login status', { loginStatus })
        switch (loginStatus) {
            case '408':
                return this.generalTry(this.requireScan, qrCodeId, 408)
            case '201':
                if (status != 201) {
                    this.emit(Constant.MsgOutType.Scaned)
                    this.info(this.lp.scanSuccess, { qrCodeId })
                }
                await new Promise(resolve => setTimeout(resolve, 3000))
                return this.generalTry(this.requireScan, qrCodeId, 201)
            case '200':
                let redirect = rt.parse(body)['window.redirect_uri']
                this.info(this.lp.loginSuccess, { qrCodeId, redirect })
                return this.generalTry(this.redirect, redirect)
            default:
                throw new Error('invalid widow.code when login')
        }
    }

    async redirect(url) {
        let body = await this.rp.get(`${url}&fun=new&version=v2`)
        this.pass_ticket = rt.findNode(body, 'pass_ticket')
        this.skey = rt.findNode(body, 'skey')
        true && ({ wxuin: this.wxuin, wxsid: this.wxsid, webwx_data_ticket: this.webwx_data_ticket } = rt.parse(this.jar.getCookieString(this.host)))
        return this.generalTry(this.init)
    }

    resendInit() {
        // this.emit(Constant.MsgOutType.Qr, this.qrUrl)
        this.emit(Constant.MsgOutType.Init, this.user)
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
        this.user = body.User
        this.emit(Constant.MsgOutType.Init, body.User)
        this.updateSyncKey(body.SyncKey)
        this.persistence()
        await this.getContact()
        return this.generalTry(this.syncCheck)
    }

    persistence() {

    }

    async generalTry(operation, ...args) {
        try {
            // console.log(this)
            return await operation.call(this, ...args)
        } catch (e) {
            this.break = true
            this.emit('error', e.message)
        }
    }

    getContact() {
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
            return this.contactList
        })
    }

    async syncCheck() {
        if (this.break) return
        let body = await this.rp.get({
            url: `https://webpush.wx2.qq.com/cgi-bin/mmwebwx-bin/synccheck?r=${new Date().getTime()}&skey=${this.skey}&sid=${this.wxsid}&uin=${this.wxuin}&deviceid=${this.deviceID}&synckey=${this.syncKey}&_=${new Date().getTime()}`,
            headers: this.generalHeaders(),
            encoding: 'utf-8'
        })
        this.debug(body)
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
        return this.generalTry(this.syncCheck)
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
            let index = msg.Content.indexOf('<br/>')
            this.sendMessage(msg.FromUserName, msg.Content.substring(index + 5, msg.Content.length))
        })
        this.emit(Constant.MsgOutType.Msg, body.AddMsgList)
    }

    async sendMessage(toUserName, msg) {
        return await this.generalTry(async () => {
            let localID = this.getLocalId()
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
            // if(body.)
            return true
        })
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

    info(msg, data) {
        console.log(msg, data ? data : '')
    }

    error(msg, data) {
        console.log(msg, data ? data : '')
        throw new Error(msg, data)
    }

    warn(msg, data) {
        console.log(msg, data ? data : '')
    }

    debug(msg, data) {
        console.log(msg, data ? data : '')
    }
}