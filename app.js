/*jslint node: true */
"use strict";
// Don't exit on error
process.on('uncaughtException', function (err) {
    console.log(err.stack);
});
var AUTO = 'AUTO';
var debugTerm = false;
var express = require('express');
var fs = require('fs');
var path = require('path');
var favicon = require('serve-favicon');
var morgan = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var mongoose = require('mongoose');
var passport = require('passport');
var flash = require('connect-flash');
var validator = require('express-validator');
var session = require('express-session');
var crypto = require('crypto');
var winston = require('winston');
var nodemailer = require('nodemailer');
var moment = require('moment-timezone');
var User = require('./models/user.js');
var ServerConfig = require('./models/serverConfig.js');
var LampConfig = require('./models/lampConfig.js');
var Lamp = require('./models/lamp.js');
var Terminal = require('./models/terminal.js');
var LAMP = new Lamp();
var TERM = new Terminal();
var LogMsg = require('./logMessages.js');
// For India
moment.tz('Asia/Kolkata').format();
var options = {
    key: fs.readFileSync('config/private.key'),
    cert: fs.readFileSync('config/server.crt')
};
var loggedInCount = {};

function myTimeStamp() {
    return moment().format().slice(0, -6);
}
// Log to console and server.log
// TODO custom level to log error.stack
var logListeners = [];
var wsTransport = {
    log: function (level, msg, meta, time) {
        if (logListeners.length > 0) {
            msg = makeStringMsg('log', {
                level: level,
                message: msg,
                timestamp: myTimeStamp()
            });
            logListeners.forEach(function (client) {
                safeSend(client, msg);
            });
        }
    }
};
var log = new winston.Logger({
    levels: {
        error: 0,
        warn: 1,
        info: 2,
        debug: 3
    },
    transports: [new winston.transports.Console({
        timestamp: myTimeStamp,
        colorize: true,
        level: 'debug'
    }), new winston.transports.File({
        filename: 'server.log',
        timestamp: myTimeStamp,
        level: 'info'
    }), wsTransport]
});
// Don't exit on error
log.exitOnError = false;
// Connect Mongoose to MongoDB
mongoose.Promise = global.Promise;
var dbConfig = require(path.join(__dirname, 'config', 'database.js'));
// https://stackoverflow.com/questions/11910842/mongoose-connection-models-need-to-always-run-on-open
mongoose.connect(dbConfig.url, {
    useMongoClient: true
}, function (err) {
    if (err) {
        log.error(LogMsg.dbConnectionError, AUTO, dbConfig.url, {
            stack: err.stack
        });
        // process.exit(1)
    }
});
var three = false,
    two = false,
    one = false;
// Find last saved server config
var sConfig;
var rerouteMap = {};
ServerConfig.findOne({}, function (err, config) {
    if (err) {
        log.error(LogMsg.dbNoServerConfig, AUTO);
        sConfig = {
            override: false
        };
        return;
    }
    sConfig = config;
    if (sConfig.delayBetweenStatusChecks != -1) {
        loadAllClusterIds(function () {
            setTimeout(() => process.nextTick(loadHeadOfNextCluster), sConfig.delayBetweenStatusChecks);
        });
    }
    three = true;
});
// Set all users offline
User.update({}, {
    online: false,
    loggedIn: false
}, {
    multi: true
}, err => {
    if (err) log.error('[%s] Failed to set users offline', AUTO);
    else two = true;
});
// Set all terminals offline
Terminal.update({}, {
    online: false,
    status: TERM.OFFLINE
}, {
    multi: true
}, err => {
    if (err) log.error('[%s] Failed to set terminals offline', AUTO);
    else one = true;
});
var mailTrans = nodemailer.createTransport('smtps://itguylab%40gmail.com:logMeMaybe@smtp.gmail.com');
// Block till initial setup
// while (!three || !two || !one);
log.info('Started Server');
// Configure Passport
require(path.join(__dirname, 'config', 'passport'))(passport);
var app = express();
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');
app.use(favicon(path.join(__dirname, 'public', 'images', 'favicon.ico')));
// app.use(morgan('dev'))
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(bodyParser.json());
app.use(validator());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'gFiwkbvvwk62KU3ZHgrk',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 7200000
    }
}));
app.use(flash());
app.use(passport.initialize());
app.use(passport.session());
// Router
app.get('/', function (req, res) {
    res.render('home', {
        isAuth: req.isAuthenticated()
    });
});
app.get('/report', function (req, res) {
    res.render('report', {
        isAuth: req.isAuthenticated()
    });
});
app.get('/about', function (req, res) {
    res.render('about', {
        isAuth: req.isAuthenticated()
    });
});
app.get('/login', function (req, res) {
    res.render('login', {
        errorMsg: req.flash('errorMsg'),
        successMsg: req.flash('successMsg'),
        isAuth: req.isAuthenticated()
    });
});
app.post('/login', function (req, res, next) {
    if (req.body.username && req.body.password && req.body.username.length > 0 && req.body.password.length > 0) {
        passport.authenticate('local-login', function (err, user, info) {
            if (err) {
                log.error('[%s] Passport error', req.body.username, {
                    stack: err.stack
                });
                res.redirect('login');
            } else if (!user) {
                log.warn('[%s] Auth failed', req.body.username);
                req.flash('errorMsg', info.errorMsg);
                res.redirect('login');
            } else {
                req.logIn(user, function (err) {
                    if (err) {
                        log.error('[%s] Passport login error', req.body.username, {
                            stack: err.stack
                        });
                        res.redirect('login');
                    }
                    if (loggedInCount[user.username] === undefined) loggedInCount[user.username] = 1;
                    else loggedInCount[user.username] += 1;
                    log.info('[%s] Logged in', req.body.username);
                    res.cookie('token', info.token, {
                        maxAge: 7200000
                    });
                    res.cookie('username', user.username, {
                        maxAge: 7200000
                    });
                    res.redirect('dash');
                });
            }
        })(req, res, next);
    } else {
        log.warn('[%s] Invalid input to login form', req.body.username ? req.body.username : '');
        req.flash('errorMsg', 'Invalid Creds');
        res.redirect('login');
    }
});

function getIpOfRequest(req) {
    var temp = (req.headers['x-forwarded-for'] || req.connection.remoteAddress).split(':');
    return temp[temp.length - 1];
}

function userIsLoggedIn(req, res, next) {
    if (req.isAuthenticated()) return next();
    log.warn('[%s] Attempted access without login', getIpOfRequest(req));
    res.redirect('/');
}
app.get('/logout', userIsLoggedIn, function (req, res) {
    var username = req.user.username;
    loggedInCount[username]--;
    var up = {};
    if (loggedInCount[username] === 0) up = {
        loggedIn: false
    };
    User.findOneAndUpdate({
        username: username
    }, up, function (err) {
        if (err) {
            log.error('[%s] Logout error', username, {
                stack: err.stack
            });
            req.flash('errorMsg', 'Logout failed');
            res.redirect('/login');
        } else {
            log.info('[%s] Logged out', username);
            req.logout();
            req.flash('successMsg', 'Logout success');
            res.cookie('token', '', {});
            res.cookie('username', '', {});
            res.redirect('/login');
        }
    });
});
app.get('/dash', userIsLoggedIn, function (req, res) {
    res.render('dash/dash', {
        user: req.user.secureMiniJsonify()
    });
});

