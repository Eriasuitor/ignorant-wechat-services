module.exports = class {

    constructor() { }

    static parse(source) {
        source = source.trim()
        let re = /(?<key>.+?)="{0,1}(?<value>.+?)"{0,1}[;&]/g
        let retJson = {}
        let match
        while (match = re.exec(source)) {
            retJson[match.groups.key] = match.groups.value
        }
        return retJson
    }

    static findNode(source, target) {
        let re = RegExp(`<${target}>(?<value>.+?)</${target}>`)
        let matched = re.exec(source)
        if (!matched) return
        return matched.groups.value
    }
}

