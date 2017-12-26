/*jslint node: true */
"use strict";
var mongoose = require('mongoose');
var configSchema = mongoose.Schema({
    override: Boolean,
    delayBetweenStatusChecks: Number,
    delayBetweenClusterStatusChecks: Number,
    delayBetweenLampStatusChecks: Number,
    timeoutTimeForLampStatusCheck: Number
});
configSchema.methods.miniJsonify = function () {
    return {
        override: this.override
    };
};
configSchema.methods.secureJsonify = function () {
    return this;
};

module.exports = mongoose.model('serverConfig', configSchema);
