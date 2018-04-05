var terminals = [{
    cid: 1,
    value: 500,
    loc: {
        lat: 13.011019644898045,
        lng: 74.79337190443084
    }
}];

function initMap() {
    var map = new google.maps.Map(document.getElementById('map'), {
        zoom: 10,
        center: {
            lat: 13.011019644898045,
            lng: 74.79337190443084
        },
        mapTypeId: 'terrain'
    });
    for (var i in terminals) {
        var pollutionCircle = new google.maps.Circle({
            strokeColor: '#FF0000',
            strokeOpacity: 0.8,
            strokeWeight: 2,
            fillColor: '#FF0000',
            fillOpacity: 0.35,
            map: map,
            center: terminals[i].loc,
            radius: 100
        });
    }
}
