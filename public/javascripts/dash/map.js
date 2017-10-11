jQuery(function ($) {
    // Asynchronously Load the map API 
    var script = document.createElement('script')
    script.src = '//maps.googleapis.com/maps/api/js?key=AIzaSyCT2IciRf75Y52RKEFWuZKpMzF3Vg9Qr_k&callback=initialize'
    document.body.appendChild(script)
    $(window).bind('beforeunload', removeListenersBeforeClose)
})
var Parents = {}
    , Pmarkers = {}
var clusters = {}
    , clusterMarkers = {}
var map, bounds
var addMarker
const iconRoot = 'http://maps.google.com/mapfiles/ms/icons/'
const briIconRoot = '/images/'
var parentStatusIcon = ['green-dot.png', 'red-dot.png', 'orange-dot.png', 'grn-pushpin.png']
var parentStatusText = ['Online and Synced', 'Offline', 'Online\nbut lamp faulty', 'Awaiting sync']
var LampStatusIcon = ['yellow.png', 'red.png', 'orange.png']
var LampStatusText = ['Online', 'NRF link failure', 'Online\nbut faulty']
var LampBrightnessIcon = ['yellow_0.png', 'yellow_1.png', 'yellow_2.png', 'yellow_3.png']
var isShowingLamps = {}

