export const MAP_CONFIG = {
    apiKey: '9X2VSCQEbqyH6TCJc0zM', // ! Replace this and protect via whitelist in maptiler account
    center: [8.768807320860198, 53.01938559330482],
    zoom: 13,
    minZoom: 13,
    maxZoom: 13,
    maxBounds: [[8.69, 52.975], [8.8658, 53.052]],
    minPitch: 0,
    maxPitch: 0,
    navigationControl: false,
    geolocateControl: false,

    defaultPOITimer: 10000, // Default time a person spends at a POI in ms
    trainSpeed: 0.005, // Train speed in coordinate units per second
    trainWaitTimeAtStation: 1000, // Time to wait at each station in ms
    personAnimDuration: 1500,
    pickupStationsAhead: 2,
    popupTimer: 5000, // Time to show popups in ms
}

export const svgCache = new Map();