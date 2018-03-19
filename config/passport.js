/*jslint node: true */
"use strict";
var LocalStrategy = require('passport-local').Strategy;
var User = require('../models/user');
var crypto = require('crypto');
module.exports = function (passport) {
    // =========================================================================
    // passport session setup ==================================================
    // =========================================================================
    // required for persistent login sessions
    // passport needs ability to serialize and unserialize users out of session
    // used to serialize the user for the session
    passport.serializeUser(function (user, done) {
        done(null, user.id);
    });
    // used to deserialize the user
    passport.deserializeUser(function (id, done) {
        User.findById(id, function (err, user) {
            done(err, user);
        });
    });
    passport.use('local-login', new LocalStrategy({
        usernameField: 'username',
        passwordField: 'password',
        passReqToCallback: true
        // allows us to pass back the entire request to the callback
    }, function (req, username, password, done) {
        User.findOne({
            username: username
        }, function (err, user) {
            if (err) {
                // TODO Figure logging
                // log.error('[%s] Passport couldn\'t get doc', username, {
                //     stack: err.stack
                // })
                return done(null, false, {
                    errorMsg: 'Internal error'
                });
            }
            if (!user) {
                return done(null, false, {
                    errorMsg: 'Invalid Creds'
                });
            }
            if (!user.validPassword(password)) {
                return done(null, false, {
                    errorMsg: 'Invalid Creds'
                });
            }
            if (user.loggedIn !== true || user.token === undefined) user.token = crypto.randomBytes(20).toString('hex');
            user.loggedIn = true;
            user.save(err => {
                if (err) return done(null, false, {
                    errorMsg: 'Internal error'
                });
                return done(null, user, {
                    token: user.token
                });
            });
        });
    }));
};
