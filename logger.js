const Log4js = require('log4js')
const path = require('path')

Log4js.configure({
    appenders: {
        runtime: {
            type: 'dateFile',
            filename: path.join(__dirname, '/logs/runtime'),
            pattern: '/yyyy-MM-dd.log',
            alwaysIncludePattern: true
        },
        web: {
            type: 'dateFile',
            filename: path.join(__dirname, '/logs/web'),
            pattern: '/yyyy-MM-dd.log',
            alwaysIncludePattern: true
        }
    },
    categories: {
        default: { appenders: ['runtime'], level: 'ALL' },
        web: { appenders: ['web'], level: 'ALL' },
    }
})

module.exports = {
    Logger: Log4js.getLogger('default'),
    WebLogger: Log4js.getLogger('web')
}