export const MAP_CONFIG = {
    apiKey: '9X2VSCQEbqyH6TCJc0zM', // ! Replace this and protect via whitelist in maptiler account
    center: [8.768807320860198, 53.01938559330482],
    zoom: 14,
    minZoom: 12,
    maxZoom: 15,
    maxBounds: [[8.680, 52.97], [8.870, 53.055]],
    minPitch: 0,
    maxPitch: 0,

    defaultPOITimer: 10000, // Default time a person spends at a POI in ms
    trainSpeed: 0.005, // Train speed in coordinate units per second
    trainWaitTimeAtStation: 1000, // Time to wait at each station in ms
    personAnimDuration: 1500,
    pickupStationsAhead: 2,
    popupTimer: 5000, // Time to show popups in ms
}

export const svgCache = new Map();