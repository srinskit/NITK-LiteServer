var mongoose = require('mongoose')
var lampSchema = mongoose.Schema({
    iid: Number,
    lid: Number,
    cid: Number,
    bri: Number,
    status: Number,
    loc: {
        lat: String,
        lng: String
    }
})
lampSchema.methods.JSONify = function () {
    return {
        'iid': this.iid,
        'cid': this.cid,
        'lid': this.lid,
        'bri': this.bri,
        'status': this.status,
        'loc': {
            'lat': this.loc.lat,
            'lng': this.loc.lng
        }
    }
}
lampSchema.methods.mJSONify = function () {
    return {
        'iid': this.iid,
        'cid': this.cid,
        'lid': this.lid,
        'bri': this.bri,
        'status': this.status
    }
}
lampSchema.methods.valid = function () {
    if (this.status == null) {
        this.status = 0
    }
    if (this.bri == null) {
        this.bri = 0
    }
    if (this.iid == null || this.cid == null || this.lid == null || this.loc.lat == null || this.loc.lng == null) {
        return false
    }
    return isInt(this.iid) && isInt(this.cid) && isInt(this.lid)
}

isInt = function (n) {
    return Number(n) === n && n % 1 === 0
}
module.exports = mongoose.model('Lamp', lampSchema)
