"use strict";
const EventEmitter = require('events').EventEmitter;

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
        this.jar = rp.jar()
        this.rp = rp.defaults({ jar: this.jar })
        this.lp = lp.cn
        this.host = 'https://wx2.qq.com'
        this.deviceID = 'e401182249799540'
    }

    login() {
        this.rp.get(`https://login.wx2.qq.com/jslogin?appid=wx782c26e4c19acffb&redirect_uri=https://wx2.qq.com/cgi-bin/mmwebwx-bin/webwxnewloginpage&fun=new&lang=zh_CN&_=${new Date().getTime()}`).then(async body => {
            let qrCodeId = rt.parse(body)['window.QRLogin.uuid']
            this.emit(Constant.MsgOutType.Qr, `https://login.weixin.qq.com/qrcode/${qrCodeId}`)
            this.qrUrl = `https://login.weixin.qq.com/qrcode/${qrCodeId}`
            await this.rp.get(`https://login.weixin.qq.com/qrcode/${qrCodeId}`)
                .pipe(fs.createWriteStream('./qrcode.png'))
            return qrCodeId
        }).then(qrCodeId => {
            this.info(this.lp.requireScan)
            this.requireScan(qrCodeId)
        })
    }

    async requireScan(qrCodeId, status) {
        let body = await this.rp.get(`https://login.wx2.qq.com/cgi-bin/mmwebwx-bin/login?loginicon=true&uuid=${qrCodeId}&tip=1&r=${new Date().getTime()}&_=${new Date().getTime()}`)
        console.log(rt.parse(body)['window.code'])
        switch (rt.parse(body)['window.code']) {
            case '408':
                return this.requireScan(qrCodeId, 408)

            case '201':
                if (status != 201) {
                    this.emit(Constant.MsgOutType.Scaned)
                    this.info(this.lp.scanSuccess)
                }
                await new Promise(resolve => {
                    setTimeout(resolve, 1500)
                })
                return this.requireScan(qrCodeId, 201)

            case '200':
                this.info('登陆成功')
                return this.redirect(rt.parse(body)['window.redirect_uri'])

            default:
                throw new Error('invalid widow.code when login')
        }

    }

    async redirect(url) {
        let body = await this.rp.get(`${url}&fun=new&version=v2`)
        this.pass_ticket = rt.findNode(body, 'pass_ticket')
        this.skey = rt.findNode(body, 'skey');
        ({ wxuin: this.wxuin, wxsid: this.wxsid, webwx_data_ticket: this.webwx_data_ticket } = rt.parse(this.jar.getCookieString(this.host)))
        return this.init()
    }

    resendInit() {
        this.emit(Constant.MsgOutType.Qr, this.qrUrl)
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
        this.getContact()
        return this.syncCheck()
    }

    persistence() {

    }

    async getContact() {
        let contactList = await this.rp.get({
            url: `https://wx2.qq.com/cgi-bin/mmwebwx-bin/webwxgetcontact?lang=zh_CN&pass_ticket=${this.pass_ticket}&r=${new Date().getTime()}&seq=0&skey=${this.skey}`,
            headers: this.generalHeaders()
        })
        contactList = JSON.parse(contactList)
        this.contactList = contactList.MemberList
        // this.info(contactList)
        // this.emit(Constant.MsgOutType.ContactList, contactList.MemberList)
    }

    async syncCheck() {
        this.info('syncCheck')
        let body = await this.rp.get({
            url: `https://webpush.wx2.qq.com/cgi-bin/mmwebwx-bin/synccheck?r=${new Date().getTime()}&skey=${this.skey}&sid=${this.wxsid}&uin=${this.wxuin}&deviceid=${this.deviceID}&synckey=${this.syncKey}&_=${new Date().getTime()}`,
            headers: this.generalHeaders()
        })
        this.info(body)
        let { retcode, selector } = JSON.parse(rt.parse(body)['window.synccheck'].replace(/(\w+):/isg, '"$1":'))
        if (selector != 0) {
            if (selector === 7) {
                await this.sync()
            }
            await this.sync()
            await new Promise(resolve => {
                setTimeout(resolve, 3000);
            })
        }
        return this.syncCheck()
    }

    async sync() {
        let body = await this.rp.post({
            // url: `https://wx2.qq.com/cgi-bin/mmwebwx-bin/webwxsync?sid=${this.wxsid}&skey=${this.skey}&lang=zh_CN&pass_ticket=${this.pass_ticket}`,
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
        console.log(body)
        this.updateSyncKey(body.SyncKey)
        body.AddMsgList.forEach(_ => {
            let contact = this.contactList.find(c => c.UserName === _.FromUserName) || {}
            let contact2 = this.contactList.find(c => c.UserName === _.ToUserName) || {}
            _.From = {
                NickName: contact.NickName,
                UserName: contact.UserName,
                RemarkName: contact.RemarkName,
                HeadImgUrl: contact.HeadImgUrl,
                Sex: contact.Sex
            }
            _.To = {
                NickName: contact2.NickName,
                UserName: contact2.UserName,
                RemarkName: contact2.RemarkName,
                HeadImgUrl: contact2.HeadImgUrl,
                Sex: contact2.Sex
            }
        })
        this.emit(Constant.MsgOutType.Msg, body.AddMsgList)
        for (let i = 0; i < body.AddMsgList.length; i++) {
            console.log(body.AddMsgList[i])
            // this.sendMessage(body.AddMsgList[i].FromUserName, body.AddMsgList[i].FromUserName)
        }
    }

    sendMessage(toUserName, msg) {
        let localID = this.getLocalId()
        this.rp.post({
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
                    "FromUserName": this.user.userName,
                    "ToUserName": toUserName,
                    "LocalID": localID,
                    "ClientMsgId": localID
                },
                "Scene": 0
            })
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