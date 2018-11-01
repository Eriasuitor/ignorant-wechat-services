const WebSocket = require('ws')
const WcServer = require('./wc')
const fs = require('fs')
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
                switch (msg.type) {
                    case Constant.MsgType.New:
                        let { userId } = msg
                        wcs = new WcServer()
                        this.info(`user #{userId} create a new wcs`)
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
                        this.user2WcServer.set(msg.userId, wcs)
                        wcs.login()
                        break;
                    case Constant.MsgType.Msg:
                        wcs = this.user2WcServer.get(msg.userId)
                        wcs.sendMessage(msg.to, msg.content)
                        break;
                    default:
                        break;
                }
            })
        })
        this.info('wcs启动成功')
    }

    info(msg, data) {
        console.log(msg, data ? data : '')
    }

    error(msg, data) {
        console.error(msg, data ? data : '')
    }
}

new Server()
