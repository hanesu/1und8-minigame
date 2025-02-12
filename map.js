maptilersdk.config.apiKey = '9X2VSCQEbqyH6TCJc0zM';
const map = new maptilersdk.Map({
container: 'map', // container's id or the HTML element to render the map
style: maptilersdk.MapStyle.STREETS,
center: [8.768807320860198, 53.01938559330482], // starting position [lng, lat]
zoom: 13, // starting zoom  
minZoom: 12,
maxZoom: 15,
});

let personMarkerSelected = false;
let stationsGeoJSON = null;
let POIsGeoJSON = null;
let personsGeoJSON = null;
let selectedPerson = null;
let canSelectPerson = true;
// personMarkers map to be used in selectPerson function
let personMarkers = {};

Promise.all([
    fetch('/geojson/stations.geojson').then(response => response.json()),
    fetch('/geojson/POIs.geojson').then(response => response.json()),
    fetch('/geojson/persons.geojson').then(response => response.json())
]).then(([stationsData, POIsData, personsData]) => {
    stationsGeoJSON = stationsData;
    POIsGeoJSON = POIsData;
    personsGeoJSON = personsData;

    routeCoordinates = stationsData.features.map(feature => feature.geometry.coordinates);
    POIcoordinates = POIsData.features.map(feature => feature.geometry.coordinates);
    initializeMap();
    generatePersonIcons();
});



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

    POIsGeoJSON.features.forEach(POI => {
        const POIpopup = new maptilersdk.Popup().setText(POI.properties.name);
        const POImarker = new maptilersdk.Marker({
            color: '#0000FF',
            size: 20,
            anchor: 'bottom'
        })
            .setLngLat(POI.geometry.coordinates)
            .setPopup(POIpopup)
            .addTo(map);
        
        POImarker.getElement().addEventListener('click', () => {
            if (personMarkerSelected && selectedPersonMarker) {
                personMarkerSelected = false;
                const POIdestination = POI.geometry.coordinates;
                
                // Find nearest station to POI
                const POIpoint = {
                    type: 'Feature',
                    geometry: {
                        type: 'Point',
                        coordinates: POIdestination
                    }
                };
                const nearestStationToPOI = turf.nearestPoint(POIpoint, stationsGeoJSON);
                const stationDestination = nearestStationToPOI.geometry.coordinates;
                if(selectedPerson.properties.destination === POI.properties.name) {
                    canSelectPerson = false;
                    moveMarkerToNearestStation(selectedPersonMarker, stationsGeoJSON, stationDestination, POIdestination);
                } else {
                    console.log('you picked the wrong station fool');
                }
            }
        });
    });

    // generate person markers from persons.geojson
    personsGeoJSON.features.forEach(function(person) {
        var el = document.createElement('div');
        el.className = 'personMarker';
        el.style.backgroundImage = `url(./img/${person.properties.name}.png)`;
        el.style.width = '40px';
        el.style.height = '40px';
        el.style.backgroundSize = 'contain';
        el.style.backgroundRepeat = 'no-repeat';
        
        const personMarker = new maptilersdk.Marker({element: el})
            .setLngLat(person.geometry.coordinates)
            .addTo(map);

        // Add person marker to personMarkers map to be used in selectPerson function
        personMarkers[person.properties.name] = personMarker;
            
        personMarker.getElement().addEventListener('click', () => {
            selectPerson(person);
            selectedPersonMarker = personMarker;
        });
    });

    // initialize map itself and add layers
    map.on('load', async function() {
        map.addSource('stations', {
            type: 'geojson',
            data: '/geojson/stations.geojson'
        });

        map.addSource('route', {
            type: 'geojson',
            data: route
        });

        const stationImage = await map.loadImage('/img/station.png');
        map.addImage('stationIcon', stationImage.data);

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
                'icon-size': 0.075,
            },
            paint: {
                    
            }
        });

        map.on('click', (e) => {
        });
    });
}

/**
 * Moves marker to the nearest station.
 *
 * @param   marker  the marker to be moved.
 * @param   stationsGeoJSON  the GeoJSON object containing the stations.
 * @param   destinationStation  the destination station (coordinate pair).
 * @param   destinationPOI  the destination POI (coordinate pair).
 * @callback moveMarkerAlongRoute called after the marker has reached the nearest station.
 */
function moveMarkerToNearestStation(marker, stationsGeoJSON, destinationStation, destinationPOI) {
    const startPoint = {
        type: 'Feature',
        geometry: {
            type: 'Point',
            coordinates: [marker.getLngLat().lng, marker.getLngLat().lat]
        }
    }
    // Calculate nearestPoint by selecting nearest point on the route
    const nearestPoint = turf.nearestPoint(startPoint, stationsGeoJSON);
    const endPoint = nearestPoint.geometry.coordinates;

    const start = marker.getLngLat();
    const startLngLat = [start.lng, start.lat];
    const duration = 1500; // duration of the animation in milliseconds
    const startTime = performance.now();

    
    function animate(time) {
        const elapsed = time - startTime;
        const t = Math.min(elapsed / duration, 1); // normalize time to [0, 1]

        const lng = startLngLat[0] + (endPoint[0] - startLngLat[0]) * t;
        const lat = startLngLat[1] + (endPoint[1] - startLngLat[1]) * t;

        marker.setLngLat([lng, lat]);

        if (t < 1) {
            requestAnimationFrame(animate);
        } else {
            moveMarkerAlongRoute(marker, routeCoordinates, destinationStation, destinationPOI);
        }
    }
    requestAnimationFrame(animate);
}