function userIsAdmin(req, res, next) {
    if (req.isAuthenticated() && req.user.admin === true) return next();
    log.warn('[%s] Attempted access without login/admin', req.isAuthenticated() ? req.user.username : getIpOfRequest(req));
    if (req.isAuthenticated()) res.redirect('/dash');
    else res.redirect('/');
}
app.get('/logTerm', function (req, res) {
    res.end(getIpOfRequest(req));
});
app.get('/dash/logs', userIsAdmin, function (req, res) {
    var fromDate, fromTime, untilDate, untilTime, ts = myTimeStamp();
    // Todo validate with regex rather than length
    if (req.query.fromDate && req.query.fromDate.length === 10) fromDate = req.query.fromDate;
    else fromDate = ts.substr(0, 10);
    if (req.query.untilDate && req.query.untilDate.length === 10) untilDate = req.query.untilDate;
    else untilDate = ts.substr(0, 10);
    if (req.query.fromTime && req.query.fromTime.length === 8) fromTime = req.query.fromTime;
    else fromTime = '00:00:00';
    if (req.query.untilTime && req.query.untilTime.length === 8) untilTime = req.query.untilTime;
    else untilTime = '23:59:59';
    var levels, level, options = {
        from: fromDate + 'T' + fromTime,
        until: untilDate + 'T' + untilTime,
        limit: 50,
        order: 'desc'
    };
    switch (req.query.level) {
    case 'info':
        levels = {
            info: true
        };
        level = 'info';
        break;
    case 'warn':
        levels = {
            warn: true
        };
        level = 'warn';
        break;
    case 'error':
        levels = {
            error: true
        };
        level = 'error';
        break;
    case 'all':
    default:
        levels = {
            info: true,
            error: true,
            warn: true
        };
        level = 'all';
    }
    log.query(options, function (err, results) {
        if (err) {
            log.error('[%s] Log query error', req.user.username);
            return;
        }
        // Todo Better level selection
        var logs = [];
        results.file.forEach(function (log) {
            if (levels[log.level]) {
                logs.push(log);
            }
        });
        res.render('dash/logs', {
            user: req.user.secureMiniJsonify(),
            vars: {
                fromDate: fromDate,
                fromTime: fromTime,
                untilDate: untilDate,
                untilTime: untilTime,
                level: level
            },
            logs: logs
        });
    });
});

function serverInOverride(req, res, next) {
    if (req.isAuthenticated() && (req.user.admin === true || sConfig.override === true)) return next();
    log.warn('[%s] Unauthorised activity where override needed', req.isAuthenticated() ? req.user.username : getIpOfRequest(req));
    if (req.isAuthenticated()) res.redirect('/dash');
    else res.redirect('/');
}
app.get('/dash/load', serverInOverride, function (req, res) {
    LampConfig.find({}, ['name', '_id'], function (err, configs) {
        if (err) {
            log.error('[%s] Error getting configs', req.user.username, {
                stack: err.stack
            });
            return;
        }
        res.render('dash/load', {
            user: req.user.secureMiniJsonify(),
            configs: configs,
            msg: req.flash('msg')
        });
    });
});

function saveCurrentConfig(name, username) {
    var config = {
        name: name,
        terminals: []
    };
    // Todo populate lamps but only bri and lid
    Terminal.find({}, ['lamps', 'cid']).populate('lamps').exec(function (err, clusters) {
        if (err) {
            log.error('[%s] Couldn\'t get current config', username, {
                stack: err.stack
            });
            return;
        }
        clusters.forEach(function (cluster) {
            var compressable = true,
                commonBri = undefined,
                foo = [];
            cluster.lamps.forEach(function (lamp) {
                foo.push({
                    lamp: lamp._id,
                    bri: lamp.bri
                });
                if (commonBri === undefined) commonBri = lamp.bri;
                else if (commonBri !== lamp.bri) compressable = false;
            });
            if (compressable) config.terminals.push({
                cid: cluster.cid,
                bri: commonBri,
                lamps: []
            });
            else config.terminals.push({
                cid: cluster.cid,
                bri: -1,
                lamps: foo
            });
        });
        (new LampConfig(config)).save(function (err) {
            if (err) {
                log.error('[%s] Couldn\'t save config %s', username, name, {
                    stack: err.stack
                });
            }
        });
    });
}
//Clients listening to status of all terminals
var terminalListeners = [];
//Clients listening to cluster by cid
var clusterListeners = {};
var serverConfigListeners = [];
var userStatusListeners = [];
var WEBCLIENT = 'webclient',
    TERMINAL = 'terminal',
    LAMPOBJ = 'lamp',
    TERMOBJ = 'terminal',
    CLUSOBJ = 'cluster';

function postSendCallBack(err) {
    if (err) {
        log.error('[] Couldn\'t send msg', {
            stack: err.stack
        });
    }
}

function makeTermMsg(type, data) {
    let jsonMsg = {
        type: type,
        data: data
    };
    return {
        type: 'bs',
        bs: makeBits(jsonMsg),
        data: debugTerm ? jsonMsg : undefined
    };
}

function makeStringTermMsg(type, data) {
    return JSON.stringify(makeTermMsg(type, data));
}

function makeJsonMsg(type, data, includeBs) {
    let jsonMsg = {
        type: type,
        data: data
    };
    if (includeBs) jsonMsg.bs = makeBits(jsonMsg);
    return jsonMsg;
}

function makeStringMsg(type, data, includeBs) {
    return JSON.stringify(makeJsonMsg(type, data, includeBs));
}

function nBit(num, n) {
    let bin = Number(num).toString(2);
    return '0'.repeat(n - bin.length) + bin;
}

function makeBits(jsonMsg) {
    let bitStream;
    switch (jsonMsg.type) {
        //override
    case LAMPOBJ:
        bitStream = '10000' + nBit(jsonMsg.data.lamp.iid, 10) + '0' + nBit(jsonMsg.data.lamp.bri, 2) + nBit(0, 11);
        break;
        //sync
    case 'sync':
        bitStream = '01000' + nBit(0, 10) + '0' + nBit(0, 2) + nBit(jsonMsg.data.hour, 5) + nBit(jsonMsg.data.minute, 6);
        break;
        //broadcast
    case CLUSOBJ:
        bitStream = '00100' + nBit(0, 10) + '0' + nBit(jsonMsg.data[CLUSOBJ].bri, 2) + nBit(0, 11);
        break;
        //status
    case 'status':
        bitStream = '00010' + nBit(jsonMsg.data.lamp.iid, 10) + '0' + nBit(0, 13);
        break;
    }
    if (jsonMsg.rerouted === true) bitStream = bitStream.substring(0, 4) + '1' + bitStream.substring(5);
    let byteStream = '';
    for (let i = 0; i < 5; i += 1) {
        byteStream += parseInt(bitStream.substr(i * 7, 7), 2) + ' '
    };
    return byteStream.substring(0, byteStream.length - 1);
}

function toClusterListeners(cid, jsonMsg) {
    if (clusterListeners[cid]) clusterListeners[cid].forEach(function (client) {
        if (client.type === WEBCLIENT) safeSend(client, JSON.stringify(jsonMsg), postSendCallBack);
    });
}

function toTerminalListeners(jsonMsg) {
    let msg = JSON.stringify(jsonMsg);
    terminalListeners.forEach(function (client) {
        if (client.type === WEBCLIENT) safeSend(client, msg, postSendCallBack);
    });
}

