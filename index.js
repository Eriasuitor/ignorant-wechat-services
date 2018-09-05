const request = require('request')
const querystring = require("querystring")
const rp = require('request-promise')
const fs = require('fs')
let jar = request.jar()

async function start() {
    let uuid, redirect_uri, wxuin, wxsid
    rp.get({
        url: `https://login.weixin.qq.com /jslogin?appid=wx782c26e4c19acffb&redirect_uri=https://wx.qq.com/cgi-bin/mmwebwx-bin/webwxnewloginpage&fun=new& amp;lang=zh_CN&_=${new Date().getTime()}`
    }).then(body => {
        console.log(parse(body))
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
                    console.log(parse(body))
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
        return rp.get({
            url: redirect_uri,
            jar
        })
    }).then(body => {
        // j.getCookies(url)
        let { wxuin, wxsid } = parse(jar.getCookieString(redirect_uri));
        console.log(JSON.stringify({
            "BaseRequest": {
                "Uin": wxuin,
                "Sid": wxsid,
                "Skey": "",
                "DeviceID": "e456470324744989"
            }
        }))
        return rp.get(`https://wx2.qq.com/cgi-bin/mmwebwx-bin/webwxnewloginpage?ticket=Aw6h08K2CHAl40FLEwULs3OI@qrticket_0&uuid=YfIK5ZiUdg==&lang=zh_CN&scan=1535983620&fun=new&version=v2&lang=zh_CN`)
        // return rp.post({
        //     url: `https://wx.qq.com/cgi-bin/mmwebwx-bin/webwxinit?r=${new Date().getTime()}`,
        //     jar,
        //     body: JSON.stringify({
        //         "BaseRequest": {
        //             "Uin": wxuin,
        //             "Sid": wxsid,
        //             "Skey": "",
        //             "DeviceID": "e456470324744989"
        //         }
        //     })
        // })
        
    }).then(body => {
        console.log(body)
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

start()
// {"BaseRequest":{"Uin":"1134794182","Sid":"mlvLEIZ3gUFVARhK","Skey":"@crypt_3a7960f6_544b20d0f361f107974dc001946d1e1e","DeviceID":"e682512373459745"}}