function initialize() {
    var mapOptions = {
            mapTypeId: 'roadmap'
            , center: {
                'lat': 13.01081
                , 'lng': 74.794128
            }
            , zoom: 18
        }
        // Display a map on the page
    map = new google.maps.Map(document.getElementById('map'), mapOptions)
    google.maps.event.addListener(map, 'rightclick', rightClickListener)
    startWS()
}
var rightClickListener = function (event) {
    if (addMarker !== undefined) {
        if (addMarker.infoWindow.isOpen) {
            addMarker.infoWindow.close()
        }
        addMarker.setMap(null)
    }
    var marker = new google.maps.Marker({
        position: new google.maps.LatLng(event.latLng.lat(), event.latLng.lng())
        , map: map
    , })
    var iaddNewContent = ['<div id="addDiv"><pre>'
        , '<label>IID: </label><input name="iIID" type="number"/>\n\n'
        , '<label>CID: </label><input name="iCID" type="number"/>\n\n'
        , '<label>LID: </label><input name="iLID" type="number" placeholder="Ignore field for parent"/>\n\n'
        , '<input type="radio" name="iType" value="lamp" checked>Lamp '
        , '<input type="radio" name="iType" value="parent">Parent'
        , '\t<input type="button" value="Add" id="addButton">'
        , '</pre></div>'].join('')
    marker.infoWindow = new google.maps.InfoWindow({
        content: iaddNewContent
    })
    marker.infoWindow.open(map, marker)
    marker.infoWindow.isOpen = true
    google.maps.event.addListener(marker.infoWindow, 'domready', function () {
        $('#addButton').on('click', function () {
            wsoc.send(makeMsg('addObj', {
                type: $('[name="iType"]:checked').val()
                , obj: {
                    iid: $('[name="iIID"]').val()
                    , cid: $('[name="iCID"]').val()
                    , lid: $('[name="iLID"]').val()
                    , loc: {
                        lat: event.latLng.lat()
                        , lng: event.latLng.lng()
                    }
                }
            }))
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
    var loc = window.location
        , new_uri, username = user.username
        , token = readCookie('token')
    if (loc.protocol === 'https:') {
        new_uri = 'wss:'
    }
    else {
        new_uri = 'ws:'
    }
    new_uri += '//' + loc.host + '/'
    new_uri += '?type=webDebug' + '&username=' + username + '&token=' + token
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
            type: type
            , data: data
        })
    }
}
process = function (msg) {
    console.log(msg)
    switch (msg.type) {
    case 'parent':
        modifyParentMarker(msg.data)
        break
    case 'lamp':
        modifyLampMarker(msg.data)
        break
    case 'cluster':
        modifyCluster(msg.data.obj)
        break
    case 'auth':
        if (msg.data.state == 'pass') {
            wsoc.send(makeMsg('addListener', {
                'loc': 'parents'
            }))
            wsoc.send(makeMsg('addListener', {
                loc: 'serverConfig'
            }))
        }
        else {
            alert('Auth error! Try logging in again')
        }
        break
    case 'serverConfig':
        if (msg.data.override == true) {
            $('.onOverride').show()
        }
        else {
            $('.onOverride').hide()
        }
        if (msg.data.override != null) {
            server.override = msg.data.override
            if (selectedParentMarker) {
                $(`#lB_c${selectedParentMarker.cid}`).prop('disabled', !server.override)
            }
            if (selectedLampMarker) {
                $(`#lB_c${selectedLampMarker.cid}_l${selectedLampMarker.lid}`).prop('disabled', !server.override)
            }
        }
        break
    case 'addError':
        alert(msg.data.msg)
        break
    case 'addSuccess':
        alert('Added')
        break
    }
}
var selectedParentMarker
modifyParentMarker = function (cluster) {
    if (Pmarkers.hasOwnProperty(cluster.cid)) {
        Pmarkers[cluster.cid].setMap(null)
    }
    else {
        isShowingLamps[cluster.cid] = false
    }
    var position = new google.maps.LatLng(cluster.loc.lat, cluster.loc.lng)
    marker = Pmarkers[cluster.cid] = new google.maps.Marker({
        position: position
        , map: map
        , title: 'CID: ' + cluster.cid.toString()
        , icon: iconRoot + parentStatusIcon[cluster.status]
    , })
    google.maps.event.addListener(marker, 'click', (function (marker) {
        return function () {
            if (marker.hasOwnProperty('infoWindow')) {
                marker.infoWindow.close()
                delete marker.infoWindow
                return
            }
            marker.infoWindow = new google.maps.InfoWindow({
                content: [`<div id="iP${cluster.cid}"><pre>`
                    , `CID: ${cluster.cid}\n`
                    , `IID: ${cluster.iid}\n`
                    , `Status: ${parentStatusText[cluster.status]}\n`
                    , `IP: ${cluster.ip}\n\n`
                    , `Show Lamps <label class="switch"><input id="toggleLampView${cluster.cid}" type="checkbox"><div class="slider"></div></label>\n`
                    , `<div id="bD_c${cluster.cid}" style="display: none">Brightness: <select name="bri" id="lB_c${cluster.cid}"><option value="-1" selected> </option><option value = "0">0</option>`
                    , '<option value = "1">1</option><option value = "2">2</option>'
                    , '<option value = "3">3</option></select>\n</div></pre>'
                    , cluster.status === 1 ? '(Last known lamp status)' : ''
                    , '</div>'
                         ].join('')
            })
            marker.cid = cluster.cid
            google.maps.event.addListener(marker.infoWindow, 'domready', function () {
                if (selectedParentMarker && selectedParentMarker != marker) {
                    if (isShowingLamps[selectedParentMarker.cid]) {
                        ParentbPressed(selectedParentMarker.cid)
                        isShowingLamps[selectedParentMarker.cid] = !isShowingLamps[selectedParentMarker.cid]
                    }
                }
                if (selectedParentMarker && selectedParentMarker != marker && selectedParentMarker.infoWindow) {
                    selectedParentMarker.infoWindow.close()
                    delete selectedParentMarker.infoWindow
                }
                selectedParentMarker = marker
                if (isShowingLamps[cluster.cid]) {
                    $(`#bD_c${cluster.cid}`).show()
                }
                $(`#toggleLampView${cluster.cid}`).prop('checked', isShowingLamps[cluster.cid])
                $(`#toggleLampView${cluster.cid}`).on('click', function () {
                    ParentbPressed(cluster.cid)
                    if (isShowingLamps[cluster.cid]) {
                        $(`#bD_c${cluster.cid}`).hide()
                    }
                    else {
                        $(`#bD_c${cluster.cid}`).show()
                    }
                    isShowingLamps[cluster.cid] = !isShowingLamps[cluster.cid]
                })
                if (!user.admin && !server.override) {
                    $(`#lB_c${cluster.cid}`).prop('disabled', true)
                }
                else {
                    $(`#lB_c${cluster.cid}`).change(function () {
                        LampModifyByCid(cluster.cid, Number($(`#lB_c${cluster.cid}`).val()))
                    })
                }
            })
            google.maps.event.addListener(marker.infoWindow, 'closeclick', function () {
                delete marker.infoWindow //bug much?
            })
            marker.infoWindow.open(map, marker)
        }
    }(marker)))
}
modifyLampMarker = function (lamp) {
    if (!clusters.hasOwnProperty(lamp.cid)) {
        clusters[lamp.cid] = {}
        clusterMarkers[lamp.cid] = {}
    }
    if (clusterMarkers[lamp.cid].hasOwnProperty(lamp.lid)) {
        var oLamp = clusters[lamp.cid][lamp.lid]
        var oMarker = clusterMarkers[lamp.cid][lamp.lid]
        if (lamp.loc == null) {
            lamp.loc = oLamp.loc
        }
        if (lamp.status == null) {
            lamp.status = oLamp.status
        }
        if (oLamp.loc.lat == lamp.loc.lat && oLamp.loc.lng == lamp.loc.lng) {
            var iconPath = lamp.status === 0 ? briIconRoot + LampBrightnessIcon[lamp.bri] : iconRoot + LampStatusIcon[lamp.status]
            oMarker.setIcon(iconPath)
            if (oMarker.infoWindow) {
                $(`#lB_c${lamp.cid}_l${lamp.lid}`).val(lamp.bri)
                $(`#lS_c${lamp.cid}_l${lamp.lid}`).text(LampStatusText[lamp.status])
            }
            clusters[lamp.cid][lamp.lid] = lamp
        }
        else {
            clusterMarkers[lamp.cid][lamp.lid].setMap(null)
            clusters[lamp.cid][lamp.lid] = lamp
            clusterMarkers[lamp.cid][lamp.lid] = makeLampMarker(lamp)
        }
    }
    else {
        clusters[lamp.cid][lamp.lid] = lamp
        clusterMarkers[lamp.cid][lamp.lid] = makeLampMarker(lamp)
    }
}
getLampIwContent = function (lamp) {
    return [`<div id="iL${lamp.lid}"><pre>`
              , `IID: ${lamp.iid}\n`
              , `CID: ${lamp.cid}\n`
              , `LID: ${lamp.lid}\n`
              , `Status: <span id="lS_c${lamp.cid}_l${lamp.lid}">${LampStatusText[lamp.status]}</span>\n`
              , `Brightness: <select name="bri" id="lB_c${lamp.cid}_l${lamp.lid}"><option value = "0">0</option>`
              , '<option value = "1">1</option><option value = "2">2</option>'
              , '<option value = "3">3</option></select>\n'
              , '</pre></div>'].join('')
}
var selectedLampMarker
makeLampMarker = function (lamp) {
    var position = new google.maps.LatLng(lamp.loc.lat, lamp.loc.lng)
    var iconPath = lamp.status === 0 ? briIconRoot + LampBrightnessIcon[lamp.bri] : iconRoot + LampStatusIcon[lamp.status]
    console.log(iconPath)
    marker = new google.maps.Marker({
        position: position
        , map: map
        , icon: iconPath
        , title: 'LID: ' + lamp.lid.toString() + '\nIID: ' + lamp.iid.toString()
    })
    marker.cid = lamp.cid
    marker.lid = lamp.lid
    google.maps.event.addListener(marker, 'click', (function (marker) {
        return function () {
            if (marker.hasOwnProperty('infoWindow')) {
                marker.infoWindow.close()
                delete marker.infoWindow
            }
            else {
                marker.infoWindow = new google.maps.InfoWindow({
                    content: getLampIwContent(lamp)
                })
                google.maps.event.addListener(marker.infoWindow, 'domready', function () {
                    if (selectedLampMarker && selectedLampMarker != marker && selectedLampMarker.infoWindow) {
                        selectedLampMarker.infoWindow.close()
                        delete selectedLampMarker.infoWindow
                    }
                    selectedLampMarker = marker
                    $(`#lB_c${lamp.cid}_l${lamp.lid}`).val(lamp.bri)
                    if (!user.admin && !server.override) {
                        $(`#lB_c${lamp.cid}_l${lamp.lid}`).prop('disabled', true)
                    }
                    else {
                        $(`#lB_c${lamp.cid}_l${lamp.lid}`).change(function () {
                            lamp.bri = Number($(`#lB_c${lamp.cid}_l${lamp.lid}`).val())
                            LampModify(lamp)
                        })
                    }
                })
                google.maps.event.addListener(marker.infoWindow, 'closeclick', function () {
                    marker.infoWindowShowing = false
                    delete marker.infoWindow //bug much?
                })
                marker.infoWindow.open(map, marker)
            }
        }
    }(marker)))
    return marker
}
ParentbPressed = function (cid) {
    if (!isShowingLamps[cid]) {
        wsoc.send(makeMsg('addListener', {
            'loc': 'lamps'
            , 'cid': cid
        }))
    }
    else {
        wsoc.send(makeMsg('removeListener', {
            'loc': 'lamps'
            , 'cid': cid
        }))
        for (var key in clusterMarkers[cid]) {
            if (clusterMarkers[cid].hasOwnProperty(key)) {
                clusterMarkers[cid][key].setMap(null)
            }
        }
        delete clusterMarkers[cid]
        delete clusters[cid]
    }
}
modifyCluster = function (clus) {
    for (var lid in clusters[clus.cid]) {
        if (clusters[clus.cid].hasOwnProperty(lid)) {
            var lamp = clusters[clus.cid][lid]
            lamp.bri = clus.bri
            if (clusterMarkers[clus.cid].hasOwnProperty(lid)) {
                var iconPath = lamp.status === 0 ? briIconRoot + LampBrightnessIcon[lamp.bri] : iconRoot + LampStatusIcon[lamp.status]
                clusterMarkers[clus.cid][lid].setIcon(iconPath)
            }
        }
    }
    if (selectedParentMarker != undefined && selectedParentMarker.cid == clus.cid) {
        $(`#lB_c${clus.cid}`).val(clus.bri)
    }
    if (selectedLampMarker != undefined && selectedLampMarker.cid == clus.cid) {
        $(`#lB_c${clus.cid}_l${selectedLampMarker.lid}`).val(clus.bri)
    }
}
LampModify = function (lamp) {
    wsoc.send(makeMsg('modObj', {
        'type': 'lamp'
        , 'obj': lamp
    }))
}
LampModifyByCid = function (cid, val) {
    if (val == -1) {
        return
    }
    wsoc.send(makeMsg('modObjX', {
        type: 'cluster'
        , obj: {
            cid: cid
            , bri: val
        }
    }))
}
removeListenersBeforeClose = function () {
        for (var key in isShowingLamps) {
            if (isShowingLamps.hasOwnProperty(key)) {
                wsoc.send(makeMsg('removeListener', {
                    'loc': 'lamps'
                    , 'cid': key
                }))
            }
        }
        wsoc.send(makeMsg('removeListener', {
            'loc': 'parents'
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
    }
    else var expires = ""
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