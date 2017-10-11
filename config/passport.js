var LocalStrategy = require('passport-local').Strategy
var User = require('../models/user')
var crypto = require('crypto')
module.exports = function (passport) {
    // =========================================================================
    // passport session setup ==================================================
    // =========================================================================
    // required for persistent login sessions
    // passport needs ability to serialize and unserialize users out of session

    // used to serialize the user for the session
    passport.serializeUser(function (user, done) {
        done(null, user.id)
    })

    // used to deserialize the user
    passport.deserializeUser(function (id, done) {
        User.findById(id, function (err, user) {
            done(err, user)
        })
    })
    passport.use('local-login', new LocalStrategy({
            usernameField: 'username',
            passwordField: 'password',
            passReqToCallback: true // allows us to pass back the entire request to the callback
        },
        function (req, username, password, done) {
            var token = crypto.randomBytes(20).toString('hex')
            User.findOneAndUpdate({
                username: username
            }, {
                token: token
            }, function (err, user) {
                if (err) {
                    log.error('[%s] Passport couldn\'t get doc', username, {
                        stack: err.stack
                    })
                    return done(null, false, {
                        errorMsg: 'Internal error'
                    })
                    return done(err)
                }
                if (!user) {
                    return done(null, false, {
                        errorMsg: 'Invalid Creds'
                    })
                }
                if (!user.validPassword(password)) {
                    return done(null, false, {
                        errorMsg: 'Invalid Creds'
                    })
                }
                return done(null, user, {
                    token: token
                })
            })

        }))
}