function sendTerminals(client) {
    if (client.type === WEBCLIENT) {
        Terminal.find({}, ['iid', 'cid', 'status', 'ip', 'loc', 'online'], (err, terms) => {
            if (err) {
                log.error('[%s] Couldn\'t get terms', client.username, {
                    stack: err.stack
                });
                return;
            }
            terms.forEach(term => {
                safeSend(client, makeStringMsg(TERMOBJ, {
                    [TERMOBJ]: term.secureJsonify()
                }), postSendCallBack);
            });
        });
    }
}

function sendCluster(cid, client) {
    if (client.type === WEBCLIENT || client.type === TERMINAL) {
        Terminal.findOne({
            'cid': cid
        }, ['lamps']).populate('lamps').exec(function (err, terminal) {
            if (err) {
                log.error('[%s] Couldn\'t get cluster', client.username, {
                    stack: err.stack
                });
                return;
            }
            terminal.lamps.forEach(function (lamp) {
                if (client.type === WEBCLIENT) safeSend(client, makeStringMsg(LAMPOBJ, {
                    [LAMPOBJ]: lamp.jsonify()
                }), postSendCallBack);
                else if (client.type === TERMINAL) {
                    safeSend(client, makeStringTermMsg(LAMPOBJ, {
                        [LAMPOBJ]: lamp.jsonify()
                    }), postSendCallBack);
                }
            });
        });
    }
}

function removeTerminalsListener(client) {
    if (client === undefined) return;
    var index = terminalListeners.indexOf(client);
    if (index > -1) terminalListeners.splice(index, 1);
}

function removeClusterListener(cid, client) {
    if (!client || !clusterListeners[cid]) return;
    var index = clusterListeners[cid].indexOf(client);
    if (index > -1) clusterListeners[cid].splice(index, 1);
}

function removeSConfigListener(client) {
    if (!client) return;
    var index = serverConfigListeners.indexOf(client);
    if (index > -1) serverConfigListeners.splice(index, 1);
}

function removeUserStatusListener(client) {
    if (!client) return;
    var index = userStatusListeners.indexOf(client);
    if (index > -1) userStatusListeners.splice(index, 1);
}

function removeLogListener(client) {
    if (!client) return;
    var index = logListeners.indexOf(client);
    if (index > -1) logListeners.splice(index, 1);
}

function loadConfig(config, username) {
    config.terminals.forEach(function (terminal) {
        if (terminal.bri !== -1) {
            Terminal.findOne({
                cid: terminal.cid
            }, ['lamps'], function (err, cluster) {
                if (err) {
                    log.error('[%s] Couldn\'t get cluster %d', username, terminal.cid, {
                        stack: err.stack
                    });
                    return;
                }
                cluster.lamps.forEach(function (_id) {
                    Lamp.update({
                        _id: _id
                    }, {
                        bri: terminal.bri
                    });
                });
                toClusterListeners(terminal.cid, makeJsonMsg(CLUSOBJ, {
                    [CLUSOBJ]: {
                        cid: terminal.cid,
                        bri: terminal.bri
                    }
                }), true);
            });
        } else {
            terminal.lamps.forEach(function (lampObj) {
                lampObj.lamp.bri = lampObj.bri;
                lampObj.lamp.save();
                toClusterListeners(terminal.cid, makeJsonMsg(LAMPOBJ, {
                    [LAMPOBJ]: lampObj.lamp
                }), true);
            });
        }
    });
}
app.post('/dash/load', serverInOverride, function (req, res) {
    var action = req.body.submit,
        configID = req.body.configID,
        configName = req.body.configName;
    switch (action) {
    case 'Save':
        if (configName !== undefined && configName.length > 0) {
            log.info('[%s] Saved config %s', req.user.username, configName);
            saveCurrentConfig(configName, req.user.username);
            req.flash('msg', 'saved');
            res.redirect('/dash/load');
        } else {
            log.warn('[%s] Invalid config name %s', req.user.username, configName);
            req.flash('msg', 'Error');
            res.redirect('/dash/load');
        }
        break
    case 'Load':
        if (configID != undefined) {
            LampConfig.findOne({
                _id: configID
            }).populate('terminals.lamps.lamp').exec(function (err, config) {
                if (err) {
                    log.error('[%s] Couldn\'t find config %s', req.user.username, configID, {
                        stack: err.stack
                    })
                    req.flash('msg', 'Error')
                    res.redirect('/dash/load')
                } else {
                    log.info('[%s] loaded config %s', req.user.username, config.name)
                    req.flash('msg', 'Sent request')
                    res.redirect('/dash/load')
                    loadConfig(config, req.user.username)
                }
            })
        } else {
            log.warn('[%s] Invalid config ID %s', req.user.username, configID)
            req.flash('msg', 'Error')
            res.redirect('/dash/load')
        }
        break
    case 'Remove':
        var array = req.body.remove
        if (array != undefined && array.length > 0) {
            LampConfig.find({
                _id: {
                    $in: array
                }
            }, function (err, configs) {
                if (err) {
                    log.error('[%s] Couldn\'t find configs %s', req.user.username, array.toString())
                    req.flash('msg', 'Error')
                    res.redirect('/dash/load')
                } else {
                    configs.forEach(function (config) {
                        // fix me userDoc remove failure
                        config.remove(function (err) {
                            if (err) {
                                log.error('[%s] Error while removing config %s', req.user.username, config.name, {
                                    stack: err.stack
                                })
                            }
                        })
                    })
                    log.info('[%s] Removed configs %s', req.user.username, array.toString())
                    req.flash('msg', 'Removed')
                    res.redirect('/dash/load')
                }
            })
        } else {
            log.warn('[%s] Invalid config ID %s', req.user.username, configID)
            req.flash('msg', 'Error')
            res.redirect('/dash/load')
        }
        break
    default:
        log.warn('[%s] Invalid action %s', req.user.username, action)
        req.flash('msg', 'Error')
        res.redirect('/dash/load')
    }
})
app.get('/dash/map', userIsLoggedIn, function (req, res) {
    res.render('dash/map', {
        user: req.user.secureMiniJsonify(),
        server: sConfig.miniJsonify()
    })
})
app.get('/dash/admin', userIsAdmin, function (req, res) {
    res.render('dash/admin', {
        user: req.user.secureMiniJsonify(),
        sConfig: sConfig.secureJsonify()
    })
})
app.get('/dash/admin/create', userIsAdmin, function (req, res, next) {
    res.render('create', {
        errorMsg: req.flash('errorMsg'),
        successMsg: req.flash('successMsg')
    })
})
app.post('/dash/admin/create', userIsAdmin, function (req, res, next) {
    if (req.body.rpassword != undefined && req.body.password != undefined && req.body.username != undefined) {
        log.info('[%s] attempted create for %s', req.user.username, req.body.username)
        registerUser(req, function () {
            res.redirect('create')
        })
    } else {
        log.error('[%s] Invalid input for create %s', req.user.username, req.body.username)
        req.flash('errorMsg', 'Invalid Input')
        return res.redirect('create')
    }
})
app.get('/dash/admin/users', userIsAdmin, function (req, res, next) {
    User.find({}, ['username', 'admin', 'online'], function (err, users) {
        if (err) {
            log.error('[%s] Error getting users list', req.user.username, {
                stack: err.stack
            });
            return
        }
        res.render('dash/users', {
            user: req.user.secureMiniJsonify(),
            users: users
        })
    })
})
app.post('/dash/admin/users', userIsAdmin, function (req, res, next) {
    var array = req.body.deadmin
    if (array && array.length > 0) {
        User.update({
            username: {
                $in: array
            }
        }, {
            admin: false
        }, {
            multi: true
        }, function (err) {
            if (err) {
                log.error('[%s] Error while de-admining following %s', req.user.username, array.toString(), {
                    stack: err.stack
                })
            }
        })
    }
    if (array && array.length > 0) {
        log.info('[%s] de-admin following %s', req.user.username, array.toString())
    }
    array = req.body.admin
    if (array && array.length > 0) {
        User.update({
            username: {
                $in: array
            }
        }, {
            admin: true
        }, {
            multi: true
        }, function (err) {
            if (err) {
                log.error('[%s] Error while admining following %s', req.user.username, array.toString(), {
                    stack: err.stack
                })
            }
        })
    }
    if (array && array.length > 0) {
        log.info('[%s] admin following %s', req.user.username, array.toString())
    }
    array = req.body.remove
    if (array && array.length > 0) {
        User.find({
            username: {
                $in: array
            }
        }, function (err, users) {
            if (err) {
                log.error('[%s] Error while de-admining following %s', req.user.username, array.toString(), {
                    stack: err.stack
                })
                return
            }
            users.forEach(function (userDoc) {
                var username = userDoc.username
                userDoc.remove(function (err) {
                    if (err) {
                        log.error('[%s] Error while removing %s', req.user.username, username, {
                            stack: err.stack
                        })
                    }
                })
            })
        })
    }
    if (array && array.length > 0) {
        log.info('[%s] removing following %s', req.user.username, array.toString())
    }
    res.redirect('/dash/admin/users')
})
app.post('/register_device', function (req, res, next) {
    console.log(req.body);
    if (req.body.username != undefined && req.body.password != undefined && req.body.username.length > 0 && req.body.password.length > 0) {
        passport.authenticate('local-login', function (err, user, info) {
            if (err) {
                log.error('[%s] Passport error', req.body.username, {
                    stack: err.stack
                });
                res.end('service error');
                return;
            }
            if (!user) {
                log.warn('[%s] Auth failed for registerDevice', req.body.username);
                res.end('failed');
                return;
            }
            if (user.admin !== true) {
                log.warn('[%s] Unauthorised activity where admin needed', req.body.username);
                res.end('failed');
                return;
            }
            registerDevice(req, res);
        })(req, res, next)
    } else {
        res.end('failed');
    }
});
app.use(function (req, res, next) {
    var err = new Error('Not Found')
    err.status = 404
    next(err)
});
app.use(function (err, req, res, next) {
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};
    res.status(err.status || 500);
    res.render('error');
});

