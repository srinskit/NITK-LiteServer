/*jslint node: true */
"use strict";
var mongoose = require('mongoose');
var powerLogSchema = mongoose.Schema({
    cid: Number,
    value: Number,
    time: String
});
module.exports = mongoose.model('powerLog', powerLogSchema);
