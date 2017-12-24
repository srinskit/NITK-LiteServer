/*jslint node: true */
"use strict";
var mongoose = require('mongoose');
var bcrypt = require('bcrypt-nodejs');
var userSchema = mongoose.Schema({
    username: String,
    password: String,
    token: String,
    admin: Boolean,
    loggedIn: Boolean,
    online: Boolean,
    enabled: Boolean
});
userSchema.methods.secureJsonify = function () {
    return {
        username: this.username,
        admin: this.admin,
        online: this.online
    };
};
userSchema.methods.secureMiniJsonify = function () {
    return {
        username: this.username,
        admin: this.admin
    };
};
// generating a hash
userSchema.methods.generateHash = function (password) {
    return bcrypt.hashSync(password, bcrypt.genSaltSync(8), null);
};
// checking if password is valid
userSchema.methods.validPassword = function (password) {
    return bcrypt.compareSync(password, this.password);
};
userSchema.methods.validToken = function (token) {
    return token === this.token;
};
userSchema.methods.initialiseAndCheck = function () {
    this.admin = false;
    this.online = false;
    this.enabled = true;
};
module.exports = mongoose.model('User', userSchema);
