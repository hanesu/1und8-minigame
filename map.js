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

let train1Marker = null;
let simulationTimeouts = [];
let train1Interval = null;


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
        var el = document.createElement('div');
        el.className = 'poi-marker';
        el.style.backgroundImage = `url(./img/POI.svg)`;

        const POIpopup = new maptilersdk.Popup().setText(POI.properties.name);
        const POImarker = new maptilersdk.Marker({element: el})
            .setLngLat(POI.geometry.coordinates)
            .setPopup(POIpopup)
            .addTo(map);

        POImarker.getElement().addEventListener('click', (e) => {
            e.stopPropagation();
    
            // Reset any previously selected markers
            Object.values(personMarkers).forEach(marker => {
                marker.getElement().classList.remove('person-marker-selected');
            });

            selectPOI(POI);
            document.getElementById('map-overlay').classList.add('darkened');
            document.getElementById('info-box').classList.remove('hidden');
        });
    });

    // generate person markers from persons.geojson
    personsGeoJSON.features.forEach(function(person) {
        var el = document.createElement('div');
        el.className = 'person-marker';
        el.style.backgroundImage = `url(./img/${person.properties.name}.svg)`;
        
        const personMarker = new maptilersdk.Marker({element: el})
            .setLngLat(person.geometry.coordinates)
            .addTo(map);

        // Add person marker to personMarkers map to be used in selectPerson function
        personMarkers[person.properties.name] = personMarker;

        personMarker.isAvailable = true;
        personMarker.name = person.properties.name;
        personMarker.destinationStation = person.properties.destinationStation;
        personMarker.home = person.geometry.coordinates;
        personMarker.homeStation = person.properties.homeStation;
        personMarker.isReturning = false;
        personMarker.waitingAtPOI = false;
        

        personMarker.getElement().addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent map click event from firing

            // Reset any previously selected markers
            Object.values(personMarkers).forEach(marker => {
                marker.getElement().classList.remove('person-marker-selected');
            });

            selectPerson(person);
            selectedPersonMarker = personMarker;
            document.getElementById('map-overlay').classList.add('darkened');
            personMarker.getElement().classList.add('person-marker-selected');
            document.getElementById('info-box').classList.remove('hidden');
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
            Object.values(personMarkers).forEach(marker => {
                marker.getElement().classList.remove('person-marker-selected');
            });
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
            console.log('Person reached station');
        }
    }
    requestAnimationFrame(animate);
}

