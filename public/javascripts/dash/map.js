jQuery(function ($) {
    // Asynchronously Load the map API
    var script = document.createElement('script');
    script.src = '//maps.googleapis.com/maps/api/js?key=AIzaSyCT2IciRf75Y52RKEFWuZKpMzF3Vg9Qr_k&callback=initialize';
    document.body.appendChild(script);
    $(window).bind('beforeunload', removeListenersBeforeClose);
});
var LAMPOBJ = 'lamp',
    TERMOBJ = 'terminal',
    CLUSOBJ = 'cluster';
var terminals = {},
    clusters = {};
var map, bounds;
var addMarker;
const intIconRoot = '/images/';
var terminalStatusIcon = ['term_connectedsynced.png', 'term_connected.png', 'term_faultylamp.png', 'term_notconnected.png', 'term_unknown.png'];
var terminalStatusText = ['Connected, synced', 'Connected, waiting sync', 'Connected, lamp faulty', 'Disconnected', 'Unknown'];
var LampStatus = {
    FINE: 0,
    FAULTY: 1,
    DISCONNECTED: 2,
    UNKNOWN: 3
};
var LampStatusIcon = ['', 'lamp_faulty.png', 'lamp_notconnected.png', 'lamp_unknown.png'];
var LampBrightnessIcon = ['yellow_0.png', 'yellow_1.png', 'yellow_2.png', 'yellow_3.png']
var LampStatusText = ['Connected, fine', 'Connected, faulty', 'Disconnected', 'Unknown'];
var isShowingLamps = {};

function initialize() {
    var mapOptions = {
        mapTypeId: 'roadmap',
        center: {
            'lat': 13.01081,
            'lng': 74.794128
        },
        zoom: 18,
        fullscreenControl: false
    };
    // Display a map on the page
    map = new google.maps.Map(document.getElementById('map'), mapOptions);
    if (user.admin) google.maps.event.addListener(map, 'rightclick', rightClickListener);
    startWS();
    $(document).on("keypress", function (e) {
        var char = String.fromCharCode(e.which);
        if (char === 'f' || char === 'F') {
            var cid = prompt('Enter CID');
            if (cid && cid.length > 0 && terminals[cid]) map.panTo(terminals[cid].marker.getPosition());
            else alert('Not found :(');
        }
    });
}
var rightClickListener = function (event) {
    if (addMarker !== undefined) {
        if (addMarker.infoWindow.isOpen) {
            addMarker.infoWindow.close()
        }
        addMarker.setMap(null)
    }
    var marker = new google.maps.Marker({
        position: new google.maps.LatLng(event.latLng.lat(), event.latLng.lng()),
        map: map
    })
    var iaddNewContent = `<div id='addDiv'> <div id='idInputs'> <input name='iIID' type='number' placeholder='IID' /> \
<br> <input name='iCID' type='number' placeholder='CID' /> <br> <input name='iLID' type='number' placeholder='LID'\
/> <br> </div> <br> <input type='button' value='Add' name='addButton' style='float:right'> <label> <input type='radi\
o' name='iType' value='${LAMPOBJ}' checked>Lamp</label> <label><input type='radio' name='iType' value='${TERMOBJ}'>Term</l\
abel> <style>#addDiv #idInputs input{box-sizing:border-box;width:100%} </style> </div>`
    marker.infoWindow = new google.maps.InfoWindow({
        content: iaddNewContent
    });
    marker.infoWindow.open(map, marker)
    marker.infoWindow.isOpen = true
    google.maps.event.addListener(marker.infoWindow, 'domready', function () {
        $('#addDiv input[name="iType"]').click(function () {
            $('#addDiv input[name=iLID]').prop('disabled', this.value === TERMOBJ);
        });
        $('#addDiv input[name="addButton"]').on('click', function () {
            var data = {
                type: $('#addDiv input[name="iType"]:checked').val()
            };
            data[data.type] = {
                iid: $('#addDiv [name="iIID"]').val(),
                cid: $('#addDiv [name="iCID"]').val(),
                lid: data.type === TERMOBJ ? undefined : $('#addDiv [name="iLID"]').val(),
                loc: {
                    lat: event.latLng.lat(),
                    lng: event.latLng.lng()
                }
            };
            wsoc.send(makeMsg('addObj', data));
            addMarker.setMap(null);
        })
    })
    google.maps.event.addListener(marker.infoWindow, 'closeclick', function () {
        marker.infoWindow.isOpen = false
        marker.setMap(null)
    })
    addMarker = marker
}
var wsoc
startWS = function () {
    var loc = window.location,
        new_uri, username = user.username,
        token = readCookie('token')
    if (loc.protocol === 'https:') {
        new_uri = 'wss:'
    } else {
        new_uri = 'ws:'
    }
    new_uri += '//' + loc.host + '/'
    new_uri += `?type=webclient&username=${username}&token=${token}`
    wsoc = new WebSocket(new_uri)
    wsoc.onopen = function (event) {
        wsoc.onmessage = function (event) {
            try {
                process(JSON.parse(event.data))
            } catch (e) {
                console.log(e)
            } finally {}
        }
        wsoc.onerror = function (event) {
            console.log(event.data)
            // alert('Error connecting to Websocket')
        }
    }
}

