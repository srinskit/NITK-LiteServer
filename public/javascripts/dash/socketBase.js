$(document).ready(function () {
    startWS()
})
var wsoc
startWS = function () {
    var loc = window.location,
        new_uri,
        username = readCookie('username'),
        token = readCookie('token')
    if (loc.protocol === 'https:') {
        new_uri = 'wss:';
    } else {
        new_uri = 'ws:';
    }
    new_uri += '//' + loc.host + '/';
    new_uri += '?type=webDebug' + '&username=' + username + '&token=' + token;
    wsoc = new WebSocket(new_uri)
    wsoc.onopen = function (event) {
        wsoc.onmessage = function (event) {
            process(JSON.parse(event.data))
        }
        wsoc.onerror = function (event) {
            console.log(event.data)
            alert('Error connecting to Websocket')
        }
    }
    makeMsg = function (type, data) {
        return JSON.stringify({
            type: type,
            data: data
        })
    }
}
//from : https://www.quirksmode.org/js/cookies.html
function createCookie(name, value, days) {
    if (days) {
        var date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        var expires = "; expires=" + date.toGMTString();
    } else var expires = "";
    document.cookie = name + "=" + value + expires + "; path=/";
}

function readCookie(name) {
    var nameEQ = name + "=";
    var ca = document.cookie.split(';');
    for (var i = 0; i < ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0) == ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
}

function eraseCookie(name) {
    createCookie(name, "", -1);
}