function movePersonToPOI(marker, POIname) {
    const person = personsGeoJSON.features.find(p => p.properties.name === marker.name);
    const POI = findPOIByName(POIname).geometry.coordinates;

    const start = marker.getLngLat();
    const startLngLat = [start.lng, start.lat];
    const duration = 1500;
    const startTime = performance.now();
    const waitTime = person.properties.returnTimer || 3000; // Default wait time if not specified

    const popup = new maptilersdk.Popup({
        className: 'destination-popup',
        closeButton: false,
        closeOnClick: true,
        offset: 25
    }).setHTML('&#128516;');

    function animate(time) {
        const elapsed = time - startTime;
        const t = Math.min(elapsed / duration, 1);

        const lng = startLngLat[0] + (POI[0] - startLngLat[0]) * t;
        const lat = startLngLat[1] + (POI[1] - startLngLat[1]) * t;

        marker.setLngLat([lng, lat]);

        if (t < 1) {
            requestAnimationFrame(animate);
        } else {
            console.log('Person reached POI');
            marker.setPopup(popup);
            marker.togglePopup();
            marker.waitingAtPOI = true;

            // Return timer
            setTimeout(() => {
                popup.remove();
            }, 1500); // Popup timer
            setTimeout(() => {
                marker.waitingAtPOI = false;
                marker.isReturning = true;
                marker.isAvailable = true;
                movePersonToStation(marker, marker.destinationStation);
                marker.destinationStation = marker.homeStation;
            }, waitTime) // Wait for x seconds before returning to station
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
    }).setHTML('&#128522;');

    function animate(time) {
        const elapsed = time - startTime;
        const t = Math.min(elapsed / duration, 1);

        const lng = startLngLat[0] + (coords[0] - startLngLat[0]) * t;
        const lat = startLngLat[1] + (coords[1] - startLngLat[1]) * t;

        marker.setLngLat([lng, lat]);

        if (t < 1) {
            requestAnimationFrame(animate);
        } else {
            console.log('Person returned home');
            marker.setPopup(popup);
            marker.togglePopup();
            marker.isReturning = false;
            marker.isAvailable = false;
            
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

    //TODO Image rotation


    // Display passengers
    const passengerContainer = document.createElement('div');
    passengerContainer.className = 'passenger-container';
    marker.getElement().appendChild(passengerContainer);

    function updatePassengerIcons() {
        passengerContainer.innerHTML = '';
        marker.passengers.forEach(passenger => {
            const icon = document.createElement('img');
            icon.src = `./img/${passenger.name}.svg`;
            icon.className = 'person-marker';

            // This is dupicated code, but it is necessary to add the event listener to the icon
            icon.addEventListener('click', (e) => {
                e.stopPropagation();
            
                // Reset any previously selected markers
                Object.values(personMarkers).forEach(marker => {
                    marker.getElement().classList.remove('person-marker-selected');
                });
    
                // Find the person data
                const person = personsGeoJSON.features.find(p => 
                    p.properties.name === passenger.name
                );
    
                selectPerson(person);
                selectedPersonMarker = passenger;
                document.getElementById('map-overlay').classList.add('darkened');
                passenger.getElement().classList.add('person-marker-selected');
                document.getElementById('info-box').classList.remove('hidden');
            });

            passengerContainer.appendChild(icon);
        });
    }

    function handlePickup(personMarker, currentPos, currentIndex) {
        const personLngLat = personMarker.getLngLat();
        const distance = calculateDistance(currentPos, [personLngLat.lng, personLngLat.lat]);
        
        const destinationStation = findStationByName(personMarker.destinationStation);
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
            console.log(`Added passenger ${personMarker.name} to train going ${direction > 0 ? 'forward' : 'backward'}`);
        }
    }

    function handleDropoff(personMarker, currentPos, dropoffCount = 0) {
        if (personMarker.isAvailable) return;

        const person = personsGeoJSON.features.find(person => 
            person.properties.name === personMarker.name
        );
        const destinationStation = findStationByName(personMarker.destinationStation);
        if (!destinationStation) return;

        const destinationCoords = destinationStation.geometry.coordinates;
        
        if (isNearLocation(currentPos, destinationCoords)) {
            console.log("A destination has been reached");

            personMarker.setLngLat(destinationCoords);
            personMarker.getElement().style.display = 'block';
            if ( personMarker.isReturning ) {
                movePersonToHome(personMarker, personMarker.home);
            } else {
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
            const destinationStation = findStationByName(personMarker.destinationStation);
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
            const destinationStation = findStationByName(passenger.destinationStation);
            if (!destinationStation) return false;
            return isNearLocation(currentPos, destinationStation.geometry.coordinates);
        });
    
        return hasViablePassenger || isDestinationStation;
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

            Object.values(personMarkers).forEach(personMarker => 
                handlePickup(personMarker, marker.getLngLat(), currentIndex)
            );

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

            const step = 0.00015; // Adjust step size for animation train speed
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
    selectedPerson = person;
    selectedPersonMarker = personMarkers[person.properties.name];

    // document.getElementById(person.properties.name).classList.add('person-icon-active');
    // document.getElementById('info-image').innerHTML = document.getElementById(person.properties.name).outerHTML;
    document.getElementById('info-title').innerHTML = person.properties.name;
    document.getElementById('info-start').innerHTML = person.properties.homeStation;
    document.getElementById('info-destination').innerHTML = person.properties.destinationStation;
    document.getElementById('info-text').innerHTML = person.properties.info;
    document.getElementById('poi-image-container').innerHTML = '';

    document.getElementById('map-overlay').classList.add('darkened');
    document.getElementById('info-box').classList.remove('hidden');

    // Update marker selection visual
    Object.values(personMarkers).forEach(marker => {
        marker.getElement().classList.remove('person-marker-selected');
    });
    personMarkers[person.properties.name].getElement().classList.add('person-marker-selected');

}

function selectPOI(poi) {
    document.getElementById('info-title').innerHTML = poi.properties.name;
    document.getElementById('info-start').innerHTML = '';
    document.getElementById('info-destination').innerHTML = '';
    document.getElementById('info-text').innerHTML = '';
    document.getElementById('poi-image-container').innerHTML = `<img id="poi-image" src="${poi.properties.image}" alt="${poi.properties.name}" class="info-image">`;

}


function startSimulation() {
    // Clear any existing timeouts
    simulationTimeouts.forEach(timeout => clearTimeout(timeout));
    simulationTimeouts = [];

    // Start train
    moveTrainMarker(train1Marker, routeCoordinates, 1);
    moveTrainMarker(train2Marker, routeCoordinates, -1);

    personsGeoJSON.features.forEach(person => {
        const delay = person.properties.startTimer || 0; // Default delay if not specified
        const personMarker = personMarkers[person.properties.name];

        simulationTimeouts.push(setTimeout(() => {
            movePersonToStation(personMarker, personMarker.homeStation);
        }, delay));
    })
}