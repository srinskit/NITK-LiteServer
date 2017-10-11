var mongoose = require('mongoose')
var lampClusterSchema = mongoose.Schema({
    cid: Number,
    lamps: [
        {
            type: mongoose.Schema.ObjectId,
            ref: 'Lamp'
        }
    ]
})
module.exports = mongoose.model('LampCluster', lampClusterSchema)
