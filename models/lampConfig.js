/*jslint node: true */
"use strict";
var mongoose = require('mongoose');
var lampConfigSchema = mongoose.Schema({
    name: String,
    terminals: [{
        cid: Number,
        bri: Number,
        lamps: [{
            lamp: {
                type: mongoose.Schema.ObjectId,
                ref: 'Lamp'
            },
            bri: Number
        }]
    }]
});
module.exports = mongoose.model('LampConfig', lampConfigSchema);
