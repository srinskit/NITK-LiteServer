$(document).ready(function () {
    startWS()
    $(window).bind('beforeunload', removeListenersBeforeClose)
})
google.charts.load('current', {
    'packages': ['corechart']
});
google.charts.setOnLoadCallback(drawChart);
var chartAPIinit = false,
    auth = false;

function drawLampChart(stats) {
    if (chartAPIinit == false) return;
    let arrData = [
        ['Status of lamp', 'Number of lamps']
    ];
    for (let key in stats) arrData.push([key, stats[key]]);
    var data = google.visualization.arrayToDataTable(arrData);
    var options = {
        // title: 'Lamp status',
        legend: 'left',
        height: 400,
        width: 500,
        is3D: true
    };
    var lampChart = new google.visualization.PieChart(document.getElementById('lampStatusChart'));
    lampChart.draw(data, options);
}

function drawTermChart(stats) {
    if (chartAPIinit == false) return;
    let arrData = [
        ['Status of term', 'Number of terms']
    ];
    for (let key in stats) arrData.push([key, stats[key]]);
    var terminalStatus = new google.visualization.PieChart(document.getElementById('terminalStatusChart'));
    terminalStatus.draw(google.visualization.arrayToDataTable(arrData), {
        legend: 'left',
        height: 400,
        width: 500,
        is3D: true
    });
}
// var powerArrData = [
//     ['Time', 'Power']
// ];
// var powerCount = 0;
//
// function drawPowerChart(stats, powerConstants) {
//     if (chartAPIinit == false) return;
//     powerCount++;
//     let power = 0;
//     power += powerConstants[0] * stats['bri0'];
//     power += powerConstants[1] * stats['bri1'];
//     power += powerConstants[2] * stats['bri2'];
//     power += powerConstants[3] * stats['bri3'];
//     let foo = ['FAULTY', 'DISCONNECTED', 'UNKNOWN', 'CONNECTED_NOSTATUS'];
//     for (let key in foo) power += powerConstants[1] * stats[foo[key]];
//     powerArrData.push([powerCount, power]);
//     var powerChart = new google.visualization.LineChart(document.getElementById('powerDataChart'));
//     powerChart.draw(google.visualization.arrayToDataTable(powerArrData), {
//         curveType: 'line',
//         height: 400,
//         width: 1200,
//         legend: {
//             position: 'bottom'
//         }
//     });
// }

function drawPowerChart(arr) {
    if (chartAPIinit == false) return;
    let arrData = [
        ['Time', 'Power']
    ];
    for (let i in arr) arrData.push([i, arr[i]]);
    var powerChart = new google.visualization.LineChart(document.getElementById('powerDataChart'));
    powerChart.draw(google.visualization.arrayToDataTable(arrData), {
        curveType: 'line',
        height: 400,
        width: 1200,
        legend: {
            position: 'bottom'
        }
    });
}

function drawPollChart(arr) {
    if (chartAPIinit == false) return;
    let arrData = [
        ['Time', 'Pollution']
    ];
    for (let i in arr) arrData.push([i, arr[i]]);
    var pollChart = new google.visualization.LineChart(document.getElementById('pollDataChart'));
    pollChart.draw(google.visualization.arrayToDataTable(arrData), {
        curveType: 'line',
        height: 400,
        width: 1200,
        legend: {
            position: 'bottom'
        }
    });
}

function drawChart() {
    console.log('chartInit');
    chartAPIinit = true;
    if (auth === true) {
        wsoc.send(makeMsg('stat', {
            query: 'lampStatus'
        }));
        wsoc.send(makeMsg('stat', {
            query: 'termStatus'
        }));
    }
}
var wsoc;
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
    new_uri += '?type=webclient' + '&username=' + username + '&token=' + token;
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
process = function (data) {
    // console.log(data)
    switch (data.type) {
    case 'auth':
        if (data.data.state === 'pass') {
            auth = true;
            wsoc.send(makeMsg('addListener', {
                loc: 'serverConfig'
            }));
            if (chartAPIinit) {
                wsoc.send(makeMsg('stat', {
                    query: 'lampStatus'
                }));
                wsoc.send(makeMsg('stat', {
                    query: 'termStatus'
                }));
            }
        } else {
            alert('Auth error! Try logging in again')
        }
        break;
    case 'stat':
        switch (data.data.type) {
        case 'powerStatus':
            drawPowerChart(data.data.data);
            break;
        case 'pollStatus':
            drawPollChart(data.data.data);
            break;
        case 'lampStatus':
            drawLampChart(data.data.data);
            // drawPowerChart(data.data.data, data.data.powerConstants);
            break;
        case 'termStatus':
            drawTermChart(data.data.data);
            break;
        }
        break;
    case 'serverConfig':
        if (data.data.override == true) {
            $('.onOverride').show()
        } else {
            $('.onOverride').hide()
        }
        break;
    }
}
setInterval(function () {
    wsoc.send(makeMsg('stat', {
        query: 'lampStatus'
    }));
    wsoc.send(makeMsg('stat', {
        query: 'termStatus'
    }));
    wsoc.send(makeMsg('stat', {
        query: 'pollStatus'
    }));
    wsoc.send(makeMsg('stat', {
        query: 'powerStatus'
    }));
}, 1000);
removeListenersBeforeClose = function () {
    wsoc.send(makeMsg('removeListener', {
        'loc': 'serverConfig'
    }))
}
