var map = L.map('map').setView([53.01, 8.78], 13);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

const trainTrack = L.polyline([
    [53.01938559330482, 8.768807320860198],
    [53.026581635632986, 8.747607592348695],
    [53.02940126579498, 8.738753072349676],
    [53.032212218810244, 8.729351092739437],
    [53.0386225164617, 8.725613261268062]
], { color: 'blue' }).addTo(map);  // Now using L.Polyline


const stations = [
    { lat: 53.01938559330482, lng: 8.768807320860198, name: "Stuhrbaum"},
    { lat: 53.026581635632986, lng: 8.747607592348695, name: "Bf Stuhr"},
    { lat: 53.02940126579498, lng: 8.738753072349676, name: "Beethovenstraße"},
    { lat: 53.032212218810244, lng: 8.729351092739437, name: "Hespenstraße"},
    { lat: 53.0386225164617, lng: 8.725613261268062, name: "Hespenstraße"},
]

let avatarClicked = false;
let avatarMarker;

// Create an avatar marker and set its initial position
avatarMarker = L.marker([53.02695257520934, 8.750997221844178]).addTo(map);
avatarMarker.bindPopup("Click a station to move").openPopup();

// Capture click on the avatar marker
avatarMarker.on('click', function () {
    avatarClicked = true;
    avatarMarker.bindPopup('Click a station to move to').openPopup();
});

// Capture click on the station markers
stations.forEach(station => {
    const stationMarker = L.marker([station.lat, station.lng]).addTo(map);
    stationMarker.bindPopup(station.name);

    stationMarker.on('click', function () {
        if (avatarClicked) {
            moveAvatarAlongTrack(station);
            avatarClicked = false; // Reset after moving the avatar
        }
    });
});

function findNearestStation() {
    let nearestStation = stations[0];
    let minDistance = avatarMarker.getLatLng().distanceTo(L.latLng(nearestStation.lat, nearestStation.lng));

    stations.forEach(station => {
        const stationLatLng = L.latLng(station.lat, station.lng);
        const distance = avatarMarker.getLatLng().distanceTo(stationLatLng);
        if (distance < minDistance) {
            nearestStation = station;
            minDistance = distance;
        }
    });

    return nearestStation;
}

// Function to animate the avatar smoothly along the polyline
function moveAvatarAlongTrack(destinationStation) {
    // Find the nearest station to the avatar
    const nearestStation = findNearestStation();

    // Start the avatar at the nearest station
    const path = trainTrack.getLatLngs();  // Get the latLngs of the polyline
    const nearestStationIndex = path.findIndex(point => 
        point.lat === nearestStation.lat && point.lng === nearestStation.lng
    );

    // Ensure the avatar starts at the nearest station
    avatarMarker.setLatLng(L.latLng(nearestStation.lat, nearestStation.lng));

    // Find the index of the destination station in the polyline
    const destinationLatLng = L.latLng(destinationStation.lat, destinationStation.lng);
    const destinationIndex = path.findIndex(point => 
        point.lat === destinationLatLng.lat && point.lng === destinationLatLng.lng
    );

    if (destinationIndex === -1) return; // Station not found in the polyline

    let currentIndex = nearestStationIndex;
    let duration = 5000;  // Duration of the animation in milliseconds
    let startTime = null;

    // Calculate total path length
    let totalLength = 0;
    for (let i = 1; i < path.length; i++) {
        totalLength += path[i - 1].distanceTo(path[i]);
    }

    function animateAvatar(timestamp) {
        if (!startTime) startTime = timestamp;

        const progress = (timestamp - startTime) / duration;  // Calculate progress (0 to 1)
        const traveledDistance = progress * totalLength;  // How much distance to travel along the path

        let traveled = 0;
        let segmentIndex = currentIndex;

        // Find where we are along the path
        while (traveled + path[segmentIndex].distanceTo(path[segmentIndex + 1]) < traveledDistance) {
            traveled += path[segmentIndex].distanceTo(path[segmentIndex + 1]);
            segmentIndex++;
        }

        // Interpolate between the two closest points
        const segmentProgress = (traveledDistance - traveled) / path[segmentIndex].distanceTo(path[segmentIndex + 1]);
        const currentLatLng = L.latLng(
            path[segmentIndex].lat + segmentProgress * (path[segmentIndex + 1].lat - path[segmentIndex].lat),
            path[segmentIndex].lng + segmentProgress * (path[segmentIndex + 1].lng - path[segmentIndex].lng)
        );

        avatarMarker.setLatLng(currentLatLng); // Update avatar's position

        // If we reached the destination station or exceeded it
        if (segmentIndex >= destinationIndex || progress >= 1) {
            avatarMarker.setLatLng(destinationLatLng);  // Ensure the avatar reaches the exact destination
        } else {
            requestAnimationFrame(animateAvatar);  // Continue animation
        }
    }

    requestAnimationFrame(animateAvatar);  // Start the animation
}


/*
function calculateAndFollowRoute(start, destination) {
    // Use Leaflet Routing Machine to calculate the route
    L.Routing.control({
        waypoints: [
            L.latLng(start.lat, start.lng),
            L.latLng(destination.lat, destination.lng)
        ],
        createMarker: () => null, // Prevent additional markers from being created
        routeWhileDragging: false
    }).on('routesfound', (e) => {
        const route = e.routes[0];
        const coordinates = route.coordinates;

        // Animate the marker along the route
        animateMarker(coordinates);
    }).addTo(map);
}

function animateMarker(coordinates) {
    let i = 0;

    function move() {
        if (i < coordinates.length) {
            avatar.setLatLng([coordinates[i].lat, coordinates[i].lng]);
            i++;
            setTimeout(move, 50); // Adjust speed by changing the timeout
        }
    }

    move();
}

// Example: Click to set destination
map.on('click', (e) => {
    const destination = e.latlng;
    const start = avatar.getLatLng();
    calculateAndFollowRoute(start, destination);
});
*/

/*
// Animate marker to the nearest point on the polyline
function animateMarkerToNearestPoint(marker, polyline, clickLatLng) {
    // Find the closest point on the polyline to the clicked point
    const closestPoint = L.GeometryUtil.closest(map, polyline, clickLatLng);

    // Move the marker to the closest point
    marker.setLatLng(closestPoint);
}

// Example usage when the user clicks on the map
map.on('click', (e) => {
    const clickedPoint = e.latlng;

    // Assuming 'avatar' is the marker you want to move
    animateMarkerToNearestPoint(avatar, railPolyline, clickedPoint);

    // Optionally, you can bind a popup to the new position
    avatar.bindPopup('Marker moved to nearest point').openPopup();
});
*/