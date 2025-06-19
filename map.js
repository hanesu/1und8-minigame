// Global variables (yeah I know)
let map = null;
let stationsGeoJSON = null;
let POIsGeoJSON = null;
let personsGeoJSON = null;
let selectedPerson = null;
let canSelectPerson = true;
// personMarkers map to be used in selectPerson function
let personMarkers = {};
let peopleAtPOIs = {};
let POIMarkers = {};

let train1Marker = null;
let simulationTimeouts = [];
let train1Interval = null;

// Cache for SVG images
const svgCache = new Map();


document.getElementById('opt-in-button').addEventListener('click', () => {
    // Hide opt-in overlay
    // document.getElementById('opt-in-overlay').classList.add('hidden');
    // Show map
    document.getElementById('map').classList.remove('hidden');
    // Initialize map
    optIn();

    setTimeout(() => {
        document.getElementById('opt-in-overlay').classList.add('invisible');
    }, 10);
});

function optIn() {
    maptilersdk.config.apiKey = '9X2VSCQEbqyH6TCJc0zM';
    map = new maptilersdk.Map({
    container: 'map', // container's id or the HTML element to render the map
    style: maptilersdk.MapStyle.STREETS,
    center: [8.768807320860198, 53.01938559330482], // starting position [lng, lat]
    zoom: 13, // starting zoom  
    minZoom: 12,
    maxZoom: 15,
    });

    Promise.all([
        fetch('/geojson/stations.geojson').then(response => response.json()),
        fetch('/geojson/POIs.geojson').then(response => response.json()),
        fetch('/geojson/persons.geojson').then(response => response.json()),
        fetch('/geojson/route8.geojson').then(response => response.json())
    ]).then(([stationsData, POIsData, personsData, route8Data]) => {
        stationsGeoJSON = stationsData;
        POIsGeoJSON = POIsData;
        personsGeoJSON = personsData;
        route8GeoJSON = route8Data;
        routeCoordinates = route8Data.features[0].geometry.coordinates;
        // routeCoordinates = stationsData.features.map(feature => feature.geometry.coordinates);
        POIcoordinates = POIsData.features.map(feature => feature.geometry.coordinates);
        stationCoordinates = stationsData.features.map(feature => feature.geometry.coordinates);
        stopCoordinates = stationsData.features.filter(feature => feature.properties.isStop).map(feature => feature.geometry.coordinates);
        initializeMap();
        setTimeout(() => {
            startSimulation();
        }, 3000);
    });
}

