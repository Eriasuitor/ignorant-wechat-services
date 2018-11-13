const WebSocket = require('ws')
const Wc = require('./wc')
const fs = require('fs')
const express = require('express')
// on(event: 'connection', cb: (this: WebSocket, socket: WebSocket, request: http.IncomingMessage) => void): this;
//         on(event: 'error', cb: (this: WebSocket, error: Error) => void): this;
//         on(event: 'headers', cb: (this: WebSocket, headers: string[], request: http.IncomingMessage) => void): this;
//         on(event: 'listening', cb: (this: WebSocket) => void): this;
//         on(event: string | symbol, listener: (this: WebSocket, ...args: any[]) => void): this;

const Constant = require('./constant')

class Server {
    constructor() {
        this.user2Wc = new Map()
        this.wss = new WebSocket.Server({
            port: 8081
        })
        this.wss.on('connection', socket => {
            this.socket = socket
            this.handleSocket(socket)
        })
        this.wss.on('error', err => {
            this.error(`服务器出错 ${err}`)
            throw err
        })
        this.info('wcs启动成功')
    }

    handleSocket(socket) {
        this.info('new connection', socket)
        socket.on('message', async msg => {
            try {
                msg = JSON.parse(msg)
                this.debug('receive message', { msg })
                switch (msg.type) {
                    case Constant.MsgType.New:
                        this.handleNew(msg.userId, msg.socket)
                        break
                    case Constant.MsgType.Msg:
                        await this.handleMsg(msg.userId, msg.to, msg.content, msg.syncId)
                        break
                    case Constant.MsgType.Offline:
                        this.handleOffline(msg.userId)
                        break
                    case Constant.MsgType.Online:
                        this.handleOnline(msg.userId)
                        break
                    case Constant.MsgType.Logout:
                        this.handleLogout(msg.userId)
                        break
                    default:
                        throw new Error()
                }
            } catch (error) {
                this.error('unrecognized msg' + JSON.stringify(msg) + error.message)
            }
        })
    }

    handleOnline(userId) {
        let wc = this.getWc(msg.userId)
        if (!wc) break
        wc.onLine()
    }

    handleOffline(userId) {
        let wc = this.getWc(msg.userId)
        if (!wc) break
        wc.offLine()
    }

    handleNew(userId) {
        let record = this.getWc(userId)
        this.debug('user try to login', { userId, record: record != undefined })
        if (record) return record.resendInit()
        let wc = new Wc()
        this.info('user wc created', { userId })
        wc.on('error', e => {
            this.error(e)
            this.deleteWc(userId)

        })
        Object.values(Constant.MsgOutType).forEach(type => {
            wc.on(type, data => {
                try {
                    this.debug("send message to ic", JSON.stringify({
                        userId,
                        type,
                        data
                    }) + ',\n')
                    this.socket.send(JSON.stringify({
                        userId,
                        type,
                        data
                    }))
                } catch (e) {
                    this.error(e.message)
                }
            })
        })
        this.setWc(userId, wc)
        wc.login()
    }

    async handleMsg(userId, to, msg, syncId) {
        let wc = this.getWc(userId)
        if (!wc) {
            return this.socket.send(JSON.stringify({
                userId,
                type: Constant.MsgOutType.RequireLogin,
                syncId
            }))
        }
        let sendResult = await wc.sendMessage(to, msg)
        if (sendResult) this.socket.send(JSON.stringify({
            userId,
            type: Constant.MsgOutType.SendSuccess,
            data: {
                syncId
            }
        }))
    }

    handleLogout(userId) {
        let wc = this.getWc(userId)
        if (!wc) return
        wc.offLine()
        this.deleteWc(userId)
    }

    setWc(userId, wc) {
        this.user2Wc.set(userId, wc)
    }

    getWc(userId) {
        return this.user2Wc.get(userId)
    }

    deleteWc(userId) {
        return this.user2Wc.delete(userId)
    }

    info(msg, data = '') {
        console.log(msg, data)
        fs.appendFileSync('result', JSON.stringify({ msg, data }) + '\n')
    }

    debug(msg, data = '') {
        this.info(msg, data)
    }

    error(msg) {
        this.info("error", msg)
    }
}

class Api {
    constructor(wcsServer) {
        if (!wcsServer) this.error(`wcsServer is ${wcsServer}`)
        this.wcsServer = wcsServer
        this.app = express()
        this.app.get('/contact', (req, resp) => {
            try {
                let { userId, q } = req.query
                let wc = this.wcsServer.getWc(userId)
                this.debug('get contact', { userId, q, wc: wc != undefined })
                if (wc) {
                    resp.status(200).json(wc.contactList.filter(_ => _.NickName.search(q) != -1) || [])
                }
                else {
                    resp.sendStatus(404)
                }
            }
            catch (e) {
                this.error(`get contact list failed, ${JSON.stringify({ query: req.query, e, err: e.message })}`)
                resp.sendStatus(500)
            }
        })
        this.app.get('/contact/init', (req, resp) => {
            try {
                let userId = req.query.userId
                let wc = this.wcsServer.getWc(userId)
                this.debug('contact init', { userId, wc: wc != undefined })
                if (wc) {
                    resp.status(200).json(wc.initContact || [])
                }
                else {
                    resp.sendStatus(404)
                }
            }
            catch (e) {
                this.error(`get contact init failed, ${JSON.stringify({ query: req.query, e, err: e, message })}`)
                resp.sendStatus(500)
            }
        })
        this.app.use(err => {
            if (err) {
                this.error(err)
                res.sendStatus(500)
            }
        })
        this.app.listen(8082)
        this.info('api启动成功')
    }

    info(msg, data = '') {
        console.log(msg, data)
        fs.appendFileSync('result', JSON.stringify({ msg, data }))
    }

    debug(msg, data = '') {
        this.info(msg, data)
    }

    error(msg) {
        this.info(msg)
    }
}

let wcServer = new Server()
new Api(wcServer)
