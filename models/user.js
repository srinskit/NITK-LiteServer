var mongoose = require('mongoose')
var bcrypt = require('bcrypt-nodejs')
var userSchema = mongoose.Schema({
    username: String,
    password: String,
    token: String,
    admin: Boolean,
    online: Boolean
})
// generating a hash
userSchema.methods.generateHash = function (password) {
    return bcrypt.hashSync(password, bcrypt.genSaltSync(8), null)
}

// checking if password is valid
userSchema.methods.validPassword = function (password) {
    return bcrypt.compareSync(password, this.password)
}
userSchema.methods.validToken = function (token) {
    return token === this.token
}
userSchema.methods.setDefaultRight = function () {
    this.admin = false
    this.online = false
}
// create the model for users and expose it to our app
module.exports = mongoose.model('User', userSchema)