/**
 * Moves marker along route line.
 *
 * @param   marker  the marker to be moved.
 * @param   route  routeCoordinates map.
 * @param   destinationStation  the destination station (coordinate pair).
 * @param   destinationPOI  the destination POI (coordinate pair).
 * @callback moveToFinalDestination called after the marker has reached the last station.
 */
function moveMarkerAlongRoute(marker, route, destinationStation, destinationPOI) {
    const startPoint = marker.getLngLat();
    let nearestPoint = route[0];
    let minDistance = calculateDistance(startPoint, nearestPoint);

    const el = marker.getElement();
    const originalImg = el.style.backgroundImage;
    el.style.backgroundImage = 'url(./img/train2.png)';

    for (let i = 1; i < route.length; i++) {
        const dist = calculateDistance(startPoint, route[i]);
        if (dist < minDistance) {
            nearestPoint = route[i];
            minDistance = dist;
        }
    }

    let currentIndex = route.indexOf(nearestPoint);
    const tolerance = 0.0001;
    let destinationIndex = route.findIndex(point => 
        Math.abs(point[0] - destinationStation[0]) < tolerance && 
        Math.abs(point[1] - destinationStation[1]) < tolerance
    );
    let direction = currentIndex < destinationIndex ? 1 : -1;

    // console.log('Direction:', direction, ' Destination:', destinationIndex);

    function animate() {
        if ((direction === 1 && currentIndex < destinationIndex) || (direction === -1 && currentIndex > destinationIndex)) {
            const currentPos = marker.getLngLat();
            const nextIndex = currentIndex + direction;
            const nextPos = route[nextIndex];

            if (!nextPos) {
                marker.setLngLat(destinationStation);
                return;
            }

            const step = 0.0001; // Adjust step size for smoothness
            const dx = nextPos[0] - currentPos.lng;
            const dy = nextPos[1] - currentPos.lat;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < step) {
                marker.setLngLat(nextPos);
                currentIndex = nextIndex;
            } else {
                const angle = Math.atan2(dy, dx);
                const newLng = currentPos.lng + step * Math.cos(angle);
                const newLat = currentPos.lat + step * Math.sin(angle);
                marker.setLngLat([newLng, newLat]);
            }

            if (calculateDistance(marker.getLngLat(), destinationStation) < step) {
                el.style.backgroundImage = originalImg;
                marker.setLngLat(destinationStation);
                moveToFinalDestination(marker, destinationPOI);
            } else {
                requestAnimationFrame(animate);
            }
        } else {
            marker.setLngLat(destinationStation);
        }
    }

    animate();
}

/**
 * Moves marker to actual POI that is the destination
 *
 * @param   marker  the marker to be moved.
 * @param   destination  destinationPOI.
 */
function moveToFinalDestination(marker, destination) {
    const start = marker.getLngLat();
    const startLngLat = [start.lng, start.lat];
    const duration = 1500;
    const startTime = performance.now();

    function animate(time) {
        const elapsed = time - startTime;
        const t = Math.min(elapsed / duration, 1);

        const lng = startLngLat[0] + (destination[0] - startLngLat[0]) * t;
        const lat = startLngLat[1] + (destination[1] - startLngLat[1]) * t;

        marker.setLngLat([lng, lat]);

        if (t < 1) {
            requestAnimationFrame(animate);
        } else {
            if (calculateDistance(marker.getLngLat(), destination) < 0.0001) {
                console.log('Destination reached');
                const personName = selectedPerson.properties.name;
                const iconEl = document.getElementById(personName);
                iconEl.classList.remove('person-icon-selected');
                iconEl.classList.add('person-icon-done')
                canSelectPerson = true;
                marker.remove();
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

function generatePersonIcons() {
    const personIconsContainer = document.querySelector('.person-icons');
    personsGeoJSON.features.forEach(person => {
        const img = document.createElement('img');
        img.src = `/img/${person.properties.name}.png`;
        img.setAttribute('data-person-name', person.properties.name);
        img.alt = person.properties.name;
        img.className = 'person-icon';
        img.id = person.properties.name;
        personIconsContainer.appendChild(img);
    });

    document.querySelectorAll('.person-icon').forEach( el => {
        el.addEventListener('click', function() {
            const personName = el.getAttribute('data-person-name');
            const person = personsGeoJSON.features.find(person => person.properties.name === personName);
            selectPerson(person);
        });
    });
}

function selectPerson(person) {
    if (!canSelectPerson) {
        return;
    }
    personMarkerSelected = true;
    selectedPerson = person;
    selectedPersonMarker = personMarkers[person.properties.name];

    personsGeoJSON.features.forEach(function(person) {
        document.getElementById(person.properties.name).classList.remove('person-icon-selected');
    });
    // Highlight selected person icon and fill title and description
    document.getElementById(person.properties.name).classList.add('person-icon-selected');
    document.getElementById('person-title').innerHTML = person.properties.name;
    document.getElementById('person-info').innerHTML = person.properties.info;
}
