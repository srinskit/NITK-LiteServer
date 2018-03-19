/*jslint node: true */
"use strict";
var mongoose = require('mongoose');
var bcrypt = require('bcrypt-nodejs');
var termSchema = mongoose.Schema({
    iid: Number,
    cid: Number,
    fcid: Number,
    status: Number,
    loc: {
        lat: String,
        lng: String
    },
    lamps: [{
        type: mongoose.Schema.ObjectId,
        ref: 'Lamp'
    }],
    head: {
        type: mongoose.Schema.ObjectId,
        ref: 'Lamp'
    },
    username: String,
    password: String,
    token: String,
    ip: String,
    enabled: Boolean,
    online: Boolean
});
termSchema.virtual('ONLINESYNCED').get(() => {
    return 0;
});
termSchema.virtual('ONLINE').get(() => {
    return 1;
});
termSchema.virtual('FAULTYLAMP').get(() => {
    return 2;
});
termSchema.virtual('OFFLINE').get(() => {
    return 3;
});
termSchema.virtual('UNREG').get(() => {
    return 4;
});

function isInt(n) {
    return Number(n) === n && n % 1 === 0;
}
termSchema.methods.initialiseAndCheck = function () {
    this.status = this.UNREG;
    this.online = false;
    this.enabled = false;
    this.ip = 'UNREG';
    this.username = 'UNREG';
    if (!this.iid || !this.cid || !this.loc.lat || !this.loc.lng) return false;
    return isInt(this.iid) && isInt(this.cid);
};
termSchema.methods.registered = function () {
    return this.username !== 'UNREG';
};
termSchema.methods.secureJsonify = function () {
    return {
        iid: this.iid,
        cid: this.cid,
        status: this.status,
        ip: this.ip,
        loc: this.loc,
        online: this.online
    };
};
termSchema.methods.secureMiniJsonify = function () {
    return {
        iid: this.iid,
        cid: this.cid,
        status: this.status
    };
};
// generating a hash
termSchema.methods.generateHash = function (password) {
    return bcrypt.hashSync(password, bcrypt.genSaltSync(8), null);
};
// checking if password is valid
termSchema.methods.validPassword = function (password) {
    return bcrypt.compareSync(password, this.password);
};
// create the model for terminals and expose it to our app
module.exports = mongoose.model('Terminal', termSchema);