function registerDevice(req, res) {
    var dev = JSON.parse(req.body.dev);
    if (!dev.username.match(/^[0-9a-z]+$/)) {
        res.end('failed');
        return;
    }
    Terminal.findOne({
        cid: dev.cid
    }, function (err, terminal) {
        if (err) {
            log.error('[%s] Error checking terminals %s', req.body.username, dev.username, {
                stack: err.stack
            });
            res.end('failed');
            return;
        }
        if (!terminal) {
            log.warn('[%s] Attempt to register un-mapped terminal %s', req.body.username, dev.username);
            res.end('failed');
            return;
        }
        if (terminal.registered()) {
            log.warn('[%s] Attempt to register already registered device %s', req.body.username, dev.username);
            res.end('failed');
            return;
        }
        terminal.username = dev.username;
        terminal.password = terminal.generateHash(dev.password);
        terminal.enabled = true;
        // TODO Validate more
        terminal.save(function (err) {
            if (err) {
                log.error('[%s] Error saving new user %s', req.body.username, dev.username, {
                    stack: err.stack
                });
                res.end('failed');
                return;
            }
            log.info('[%s] Registered terminal %s', req.body.username, dev.username);
            res.end('success');
            toTerminalListeners(makeJsonMsg(TERMOBJ, {
                [TERMOBJ]: terminal.secureJsonify()
            }));
        });
    });
}

function registerUser(req, done) {
    var username = req.body.username
    var password = req.body.password
    if (!username.match(/^[0-9a-z]+$/)) {
        req.flash('errorMsg', 'Check username')
        done()
        return
    }
    if (password !== req.body.rpassword) {
        req.flash('errorMsg', 'Passwords don\'t match')
        done()
        return
    }
    User.findOne({
        'username': username
    }, function (err, user) {
        if (err) {
            log.error('[%s] Error checking for existing user %s', req.user.username, username, {
                stack: err.stack
            })
            req.flash('errorMsg', 'DB error')
            done()
            return
        }
        if (user) {
            req.flash('errorMsg', 'Username already taken')
            done()
            return
        }
        var newUser = new User()
        newUser.username = username
        newUser.password = newUser.generateHash(password)
        newUser.initialiseAndCheck()
        newUser.save(function (err) {
            if (err) {
                req.flash('errorMsg', 'DB error')
                log.error('[%s] Error saving new user %s', req.user.username, username, {
                    stack: err.stack
                })
            } else {
                req.flash('successMsg', 'Done!')
                log.info('[%s] Registered user %s', req.user.username, username);
            }
            done()
        })
    })
}
var debug = require('debug')('nodeserver:server')
var http = require('http');
var https = require('https');
var port = normalizePort(process.env.PORT || '80')
app.set('port', port)
var server = http.createServer(app);
https.createServer(options, app).listen(443);
server.listen(port)
server.on('error', onError)
server.on('listening', onListening)

function normalizePort(val) {
    var port = parseInt(val, 10)
    if (isNaN(port)) {
        return val
    }
    if (port >= 0) {
        return port
    }
    return false
}

function onError(error) {
    log.error('Error starting server', {
        stack: error.stack
    })
    if (error.syscall !== 'listen') {
        throw error
    }
    var bind = typeof port === 'string' ? 'Pipe ' + port : 'Port ' + port
    switch (error.code) {
    case 'EACCES':
        console.error(bind + ' requires elevated privileges')
        process.exit(1)
        break
    case 'EADDRINUSE':
        console.error(bind + ' is already in use')
        process.exit(1)
        break
    default:
        throw error
    }
}

function onListening() {
    var addr = server.address()
    var bind = typeof addr === 'string' ? 'pipe ' + addr : 'port ' + addr.port
    debug('Listening on ' + bind)
}
var schedule = require('node-schedule')
var WebSocketServer = require('ws').Server
var Url = require('url')
var wss = new WebSocketServer({
    server: server,
    path: '/'
})
//Module to give unique id to sockets v1 is timestamp based
var uuid = require('uuid/v1')
//Web clients by username(multiple connections supported)
var webClients = {};
//Terminal clients by cid
var terminalClients = {};
//Add user to webClients
function addUser(client) {
    if (!webClients.hasOwnProperty(client.username)) webClients[client.username] = {};
    webClients[client.username][client.id] = true;
    if (Object.keys(webClients[client.username]).length <= 1) {
        User.update({
            username: client.username
        }, {
            online: true
        }, function (err) {
            if (err) {
                log.error('[%s] Error updating user status', client.username, {
                    stack: err.stack
                });
            }
            userStatusListeners.forEach(function (lis) {
                safeSend(lis, makeStringMsg('userStatus', {
                    user: {
                        username: client.username,
                        online: true
                    }
                }), postSendCallBack);
            });
        });
    }
}

