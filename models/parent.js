var mongoose = require('mongoose')
var parentSchema = mongoose.Schema({
    iid: Number
    , cid: Number
    , status: Number
    , ip: String
    , loc: {
        lat: String
        , lng: String
    }
})
parentSchema.methods.JSONify = function () {
    return {
        'iid': this.iid
        , 'cid': this.cid
        , 'status': this.status
        , 'ip': this.ip
        , 'loc': {
            'lat': this.loc.lat
            , 'lng': this.loc.lng
        }
    }
}
parentSchema.methods.valid = function () {
    if (this.status == undefined) {
        this.status = 0
    }
    if (this.iid == undefined || this.cid == undefined || this.loc.lat == undefined || this.loc.lng == undefined) {
        return false
    }
    return isInt(this.iid) && isInt(this.cid)
}
isInt = function (n) {
    return Number(n) === n && n % 1 === 0
}
module.exports = mongoose.model('Parent', parentSchema)