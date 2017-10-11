var statusDelay = -1
    //Don't exit on error
process.on('uncaughtException', function (err) {
    console.log(err.stack)
})
var express = require('express')
var path = require('path')
var favicon = require('serve-favicon')
var morgan = require('morgan')
var cookieParser = require('cookie-parser')
var bodyParser = require('body-parser')
var mongoose = require('mongoose')
var passport = require('passport')
var flash = require('connect-flash')
var validator = require('express-validator')
    //TODO find storage for session
var session = require('express-session')
var crypto = require('crypto')
var winston = require('winston')
var moment = require('moment-timezone');
moment.tz('Asia/Kolkata').format()
myTimeStamp = function () {
        return new Date().toLocaleString('en-GB', {
            timezone: 'Asia/Kolkata'
        })
    }
    //Log to console and server.log
    //TODO custom level to log error.stack
var log = new(winston.Logger)({
        transports: [
      new(winston.transports.Console)({
                timestamp: myTimeStamp
                , colorize: true
            })
      , new(winston.transports.File)({
                filename: 'server.log'
                , timestamp: myTimeStamp
            })
    ]
    })
    //Don't exit on error
log.exitOnError = false
log.info('Started Server')
    //Connect Mongoose to MongoDB
mongoose.Promise = global.Promise
var dbConfig = require(path.join(__dirname, 'config', 'database.js'))
    //todo handle db connect
mongoose.connect(dbConfig.url, {
        useMongoClient: true
    }, function (err) {
        if (err) {
            log.error('Couldn\'t connect to DB at %s', dbConfig.url, {
                stack: err.stack
            })
        }
    })
    //Configure Passport
require(path.join(__dirname, 'config', 'passport'))(passport)
var app = express()
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'pug')
app.use(favicon(path.join(__dirname, 'public', 'images', 'favicon.ico')))
    //app.use(morgan('dev'))
app.use(bodyParser.urlencoded({
    extended: true
}))
app.use(bodyParser.json())
app.use(validator())
app.use(cookieParser())
app.use(express.static(path.join(__dirname, 'public')))
app.use(session({
    secret: 'gFiwkbvvwk62KU3ZHgrk'
    , resave: false
    , saveUninitialized: false
    , cookie: {
        maxAge: 7200000
    }
}))
app.use(flash())
app.use(passport.initialize())
app.use(passport.session())
    //Router