function removeUser(client) {
    removeTerminalsListener(client);
    removeClusterListener(client);
    removeSConfigListener(client);
    removeUserStatusListener(client);
    delete webClients[client.username][client.id];
    if (Object.keys(webClients[client.username]).length <= 0) {
        User.update({
            username: client.username
        }, {
            online: false
        }, function (err) {
            userStatusListeners.forEach(function (lis) {
                safeSend(lis, makeStringMsg('userStatus', {
                    user: {
                        username: client.username,
                        online: false
                    }
                }), postSendCallBack);
            });
        });
    }
}

function addTerminal(client) {
    rerouteMap[client.cid] = undefined;
    terminalClients[client.cid] = client;
}

function removeTerminal(client) {
    rerouteMap[client.cid] = client.fcid;
    removeClusterListener(client.cid, client);
    delete terminalClients[client.cid];
}

function onAuth(cred, client, pass, fail) {
    if (cred.type == TERMINAL) {
        var failedMsg = '[%s] Failed to auth terminal to socketServer',
            successMsg = '[%s] Terminal auth to socketServer';
        Terminal.findOne({
            username: cred.username
        }, ['password', 'cid', 'fcid'], function (err, terminal) {
            if (err) {
                log.error(failedMsg, cred.username, {
                    stack: err.stack
                });
                return fail(client);
            }
            if (!terminal || !terminal.validPassword(String(cred.password))) {
                log.warn(failedMsg, cred.username);
                return fail(client);
            }
            terminal.ip = cred.ip;
            terminal.status = TERM.ONLINE;
            terminal.save(err => {
                client.id = uuid();
                client.username = cred.username;
                client.cid = terminal.cid;
                client.type = cred.type;
                client.fcid = terminal.fcid;
                addTerminal(client);
                safeSend(client, makeStringMsg('auth', {
                    state: 'pass'
                }), postSendCallBack);
                let time = {
                    hour: moment().get('hour'),
                    minute: moment().get('minute')
                };
                time.minute = time.minute % 2 == 1 ? time.minute + 1 : time.minute;
                safeSend(client, makeStringTermMsg('sync', time));
                sendCluster(client.cid, client);
                toTerminalListeners(makeJsonMsg(TERMOBJ, {
                    [TERMOBJ]: terminal.secureJsonify()
                }));
                log.info(successMsg, client.username);
                return pass(client);
            });
        });
    } else if (cred.type == WEBCLIENT) {
        var failedMsg = '[%s] Failed to auth user to socketServer',
            successMsg = '[%s] User auth to socketServer'
        User.findOne({
            username: cred.username
        }, function (err, user) {
            if (err) {
                log.error(failedMsg, cred.username, {
                    stack: err.stack
                })
                return fail(client);
            }
            if (!user || !user.validToken(cred.token)) {
                log.warn(failedMsg, cred.username);
                return fail(client);
            }
            client.id = uuid();
            safeSend(client, makeStringMsg('auth', {
                state: 'pass'
            }), postSendCallBack);
            client.username = user.username;
            client.admin = user.admin;
            client.type = cred.type;
            addUser(client);
            log.info(successMsg, client.username);
            return pass(client);
        })
    }
}
wss.on('connection', function (client, req) {
    var cred = new Url.parse(req.url, true).query;
    var ip = getIpOfRequest(req);
    cred.ip = ip;
    onAuth(cred, client, function (client) {
        client.on('message', function (msg) {
            try {
                respond(JSON.parse(msg), client);
            } catch (err) {
                log.error('[%s] Failed to parse msg %s', cred.username, msg, {
                    stack: err.stack
                });
            }
        });
        client.on('close', function () {
            var index = serverConfigListeners.indexOf(client);
            if (index > -1) {
                serverConfigListeners.splice(index, 1);
            }
            if (client.type === WEBCLIENT) {
                removeUser(client);
            } else if (client.type === TERMINAL) {
                updateTerminalStatus(client.cid, TERM.OFFLINE);
                removeTerminal(client);
            }
            log.info('[%s] A %s disconnected', client.username, client.type);
        });
        client.on('error', function (e) {
            log.error('[%s] Socket on error', client.username, {
                stack: err.stack
            });
        });
    }, function (client) {
        safeSend(client, makeStringMsg('auth', {
            state: 'fail'
        }), err => {
            postSendCallBack(err)
            client.close();
        });
    });
})
var pingTimer;

