const request = require('request')
let jar = request.jar()
let rp = require('request-promise').defaults({
    jar
})
const fs = require('fs')
const tool = require('./tool.js')

let uuid, redirect_uri, wxuin, wxsid, webwx_data_ticket, syncKey, i = 1,
    userName, skey,
    pass_ticket

async function start() {
    await rp.get({
        url: `https://login.weixin.qq.com/jslogin?appid=wx782c26e4c19acffb&redirect_uri=https://wx.qq.com/cgi-bin/mmwebwx-bin/webwxnewloginpage&fun=new& amp;lang=zh_CN&_=${new Date().getTime()}`
    }).then(body => {
        fs.writeFileSync(i + '.json', body)
        fs.writeFileSync(i++ + 'Jar.json', JSON.stringify(jar))
        uuid = parse(body)['window.QRLogin.uuid']
    }).then(() => {
        rp.get(`https://login.weixin.qq.com/qrcode/${uuid}?t=webwx`).pipe(fs.createWriteStream('./qrcode.png'))
    }).then(async () => {
        console.log('扫描 qrcode.png 中的二维码以登录')
        while (true) {
            if ((await new Promise(resolve => {
                    rp.get({
                        url: `https://login.weixin.qq.com/cgi-bin/mmwebwx-bin/login?uuid=${uuid}&tip=1&_=${new Date().getTime()}`
                    }).then(body => {
                        console.log(body)
                        let parsedBody = parse(body)
                        if (parsedBody['window.code'] == 201) {
                            console.log('扫描成功，请点击确认按钮以登录')
                            resolve(0)
                        }
                        if (parsedBody['window.code'] == 200) {
                            console.log('登录成功!')
                            redirect_uri = parsedBody['window.redirect_uri']
                            resolve(1)
                        }
                        resolve(0)
                    })
                })) === 1) break
            else {
                await new Promise(resolve => {
                    setTimeout(resolve, 1000)
                })
            }
        }
        fs.writeFileSync(i++ + 'Jar.json', JSON.stringify(jar));
        return rp.get({
            url: redirect_uri + '&fun=new',
        })
    }).then(body => {
        pass_ticket = tool.findNode(body, 'pass_ticket');
        skey = tool.findNode('skey');
        fs.writeFileSync(i + '.txt', body);
        fs.writeFileSync(i++ + 'Jar.json', JSON.stringify(jar));
        ({
            wxuin,
            wxsid,
            webwx_data_ticket
        } = parse(jar.getCookieString(redirect_uri)));
        return rp.post({
            url: `https://wx2.qq.com/cgi-bin/mmwebwx-bin/webwxinit?r=${new Date().getTime()}`,
            body: JSON.stringify({
                "BaseRequest": {
                    "Uin": wxuin,
                    "Sid": wxsid,
                    "Skey": "",
                    "DeviceID": "e45382650334865"
                }
            }),
            headers: {
                'Cookie': tool.jarObjStringify(tool.jarObjParse(jar.getCookieString('https://wx2.qq.com')))
            }
        })

    }).then(body => {
        userName = JSON.parse(body).User.UserName
        syncKey = JSON.parse(body).SyncKey.List.map(sk => `${sk.Key}_${sk.Val}`).join('|')
        fs.writeFileSync('jar2.json', JSON.stringify(jar))
        console.log(wxuin, wxsid, webwx_data_ticket)
        return rp.get({
            url: `https://wx2.qq.com/cgi-bin/mmwebwx-bin/webwxgetcontact?type=ex&&r=${new Date().getTime()}`,
            headers: {
                'Cookie': tool.jarObjStringify(tool.jarObjParse(jar.getCookieString('https://wx2.qq.com')))
            }
        })
    }).then(body => {
        fs.writeFileSync(i + '.json', body)
        fs.writeFileSync(i++ + 'Jar.json', JSON.stringify(jar))
        return rp.get({
            url: `https://webpush.wx2.qq.com/cgi-bin/mmwebwx-bin/synccheck?r=${new Date().getTime()}&sid=${wxsid}&uin=${wxuin}&deviceid=e45382650334865&synckey=${syncKey}`,
            headers: {
                'Cookie': tool.jarObjStringify(tool.jarObjParse(jar.getCookieString('https://wx2.qq.com')))
            }
        })
    }).then(body => {
        fs.writeFileSync(i + '.json', body)
        fs.writeFileSync(i++ + 'Jar.json', JSON.stringify(jar))
        let LocalID = new Date().getTime() * 10000 + Math.floor(Math.random() * 10000)
        console.log({
            url: `https://wx2.qq.com/cgi-bin/mmwebwx-bin/webwxsendmsg?lang=zh_CN&pass_ticket=${pass_ticket}`,
            body: JSON.stringify({
                "BaseRequest": {
                    "Uin": wxuin,
                    "Sid": wxsid,
                    "Skey": skey,
                    "DeviceID": "e45382650334865"
                },
                "Msg": {
                    "Type": 1,
                    "Content": "Hello, human",
                    "FromUserName": userName,
                    "ToUserName": "filehelper",
                    "LocalID": LocalID,
                    "ClientMsgId": LocalID
                },
                "Scene": 0
            })
        })
        return rp.post({
            url: `https://wx2.qq.com/cgi-bin/mmwebwx-bin/webwxsendmsg?lang=zh_CN&pass_ticket=${pass_ticket}`,
            headers: {
                'Cookie': tool.jarObjStringify(tool.jarObjParse(jar.getCookieString('https://wx2.qq.com')))
            },
            body: JSON.stringify({
                "BaseRequest": {
                    "Uin": wxuin,
                    "Sid": wxsid,
                    "Skey": skey,
                    "DeviceID": "e45382650334865"
                },
                "Msg": {
                    "Type": 1,
                    "Content": "Hello, human",
                    "FromUserName": userName,
                    "ToUserName": "filehelper",
                    "LocalID": LocalID,
                    "ClientMsgId": LocalID
                }
            })
        })
    }).then(body => {
        console.log(i)
        fs.writeFileSync(i + '.json', body)
        fs.writeFileSync(i++ + 'Jar.json', JSON.stringify(jar))
    })
}

function parse(source) {
    let re = /(?<key>.+?)\s{0,1}=\s{0,1}"{0,1}(?<value>.+?)"{0,1};\s{0,1}/g
    let retJson = {}
    let match
    while (match = re.exec(source)) {
        retJson[match.groups.key] = match.groups.value
    }
    return retJson
}

// function syncKey() {

// }

start()

// let jar = JSON.parse(fs.readFileSync('jar.txt').toString())

// let { wxuin, wxsid, webwx_data_ticket } = parse(jar.getCookieString(redirect_uri))

// rp.post({
//     url: `https://wx.qq.com/cgi-bin/mmwebwx-bin/webwxsync?sid=${wxsid}&r=${new Date().getTime()}`,
//     url: `https://webpush.wx2.qq.com/cgi-bin/mmwebwx-bin/synccheck?r=${new Date().getTime()}&skey=&sid=${wxsid}&uin=${wxuin}&deviceid=e45382650334865&synckey=1_679319969%7C2_679320119%7C3_679320045%7C11_679319441%7C201_1536229775%7C1000_1536222603%7C1001_1536222675&_=1536229586841`
//     body: JSON.stringify({}),
//     headers: {
//         'Cookie': `wxuin=1134794182; wxsid=ErMKFxi0oyzG7OJq; webwx_data_ticket=gSei+kZ5AvnYSHXpVRVAcw2J`
//     }
// }).then(body => {
//     console.log(body)
// })