app.get('/', function (req, res, next) {
    res.render('home', {
        isAuth: req.isAuthenticated()
    })
})
app.get('/report', function (req, res, next) {
    res.render('report', {
        isAuth: req.isAuthenticated()
    })
})
app.get('/about', function (req, res, next) {
    res.render('about', {
        isAuth: req.isAuthenticated()
    })
})
app.get('/login', function (req, res, next) {
    res.render('login', {
        errorMsg: req.flash('errorMsg')
        , successMsg: req.flash('successMsg')
        , isAuth: req.isAuthenticated()
    })
})
app.post('/login', function (req, res, next) {
    if (req.body.username != undefined && req.body.password != undefined && req.body.username.length > 0 && req.body.password.length > 0) {
        passport.authenticate('local-login', function (err, user, info) {
            if (err) {
                log.error('[%s] Passport error', req.body.username, {
                    stack: err.stack
                })
                res.redirect('login')
                return
            }
            if (!user) {
                log.warn('[%s] Auth failed', req.body.username)
                req.flash('errorMsg', info.errorMsg)
                res.redirect('login')
                return
            }
            req.logIn(user, function (err) {
                if (err) {
                    log.error('[%s] Passport login error', req.body.username, {
                        stack: err.stack
                    })
                    res.redirect('login')
                    return
                }
                log.info('[%s] Logged in', req.body.username)
                res.cookie('token', info.token, {
                    maxAge: 7200000
                })
                res.cookie('username', user.username, {
                    maxAge: 7200000
                })
                res.redirect('dash')
            })
        })(req, res, next)
    }
    else {
        log.warn('[%s] Invalid input to login form', req.body.username != undefined ? req.body.username : '')
        req.flash('errorMsg', 'Invalid Creds')
        res.redirect('login')
    }
})
app.get('/logout', isLoggedIn, function (req, res) {
    var username = req.user.username
    User.findOneAndUpdate({
        username: username
    }, {
        token: ''
    }, function (err) {
        if (err) {
            log.error('[%s] Logout error', username, {
                stack: err.stack
            })
            req.flash('errorMsg', 'Logout failed')
            res.redirect('/login')
        }
        else {
            log.info('[%s] Logged out', username)
            req.logout()
            req.flash('successMsg', 'Logout success')
            res.cookie('token', '', {})
            res.cookie('username', '', {})
            res.redirect('/login')
        }
    })
})
app.get('/dash', isLoggedIn, function (req, res) {
    res.render('dash/dash', {
        user: {
            username: req.user.username
            , admin: req.user.admin
        }
    })
})
app.get('/dash/logs', isAdmin, function (req, res) {
    var hours
    switch (req.query.period) {
    case '1':
    case '6':
    case '24':
    case '48':
        hours = Number(req.query.period)
        break
    default:
        hours = 6
    }
    var levels, level
    switch (req.query.level) {
    case 'all':
        levels = {
            info: true
            , error: true
        }
        level = 'all'
        break
    case 'info':
        levels = {
            info: true
        }
        level = 'info'
        break
    case 'error':
        levels = {
            error: true
        }
        level = 'error'
        break
    default:
        levels = {
            info: true
            , error: true
        }
        level = 'all'
    }
    var options = {
        from: new Date - hours * 60 * 60 * 1000
        , until: new Date
        , limit: 100
        , order: 'desc'
    }
    log.query(options, function (err, results) {
        if (err) {
            log.error('[%s] Log query error', req.user.username)
            return
        }
        //Todo Better level selection
        logs = []
        results.file.forEach(function (log) {
            if (levels[log.level]) {
                logs.push(log)
            }
        })
        res.render('dash/logs', {
            user: {
                username: req.user.username
                , admin: req.user.admin
            }
            , vars: {
                period: hours
                , level: level
            }
            , logs: logs
        })
    })
})
app.get('/dash/load', ifOverride, function (req, res) {
    LampConfig.find({}, ['name', '_id'], function (err, configs) {
        if (err) {
            log.error('[%s] Error getting configs', req.user.username, {
                stack: err.stack
            })
            return
        }
        res.render('dash/load', {
            user: {
                username: req.user.username
                , admin: req.user.admin
            }
            , configs: configs
            , msg: req.flash('msg')
        })
    })
})
app.post('/dash/load', ifOverride, function (req, res) {
    var action = req.body.submit
    switch (action) {
    case 'Save':
        var configName = req.body.configName
        if (configName != undefined && configName.length > 0) {
            log.info('[%s] Saved config %s', req.user.username, configName)
            saveCurrentConfig(configName, req.user.username)
            req.flash('msg', 'Saved')
            res.redirect('/dash/load')
        }
        else {
            log.warn('[%s] Invalid config name %s', req.user.username, configName)
            req.flash('msg', 'Error')
            res.redirect('/dash/load')
        }
        break
    case 'Load':
        var configID = req.body.configID
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
                }
                else {
                    log.info('[%s] loaded config %s', req.user.username, config.name)
                    req.flash('msg', 'Sent request')
                    res.redirect('/dash/load')
                    loadConfig(config, req.user.username)
                }
            })
        }
        else {
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
                }
                else {
                    configs.forEach(function (config) {
                        //fix me userDoc remove failure
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
        }
        else {
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
app.get('/dash/map', isLoggedIn, function (req, res) {
    res.render('dash/map', {
        user: {
            username: req.user.username
            , admin: req.user.admin
        }
        , server: {
            override: sConfig.override
        }
    })
})
app.get('/dash/admin', isAdmin, function (req, res) {
    res.render('dash/admin', {
        user: {
            username: req.user.username
            , admin: req.user.admin
        }
    })
})
app.get('/dash/admin/create', isAdmin, function (req, res, next) {
    res.render('create', {
        errorMsg: req.flash('errorMsg')
        , successMsg: req.flash('successMsg')
    })
})
app.post('/dash/admin/create', isAdmin, function (req, res, next) {
    if (req.body.rpassword != undefined && req.body.password != undefined && req.body.username != undefined) {
        log.info('[%s] attempted create for %s', req.user.username, req.body.username)
        create(req, function () {
            res.redirect('create')
        })
    }
    else {
        log.error('[%s] Invalid input for create %s', req.user.username, req.body.username)
        req.flash('errorMsg', 'Invalid Input')
        return res.redirect('create')
    }
})
app.get('/dash/admin/users', isAdmin, function (req, res, next) {
    User.find({}, ['username', 'admin', 'online'], function (err, users) {
        if (err) {
            log.error('[%s] Error getting users list', req.user.username, {
                stack: err.stack
            })
            return
        }
        res.render('dash/users', {
            user: {
                username: req.user.username
                , admin: req.user.admin
            }
            , users: users
        })
    })
})
app.post('/dash/admin/users', isAdmin, function (req, res, next) {
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
app.use(function (req, res, next) {
    var err = new Error('Not Found')
    err.status = 404
    next(err)
})
app.use(function (err, req, res, next) {
    res.locals.message = err.message
    res.locals.error = req.app.get('env') === 'development' ? err : {}
    res.status(err.status || 500)
    res.render('error')
})

function isLoggedIn(req, res, next) {
    if (req.isAuthenticated()) return next()
    var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress
    log.warn('[%s] Unauthorised activity where loggin needed', ip)
    res.redirect('/')
}

function ifOverride(req, res, next) {
    if (req.isAuthenticated() && (req.user.admin || sConfig.override)) return next()
    var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress
    log.warn('[%s] Unauthorised activity where override needed', req.isAuthenticated() ? req.user.username : ip)
    if (req.isAuthenticated()) {
        res.redirect('/dash')
    }
    else {
        res.redirect('/')
    }
}

function isAdmin(req, res, next) {
    if (req.isAuthenticated() && req.user.admin) return next()
    var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress
    log.warn('[%s] Unauthorised activity where admin needed', req.isAuthenticated() ? req.user.username : ip)
    if (req.isAuthenticated()) {
        res.redirect('/dash')
    }
    else {
        res.redirect('/')
    }
}
create = function (req, done) {
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
            newUser.setDefaultRight()
            newUser.username = username
            newUser.password = newUser.generateHash(password)
            newUser.save(function (err) {
                if (err) {
                    req.flash('errorMsg', 'DB error')
                    log.error('[%s] Error saving new user %s', req.user.username, username, {
                        stack: err.stack
                    })
                }
                else {
                    req.flash('successMsg', 'Done!')
                }
                done()
            })
        })
    }
    //------------------------------------------------------------------------------------------------------------
var debug = require('debug')('nodeserver:server')
var http = require('http')
var port = normalizePort(process.env.PORT || '80')
app.set('port', port)
var server = http.createServer(app)
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
//-----------------------------------------------------------------------------------------
var schedule = require('node-schedule')
var WebSocketServer = require('ws').Server
var Parent = require('./models/parent.js')
var LampCluster = require('./models/lampCluster.js')
var Lamp = require('./models/lamp.js')
var User = require('./models/user.js')
var ServerConfig = require('./models/serverConfig.js')
var Url = require('url')
    //Find last saved server config
var sConfig
ServerConfig.findOne({}, function (err, config) {
        if (err) {
            log.error('Couldn\'t find any server config')
            sConfig = {
                override: false
            }
            return
        }
        sConfig = config
    })
    //Make all users offline
User.update({}, {
        online: false
    }, {
        multi: true
    }, function (err) {})
    //FIX ME Check if client is connected
var wss = new WebSocketServer({
    server: server
    , path: '/'
})
const webDebug = 'webDebug'
    , terminal = 'terminal'
    //Module to give unique id to sockets v1 is timestamp based
var uuid = require('uuid/v1')
    //Web clients by username(multiple connections supported)
var webClients = {}
    //Terminal clients by cid
var terminalClients = {}
    //Add user to webClients
addUser = function (client) {
    if (!webClients.hasOwnProperty(client.username)) {
        webClients[client.username] = {}
    }
    webClients[client.username][client.id] = true
    if (Object.keys(webClients[client.username]).length <= 1) {
        User.update({
            username: client.username
        }, {
            online: true
        }, function (err) {
            if (err) {
                log.error('[%s] Error updating user status', client.username, {
                    stack: err.stack
                })
            }
        })
        userStatusListeners.forEach(function (lis) {
            lis.send(makeMsg('userStatus', {
                username: client.username
                , online: true
            }), postSendCallBack)
        })
    }
}
removeUser = function (client) {
    delete webClients[client.username][client.id]
    if (Object.keys(webClients[client.username]).length <= 0) {
        User.update({
            username: client.username
        }, {
            online: false
        }, function (err) {})
        userStatusListeners.forEach(function (lis) {
            lis.send(makeMsg('userStatus', {
                username: client.username
                , online: false
            }), postSendCallBack)
        })
    }
}
addTerminal = function (client) {
    terminalClients[client.cid] = client
}
removeTerminal = function (client) {
    removeLampClusterListener(client.cid, client)
    delete terminalClients[client.cid]
}
wss.on('connection', function (client, req) {
        var cred = new Url.parse(req.url, true).query
        var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress
        ip = ip.split(':')
        ip = ip[ip.length - 1]
        User.findOne({
            username: cred.username
        }, function (err, user) {
            if (err) {
                log.error('[%s] Failed to find user for soc auth', cred.username, {
                    stack: err.stack
                })
                return
            }
            if (!user) {
                log.warn('[%s] Failed to find user for soc auth', cred.username)
                return
            }
            if (user.validToken(cred.token)) {
                client.id = uuid()
                client.send(makeMsg('auth', {
                    state: 'pass'
                }), postSendCallBack)
                if (cred.type === webDebug) {
                    client.username = user.username
                    client.admin = user.admin
                    client.type = cred.type
                    addUser(client)
                }
                else if (cred.type === terminal) {
                    client.username = 'cid : ' + cred.cid
                    client.cid = cred.cid
                    client.type = cred.type
                    Parent.findOneAndUpdate({
                        cid: cred.cid
                    }, {
                        $set: {
                            ip: ip
                            , status: parentOnline
                        }
                    }, {
                        new: true
                    }, function (err, parent) {
                        if (err) {
                            log.error('[%s] Couldn\'t update ip of terminal', client.username, {
                                stack: err.stack
                            })
                        }
                        else {
                            sendToAllTerminalListeners(makeMsg('parent', parent.JSONify()))
                        }
                    })
                    addTerminal(client)
                }
                log.info(`[%s] A %s connected`, client.username, client.type)
                client.on('message', function (msg) {
                    try {
                        respond(JSON.parse(msg), client)
                    }
                    catch (err) {
                        log.error('[%s] Failed to parse msg %s', cred.username, msg, {
                            stack: err.stack
                        })
                    }
                })
                client.on('close', function () {
                    var index = serverConfigListeners.indexOf(client)
                    if (index > -1) {
                        serverConfigListeners.splice(index, 1)
                    }
                    if (client.type === webDebug) {
                        removeUser(client)
                    }
                    else if (client.type === terminal) {
                        updateParentStatus(client.cid, parentOffline)
                        removeTerminal(client)
                    }
                    log.info('[%s] A %s disconnected', client.username, client.type)
                })
                client.on('error', function (e) {
                    log.error('[%s] Socket on error', client.username, {
                        stack: err.stack
                    })
                })
            }
            else {
                log.error('[%s] soc auth failed for %s', cred.username, cred.type)
                client.close()
            }
        })
    })
    //Clients listening to status of all terminals
var terminalListeners = []
    //Clients listening to cluster by cid
var clusterListeners = {}
var serverConfigListeners = []
var userStatusListeners = []
respond = function (msg, client) {
    switch (msg.type) {
    case 'bs':
        msg = parseBitStream(msg.data.bs)
        switch (msg.type) {
        case 'status':
            step4(msg.data)
            break
        }
        break
    case 'addListener':
        switch (msg.data.loc) {
        case 'parents':
            terminalListeners.push(client)
            sendAllParentsTo(client)
            break
        case 'lamps':
            if (msg.data.cid == undefined) {
                log.warn('[%s] Invalid msg', client.username, {
                    msg: msg
                })
                break
            }
            if (clusterListeners.hasOwnProperty(msg.data.cid)) {
                clusterListeners[msg.data.cid].push(client)
            }
            else {
                clusterListeners[msg.data.cid] = [client]
            }
            sendLampsByCidTo(msg.data.cid, client)
            break
        case 'serverConfig':
            serverConfigListeners.push(client)
            client.send(makeMsg('serverConfig', sConfig.JSONify()), postSendCallBack)
            break
        case 'userStatus':
            userStatusListeners.push(client)
            break
        default:
            log.warn('[%s] Invalid msg', client.username, {
                msg: msg
            })
        }
        break
    case 'removeListener':
        switch (msg.data.loc) {
        case 'parents':
            removeParentListener(client)
            break
        case 'lamps':
            if (msg.data.cid == undefined) {
                log.warn('[%s] Invalid msg %s', client.username, msg.toString())
                break
            }
            removeLampClusterListener(msg.data.cid, client)
            break
        case 'serverConfig':
            removeSConfigListener(client)
            break
        case 'userStatus':
            removeUserStatusListener(client)
            break
        }
        break
    case 'addObj':
        if (sConfig.override !== true && client.admin !== true) {
            log.warn('[%s] Attempt to addObj without prev', client.username)
            break
        }
        switch (msg.data.type) {
        case 'parent':
            var p = new Parent(msg.data.obj)
            if (!p.valid()) {
                log.warn('[%s] Attempt to add invalid obj', client.username, {
                    msg: msg
                })
                client.send(makeMsg('addError', {
                    msg: 'Invalid Input'
                }), postSendCallBack)
                break
            }
            p.save(function (err) {
                if (err) {
                    log.error('[%s] Couldn\'t save parent', client.username, {
                        stack: err.stack
                    })
                    client.send(makeMsg('addError', {
                        msg: 'Internal error'
                    }), postSendCallBack)
                    return
                }
                var lc = new LampCluster({
                    'cid': p.cid
                })
                lc.save(function (err) {
                    if (err) {
                        log.error('[%s] Couldn\'t save parent', client.username, {
                            stack: err
                        })
                    }
                })
                client.send(makeMsg('addSuccess', {}), postSendCallBack)
                sendToAllTerminalListeners(makeMsg('parent', p.JSONify()))
            })
            break
        case 'lamp':
            var l = new Lamp(msg.data.obj)
            if (!l.valid()) {
                log.warn('[%s] Attempt to add invalid obj', client.username, {
                    msg: msg
                })
                client.send(makeMsg('addError', {
                    msg: 'Invalid Input'
                }), postSendCallBack)
                break
            }
            l.save(function (err) {
                if (err) {
                    log.error('[%s] Couldn\'t add lamp', client.username, {
                        stack: err.stack
                    })
                    client.send(makeMsg('addError', {
                        msg: 'Internal error'
                    }), postSendCallBack)
                    return
                }
                LampCluster.update({
                    'cid': msg.data.obj.cid
                }, {
                    $push: {
                        'lamps': l._id
                    }
                }, {
                    safe: true
                    , upsert: true
                    , new: true
                }, function (err) {
                    if (err) {
                        log.error('[%s] Couldn\'t add lamp', client.username, {
                            stack: err.stack
                        })
                        client.send(makeMsg('addError', {
                            msg: 'Internal error'
                        }), postSendCallBack)
                        return
                    }
                    client.send(makeMsg('addSuccess', {}), postSendCallBack)
                    sendToAllClusterListeners(l.cid, jMakeMsg('lamp', l.JSONify()))
                })
            })
            break
        }
        break
    case 'modObj':
        if (!sConfig.override && !client.admin) {
            log.warn('[%s] Attempt to modObj without prev', client.username)
            break
        }
        switch (msg.data.type) {
        case 'lamp':
            var lamp = new Lamp(msg.data.obj)
            Lamp.update({
                cid: lamp.cid
                , lid: lamp.lid
            }, {
                $set: {
                    bri: lamp.bri
                    , status: lamp.status
                }
            }, {}, function (err) {
                if (err) {
                    log.error('[%s] Couldn\'t mod obj', client.username, {
                        stack: err.stack
                    })
                    client.send(makeMsg('addError', {
                        msg: 'Internal error'
                    }), postSendCallBack)
                }
                else {
                    client.send(makeMsg('modSuccess', {}), postSendCallBack)
                    sendToAllClusterListeners(lamp.cid, jMakeMsg('lamp', lamp.JSONify()))
                    log.info('[%s] Modified lamp : cid %d lid %d to bri %d', client.username, lamp.cid, lamp.lid, lamp.bri)
                }
            })
            break
        }
        break
    case 'modObjX':
        if (!sConfig.override && !client.admin) {
            log.warn('[%s] Attempt to modObjX without prev', client.username)
            break
        }
        switch (msg.data.type) {
        case 'cluster':
            var clus = msg.data.obj
            LampCluster.findOne({
                'cid': clus.cid
            , }).populate('lamps', ['bri']).exec(function (err, cluster) {
                if (err) {
                    log.error('[%s] Couldn\'t mod obj', client.username, {
                        stack: err.stack
                    })
                    client.send(makeMsg('modError', {
                        msg: 'Internal error'
                    }), postSendCallBack)
                    return
                }
                cluster.lamps.forEach(function (lamp) {
                    lamp.bri = clus.bri
                    lamp.save()
                })
                sendToAllClusterListeners(msg.data.obj.cid, jMakeMsg('cluster', {
                    obj: msg.data.obj
                }))
            })
            break
        case 'serverConfig':
            var gConfig = new ServerConfig(msg.data.config)
            var up = {}
            if (gConfig.override === true || gConfig.override === false) {
                up['override'] = gConfig.override
                sConfig.override = gConfig.override
            }
            ServerConfig.update({}, {
                '$set': up
            }, {}, function (err) {
                if (err) {
                    log.error('[%s] Couldn\'t mod objX', client.username, {
                        stack: err.stack
                    })
                    client.send(makeMsg('modError', {
                        msg: 'Internal error'
                    }), postSendCallBack)
                    return
                }
                client.send(makeMsg('modSuccess', {}), postSendCallBack)
                serverConfigListeners.forEach(function (client) {
                    client.send(makeMsg('serverConfig', sConfig), postSendCallBack)
                })
            })
            break
        case 'lamp':
            var lamp = new Lamp(msg.data.obj)
            var up = {}
            if (lamp.status !== null) {
                up['lamps.$.status'] = lamp.status
            }
            if (lamp.bri !== null) {
                up['lamps.$.bri'] = lamp.bri
            }
            if (lamp.loc.lat !== null) {
                up['lamps.$.loc.lat'] = lamp.loc.lat
            }
            if (lamp.loc.lng !== null) {
                up['lamps.$.loc.lng'] = lamp.loc.lng
            }
            Lamp.update({
                'cid': lamp.cid
                , 'lid': lamp.lid
            }, up, {}, function (err) {
                if (err) {
                    log.error('[%s] Couldn\'t mod objX', client.username, {
                        stack: err.stack
                    })
                    client.send(makeMsg('addError', {
                        msg: 'Internal error'
                    }), postSendCallBack)
                    return
                }
                client.send(makeMsg('modSuccess', {}), postSendCallBack)
                sendToAllClusterListeners(lamp.cid, jMakeMsg('lamp', lamp.JSONify()))
            })
            break
        }
        break
    }
}
to_nBit = function (num, n) {
    var ret = []
    for (var i = 0; i < n; ++i) {
        ret.push((num % 2 === 1) ? '1' : '0')
        num = Math.floor(num / 2)
    }
    return ret.reverse().join('')
}
toBitStream = function (msg) {
    bStream = ''
    switch (msg.type) {
        //override
    case 'lamp':
        bStream += '10000'
        bStream += to_nBit(msg.data.iid, 10)
        bStream += '0'
        bStream += to_nBit(msg.data.bri, 2)
        bStream += to_nBit(0, 11)
        break
        //sync
    case 'sync':
        bStream += '01000'
        bStream += to_nBit(0, 10)
        bStream += '0'
        bStream += to_nBit(0, 2)
        bStream += to_nBit(msg.data.hour, 5)
        bStream += to_nBit(msg.data.minute, 6)
        break
        //broadcast
    case 'cluster':
        bStream += '00100'
        bStream += to_nBit(0, 10)
        bStream += '0'
        bStream += to_nBit(msg.data.obj.bri, 2)
        bStream += to_nBit(0, 11)
        break
        //status
    case 'status':
        bStream += '00010'
        bStream += to_nBit(msg.data.iid, 10)
        bStream += '0'
        bStream += to_nBit(0, 13)
        break
    }
    return makeMsg('bs', {
        bs: bStream
    })
}
parseBitStream = function (msg) {
    jmsg = {}
    switch (msg.substr(0, 5)) {
    case '00010':
        jmsg.type = 'status'
        jmsg.data = {
            iid: parseInt(msg.substr(5, 10), 2)
            , bri: parseInt(msg.substr(15, 2), 2)
        }
        break
    }
    return jmsg
}
sendToAllClusterListeners = function (cid, msg) {
    if (clusterListeners.hasOwnProperty(cid)) {
        clusterListeners[cid].forEach(function (client) {
            if (client.type == terminal) {
                client.send(toBitStream(msg), postSendCallBack)
            }
            else {
                client.send(JSON.stringify(msg), postSendCallBack)
            }
        })
    }
}
sendToAllTerminalListeners = function (msg) {
    terminalListeners.forEach(function (client) {
        client.send(msg, postSendCallBack)
    })
}
sendAllParentsTo = function (client) {
    Parent.find({}, function (err, parents) {
        if (err) {
            log.error('[%s] Couldn\'t get parents', client.username, {
                stack: err.stack
            })
        }
        parents.forEach(function (parent) {
            client.send(makeMsg('parent', parent), postSendCallBack)
        })
    })
}
sendLampsByCidTo = function (cid, client) {
    LampCluster.findOne({
        'cid': cid
    }).populate('lamps').exec(function (err, lampC) {
        if (err) {
            log.error('[%s] Couldn\'t get cluster', client.username, {
                stack: err.stack
            })
        }
        lampC.lamps.forEach(function (lamp) {
            if (client.type === webDebug) client.send(makeMsg('lamp', lamp), postSendCallBack)
            else if (client.type == terminal) client.send(toBitStream(jMakeMsg('lamp', lamp)), postSendCallBack)
        })
    })
}
postSendCallBack = function (err) {
    if (err) {
        log.error('[] Couldn\'t send msg', {
            stack: err.stack
        })
    }
}
jMakeMsg = function (type, data) {
    return {
        type: type
        , data: data
    }
}
makeMsg = function (type, data) {
    return JSON.stringify({
        type: type
        , data: data
    })
}
removeParentListener = function (client) {
    if (client == undefined || terminalListeners == undefined) {
        return
    }
    var index = terminalListeners.indexOf(client)
    if (index > -1) {
        terminalListeners.splice(index, 1)
    }
}
removeLampClusterListener = function (cid, client) {
    if (client == undefined || clusterListeners == undefined || clusterListeners[cid] == undefined) {
        return
    }
    var index = clusterListeners[cid].indexOf(client)
    if (index > -1) {
        clusterListeners[cid].splice(index, 1)
    }
}
removeSConfigListener = function (client) {
    if (client == undefined || serverConfigListeners == undefined) {
        return
    }
    var index = serverConfigListeners.indexOf(client)
    if (index > -1) {
        serverConfigListeners.splice(index, 1)
    }
}
removeUserStatusListener = function (client) {
    if (client == undefined || userStatusListeners == undefined) {
        return
    }
    var index = userStatusListeners.indexOf(client)
    if (index > -1) {
        userStatusListeners.splice(index, 1)
    }
}
var LampConfig = require('./models/lampConfig.js')
saveCurrentConfig = function (name, username) {
    var config = {
        name: name
        , author: username
    }
    config.terminals = []
    LampCluster.find({}).populate('lamps').exec(function (err, clusters) {
        if (err) {
            log.error('[%s] Couldn\'t get current config %s', username, name, {
                stack: err.stack
            })
            return
        }
        clusters.forEach(function (cluster) {
            var mini = true
                , commonBri = null
                , foo = []
            cluster.lamps.forEach(function (lamp) {
                foo.push({
                    lamp: lamp._id
                    , bri: lamp.bri
                })
                if (commonBri === null) {
                    commonBri = lamp.bri
                }
                else {
                    if (commonBri !== lamp.bri) {
                        mini = false
                    }
                }
            })
            if (mini) {
                config.terminals.push({
                    cid: cluster.cid
                    , bri: commonBri
                    , lamps: []
                })
            }
            else {
                config.terminals.push({
                    cid: cluster.cid
                    , bri: -1
                    , lamps: foo
                })
            }
        })
        config = new LampConfig(config)
        config.save(function (err) {
            if (err) {
                log.error('[%s] Couldn\'t save config %s', username, name, {
                    stack: err.stack
                })
            }
        })
    })
}
loadConfig = function (config, username) {
        config.terminals.forEach(function (terminal) {
            if (terminal.bri !== -1) {
                LampCluster.findOne({
                    cid: terminal.cid
                }).populate('lamps').exec(function (err, cluster) {
                    if (err) {
                        log.error('[%s] Couldn\'t get cluster', username, {
                            stack: err.stack
                        })
                        return
                    }
                    cluster.lamps.forEach(function (lamp) {
                        lamp.bri = terminal.bri
                        lamp.save()
                    })
                    sendToAllClusterListeners(terminal.cid, jMakeMsg('cluster', {
                        obj: {
                            cid: terminal.cid
                            , bri: terminal.bri
                        }
                    }))
                })
            }
            else {
                terminal.lamps.forEach(function (lampObj) {
                    lampObj.lamp.bri = lampObj.bri
                    lampObj.lamp.save()
                    sendToAllClusterListeners(terminal.cid, jMakeMsg('lamp', lampObj.lamp))
                })
            }
        })
    }
    //-------------------------------------------------------------------------------------
const auto = 'AUTO'
schedule.scheduleJob({
    hour: 21
    , minute: 55
}, function () {
    LampConfig.findOne({
        name: 'midnyt'
    }).populate('terminals.lamps.lamp').exec(function (err, config) {
        if (err) {
            log.error('[%s] Couldn\'t find config %s', auto, config.name, {
                stack: err.stack
            })
            return
        }
        log.info('[%s] loaded config %s', auto, config.name)
        loadConfig(config, auto)
    })
})
timeTime = {
        hour: '*'
        , minute: '*'
        , second: 0
    }
    //`${timeTime.second} ${timeTime.minute} ${timeTime.hour} * * 1,3,5 *`
schedule.scheduleJob(`${timeTime.second} ${timeTime.minute} ${timeTime.hour} * * * *`, function () {
    var bStream = toBitStream(jMakeMsg('sync', {
        hour: moment().get('hour')
        , minute: moment().get('minute')
            //        hour: timeTime.hour
            //        , minute: timeTime.minute
    }))
    for (var cid in terminalClients) {
        if (terminalClients.hasOwnProperty(cid)) {
            terminalClients[cid].send(bStream, postSendCallBack)
        }
    }
    log.info('[%s] sent time to all terminals', auto)
})
const parentOffline = 1
    , parentOnlineSynced = 0
    , parentHasFaultyLamp = 2
    , parentOnline = 3
var doneSysCheck = true
var clusterIds = []
    , currentLamp, clusterFine
step1 = function () {
    if (doneSysCheck == false) {
        return
    }
    doneSysCheck = false
        //get all clusterIds
    LampCluster.find({}, [], function (err, gClusters) {
        if (err) {
            log.error('[%s] Couldn\'t get clusterIds', auto, {
                stack: err.stack
            })
            return
        }
        gClusters.forEach(function (cluster) {
            clusterIds.push(cluster._id)
        })
    })
    process.nextTick(step2)
}
if (statusDelay != -1) {
    setInterval(step1, statusDelay)
}
var lampIds = []
step2 = function () {
    if (clusterIds.length <= 0) {
        doneSysCheck = true
        return
    }
    var id = clusterIds.pop()
    LampCluster.findOne({
        _id: id
    }, function (err, cluster) {
        if (err) {
            log.error('[%s] Couldn\'t get cluster', auto, {
                stack: err.stack
            })
            return
        }
        if (terminalClients[cluster.cid] == undefined) {
            updateParentStatus(cluster.cid, parentOffline)
            process.nextTick(step2)
            return
        }
        else {
            clusterFine = true
            lampIds = cluster.lamps
            lampIds.reverse()
            process.nextTick(step3)
        }
    })
}
var timer
step3 = function () {
    if (lampIds.length <= 0) {
        process.nextTick(step2)
        return
    }
    Lamp.findOne({
        _id: lampIds[lampIds.length - 1]
    }, function (err, lamp) {
        if (err) {
            log.error('[%s] Couldn\'t get lamp', auto, {
                stack: err.stack
            })
            return
        }
        terminalClients[lamp.cid].send(toBitStream(jMakeMsg('status', lamp.JSONify())), postSendCallBack)
        currentLamp = lamp
        timer = setTimeout(function () {
            updateParentStatus(lamp.cid, parentOffline)
            currentLamp = undefined
            process.nextTick(step2)
        }, 5000)
    })
}
const lampDisconnected = 1
    , lampFaulty = 2
    , lampFine = 0
step4 = function (gotLamp) {
    if (currentLamp == undefined || gotLamp.iid != currentLamp.iid) {
        return
    }
    clearTimeout(timer)
    Lamp.findOne({
        _id: lampIds.pop()
    }, function (err, lamp) {
        if (err) {
            log.error('[%s] Couldn\'t get lamp', auto, {
                stack: err.stack
            })
            return
        }
        if (gotLamp.iid != lamp.iid) {}
        else if (gotLamp.bri != lamp.bri) {
            clusterFine = false
            if (lamp.status != lampFaulty) {
                lamp.status = lampFaulty
                lamp.save(function (err) {
                    if (err) {
                        return
                    }
                    sendToAllClusterListeners(lamp.cid, jMakeMsg('lamp', lamp.mJSONify()))
                })
            }
        }
        else {
            if (lamp.status != lampFine) {
                lamp.status = lampFine
                lamp.save(function (err) {
                    if (err) {
                        return
                    }
                    sendToAllClusterListeners(lamp.cid, jMakeMsg('lamp', lamp.mJSONify()))
                })
            }
        }
        if (lampIds.length <= 0) {
            if (clusterFine) {
                updateParentStatus(lamp.cid, parentOnlineSynced)
            }
            else {
                updateParentStatus(lamp.cid, parentHasFaultyLamp)
            }
        }
        process.nextTick(step3)
    })
}
updateParentStatus = function (cid, status) {
        Parent.findOne({
            cid: cid
        }, function (err, parent) {
            if (err) {
                log.error('[%s] Couldn\'t update parent status', auto, {
                    stack: err.stack
                })
            }
            else {
                if (parent.status == status) {
                    return
                }
                parent.status = status
                parent.save(function (err) {
                    if (err) {
                        log.error('[%s] Couldn\'t save parent status', auto, {
                            stack: err.stack
                        })
                    }
                })
                sendToAllTerminalListeners(makeMsg('parent', parent.JSONify()))
            }
        })
    }
    // create({body:{username:'master',password:'pass',rpassword:'pass'},flash:function(s){}}, function(){
    // })