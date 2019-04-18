const Constant = require('./constant')
const rp = require('request-promise')
const fs =require('fs')
var inquirer = require('inquirer');
var chalkPipe = require('chalk-pipe');

let friends = []
// inquirer.prompt([{
//     type: 'input',
//     name: 'text',
//     message: "输入群发信息内容"
//   },]).then(answers => {
// 	console.log(answers.text);
//   });
const Wc = require('./wc')

const wc = new Wc()

wc.on(Constant.MsgOutType.Qr, async ({url}) => {
	await rp.get(url).pipe(fs.createWriteStream('./登陆.png'))
	console.log('请扫描此文件加中的 登陆.png 图片以登陆微信')
})
wc.on(Constant.MsgOutType.Scanned, () => {
	console.log('扫描成功，请在手机中点击登陆按钮')
})
wc.on(Constant.MsgOutType.Init, (user) => {
	console.log(user)
})
wc.on(Constant.MsgOutType.Init, async (user) => {
	console.log('您是：')
	console.log(user)
	friends = await wc.getContact()
	fs.writeFileSync('friends.json', JSON.stringify(friends))
	console.log('所有好友：')
	console.log(friends.map(_ => ({name: _.NickName, uid: _.UserName})))
	cur()
})

wc.login()

let cur = async () => {
	while(true){
		await inquirer.prompt([{
			type: 'input',
			name: 'target',
			message: "请输入对象"
		}, {
			type: 'input',
			name: 'text',
			message: "输入信息内容"
		}]).then(async answer => {
			if(answer.target === 'white') {
				// let toSend = friends.filter(_ => _.UserName.startWith('@@')).map(_ => _.UserName)
				let whiteList = require('./whitelist')
				let toSend = friends.filter(_ => whiteList.includes(_.NickName)).map(_ => _.UserName)
				for(let i = 0; i < toSend.length; i++){
					let result = await wc.sendMessage(toSend[i], answer.text)
					console.log(`[${i+1}/${toSend.length}]发送结果: ` + JSON.stringify(result))
					return await new Promise(resolve => setTimeout(resolve, 10000))
				}
			}
			let result = await wc.sendMessage(answer.target, answer.text)
			console.log('发送结果: ' + JSON.stringify(result))
		})
	}
}
