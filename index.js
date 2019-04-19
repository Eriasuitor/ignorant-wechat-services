const Constant = require('./constant')
const rp = require('request-promise')
const fs =require('fs')
var inquirer = require('inquirer');
var chalkPipe = require('chalk-pipe');

let friends = [], contactBatch = []
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
	contactBatch = await wc.getContactBatch()
	contactBatch2 = await wc.getContactBatch()
	friends.concat(contactBatch)
	fs.writeFileSync('friends.json', JSON.stringify(friends))
	fs.writeFileSync('contactBatch.json', JSON.stringify(contactBatch))
	fs.writeFileSync('contactBatch2.json', JSON.stringify(contactBatch2))
	console.log('所有好友：')
	console.log(friends.map(_ => ({name: _.NickName, uid: _.UserName})))
	cur()
})

wc.login()
operationActions = {
	'白名单模式': async () => {
		// let toSend = friends.filter(_ => _.UserName.startWith('@@')).map(_ => _.UserName)
		let whiteList = require('./whitelist')
		let toSend = friends.filter(_ => whiteList.includes(_.NickName)).map(_ => _.UserName)
		console.log(`发现${whiteList.length}个，匹配成功${toSend.length}个`)
		let answer = await inquirer.prompt([{
			type: 'input',
			name: 'text',
			message: "输入信息内容"
		}])
		if(answer.text === 'q') return
		for(let i = 0; i < toSend.length; i++){
			let result = await wc.sendMessage(toSend[i], answer.text)
			console.log(`[${i+1}/${toSend.length}]发送结果: ` + JSON.stringify(result))
			await new Promise(resolve => setTimeout(resolve, 10000))
		}
		return
	},
	'单发模式': async () => {
		await inquirer.prompt([{
			type: 'input',
			name: 'target',
			message: "请输入对象"
		}, {
			type: 'input',
			name: 'text',
			message: "输入信息内容"
		}]).then(async answer => {
			answer.target = friends.find(_ => _.NickName === answer.target).UserName
			let result = await wc.sendMessage(answer.target, answer.text)
			console.log('发送结果: ' + JSON.stringify(result))
		})
	},
	'群无差别群发模式': async () => {
		await inquirer.prompt([{
			type: 'input',
			name: 'text',
			message: "输入信息内容"
		}]).then(async answer => {
			answer.target = friends.filter(_ => _.UserName.startsWith('@@')).map(_ => _.UserName)
			let result = await wc.sendMessage(answer.target, answer.text)
			console.log('发送结果: ' + JSON.stringify(result))
		})
	}
}
let cur = async () => {
	while(true){
		let operation = await inquirer.prompt([{
			type: 'list',
			name: 'operation',
			choices: [
				'白名单模式',
				'单发模式',
				'群无差别群发模式'
			]
		}])
		await operationActions[operation.operation]()
	}
}