function makeMsg(type, data) {
    return JSON.stringify({
        type: type,
        data: data
    });
}

function smallLamp(lamp) {
    return {
        cid: lamp.cid,
        lid: lamp.iid,
        bri: lamp.bri
    }
}
process = function (msg) {
    console.log(msg)
    switch (msg.type) {
    case TERMOBJ:
        updateTerminal(msg.data[TERMOBJ])
        break
    case LAMPOBJ:
        updateLamp(msg.data[LAMPOBJ])
        break
    case CLUSOBJ:
        updateCluster(msg.data[CLUSOBJ])
        break
    case 'auth':
        if (msg.data.state == 'pass') {
            wsoc.send(makeMsg('addListener', {
                'loc': 'terminals'
            }))
            wsoc.send(makeMsg('addListener', {
                loc: 'serverConfig'
            }))
        } else {
            // alert('Auth error! Try logging in again')
        }
        break
    case 'serverConfig':
        if (msg.data.override === true) {
            $('.onOverride').show();
            if (!user.admin) google.maps.event.addListener(map, 'rightclick', rightClickListener);
        } else if (msg.data.override === false) {
            $('.onOverride').hide();
            if (!user.admin) google.maps.event.clearListeners(map, 'rightclick');
        }
        if (msg.data.override != null) {
            server.override = msg.data.override;
            if (selectedTerminalMarker) $(`#infoTerm${selectedTerminalMarker.cid} select[name="bri"]`).prop('disabled', !server.override);
            if (selectedLampMarker) $(`#infoLamp${selectedLampMarker.cid},${selectedLampMarker.lid} select[name="bri"]`).prop('disabled', !server.override);
        }
        break;
    case 'notify':
        pushMsg(msg.data);
        break;
    }
}
var selectedTerminalMarker;

