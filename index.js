const request = require('request')
let jar = request.jar()
let rp = require('request-promise').defaults({ jar })
const fs = require('fs')

async function start() {
    let uuid, redirect_uri, wxuin, wxsid, webwx_data_ticket
    await rp.get({
        url: `https://login.weixin.qq.com /jslogin?appid=wx782c26e4c19acffb&redirect_uri=https://wx.qq.com/cgi-bin/mmwebwx-bin/webwxnewloginpage&fun=new& amp;lang=zh_CN&_=${new Date().getTime()}`
    }).then(body => {
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
        return rp.get({
            url: redirect_uri,
            headers: {
                'Upgrade-Insecure-Requests': 1,
                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.84 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8'
            }
        })
    }).then(body => {
        ({ wxuin, wxsid, webwx_data_ticket } = parse(jar.getCookieString(redirect_uri)));
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
                'Cookie': `wxuin=${wxuin}; wxsid=${wxsid}; webwx_data_ticket=${webwx_data_ticket}`
            }
        })

    }).then(body => {
        fs.writeFileSync('first.json', body)
        // console.log(JSON.parse(body))
        fs.writeFileSync('jar.txt', JSON.stringify(jar))
        console.log(wxuin, wxsid, webwx_data_ticket)
        rp.get({
            url: `https://wx2.qq.com/cgi-bin/mmwebwx-bin/webwxgetcontact?type=ex&&r=${new Date().getTime()}`,
            headers: {
                'Cookie': `wxuin=${wxuin}; wxsid=${wxsid}; webwx_data_ticket=${webwx_data_ticket}`
            }
        }).then(body => {
            console.log(body)
        })
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

// start()

let jar = JSON.parse(fs.readFileSync('jar.txt').toString())

let { wxuin, wxsid, webwx_data_ticket } = parse(jar.getCookieString(redirect_uri))

rp.post({
    url: `https://wx.qq.com/cgi-bin/mmwebwx-bin/webwxsync?sid=${wxsid}&r=${new Date().getTime()}`,
    body: JSON.stringify({}),
    headers: {
        'Cookie': `wxuin=1134794182; wxsid=ErMKFxi0oyzG7OJq; webwx_data_ticket=gSei+kZ5AvnYSHXpVRVAcw2J`
    }
}).then(body => {
    console.log(body)
})