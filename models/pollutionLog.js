/*jslint node: true */
"use strict";
var mongoose = require('mongoose');
var pollutionLogSchema = mongoose.Schema({
    cid: Number,
    value: Number,
    time: String
});
module.exports = mongoose.model('pollutionLog', pollutionLogSchema);