function updateTerminal(terminal) {
    if (!terminal.cid) return;
    myTerm = terminals[terminal.cid];
    var props = ['loc', 'iid', 'status', 'ip'];
    var applyChange = {
        'loc': function (term) {
            term.marker.setPosition(new google.maps.LatLng(term.loc.lat, term.loc.lng));
        },
        'iid': function (term) {
            if (term.marker.infoWindow) $(`#infoTerm${term.cid} label[name='iid']`).text(`IID : ${term.iid}`);
        },
        'status': function (term) {
            term.marker.setTitle(`${term.cid.toString()} | ${terminalStatusText[term.status]}`);
            term.marker.setIcon(intIconRoot + terminalStatusIcon[term.status]);
            if (term.marker.infoWindow) $(`#infoTerm${term.cid} label[name='status']`).text(`Status : ${terminalStatusText[term.status]}`);
        },
        'ip': function (term) {
            if (term.marker.infoWindow) $(`#infoTerm${term.cid} label[name='ip']`).text(`IP : ${term.ip}`);
        }
    };
    if (!myTerm) {
        myTerm = {}
        for (var i = 0; i < props.length; ++i) {
            if (!terminal.hasOwnProperty(props[i])) {
                // Todo: Ask server to send entire obj
                return;
            }
            myTerm[props[i]] = terminal[props[i]];
        }
        if (!terminal.loc.lat || !terminal.loc.lng || !terminal.cid) return;
        myTerm.cid = terminal.cid;
        marker = myTerm.marker = new google.maps.Marker({
            position: new google.maps.LatLng(myTerm.loc.lat, myTerm.loc.lng),
            map: map,
            title: `${myTerm.cid.toString()} | ${terminalStatusText[myTerm.status]}`,
            icon: intIconRoot + terminalStatusIcon[myTerm.status],
        });
        marker.cid = myTerm.cid;
        google.maps.event.addListener(marker, 'click', (function (myTerm) {
            return function () {
                marker = myTerm.marker;
                if (marker.hasOwnProperty('infoWindow')) {
                    marker.infoWindow.close();
                    delete marker.infoWindow;
                    return;
                }
                marker.infoWindow = new google.maps.InfoWindow({
                    content: `<div style="font-size:large" id="infoTerm${myTerm.cid}"> <label>CID: ${myTerm.cid}</label> <label name="iid" style="float:right;">IID: ${myTerm.iid}</label>` + `<br> <label name='status'>Status: ${terminalStatusText[myTerm.status]}</label> <br> <label name='ip'>IP: ${myTerm.ip} </label><br> <div >` + `Set brightness: <select name="bri" style="float:right;"> <option value="-1" selected> </option> <option val` + `ue="0">0</option> <option value="1">1</option> <option value="2">2</option> <option value="3">3</option> </select> </div> <br>` + `Show Lamps <label class="switch" style="float:right;"><input name="toggleLampView" type="checkbox"><div class="slider"></div></label><br></div>`
                });
                google.maps.event.addListener(marker.infoWindow, 'domready', function () {
                    if (selectedTerminalMarker && selectedTerminalMarker != marker) {
                        if (isShowingLamps[selectedTerminalMarker.cid]) {
                            TerminalbPressed(selectedTerminalMarker.cid)
                            isShowingLamps[selectedTerminalMarker.cid] = !isShowingLamps[selectedTerminalMarker.cid]
                        }
                    }
                    if (selectedTerminalMarker && selectedTerminalMarker != marker && selectedTerminalMarker.infoWindow) {
                        selectedTerminalMarker.infoWindow.close()
                        delete selectedTerminalMarker.infoWindow
                    }
                    selectedTerminalMarker = marker
                    $(`#infoTerm${myTerm.cid} input[name="toggleLampView"]`).prop('checked', isShowingLamps[myTerm.cid])
                    $(`#infoTerm${myTerm.cid} input[name="toggleLampView"]`).on('click', function () {
                        TerminalbPressed(myTerm.cid)
                        isShowingLamps[myTerm.cid] = !isShowingLamps[myTerm.cid]
                    })
                    if (!user.admin && !server.override) $(`#infoTerm${myTerm.cid} select[name="bri"]`).prop('disabled', true);
                    else $(`#infoTerm${myTerm.cid} select[name="bri"]`).change(function () {
                        LampModifyByCid(myTerm.cid, Number($(`#infoTerm${myTerm.cid} select[name="bri"]`).val()))
                    });
                })
                google.maps.event.addListener(marker.infoWindow, 'closeclick', function () {
                    delete marker.infoWindow //bug much?
                })
                marker.infoWindow.open(map, marker)
            }
        }(myTerm)));
        terminals[myTerm.cid] = myTerm;
    } else {
        for (var i = 0; i < props.length; ++i)
            if (terminal.hasOwnProperty(props[i])) myTerm[props[i]] = terminal[props[i]];
        for (var i = 0; i < props.length; ++i)
            if (terminal.hasOwnProperty(props[i])) applyChange[props[i]](myTerm);
    }
}
var selectedLampMarker;

