/*jslint node: true */
"use strict";
var mongoose = require('mongoose');
var configSchema = mongoose.Schema({
    override: Boolean,
    delayBetweenStatusChecks: Number,
    delayBetweenClusterStatusChecks: Number,
    timeoutTimeForLampStatusCheck: Number
});
configSchema.methods.miniJsonify = function () {
    return {
        override: this.override
    };
};
module.exports = mongoose.model('serverConfig', configSchema);
