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
                        break;
                    case Constant.MsgType.Msg:
                        await this.handleMsg(msg.userId, msg.socket, msg.content, msg.syncId)
                        break;
                    default:
                        throw new Error()
                }
            } catch (error) {
                this.error('unrecognized msg' + msg)
            }
        })
    }

    handleNew(userId, socket) {
        let record = this.getWc(userId)
        if (record) return record.resendInit()
        let wc = new Wc()
        this.info('user wc created', { userId })
        wc.on('error', e => {
            this.error(e)
            this.user2Wc.delete(userId)
        })
        Object.values(Constant.MsgOutType).forEach(type => {
            wc.on(type, data => {
                this.debug(JSON.stringify({
                    userId,
                    type,
                    data
                }) + ',\n')
                socket.send(JSON.stringify({
                    userId,
                    type,
                    data
                }))
            })
        })
        this.setWc(userId, wc)
        wc.login()
    }

    async handleMsg(userId, socket, msg, syncId) {
        let wc = this.getWc(userId)
        if (!wc) {
            return socket.send(JSON.stringify({
                userId,
                type: Constant.MsgOutType.RequireLogin,
                syncId
            }))
        }
        let sendResult = await wc.sendMessage(msg.to, msg.content)
        if (sendResult) socket.send(JSON.stringify({
            userId,
            type: Constant.MsgOutType.SendSuccess,
            syncId
        }))
    }

    setWc(userId, wc) {
        this.user2Wc.set(userId, wc)
    }

    getWc(userId) {
        return this.user2Wc.get(userId)
    }

    info(msg, data = '') {
        console.log(msg, data)
        fs.appendFileSync('result', { msg, data })
    }

    debug(msg, data = '') {
        this.info(msg, data)
    }

    error(msg) {
        this.info(msg)
    }
}

class Api {
    constructor(wcsServer) {
        if (!wcsServer) this.error(`wcsServer is ${wcsServer}`)
        this.wcsServer = wcsServer
        this.app = express()
        this.app.get('/contact', this.getContactList)
        this.app.listen(8082)
        this.info('api启动成功')
    }

    getContactList(req, resp) {
        try {
            let userId = req.query.userId
            let wc = this.wcsServer.getWc(userId)
            if (wc) {
                resp.status(200).json(wc.getContact())
            }
            else {
                resp.sendStatus(404)
            }
        }
        catch (e) {
            this.error(`get caontact list failed, ${JSON.stringify({ q: req.query, wc, e })}`)
        }
    }

    info(msg, data = '') {
        console.log(msg, data)
        fs.appendFileSync('result', { msg, data })
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
