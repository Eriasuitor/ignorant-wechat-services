const Wc = require('./wc')

let wc = new Wc()
wc.login()
wc.on('msg', data => {
    // console.log(data)
})