const request = require('request')
const querystring = require("querystring")
let jar = request.jar()
let rp = require('request-promise')
rp = rp.defaults({ jar })
const fs = require('fs')
// WAUWC0  GKWSALF3Q
async function start() {
    let uuid, redirect_uri, wxuin, wxsid, webwx_data_ticket
    rp.get({
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
            // jar
        })
    }).then(body => {
        // j.getCookies(url)
        ({ wxuin, wxsid, webwx_data_ticket } = parse(jar.getCookieString(redirect_uri)));
        console.log(wxuin, wxsid, webwx_data_ticket)
        console.log({
            url: `https://wx.qq.com/cgi-bin/mmwebwx-bin/webwxinit?r=${new Date().getTime()}`,
            // jar,
            body: JSON.stringify({
                "BaseRequest": {
                    "Uin": wxuin,
                    "Sid": wxsid,
                    "Skey": "",
                    "DeviceID": "e456470324744989"
                }
            }),
            headers: {
                Cookie: `wxuin=${wxuin}; wxsid=${wxsid}; webwx_data_ticket=${webwx_data_ticket}`
            }
        })
        // return rp.get(`https://wx2.qq.com/cgi-bin/mmwebwx-bin/webwxnewloginpage?ticket=Aw6h08K2CHAl40FLEwULs3OI@qrticket_0&uuid=YfIK5ZiUdg==&lang=zh_CN&scan=1535983620&fun=new&version=v2&lang=zh_CN`)
        // rp.post({
        //     url: 'https://wx2.qq.com/cgi-bin/mmwebwx-bin/webwxinit?r=144835077100',
        //     body: '{"BaseRequest":{"Uin":"1134794182","Sid":"YJhsd34iAr9+HntQ","Skey":"","DeviceID":"e45382650334865"}}',
        //     headers: {
        //         'Cookie': 'wxuin=1134794182; wxsid=+YJhsd34iAr9+HntQ;webwx_data_ticket=gSdQA6jkCRAFTuSMTZ2ihmKp;'
        //     }
        // }).then(body => {
        //     console.log(body)
        // })
        return rp.post({
            url: `https://wx2.qq.com/cgi-bin/mmwebwx-bin/webwxinit?r=144835077100`,
            // jar,
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
let a = 'https://wx2.qq.com/cgi-bin/mmwebwx-bin/webwxnewloginpage?ticket=A2pGNnFXjxNrhvzIt197zz5J@qrticket_0&uuid=IYoOk5ocNA==&lang=zh_CN&scan=1536153414'
// rp.get(a)
//     .then(body => {
//         // console.log(body)
//         let { wxuin, wxsid, webwx_data_ticket } = parse(jar.getCookieString(a));
//         console.log(wxuin, wxsid, webwx_data_ticket)
//     })
// jar.setCookie(request.cookie('pgv_pvi=361434112; pgv_pvid=9292349042; ptui_loginuin=948471414; pt2gguin=o0948471414; RK=DKjwpu9xY+; ptcz=8479610fee4bea8d4ee667d2a46afbd32c81bee40e5ff709b99c9b988ec2e7ff; tvfe_boss_uuid=a0a3f6cbaa01b865; o_cookie=948471414; luin=o0948471414; lskey=000100007e84f6d3ba91f15ad231a03a709dd01a6f25a4d1aca589f5e41b96bd1f04ff48ede6c47f2a3a2ce0; wxuin=1134794182; webwxuvid=a5e6b830305566c23bf8d916f0de93766ff5b1bd0cb2a601dc4e543358271731240eed42a56b3594f484c7a4efab8076; login_frequency=1; last_wxuin=1134794182; mm_lang=zh_CN; wxpluginkey=1536134882; refreshTimes=5; wxsid=3GYIE5Ck9EcgxVQg; webwx_data_ticket=gSePtP+Xn9hhgkQgHuZKpebb; webwx_auth_ticket=CIsBEMuwu6QPGoABu8q1pSEjNd+wDQR5QEmI4HmRj2QuwJaCAT5CJDV+1dSXwaAC8Cht7eUiMNqHWmlG7zndcLGP25lFGMJ2gd5dzrIkEzVNWA5jmZMYQbWlsU/BK/8KYYVj7Ph43MHMV74TeGzZwGGgWf/E5M0JS/1/+UxBTiPaaZj+y+mv8ZzErj8=; wxloadtime=1536148496_expired; MM_WX_NOTIFY_STATE=1; MM_WX_SOUND_STATE=1'))
// rp.post({
//     url: 'https://wx2.qq.com/cgi-bin/mmwebwx-bin/webwxinit?r=144835077100',
//     body: '{"BaseRequest":{"Uin":"1134794182","Sid":"YJhsd34iAr9+HntQ","Skey":"","DeviceID":"e45382650334865"}}',
//     headers: {
//         'Cookie': 'wxuin=1134794182; wxsid=+YJhsd34iAr9+HntQ;webwx_data_ticket=gSdQA6jkCRAFTuSMTZ2ihmKp;'
//     }
// }).then(body => {
//     console.log(body)
// })
// {"BaseRequest":{"Uin":"1134794182","Sid":"mlvLEIZ3gUFVARhK","Skey":"@crypt_3a7960f6_544b20d0f361f107974dc001946d1e1e","DeviceID":"e682512373459745"}}
// 1134794182 W/d2zRr4FmxJcbbg gSd/4o0z01K9l2ea1NmxzyIS
// 1134794182 vwbk6BplXnO4OU7P gSdUftQvEwx0xW3pHIyTiCXv
// 1134794182 yJ/38JUlqs/wkaL/ gSc7l3P2XxzwsYKyNBsO83FR