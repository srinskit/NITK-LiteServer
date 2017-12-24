/*jslint node: true */
"use strict";
var mongoose = require('mongoose');
var lampSchema = mongoose.Schema({
    iid: Number,
    lid: Number,
    cid: Number,
    bri: Number,
    status: Number,
    loc: {
        lat: String,
        lng: String
    },
    next: {
        type: mongoose.Schema.ObjectId,
        ref: 'Lamp'
    }
});
lampSchema.methods.fullJsonify = function () {
    return {
        _id: this._id,
        iid: this.iid,
        cid: this.cid,
        lid: this.lid,
        bri: this.bri,
        status: this.status,
        loc: this.loc,
        next: this.next
    };
};
lampSchema.methods.jsonify = function () {
    return {
        iid: this.iid,
        cid: this.cid,
        lid: this.lid,
        bri: this.bri,
        status: this.status,
        loc: this.loc
    };
};
lampSchema.methods.miniJsonify = function () {
    return {
        'iid': this.iid,
        'cid': this.cid,
        'lid': this.lid,
        'bri': this.bri,
        'status': this.status
    };
};
lampSchema.virtual('FINE').get(() => {
    return 0;
});
lampSchema.virtual('FAULTY').get(() => {
    return 1;
});
lampSchema.virtual('DISCONNECTED').get(() => {
    return 2;
});
lampSchema.virtual('UNKNOWN').get(() => {
    return 3;
});

function isInt(n) {
    return Number(n) === n && n % 1 === 0;
}
lampSchema.methods.initialiseAndCheck = function () {
    if (!this.status) this.status = this.UNKNOWN;
    if (!this.bri) this.bri = 0;
    this.next = undefined;
    if (!this.iid || !this.cid || !this.lid || !this.loc || !this.loc.lat || !this.loc.lng) return false;
    return isInt(this.iid) && isInt(this.cid) && isInt(this.lid);
};
module.exports = mongoose.model('Lamp', lampSchema);
