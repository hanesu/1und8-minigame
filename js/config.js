export const MAP_CONFIG = {
    apiKey: '9X2VSCQEbqyH6TCJc0zM', // ! Replace this and protect via whitelist in maptiler account
    center: [8.768807320860198, 53.01938559330482],
    zoom: 14,
    minZoom: 12,
    maxZoom: 15,
    maxBounds: [[8.680, 52.97], [8.870, 53.06]],

    defaultReturnTimer: 10000,
    trainStepSize: 0.00005,
    personAnimDuration: 1500,
}

export const svgCache = new Map();
export const activePassengers = new Set();