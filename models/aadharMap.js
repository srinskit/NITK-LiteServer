/*jslint node: true */
"use strict";
var mongoose = require('mongoose');
var aadharMapSchema = mongoose.Schema({
    number: String,
    phone: String,
    name: String
});
module.exports = mongoose.model('aadharMap', aadharMapSchema);
