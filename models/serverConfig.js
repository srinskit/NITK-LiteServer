var mongoose = require('mongoose')
var configSchema = mongoose.Schema({
    override: Boolean
})
configSchema.methods.JSONify = function () {
    return {
        override: this.override
    }
}
module.exports = mongoose.model('serverConfig', configSchema)
