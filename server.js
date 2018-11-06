const WebSocket = require('ws')
const WcServer = require('./wc')
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
        this.user2WcServer = new Map()
        this.wss = new WebSocket.Server({
            port: 8081
        })
        this.wss.on('connection', socket => {
            this.info('new connection', socket)
            socket.on('message', msg => {
                this.info(msg)
                try {
                    msg = JSON.parse(msg)
                } catch (error) {
                    this.error('unrecgnised msg' + msg)
                }
                let wcs
                let { userId } = msg
                switch (msg.type) {
                    case Constant.MsgType.New:
                        let record = this.user2WcServer.get(userId)
                        if (record) {
                            record.resendInit()
                            break
                        }
                        wcs = new WcServer()
                        this.info(`user ${userId} connect to wcs`)
                        Object.values(Constant.MsgOutType).forEach(type => {
                            wcs.on(type, data => {
                                fs.appendFileSync('result', JSON.stringify({
                                    userId,
                                    type,
                                    data
                                }) + ',\n')
                                socket.send(JSON.stringify({
                                    userId,
                                    type,
                                    data: JSON.stringify(data)
                                }))
                            })
                        })
                        this.user2WcServer.set(userId, wcs)
                        wcs.login()
                        break;
                    case Constant.MsgType.Msg:
                        wcs = this.user2WcServer.get(userId)
                        wcs.sendMessage(msg.to, msg.content)
                        break;
                    default:
                        break;
                }
            })
        })

        this.info('wcs启动成功')
    }

    getWcs(userId){
        return this.user2WcServer.get(userId)
    }

    info(msg, data) {
        console.log(msg, data ? data : '')
    }

    error(msg, data) {
        console.error(msg, data ? data : '')
    }
}

class Api {
    constructor(wcsServer) {
        this.wcsServer = wcsServer
        this.app = express()
        this.app.get('/contact', getContactList)
        this.app.listen(8082)
    }

    getContactList(req, resp){
        let userId = req.query.userId
        let wcs = this.wcsServer.getWcs(userId)
        if(wcs && wcs.contactList) {
            resp.status = 200
            resp.json(wcs.contactList)
        }
    }
}

let wcServer = new Server()
new Api(wcServer)