function initializeMap() {
    var route = {
        type: 'FeatureCollection',
        features: [
            {
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: routeCoordinates
                }
            }
        ]
    };

    var train1MarkerEl = document.createElement('div');
    train1MarkerEl.className = 'train-marker';
    train1Marker = new maptilersdk.Marker({
        element: train1MarkerEl,
        anchor: 'center'
    })
        .setLngLat(stationCoordinates[0])
        .addTo(map);
    train1Marker.passengers = [];

    var train2MarkerEl = document.createElement('div');
    train2MarkerEl.className = 'train-marker';
    train2Marker = new maptilersdk.Marker({
        element: train2MarkerEl,
        anchor: 'center'
    })
        .setLngLat(stationCoordinates[stationCoordinates.length - 1])
        .addTo(map);
    train2Marker.passengers = [];



    POIsGeoJSON.features.forEach(POI => {
        const container = document.createElement('div');
        container.className = 'poi-container';

        const el = document.createElement('div');
        el.className = 'poi-marker';
        el.style.backgroundImage = `url(./img/POI.svg)`;

        const peopleContainer = document.createElement('div');
        peopleContainer.className = `people-container people-${POI.properties.peoplePosition || 'left'}`;
        container.appendChild(peopleContainer);
        container.appendChild(el);

        const POImarker = new maptilersdk.Marker({element: container})
            .setLngLat(POI.geometry.coordinates)
            .addTo(map);

        POImarker.peopleContainer = peopleContainer;
        POIMarkers[POI.properties.name] = POImarker;

        el.addEventListener('click', (e) => {
            e.stopPropagation();
            
            Object.values(personMarkers).forEach(marker => {
                marker.getElement().classList.remove('marker-selected');
            });

            selectPOI(POI);
            document.getElementById('map-overlay').classList.add('darkened');
            document.getElementById('info-box').classList.remove('hidden');
            selectedPerson = null;
        });
    });

    // generate person markers from persons.geojson
    personsGeoJSON.features.forEach(function(person) {
        const el = document.createElement('div');
        el.className = 'person-marker';
        el.setAttribute('data-name', person.properties.name);
        el.style.backgroundImage = `url(./img/${person.properties.name}.svg)`;

        // Cache SVG images to avoid multiple fetch requests
        fetch(`./img/${person.properties.name}.svg`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Image for ${person.properties.name} not found`);
                }
                const url = `./img/${person.properties.name}.svg`;
                svgCache.set(person.properties.name, url);
                el.style.backgroundImage = `url(${url})`;
            })
            .catch(error => {
                console.warn(error);
                const fallbackUrl = './img/Hund.svg';
                svgCache.set(person.properties.name, fallbackUrl);
                el.style.backgroundImage = `url(${fallbackUrl})`; 
            });
        
        const personMarker = new maptilersdk.Marker({element: el})
            .setLngLat(person.geometry.coordinates)
            .addTo(map);

        // Add person marker to personMarkers map to be used in selectPerson function
        personMarkers[person.properties.name] = personMarker;

        personMarker.isAvailable = true;
        personMarker.name = person.properties.name;
        personMarker.home = person.geometry.coordinates;
        personMarker.homeStation = person.properties.homeStation;
        personMarker.destinationStation = person.properties.destinationStation;
        personMarker.currentDestination = person.properties.destinationStation;
        personMarker.isReturning = false;
        personMarker.waitingAtPOI = false;
        personMarker.isMoving = false;
        

        personMarker.getElement().addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent map click event from firing

            selectPerson(person);
            selectedPersonMarker = personMarker;
        });
    });

    // Initialize map and add layers
    map.on('load', async function() {
        map.addSource('stations', {
            type: 'geojson',
            data: '/geojson/stations.geojson'
        });

        map.addSource('route', {
            type: 'geojson',
            data: route
        });

        const stationImage = new Image();
        stationImage.src = './img/Haltestelle.svg';
        stationImage.onload = () => {
            map.addImage('stationIcon', stationImage);
        };
        // const stationImage = await map.loadImage('./img/station.png');
        // map.addImage('stationIcon', stationImage.data);

        map.addLayer({
            id: 'route',
            type: 'line',
            source: 'route',
            layout: {
                'line-join': 'round',
                'line-cap': 'round'
            },
            paint: {
                'line-color': '#92C01A',
                'line-width': 4
            }
        });


        map.addLayer({
            id: 'stations-layer',
            type: 'symbol',
            source: 'stations',
            layout: {
                'icon-image': 'stationIcon',
                'icon-size': 0.175,
            },
            paint: {
                    
            }
        });

        map.on('click', (e) => {
            document.getElementById('map-overlay').classList.remove('darkened');
            document.getElementById('info-box').classList.add('hidden');
            
            document.querySelectorAll('.person-marker, .poi-marker')
                .forEach(el => el.classList.remove('marker-selected'));

            selectedPerson = null;
        });
    });
}


function movePersonToStation(marker, stationName) {
    const station = findStationByName(stationName).geometry.coordinates;
    const start = marker.getLngLat();
    const startLngLat = [start.lng, start.lat];
    const duration = 1500;
    const startTime = performance.now();

    function animate(time) {
        const elapsed = time - startTime;
        const t = Math.min(elapsed / duration, 1);

        const lng = startLngLat[0] + (station[0] - startLngLat[0]) * t;
        const lat = startLngLat[1] + (station[1] - startLngLat[1]) * t;

        marker.setLngLat([lng, lat]);

        if (t < 1) {
            requestAnimationFrame(animate);
        } else {
            marker.isMoving = false;
        }
    }
    requestAnimationFrame(animate);
}

function movePersonToPOI(marker, POIname) {
    const person = personsGeoJSON.features.find(p => p.properties.name === marker.name);
    const POI = findPOIByName(POIname);
    const POImarker = POIMarkers[POIname];
    const POIcoords = POI.geometry.coordinates;

    const start = marker.getLngLat();
    const startLngLat = [start.lng, start.lat];
    const duration = 1500;
    const startTime = performance.now();
    const waitTime = person.properties.returnTimer || 10000;

    function animate(time) {
        const elapsed = time - startTime;
        const t = Math.min(elapsed / duration, 1);

        const lng = startLngLat[0] + (POIcoords[0] - startLngLat[0]) * t;
        const lat = startLngLat[1] + (POIcoords[1] - startLngLat[1]) * t;

        marker.setLngLat([lng, lat]);

        if (t < 1) {
            requestAnimationFrame(animate);
        } else {
            // Add person to POI
            const personEl = document.createElement('div');
            personEl.className = 'person-marker-small';
            personEl.setAttribute('data-name', marker.name);
            personEl.style.backgroundImage = `url(${svgCache.get(marker.name)})`;
            if (selectedPerson = marker.name) {
                // personEl.classList.add('marker-selected');
            }
            
            personEl.addEventListener('click', (e) => {
                e.stopPropagation();
                selectPerson(person);
            });

            POImarker.peopleContainer.appendChild(personEl);
            marker.getElement().style.display = 'none';
            marker.waitingAtPOI = true;

            // Return timer
            setTimeout(() => {
                personEl.remove();
                marker.waitingAtPOI = false;
                marker.isReturning = true;
                marker.isAvailable = true;
                marker.currentDestination = person.properties.homeStation;
                marker.getElement().style.display = 'block';
            }, waitTime);
        }
    }
    requestAnimationFrame(animate);
}

function movePersonToHome(marker, coords) {
    const start = marker.getLngLat();
    const startLngLat = [start.lng, start.lat];
    const duration = 1500;
    const startTime = performance.now();

    const popup = new maptilersdk.Popup({
        className: 'destination-popup',
        closeButton: false,
        closeOnClick: true,
        offset: 25
    }).setHTML('&#x1F3E0;');

    function animate(time) {
        const elapsed = time - startTime;
        const t = Math.min(elapsed / duration, 1);

        const lng = startLngLat[0] + (coords[0] - startLngLat[0]) * t;
        const lat = startLngLat[1] + (coords[1] - startLngLat[1]) * t;

        marker.setLngLat([lng, lat]);

        if (t < 1) {
            requestAnimationFrame(animate);
        } else {
            marker.setPopup(popup);
            marker.togglePopup();
            marker.isReturning = false;
            marker.isAvailable = true;
            marker.waitingAtPOI = false;
            marker.isMoving = false;
            marker.currentDestination = marker.destinationStation;

            // find original person data to reset destination
            const person = personsGeoJSON.features.find(p => 
                p.properties.name === marker.name
            );
            marker.destinationStation = person.properties.destinationStation;
            
            setTimeout(() => {
                popup.remove();
            }, 1500);
        }
    }
    requestAnimationFrame(animate);
}


function findStationByName(stationName) {
    return stationsGeoJSON.features.find(station => 
        station.properties.name === stationName
    );
}
function findPOIByName(POIname) {
    return POIsGeoJSON.features.find(POI => 
        POI.properties.name === POIname
    );
}

function isNearLocation(position1, position2, tolerance = 0.0001) {
    return Math.abs(position1.lng - position2[0]) < tolerance && 
           Math.abs(position1.lat - position2[1]) < tolerance;
}

/**
 * Moves train marker along route.
 *
 * @param   marker  the marker to be moved.
 * @param   route  routeCoordinates map.
 * @param   direction the direction of the train (1 or -1).
 */
function moveTrainMarker(marker, route, direction) {
    let startPoint = direction === 1 ? route[0] : route[route.length - 1];
    let endPoint = direction === 1 ? route[route.length - 1] : route[0];
    let currentIndex = route.indexOf(startPoint);
    let destinationIndex = route.indexOf(endPoint);
    let isWaitingAtStation = false;
    let waitStartTime = null;
    const stationWaitTime = 1000; // Wait time at stations in milliseconds
    let hasStoppedAtCurrentStation = false;
    let lastStationCoords = null;

    // Display passengers
    const passengerContainer = document.createElement('div');
    passengerContainer.className = 'passenger-container';
    marker.getElement().appendChild(passengerContainer);

    function updatePassengerIcons() {
        passengerContainer.innerHTML = '';
        marker.passengers.forEach(passenger => {
            const icon = document.createElement('img');
            icon.src = svgCache.get(passenger.name) || './img/Hund.svg';
            icon.className = 'person-marker-small';
            icon.setAttribute('data-name', passenger.name);
            if (selectedPerson === passenger.name) {
                icon.classList.add('marker-selected');
            }

            // This is dupicated code, but it is necessary to add the event listener to the icon
            icon.addEventListener('click', (e) => {
                e.stopPropagation();
        
                // Find the person data
                const person = personsGeoJSON.features.find(p => 
                    p.properties.name === passenger.name
                );
    
                selectPerson(person);
                selectedPersonMarker = passenger;
            });

            passengerContainer.appendChild(icon);
        });
    }

    function handlePickup(personMarker, currentPos, currentIndex) {
        // console.log('Trying to pickup:', {
        //     name: personMarker.name,
        //     isAvailable: personMarker.isAvailable,
        //     isReturning: personMarker.isReturning,
        //     destinationStation: personMarker.destinationStation,
        //     currentPos: currentPos,
        //     personPos: personMarker.getLngLat()
        // });
        const personLngLat = personMarker.getLngLat();
        const distance = calculateDistance(currentPos, [personLngLat.lng, personLngLat.lat]);
        

        const destinationStation = findStationByName(personMarker.currentDestination);
        if (!destinationStation) return;

        const destinationCoords = destinationStation.geometry.coordinates;
        const destinationIndex = route.findIndex(point => 
            isNearLocation({lng: point[0], lat: point[1]}, destinationCoords, 0.0001)
        );
        
        const willPassDestination = direction === 1 ? 
            (destinationIndex > currentIndex && destinationIndex <= route.length - 1) :
            (destinationIndex < currentIndex && destinationIndex >= 0);
        
        if (distance < 0.0002 && personMarker.isAvailable && willPassDestination) {
            marker.passengers.push(personMarker);
            personMarker.isAvailable = false;
            personMarker.getElement().style.display = 'none';
            updatePassengerIcons();
            return true;
        }
        return false;
    }

    function handleDropoff(personMarker, currentPos, dropoffCount = 0) {
        if (personMarker.isAvailable) return false;

        const destinationStation = findStationByName(personMarker.currentDestination);
        if (!destinationStation) return false;

        const destinationCoords = destinationStation.geometry.coordinates;
        
        if (isNearLocation({lng: currentPos.lng, lat: currentPos.lat}, destinationCoords)) {

            personMarker.setLngLat(destinationCoords);
            personMarker.getElement().style.display = 'block';

            if ( personMarker.isReturning ) {
                movePersonToHome(personMarker, personMarker.home);
            } else {
                const person = personsGeoJSON.features.find(p => p.properties.name === personMarker.name);
                movePersonToPOI(personMarker, person.properties.destination);
            }
            return true;
        }
        return false;
    }

    function shouldStopAtLocation(currentPos, currentIndex) {
        // Check if there are any viable passengers nearby
        const hasViablePassenger = Object.values(personMarkers).some(personMarker => {
            if (!personMarker.isAvailable) return false;
            
            // Check if person is near current position
            const personLngLat = personMarker.getLngLat();
            if (!isNearLocation(currentPos, [personLngLat.lng, personLngLat.lat])) return false;
    
            // Check if person's destination is along train's route
            const destinationStation = findStationByName(personMarker.currentDestination);
            if (!destinationStation) return false;
    
            const destinationCoords = destinationStation.geometry.coordinates;
            const destinationIndex = route.findIndex(point => 
                isNearLocation({lng: point[0], lat: point[1]}, destinationCoords, 0.0001)
            );
    
            // Only return true if train will pass the destination
            return direction === 1 ? 
                (destinationIndex > currentIndex && destinationIndex <= route.length - 1) :
                (destinationIndex < currentIndex && destinationIndex >= 0);
        });
    
        // Check if this is a destination station for any current passenger
        const isDestinationStation = marker.passengers.some(passenger => {
            const destinationStation = findStationByName(passenger.currentDestination);
            if (!destinationStation) return false;
            return isNearLocation(currentPos, destinationStation.geometry.coordinates);
        });
    
        return hasViablePassenger || isDestinationStation;
    }

    function checkForPersonMovement(currentPos) {
        Object.values(personMarkers).forEach(personMarker => {
            if (!personMarker.isMoving && personMarker.isAvailable && !personMarker.waitingAtPOI) {
                const targetStation = personMarker.isReturning ? 
                    personMarker.destinationStation : 
                    personMarker.homeStation;
                    
                const triggerStation = findStationBeforeTarget(targetStation, direction, 3);
                if (!triggerStation) return;
                
                const triggerStationData = findStationByName(triggerStation);
                if (!triggerStationData) return;
                
                if (isNearLocation(currentPos, triggerStationData.geometry.coordinates)) {
                    personMarker.isMoving = true;
                    movePersonToStation(personMarker, targetStation);
                }
            }
        });
    }

    function animate(timestamp) {
        // Check if waiting at station
        if (isWaitingAtStation) {
            if (waitStartTime === null) {
                waitStartTime = timestamp;
            }
            const waitElapsed = timestamp - waitStartTime;
            if (waitElapsed < stationWaitTime) {
                requestAnimationFrame(animate);
                return;
            }
            isWaitingAtStation = false;
            waitStartTime = null;
            hasStoppedAtCurrentStation = true;
            lastStationCoords = marker.getLngLat();

        const availablePassengers = Object.values(personMarkers).filter(personMarker => 
            personMarker.isAvailable && 
            isNearLocation(marker.getLngLat(), [personMarker.getLngLat().lng, personMarker.getLngLat().lat])
        );

        availablePassengers.forEach(personMarker => {
            handlePickup(personMarker, marker.getLngLat(), currentIndex);
        });

        // Process dropoffs
        if (marker.passengers.length > 0) {
            const passengersToProcess = [...marker.passengers];
            const droppedOffPassengers = passengersToProcess.filter(passenger => 
                handleDropoff(passenger, marker.getLngLat())
            );
            
            droppedOffPassengers.forEach(passenger => {
                const index = marker.passengers.indexOf(passenger);
                if (index > -1) {
                    marker.passengers.splice(index, 1);
                }
            });
            
            updatePassengerIcons();
        }
        }

        if ((direction === 1 && currentIndex < destinationIndex) || 
            (direction === -1 && currentIndex > destinationIndex)) {
            const currentPos = marker.getLngLat();
            const nextIndex = currentIndex + direction;
            const nextPos = route[nextIndex];

            //!
            const step = 0.00005; // Adjust step size for animation train speed
            const dx = nextPos[0] - currentPos.lng;
            const dy = nextPos[1] - currentPos.lat;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // Reset hasStoppedAtCurrentStation when we've moved away from the last station
            if (lastStationCoords) {
                if (Math.abs(currentPos.lng - lastStationCoords.lng) > 0.0002 || 
                    Math.abs(currentPos.lat - lastStationCoords.lat) > 0.0002) {
                        hasStoppedAtCurrentStation = false;
                        lastStationCoords = null;
                    }
            }

            // Check if current position is a station
            const currentCoords = [currentPos.lng, currentPos.lat];
            if (shouldStopAtLocation({lng: currentCoords[0], lat: currentCoords[1]}, currentIndex) && 
            !hasStoppedAtCurrentStation) {
                isWaitingAtStation = true;
                waitStartTime = timestamp;
                requestAnimationFrame(animate);
                return;
            }
            checkForPersonMovement({lng: currentCoords[0], lat: currentCoords[1]});

            if (distance < step) {
                marker.setLngLat(nextPos);
                currentIndex = nextIndex;
            } else {
                const angle = Math.atan2(dy, dx);
                const newLng = currentPos.lng + step * Math.cos(angle);
                const newLat = currentPos.lat + step * Math.sin(angle);
                marker.setLngLat([newLng, newLat]);   
            }

            requestAnimationFrame(animate);
        } else {
            // Reached end point, flip direction and restart
            // if train at Roland-Center, wait 10 seconds before flipping direction
            const currentPos = marker.getLngLat();
            const rolandCenter = findStationByName('Roland-Center');

            if (isNearLocation(currentPos, rolandCenter.geometry.coordinates)) {
                marker.getElement().classList.add('hidden');

                setTimeout(() => {
                    marker.getElement().classList.remove('hidden');
                    direction *= -1;
                    const temp = startPoint;
                    startPoint = endPoint;
                    endPoint = temp;
                    currentIndex = direction === 1 ? route.indexOf(startPoint) : route.length - 1;
                    destinationIndex = direction === 1 ? route.length - 1 : 0;
                    marker.setLngLat(route[currentIndex]);
                    requestAnimationFrame(animate);
                }, 20000);
            } else {
                direction *= -1;
                const temp = startPoint;
                startPoint = endPoint;
                endPoint = temp;
                
                currentIndex = direction === 1 ? route.indexOf(startPoint) : route.length - 1;
                destinationIndex = direction === 1 ? route.length - 1 : 0;

                marker.setLngLat(route[currentIndex]);
                requestAnimationFrame(animate);
            }
        }
    }

    requestAnimationFrame(animate);
}

function calculateDistance(point1, point2) {
    const dx = point1.lng - point2[0];
    const dy = point1.lat - point2[1];
    return Math.sqrt(dx * dx + dy * dy);
}


function selectPerson(person) {
    if (!canSelectPerson) {
        return;
    }
    selectedPerson = person.properties.name;
    selectedPersonMarker = personMarkers[person.properties.name];

    // document.getElementById(person.properties.name).classList.add('person-icon-active');
    document.getElementById('info-image').innerHTML = `<img id="info-image" src="./img/${person.properties.name}.svg" class="info-image">`;
    document.getElementById('info-image').classList.remove('hidden');
    document.getElementById('info-title').innerHTML = person.properties.name;
    document.getElementById('info-ul').classList.remove('hidden');
    document.getElementById('info-start').innerHTML = person.properties.homeStation;
    document.getElementById('info-destination').innerHTML = person.properties.destinationStation;
    document.getElementById('info-text').innerHTML = person.properties.info;
    document.getElementById('poi-image-container').innerHTML = '';

    document.getElementById('map-overlay').classList.add('darkened');
    document.getElementById('info-box').classList.remove('hidden');

    // Remove selection from all
    document.querySelectorAll('.person-marker, .poi-marker')
        .forEach(el => el.classList.remove('marker-selected'));

    // Add selection to all elements representing this person
    document.querySelectorAll(`[data-name="${person.properties.name}"]`)
        .forEach(el => el.classList.add('marker-selected'));
}

function selectPOI(poi) {
    document.getElementById('info-title').innerHTML = poi.properties.name;
    document.getElementById('info-image').classList.add('hidden');
    document.getElementById('info-ul').classList.add('hidden');
    document.getElementById('info-text').innerHTML = '';
    document.getElementById('poi-image-container').innerHTML = `<img id="poi-image" src="${poi.properties.image}" alt="${poi.properties.name}" class="info-image">`;

}

function findStationBeforeTarget(targetStation, direction, stationsAhead = 3) {
    const stationsList = stationsGeoJSON.features.map(station => station.properties.name);
    const targetIndex = stationsList.indexOf(targetStation);
    if (targetIndex === -1) return null;
    
    const lookAheadIndex = direction === 1 ? 
        targetIndex - stationsAhead : 
        targetIndex + stationsAhead;
        
    if (lookAheadIndex >= 0 && lookAheadIndex < stationsList.length) {
        return stationsList[lookAheadIndex];
    }
    return null;
}

function findNearestStation(position) {
    let nearestStation = null;
    let shortestDistance = Infinity;
    
    stationsGeoJSON.features.forEach(station => {
        const distance = calculateDistance(position, station.geometry.coordinates);
        if (distance < shortestDistance) {
            shortestDistance = distance;
            nearestStation = station.properties.name;
        }
    });
    
    return nearestStation;
}


function startSimulation() {
    // Clear any existing timeouts
    simulationTimeouts.forEach(timeout => clearTimeout(timeout));
    simulationTimeouts = [];

    // Start train
    moveTrainMarker(train1Marker, routeCoordinates, 1);
    moveTrainMarker(train2Marker, routeCoordinates, -1);

}
