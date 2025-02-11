maptilersdk.config.apiKey = '9X2VSCQEbqyH6TCJc0zM';
const map = new maptilersdk.Map({
container: 'map', // container's id or the HTML element to render the map
style: maptilersdk.MapStyle.STREETS,
center: [8.768807320860198, 53.01938559330482], // starting position [lng, lat]
zoom: 13, // starting zoom
});

let personMarkerSelected = false;
let stationsGeoJSON = null;
let POIsGeoJSON = null;
let personsGeoJSON = null;

Promise.all([
    fetch('/stations.geojson').then(response => response.json()),
    fetch('/POIs.geojson').then(response => response.json()),
    fetch('/persons.geojson').then(response => response.json())
]).then(([stationsData, POIsData, personsData]) => {
    stationsGeoJSON = stationsData;
    POIsGeoJSON = POIsData;
    personsGeoJSON = personsData;

    routeCoordinates = stationsData.features.map(feature => feature.geometry.coordinates);
    POIcoordinates = POIsData.features.map(feature => feature.geometry.coordinates);
    initializeMap();
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
    
    const POImarkers = [];
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

        POImarkers[POI.properties.name] = POImarker;
        
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
                
                moveMarkerToNearestStation(selectedPersonMarker, stationsGeoJSON, stationDestination, POIdestination);
            }
        });
    });

    personsGeoJSON.features.forEach(person => {
        const personMarker = new maptilersdk.Marker({
            color: '#008000',
            size: 20,
            anchor: 'bottom'
        })
            .setLngLat(person.geometry.coordinates)
            .setPopup(new maptilersdk.Popup().setText(person.properties.name))
            .addTo(map);
    
        personMarker.getElement().addEventListener('click', () => {
            personMarkerSelected = true;
            selectedPersonMarker = personMarker;
            console.log('Person marker clicked', personMarker);
            
        });
    });

    

    map.on('load', () => {
        map.addSource('stations', {
            type: 'geojson',
            data: '/stations.geojson'
        });

        map.addSource('route', {
            type: 'geojson',
            data: route
        });

        map.addLayer({
            id: 'route',
            type: 'line',
            source: 'route',
            layout: {
                'line-join': 'round',
                'line-cap': 'round'
            },
            paint: {
                'line-color': '#FF0000',
                'line-width': 4
            }
        });

        map.addLayer({
            id: 'stations-layer',
            type: 'circle',
            source: 'stations',
            paint: {
                'circle-radius': 10,
                'circle-color': '#B42222'
            }
        });

        map.on('click', (e) => {
        });
    });
}

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
    console.log(endPoint);
    requestAnimationFrame(animate);
}

function moveMarkerAlongRoute(marker, route, destinationStation, destinationPOI) {
    const startPoint = marker.getLngLat();
    let nearestPoint = route[0];
    let minDistance = calculateDistance(startPoint, nearestPoint);

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

    console.log('Direction:', direction, ' Destination:', destinationIndex);

    function animate() {
        if ((direction === 1 && currentIndex < destinationIndex) || (direction === -1 && currentIndex > destinationIndex)) {
            const currentPos = marker.getLngLat();
            const nextIndex = currentIndex + direction;
            const nextPos = route[nextIndex];

            // console.log('Current:', currentPos, ' Next:', nextPos, ' CurrentIndex:', currentIndex);

            if (!nextPos) {
                marker.setLngLat(destinationStation);
                return;
            }

            const step = 0.00005; // Adjust step size for smoothness
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
        }
    }

    requestAnimationFrame(animate);
}

function calculateDistance(point1, point2) {
    const dx = point1.lng - point2[0];
    const dy = point1.lat - point2[1];
    return Math.sqrt(dx * dx + dy * dy);
}