function updateLamp(lamp) {
    if (!lamp.cid || !lamp.lid) return;
    var props = ['loc', 'iid', 'status', 'bri'];
    var applyChange = {
        'loc': function (lamp) {
            lamp.marker.setPosition(new google.maps.LatLng(lamp.loc.lat, lamp.loc.lng));
        },
        'iid': function (lamp) {
            if (lamp.marker.infoWindow) $(`#infoLamp${lamp.cid}\\,${lamp.lid} label[name='iid']`).text(`IID : ${lamp.iid}`);
        },
        'status': function (lamp) {
            lamp.marker.setTitle(`${lamp.cid}, ${lamp.lid} | ${LampStatusText[lamp.status]}`);
            lamp.marker.setIcon(intIconRoot + (lamp.status === LampStatus.FINE ? LampBrightnessIcon[lamp.bri] : LampStatusIcon[lamp.status]));
            if (lamp.marker.infoWindow) $(`#infoLamp${lamp.cid}\\,${lamp.lid} label[name='status']`).text(`Status : ${LampStatusText[lamp.status]}`);
        },
        'bri': function (lamp) {
            $(`#infoLamp${lamp.cid}\\,${lamp.lid} select[name="bri"]`).val(lamp.bri);
            lamp.marker.setIcon(intIconRoot + (lamp.status === LampStatus.FINE ? LampBrightnessIcon[lamp.bri] : LampStatusIcon[lamp.status]));
        }
    };
    if (!clusters[lamp.cid]) clusters[lamp.cid] = {};
    if (!clusters[lamp.cid].hasOwnProperty(lamp.lid)) {
        myLamp = {}
        for (var i = 0; i < props.length; ++i) {
            if (!lamp.hasOwnProperty(props[i])) {
                // Todo: Ask server to send entire obj
                return;
            }
            myLamp[props[i]] = lamp[props[i]];
        }
        if (!lamp.loc.lat || !lamp.loc.lng || !lamp.cid || !lamp.lid) return;
        myLamp.cid = lamp.cid;
        myLamp.lid = lamp.lid;
        marker = myLamp.marker = new google.maps.Marker({
            position: new google.maps.LatLng(lamp.loc.lat, lamp.loc.lng),
            map: map,
            icon: intIconRoot + (lamp.status === LampStatus.FINE ? LampBrightnessIcon[lamp.bri] : LampStatusIcon[lamp.status]),
            title: `${lamp.cid}, ${lamp.lid} | ${LampStatusText[lamp.status]}`
        });
        marker.cid = lamp.cid;
        marker.lid = lamp.lid;
        google.maps.event.addListener(marker, 'click', (function (lamp) {
            return function () {
                marker = lamp.marker;
                if (marker.hasOwnProperty('infoWindow')) {
                    marker.infoWindow.close();
                    delete marker.infoWindow;
                } else {
                    marker.infoWindow = new google.maps.InfoWindow({
                        content: `<div style="font-size:large" id="infoLamp${lamp.cid},${lamp.lid}"> <label style="float:right;">CID: ${lamp.cid}</label> LID: ${lamp.lid} <br><label name="iid">IID: ${lamp.iid} </label><br>Status: <label name="status">${LampStatusText[lamp.status]}</label> <br> Brightness: <select name="bri" style="float:right;"> <option value="0">0</option> <option value="1">1</option> <option value="2">2</option> <option value="3">3</option> </select></div>`
                    });
                    google.maps.event.addListener(marker.infoWindow, 'domready', function () {
                        if (selectedLampMarker && selectedLampMarker != marker && selectedLampMarker.infoWindow) {
                            selectedLampMarker.infoWindow.close()
                            delete selectedLampMarker.infoWindow
                        }
                        selectedLampMarker = marker
                        var briSelector = $(`#infoLamp${lamp.cid}\\,${lamp.lid} select`);
                        briSelector.val(lamp.bri);
                        if (!user.admin && !server.override) {
                            briSelector.prop('disabled', true);
                        } else {
                            briSelector.change(function () {
                                lamp.bri = Number(briSelector.val());
                                LampModify(lamp);
                            });
                        }
                    });
                    google.maps.event.addListener(marker.infoWindow, 'closeclick', function () {
                        marker.infoWindowShowing = false;
                        delete marker.infoWindow //bug much?
                    })
                    marker.infoWindow.open(map, marker);
                }
            }
        }(myLamp)));
        clusters[myLamp.cid][myLamp.lid] = myLamp;
    } else {
        myLamp = clusters[lamp.cid][lamp.lid];
        for (var i = 0; i < props.length; ++i)
            if (lamp.hasOwnProperty(props[i])) myLamp[props[i]] = lamp[props[i]];
        for (var i = 0; i < props.length; ++i)
            if (lamp.hasOwnProperty(props[i])) applyChange[props[i]](myLamp);
    }
}
TerminalbPressed = function (cid) {
    if (!isShowingLamps[cid]) {
        wsoc.send(makeMsg('addListener', {
            'loc': 'lamps',
            'cid': cid
        }))
    } else {
        wsoc.send(makeMsg('removeListener', {
            'loc': 'lamps',
            'cid': cid
        }))
        for (var key in clusters[cid])
            if (clusters[cid].hasOwnProperty(key)) clusters[cid][key].marker.setMap(null);
        delete clusters[cid]
    }
}
updateCluster = function (clus) {
    var lamp = {
        bri: clus.bri,
        cid: clus.cid
    };
    for (var lid in clusters[clus.cid])
        if (clusters[clus.cid].hasOwnProperty(lid)) {
            lamp.lid = lid;
            updateLamp(lamp);
        }
    if (selectedTerminalMarker != undefined && selectedTerminalMarker.cid == clus.cid) $(`#infoTerm${clus.cid} select[name="bri"]`).val(clus.bri)
    if (selectedLampMarker != undefined && selectedLampMarker.cid == clus.cid) $(`#infoLamp${clus.cid},${selectedLampMarker.lid} select[name="bri"]`).val(clus.bri);
}
LampModify = function (lamp) {
    wsoc.send(makeMsg('modObj', {
        type: LAMPOBJ,
        [LAMPOBJ]: {
            lid: lamp.lid,
            cid: lamp.cid,
            bri: lamp.bri
        }
    }));
}
LampModifyByCid = function (cid, val) {
    if (val == -1) {
        return;
    }
    wsoc.send(makeMsg('modObj', {
        type: CLUSOBJ,
        [CLUSOBJ]: {
            cid: cid,
            bri: val
        }
    }))
}
removeListenersBeforeClose = function () {
    for (var key in isShowingLamps) {
        if (isShowingLamps.hasOwnProperty(key)) {
            wsoc.send(makeMsg('removeListener', {
                'loc': 'lamps',
                'cid': key
            }))
        }
    }
    wsoc.send(makeMsg('removeListener', {
        'loc': 'terminals'
    }))
    wsoc.send(makeMsg('removeListener', {
        'loc': 'serverConfig'
    }))
}
//from: https://www.quirksmode.org/js/cookies.html
function createCookie(name, value, days) {
    if (days) {
        var date = new Date()
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000))
        var expires = " expires=" + date.toGMTString()
    } else var expires = ""
    document.cookie = name + "=" + value + expires + " path=/"
}

function readCookie(name) {
    var nameEQ = name + "="
    var ca = document.cookie.split(';')
    for (var i = 0; i < ca.length; i++) {
        var c = ca[i]
        while (c.charAt(0) == ' ') c = c.substring(1, c.length)
        if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length)
    }
    return null
}

function eraseCookie(name) {
    createCookie(name, "", -1)
}