function respond(msg, client) {
    switch (msg.type) {
    case 'emergency':
        Terminal.findOne({
                'cid': client.cid
            },['loc'], function (err, terminal) {
                if (err) {
                    log.error('[%s] Couldn\'t find terminal', client.username, {
                        stack: err.stack
                    });
                }
                var mailOptions = {
                    from: '"srinag s" <itguylab@gmail.com>',
                    to: 'srinagrao2007@gmail.com',
                    subject: `${msg.data.service} requested by Aadhar# ${msg.data.id}`,
                    html: `Send <strong>${msg.data.service}</strong> to terminal ${client.cid} (${terminal.loc.lat},${terminal.loc.lng}). \
                    Aadhar# ${msg.data.id} needs help! Click <a href='https://www.google.com/maps/dir/?api=1&destination=${terminal.loc.lat},${terminal.loc.lng}&travelmode=driving'>here</a> for directions.`
                };
                mailTrans.sendMail(mailOptions, function (error, info) {
                    if (error) {
                        return console.log(error);
                    }
                    console.log('Message sent: ' + info.response);
                });
            }
        );
    log.info('[%s] %s service requested', client.username, msg.data.service);
    break;
case 'bs':
    msg = parseByteStream(msg.data.bs);
    switch (msg.type) {
    case 'status':
        onRecievingLampStatus(msg.data[LAMPOBJ]);
        break;
    case 'termLampDisconnection':
        log.warn('Detected terminal lamp disconnection');
        rerouteMap[client.cid] = client.fcid;
        break;
    case 'termLampConnection':
        log.warn('Detected terminal lamp re-connection');
        rerouteMap[client.cid] = undefined;
        break;
    }
    break;
case 'ping':
    log.debug('[%s] Latency (%dms)', client.username, moment().valueOf() - pingTimer);
    break;
case 'addListener':
    switch (msg.data.loc) {
    case 'terminals':
        log.info('[%s] Listening to terminals', client.username);
        terminalListeners.push(client);
        sendTerminals(client);
        break;
    case 'lamps':
        if (client.type === TERMINAL && client.cid != msg.data.cid) return;
        if (msg.data.cid == undefined) {
            log.warn('[%s] Invalid msg', client.username, {
                msg: msg
            });
            break;
        }
        log.info('[%s] listening to cluster %s', client.username, msg.data.cid);
        if (clusterListeners.hasOwnProperty(msg.data.cid)) {
            clusterListeners[msg.data.cid].push(client);
        } else {
            clusterListeners[msg.data.cid] = [client];
        }
        sendCluster(msg.data.cid, client);
        break;
    case 'serverConfig':
        log.info('[%s] Listening to serverConfig', client.username);
        serverConfigListeners.push(client);
        safeSend(client, makeStringMsg('serverConfig', sConfig.miniJsonify()), postSendCallBack);
        break;
    case 'userStatus':
        log.info('[%s] Listening to userStatus', client.username);
        userStatusListeners.push(client);
        break;
    case 'logs':
        log.info('[%s] Listening to logs', client.username);
        logListeners.push(client);
        break;
    default:
        log.warn('[%s] Invalid msg', client.username, {
            msg: msg
        });
    }
    break
case 'removeListener':
    switch (msg.data.loc) {
    case 'terminals':
        log.info('[%s] Stopped listening to terminals', client.username);
        removeTerminalsListener(client);
        break;
    case 'lamps':
        if (msg.data.cid == undefined) {
            log.warn('[%s] Invalid msg %s', client.username, msg.toString());
            break;
        }
        log.info('[%s] Stopped listening to cluster %s', client.username, msg.data.cid);
        removeClusterListener(msg.data.cid, client);
        break;
    case 'serverConfig':
        log.info('[%s] Stopped listening to serverConfig', client.username);
        removeSConfigListener(client);
        break;
    case 'userStatus':
        log.info('[%s] Stopped listening to userStatus', client.username);
        removeUserStatusListener(client);
        break;
    case 'logs':
        removeLogListener(client);
        log.info('[%s] Stopped listening to logs', client.username);
        break;
    }
    break;
case 'addObj':
    if (sConfig.override !== true && client.admin !== true) {
        log.warn('[%s] Attempt to addObj without prev', client.username);
        break;
    }
    switch (msg.data.type) {
    case TERMOBJ:
        var newTerminal = new Terminal(msg.data.terminal);
        if (!newTerminal.initialiseAndCheck()) {
            log.warn('[%s] Attempt to add invalid obj', client.username, {
                msg: msg
            });
            safeSend(client, makeStringMsg('notify', {
                type: 'error',
                msg: "Coundn't add terminal"
            }), postSendCallBack);
            break;
        }
        newTerminal.save(function (err) {
            if (err) {
                log.error('[%s] Couldn\'t save terminal', client.username, {
                    stack: err.stack
                });
                safeSend(client, makeStringMsg('notify', {
                    type: 'error',
                    msg: 'Couldn\'t add terminal (Internal)'
                }), postSendCallBack);
            }
            clusterIds.push(newTerminal._id);
            log.info('[%s] Added a terminal %s', client.username, msg.data.terminal.cid);
            safeSend(client, makeStringMsg('notify', {
                type: 'info',
                msg: "Added terminal"
            }), postSendCallBack);
            toTerminalListeners(makeJsonMsg(TERMOBJ, {
                [TERMOBJ]: newTerminal.secureJsonify()
            }));
        });
        break;
    case LAMPOBJ:
        var newLamp = new Lamp(msg.data.lamp);
        if (!newLamp.initialiseAndCheck()) {
            log.warn('[%s] Attempt to add invalid obj', client.username, {
                msg: msg
            });
            safeSend(client, makeStringMsg('notify', {
                type: 'error',
                msg: 'Coundn\'t add lamp'
            }), postSendCallBack);
            break;
        }
        newLamp.save(function (err) {
            if (err) {
                log.error('[%s] Couldn\'t add lamp', client.username, {
                    stack: err.stack
                });
                safeSend(client, makeStringMsg('notify', {
                    type: 'error',
                    msg: 'Coundn\'t add lamp(Internal)'
                }), postSendCallBack);
                return;
            }
            Terminal.findOne({
                'cid': msg.data.lamp.cid
            }, ['lamps', 'head', 'tail'], function (err, terminal) {
                if (err) {
                    log.error('[%s] Couldn\'t add lamp', client.username, {
                        stack: err.stack
                    });
                    safeSend(client, makeStringMsg('notify', {
                        type: 'error',
                        msg: 'Coundn\'t add lamp(Internal)'
                    }), postSendCallBack);
                    return;
                }
                if (terminal.lamps.length === 0) terminal.head = newLamp._id;
                else {
                    Lamp.update({
                        _id: terminal.lamps[terminal.lamps.length - 1]
                    }, {
                        next: newLamp._id
                    }, {
                        upsert: true
                    }, err => {
                        if (err) log.error('[%s] Couldn\'t add lamp', client.username, {
                            stack: err.stack
                        });
                    });
                }
                terminal.lamps.push(newLamp._id);
                terminal.save(err => {
                    log.info('[%s] Added a lamp %d,%d', client.username, msg.data.lamp.cid, msg.data.lamp.lid);
                    safeSend(client, makeStringMsg('notify', {
                        type: 'success',
                        msg: 'Added lamp'
                    }), postSendCallBack);
                    toClusterListeners(newLamp.cid, makeJsonMsg(LAMPOBJ, {
                        [LAMPOBJ]: newLamp.jsonify()
                    }));
                    safeSendTerm(newLamp.cid, makeJsonMsg(LAMPOBJ, {
                        [LAMPOBJ]: newLamp.jsonify()
                    }));
                });
            });
        });
        break;
    }
    break;
case 'modObj':
    if (!sConfig.override && !client.admin) {
        log.warn('[%s] Attempt to modObj without prev', client.username)
        break
    }
    switch (msg.data.type) {
    case CLUSOBJ:
        var clus = msg.data.cluster
        Terminal.findOne({
            'cid': clus.cid,
        }).populate('lamps', ['bri']).exec(function (err, cluster) {
            if (err) {
                log.error('[%s] Couldn\'t mod obj', client.username, {
                    stack: err.stack
                });
                safeSend(client, makeStringMsg('notify', {
                    type: 'error',
                    msg: 'Internal error'
                }), postSendCallBack);
                return;
            }
            cluster.lamps.forEach(function (lamp) {
                lamp.bri = clus.bri;
                lamp.save();
            });
            log.info('[%s] Modified cluster %d to bri %d', client.username, msg.data.cluster.cid, msg.data.cluster.bri);
            safeSend(client, makeStringMsg('notify', {
                type: 'success',
                msg: 'Modified Cluster'
            }), postSendCallBack);
            toClusterListeners(msg.data.cluster.cid, makeJsonMsg(CLUSOBJ, {
                [CLUSOBJ]: msg.data.cluster
            }));
            safeSendTerm(msg.data.cluster.cid, makeJsonMsg(CLUSOBJ, {
                [CLUSOBJ]: msg.data.cluster
            }));
        });
        break;
    case 'serverConfig':
        var gConfig = new ServerConfig(msg.data.config);
        var up = {};
        if (gConfig.override === true || gConfig.override === false) {
            up['override'] = gConfig.override;
            sConfig.override = gConfig.override;
        }
        ServerConfig.update({}, {
            '$set': up
        }, {}, function (err) {
            if (err) {
                log.error('[%s] Couldn\'t mod objX', client.username, {
                    stack: err.stack
                });
                safeSend(client, makeStringMsg('notify', {
                    type: 'error',
                    msg: 'Internal error'
                }), postSendCallBack);
                return;
            }
            safeSend(client, makeStringMsg('notify', {
                type: 'success',
                msg: 'Updated override'
            }), postSendCallBack);
            serverConfigListeners.forEach(function (client) {
                safeSend(client, makeStringMsg('serverConfig', sConfig.miniJsonify()), postSendCallBack)
            });
        });
        break
    case LAMPOBJ:
        var lamp = new Lamp(msg.data.lamp);
        var up = {}
        if (lamp.status !== undefined) up.status = lamp.status;
        if (lamp.bri !== undefined) up.bri = lamp.bri;
        if (lamp.loc.lat !== undefined) {
            if (!up.loc) up.loc = {};
            up.loc.lat = lamp.loc.lat;
        }
        if (lamp.loc.lng !== undefined) {
            if (!up.loc) up.loc = {};
            up.loc.lng = lamp.loc.lng;
        }
        Lamp.findOneAndUpdate({
            'cid': lamp.cid,
            'lid': lamp.lid
        }, up, {
            new: true
        }, function (err, lamp) {
            // console.log(lampi)
            if (err) {
                log.error('[%s] Couldn\'t mod obj', client.username, {
                    stack: err.stack
                })
                safeSend(client, makeStringMsg('notify', {
                    type: 'error',
                    msg: 'Internal error'
                }), postSendCallBack)
                return
            }
            log.info('[%s] Modified lamp %d,%d to bri %d', client.username, lamp.cid, lamp.lid, lamp.bri);
            safeSend(client, makeStringMsg('notify', {
                type: 'success',
                msg: 'Modified lamp'
            }), postSendCallBack)
            toClusterListeners(lamp.cid, makeJsonMsg(LAMPOBJ, {
                [LAMPOBJ]: lamp.miniJsonify()
            }));
            safeSendTerm(lamp.cid, makeJsonMsg(LAMPOBJ, {
                [LAMPOBJ]: lamp.miniJsonify()
            }));
        });
        break;
    }
    break;
}
}

