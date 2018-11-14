"use strict"
const EventEmitter = require('events').EventEmitter

const rp = require('request-promise')
const r = require('request')
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
        this.emit(Constant.MsgOutType.Qr, { url: this.qrUrl })
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
                    this.emit(Constant.MsgOutType.Scanned)
                    this.info(this.lp.scanSuccess, { qrCodeId })
                }
                await new Promise(resolve => setTimeout(resolve, 3000))
                return this.generalTry(this.requireScan, qrCodeId, 201)
            case '200':
                let redirect = rt.parse(body)['window.redirect_uri']
                this.info(this.lp.loginSuccess, { qrCodeId, redirect })
                return this.generalTry(this.redirect, redirect)
            default:
                throw new Error('invalid widow.code when login: ' + loginStatus)
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
        this.debug('resend init', { user: this.user, initContact: this.initContact })
        if (this.user && this.initContact) this.emit(Constant.MsgOutType.Init, this.user)
        else this.login()
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
        this.debug('init', body)
        this.emit(Constant.MsgOutType.Init, this.user)
        // console.log(`${this.host}${body.ContactList[0].HeadImgUrl}`)
        // this.r.get({
        //     url: `${this.host}${body.ContactList[0].HeadImgUrl}`,
        //     headers: this.generalHeaders()
        // }).pipe(fs.createWriteStream("avatar"))
        this.persistence()
        await this.getContact()
        return this.generalTry(this.syncCheck)
    }

    persistence() {

    }

    async generalTry(operation, ...args) {
        try {
            if (this.break) return
            return await operation.call(this, ...args)
        } catch (e) {
            this.offLine()
            this.emit('error', e.message)
        }
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
            // this.debug('contact list', contactList)
            await this.generalTry(this.cacheHeadImg, this.contactList)
            return this.contactList
        })
    }

    async syncCheck() {
        let body = await this.rp.get({
            url: `https://webpush.wx2.qq.com/cgi-bin/mmwebwx-bin/synccheck?r=${new Date().getTime()}&skey=${this.skey}&sid=${this.wxsid}&uin=${this.wxuin}&deviceid=${this.deviceID}&synckey=${this.syncKey}&_=${new Date().getTime()}`,
            headers: this.generalHeaders(),
            encoding: 'utf-8'
        })
        this.debug('sync checkt result', body)
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
            // let index = msg.Content.indexOf('<br/>')
            // index === -1 ? index = 0 : index += 5
            // this.sendMessage('filehelper', msg.Content.substring(index, msg.Content.length))
        })
        this.emit(Constant.MsgOutType.Msg, { msgList: body.AddMsgList })
    }

    async sendMessage(toUserName, msg) {
        return await this.generalTry(async () => {
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

    cacheHeadImg(contactList) {
        let headers = this.generalHeaders()
        contactList.forEach(c => {
            // r.get({
            //     url: `http://localhost:1001/iws/cgi-bin/mmwebwx-bin/webwxgetheadimg&seq=0&user`,
            //     headers:{
            //         'Content-Type': 'application/octet-stream'
            //     }
            // }).pipe(r.post({
            //     url: `http://localhost:1001/iws/22222`,
            //     headers:{

            //     }
            // }))
            let tempHeadImg = this.cdnHost + c.HeadImgUrl.replace(/[?&=]/g, '_')
            this.r.get({
                url: this.host + c.HeadImgUrl,
                headers
            }).pipe(this.r.post({
                url: tempHeadImg,
                headers: {
                    'Content-Type': 'application/octet-stream'
                }
            })).on('response', resp => {
                if (resp.statusCode !== 200) this.error('cache head img failed', { code: resp.statusCode })
            }).on('error', error => {
                this.error('cache head img error', { error })
            })
            c.HeadImgUrl = tempHeadImg
        })
    }

    offLine() {
        this.break = true
    }

    onLine() {
        this.break = false
        return this.generalTry(this.syncCheck)
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
        // throw new Error(msg, data)
    }

    warn(msg, data) {
        console.log(msg, data ? data : '')
    }

    debug(msg, data) {
        // console.log(msg, data ? data : '')
        require('fs').appendFileSync('result_wc', JSON.stringify({ msg, data }) + '\n')
    }
}