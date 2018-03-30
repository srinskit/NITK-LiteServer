/*jslint node: true */
"use strict";
var mongoose = require('mongoose');
var configSchedulerSchema = mongoose.Schema({
    name: String,
    time: String
});
module.exports = mongoose.model('configScheduler', configSchedulerSchema);