function safeSendTerm(cid, jsonMsg) {
    let final_cid = rerouteMap[cid] === undefined ? cid : rerouteMap[cid];
    let client = terminalClients[final_cid];
    if (client == undefined) return;
    jsonMsg.rerouted = final_cid !== cid;
    let msg = JSON.stringify({
        type: 'bs',
        bs: makeBits(jsonMsg)
    });
    try {
        client.send(msg);
    } catch (err) {
        if (client.type == TERMINAL) removeTerminal(client);
    }
}

function safeSend(client, msg) {
    if (client == undefined) return;
    try {
        client.send(msg);
    } catch (err) {
        if (client.type == TERMINAL) removeTerminal(client);
        else if (client.type == WEBCLIENT) removeUser(client);
    }
}

function parseByteStream(byteStream) {
    let bitStream = '';
    let tmp = byteStream.split(' ');
    for (let i in tmp) bitStream += nBit(tmp[i], 7);
    let jmsg = {};
    switch (bitStream.substring(0, 5)) {
    case '00010':
    case '00011':
        jmsg.type = 'status';
        jmsg.data = {
            type: LAMPOBJ,
            [LAMPOBJ]: {
                iid: parseInt(bitStream.substr(5, 10), 2),
                on: bitStream.substr(15, 1) === '0' ? false : true,
                bri: parseInt(bitStream.substr(16, 2), 2)
            }
        };
        break;
    case '10011':
        jmsg.type = 'status';
        jmsg.data = {
            type: LAMPOBJ,
            [LAMPOBJ]: {
                iid: parseInt(bitStream.substr(5, 10), 2)
            }
        };
        break;
    case '00111':
        jmsg.type = 'termLampDisconnection';
        break;
    case '01111':
        jmsg.type = 'termLampConnection';
        break;
    }
    return jmsg;
}
//-------------------------------------------------------------------------------------
schedule.scheduleJob({
    hour: 1,
    minute: 0,
    second: 0
}, function () {
    LampConfig.findOne({
        name: 'midnyt'
    }).populate('terminals.lamps.lamp').exec(function (err, config) {
        if (err) {
            log.error('[%s] Couldn\'t find config %s', AUTO, config.name, {
                stack: err.stack
            })
            return
        }
        log.info('[%s] loaded config %s', AUTO, config.name);
        loadConfig(config, AUTO)
    })
})
var timeTime = {
    hour: '*',
    minute: '*/2',
    second: '0'
}
// `${timeTime.second} ${timeTime.minute} ${timeTime.hour} * * 1,3,5 *`
schedule.scheduleJob(`${timeTime.second} ${timeTime.minute} ${timeTime.hour} * * * *`, function () {
    let msg = makeJsonMsg('sync', {
        hour: moment().get('hour'),
        minute: moment().get('minute')
    });
    for (var cid in terminalClients) safeSendTerm(cid, msg);
    log.info('[%s] Sync terminal clocks', AUTO)
});
var clusterIdIndex = 0,
    clusterIds = [],
    nextLampId, currentLamp, clusterFine, currentCluster;
// Loads all cluster _ids in to array clusterIds
function loadAllClusterIds(callback) {
    Terminal.find({}, '_id', function (err, clusters) {
        if (err) {
            log.error('[%s] Couldn\'t get clusterIds', AUTO, {
                stack: err.stack
            });
            return;
        }
        // Map array of objects containing _id field to array of _id
        clusterIds = clusters.map(obj => obj._id);
        process.nextTick(callback);
    });
}
// Loads _id of lamps of next cluster
function loadHeadOfNextCluster() {
    prevLampTimedOut = false;
    if (clusterIdIndex >= clusterIds.length) {
        clusterIdIndex = 0;
        setTimeout(() => process.nextTick(loadHeadOfNextCluster), sConfig.delayBetweenStatusChecks);
        return;
    }
    Terminal.findOne({
        _id: clusterIds[clusterIdIndex++]
    }, ['head', 'cid', 'fcid', 'status'], function (err, cluster) {
        if (err) {
            log.error('[%s] Couldn\'t get cluster', AUTO, {
                stack: err.stack
            });
            setTimeout(() => process.nextTick(loadHeadOfNextCluster), sConfig.delayBetweenClusterStatusChecks);
            return;
        }
        if (cluster.status === TERM.UNREG) {
            process.nextTick(loadHeadOfNextCluster);
            return;
        }
        log.debug('[%s] Checking cluster %d', AUTO, cluster.cid);
        if (!terminalClients.hasOwnProperty(cluster.cid)) {
            updateTerminalStatus(cluster.cid, TERM.OFFLINE);
            rerouteMap[cluster.cid] = cluster.fcid;
            if (cluster.fcid == undefined || !terminalClients.hasOwnProperty(cluster.fcid)) {
                setTimeout(() => process.nextTick(loadHeadOfNextCluster), sConfig.delayBetweenClusterStatusChecks);
                return;
            }
        }
        safeSend(terminalClients[cluster.cid], makeStringMsg('ping'));
        pingTimer = moment().valueOf();
        nextLampId = cluster.head;
        currentCluster = cluster;
        clusterFine = true;
        setTimeout(() => process.nextTick(askStatusOfNextLamp), sConfig.delayBetweenLampStatusChecks);
    });
}
var timeoutTimer;

function markLampDisconnected(id) {
    if (!id) return;
    Lamp.findOneAndUpdate({
        _id: id
    }, {
        status: LAMP.DISCONNECTED
    }, {
        new: true
    }, function (err, lamp) {
        if (err) return;
        if (clusterListeners.hasOwnProperty(lamp.cid)) {
            var msg = makeStringMsg(LAMPOBJ, {
                [LAMPOBJ]: lamp.miniJsonify()
            });
            clusterListeners[lamp.cid].forEach(function (client) {
                if (client.type === WEBCLIENT) safeSend(client, msg, postSendCallBack);
            });
        }
        markLampDisconnected(lamp.next);
    });
}
var startTime = 0,
    prevLampTimedOut = false;

function onLampTimeout(lamp) {
    var fcid = rerouteMap[lamp.cid];
    var fclient = fcid != undefined ? terminalClients[fcid] : undefined;
    if (terminalClients[lamp.cid] === undefined && fclient === undefined) {
        currentLamp = undefined;
        nextLampId = undefined;
        setTimeout(function () {
            process.nextTick(loadHeadOfNextCluster);
        }, sConfig.delayBetweenClusterStatusChecks);
        log.warn('[%s] Terminal disconnected while checking %d', AUTO, lamp.cid);
        return;
    }
    log.warn('[%s] Timedout lamp %d->%d', AUTO, lamp.cid, lamp.lid);
    lamp = currentLamp;
    clusterFine = false;
    if (lamp.status != LAMP.DISCONNECTED) {
        lamp.status = LAMP.DISCONNECTED;
        lamp.save(function (err) {
            if (clusterListeners.hasOwnProperty(lamp.cid)) {
                var msg = makeStringMsg(LAMPOBJ, {
                    [LAMPOBJ]: lamp.miniJsonify()
                });
                clusterListeners[lamp.cid].forEach(function (client) {
                    if (client.type === WEBCLIENT) safeSend(client, msg, postSendCallBack);
                });
            }
        });
        if (rerouteMap[lamp.cid] === undefined) updateTerminalStatus(lamp.cid, TERM.FAULTYLAMP);
    }
    if (prevLampTimedOut) {
        currentLamp = undefined;
        nextLampId = undefined;
        markLampDisconnected(lamp.next);
        setTimeout(function () {
            process.nextTick(loadHeadOfNextCluster);
        }, sConfig.delayBetweenClusterStatusChecks);
    } else {
        prevLampTimedOut = true;
        nextLampId = currentLamp.next;
        currentLamp = undefined;
        setTimeout(() => process.nextTick(askStatusOfNextLamp), sConfig.delayBetweenLampStatusChecks);
    }
}

function askStatusOfNextLamp() {
    if (nextLampId == undefined) {
        // End of cluster check
        if (rerouteMap[currentCluster.cid] === undefined) {
            if (clusterFine) updateTerminalStatus(currentCluster.cid, TERM.ONLINESYNCED);
            else updateTerminalStatus(currentCluster.cid, TERM.FAULTYLAMP);
        } else {
            if (terminalClients[currentCluster.cid] === undefined) updateTerminalStatus(currentCluster.cid, TERM.OFFLINE);
            else updateTerminalStatus(currentCluster.cid, TERM.FAULTYLAMP);
        }
        setTimeout(() => process.nextTick(loadHeadOfNextCluster), sConfig.delayBetweenClusterStatusChecks);
        currentCluster = undefined;
        return;
    }
    Lamp.findOne({
        _id: nextLampId
    }, function (err, lamp) {
        if (err) {
            log.error('[%s] Couldn\'t get lamp', AUTO, {
                stack: err.stack
            });
            return;
        }
        log.info('[%s] Checking lamp %d->%d', AUTO, lamp.cid, lamp.lid);
        startTime = moment().valueOf();
        safeSendTerm(lamp.cid, makeJsonMsg('status', {
            [LAMPOBJ]: lamp.jsonify()
        }), postSendCallBack);
        currentLamp = lamp;
        timeoutTimer = setTimeout(function () {
            onLampTimeout(lamp);
        }, sConfig.timeoutTimeForLampStatusCheck);
    });
}
var dayStartTime = '08:00:00',
    dayEndTime = '17:00:00',
    dayTime = dayStartTime < myTimeStamp().substr(-8, 8) && myTimeStamp().substr(-8, 8) < dayEndTime;
schedule.scheduleJob(`08 00 00 * * * *`, function () {
    dayTime = true;
})
schedule.scheduleJob(`17 00 00 * * * *`, function () {
    dayTime = false;
})

function onRecievingLampStatus(gotLamp) {
    if (currentLamp == undefined || gotLamp.iid != currentLamp.iid) return;
    clearTimeout(timeoutTimer);
    prevLampTimedOut = false;
    var latency = moment().valueOf() - startTime;
    Lamp.findOne({
        _id: nextLampId
    }, function (err, lamp) {
        if (err) {
            log.error('[%s] Couldn\'t get lamp', AUTO, {
                stack: err.stack
            });
            return;
        }
        if (gotLamp.on === undefined) {
            onLampTimeout(lamp);
            return;
        } else if (gotLamp.bri != lamp.bri || dayTime && gotLamp.on && lamp.bri != 0) {
            log.debug('[AUTO] Got status(%d) of lamp %d,%d (%dms)', gotLamp.bri, lamp.cid, lamp.lid, latency);
            clusterFine = false;
            safeSendTerm(lamp.cid, makeJsonMsg(LAMPOBJ, {
                [LAMPOBJ]: lamp.miniJsonify()
            }));
            if (lamp.status != LAMP.FAULTY) {
                lamp.status = LAMP.FAULTY;
                lamp.save(function (err) {
                    if (err) {
                        return;
                    }
                    if (clusterListeners.hasOwnProperty(lamp.cid)) {
                        clusterListeners[lamp.cid].forEach(function (client) {
                            if (client.type === WEBCLIENT) {
                                safeSend(client, JSON.stringify(makeJsonMsg(LAMPOBJ, {
                                    [LAMPOBJ]: lamp.miniJsonify()
                                })), postSendCallBack);
                            }
                        });
                    }
                })
            }
        } else {
            log.debug('[AUTO] Got status of lamp %d,%d (%dms)', lamp.cid, lamp.lid, latency);
            if (lamp.status != LAMP.FINE) {
                lamp.status = LAMP.FINE;
                lamp.save(function (err) {
                    if (err) {
                        return;
                    }
                    toClusterListeners(lamp.cid, makeJsonMsg(LAMPOBJ, {
                        [LAMPOBJ]: lamp.miniJsonify()
                    }));
                });
            }
        }
        nextLampId = lamp.next;
        setTimeout(() => process.nextTick(askStatusOfNextLamp), sConfig.delayBetweenLampStatusChecks);
    });
}

function updateTerminalStatus(cid, status) {
    Terminal.findOne({
        cid: cid
    }, ['cid', 'status'], function (err, terminal) {
        if (err) {
            log.error('[%s] Couldn\'t update terminal status', AUTO, {
                stack: err.stack
            });
        } else {
            if (terminal.status == status) {
                return;
            }
            terminal.status = status;
            terminal.save(function (err) {
                if (err) {
                    log.error('[%s] Couldn\'t save terminal status', AUTO, {
                        stack: err.stack
                    });
                }
                toTerminalListeners(makeJsonMsg(TERMOBJ, {
                    [TERMOBJ]: terminal.secureJsonify()
                }));
            });
        }
    });
}
// Autoexes
// registerUser({body:{username:'admin',password:'pass',rpassword:'pass'},user:{username:'AUTO'}, flash:function(msg){}},function(){})
respond({
    type: 'emergency',
    data: {
        service: 'ambulance',
        id: 'meow'
    }
}, {
    cid: 1,
    username: 'term1'
});
