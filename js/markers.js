import { MAP_CONFIG, svgCache } from "./config.js";
import { findStationByName, findPOIByName, isNearLocation } from "./utils.js";

export class Station {
    static allStations = {};

    constructor(stationData, map, onSelect) {
        this.stationData = stationData;
        this.map = map;
        this.onSelect = onSelect;
        this.name = stationData.properties.name;
        this.location = stationData.geometry.coordinates;

        const el = document.createElement('div');
        el.className = 'station-marker';

        this.marker = new maptilersdk.Marker({element: el, anchor: 'bottom'})
            .setLngLat(stationData.geometry.coordinates)
            .addTo(map);

        this.marker.getElement().addEventListener('click', (e) => {
            e.stopPropagation(); 
            this.onSelect(stationData);
        });
        
        Station.allStations[this.name] = this;
    }
}

export class Person {
    static allPeople = {};

    constructor(personData, map, onSelect) {
        this.personData = personData;
        this.map = map;
        this.onSelect = onSelect;

        this.name = personData.properties.name;
        this.home = personData.geometry.coordinates;

        this.pickupStationName = personData.properties.homeStation;
        this.dropoffStationName = personData.properties.poiStation;
        this.pickupStation = null; // Station object
        this.dropoffStation = null; // Station object

        this.isReadyForPickup = false;
        this.isReadyToMoveToStation = true;

        this.isAvailable = true;
        this.isReturning = false;
        this.waitingAtPOI = false;
        this.isMoving = false;
        this.journeyCompleted = false;

        const el = document.createElement('div');
        el.className = 'person-marker';
        el.setAttribute('data-name', this.name);
        el.style.backgroundImage = `url(./img/${this.name}.svg)`;

        fetch(`./img/${this.name}.svg`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Image for ${this.name} not found`);
                }
                const url = `./img/${this.name}.svg`;
                svgCache.set(this.name, url);
                el.style.backgroundImage = `url(${url})`;
            })
            .catch(error => {
                console.warn(error);
                const fallbackUrl = './img/Hund.svg';
                svgCache.set(this.name, fallbackUrl);
                el.style.backgroundImage = `url(${fallbackUrl})`; 
            });
        
        this.marker = new maptilersdk.Marker({element: el})
            .setLngLat(personData.geometry.coordinates)
            .addTo(map);

        // Add person to Person.allPeople map
        Person.allPeople[personData.properties.name] = this;

        this.marker.getElement().addEventListener('click', (e) => {
            e.stopPropagation(); 
            this.onSelect(personData);
        });
    }

    static initializeStations() {
        // Resolve station names to Station objects using Station.markers lookup
        Object.values(Person.allPeople).forEach(person => {
            if (!person) return;
            
            person.pickupStation = Station.allStations[person.pickupStationName] || 
                { name: person.pickupStationName, location: null };
            person.dropoffStation = Station.allStations[person.dropoffStationName] || 
                { name: person.dropoffStationName, location: null };
        });
    }

    moveToHome() {
        const start = this.marker.getLngLat();
        const startLngLat = [start.lng, start.lat];
        const endLngLat = this.home;
        const duration = 1500;
        const startTime = performance.now();

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const currentLng = startLngLat[0] + (endLngLat[0] - startLngLat[0]) * progress;
            const currentLat = startLngLat[1] + (endLngLat[1] - startLngLat[1]) * progress;
            this.marker.setLngLat([currentLng, currentLat]);

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                this.waitingAtPOI = false;
                this.isAvailable = true;
                this.isMoving = false;

                // Return stations to original state
                this.pickupStation = Station.allStations[this.personData.properties.homeStation]?.person;
                this.dropoffStation = Station.allStations[this.personData.properties.poiStation]?.person;
                this.isReturning = false;
            }
        };
        requestAnimationFrame(animate);
    }

    moveToStation(station) {
        const start = this.marker.getLngLat();
        const startLngLat = [start.lng, start.lat];
        const endLngLat = station.stationData.geometry.coordinates;
        const duration = MAP_CONFIG.personAnimDuration;
        const startTime = performance.now();

        const currentPOI = POI.findPOIForPerson(this);
        if (currentPOI) POI.removePerson(this, currentPOI);

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const currentLng = startLngLat[0] + (endLngLat[0] - startLngLat[0]) * progress;
            const currentLat = startLngLat[1] + (endLngLat[1] - startLngLat[1]) * progress;
            this.marker.setLngLat([currentLng, currentLat]);

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                this.isMoving = false;
                this.isReadyForPickup = true;
            }
        }
        requestAnimationFrame(animate);
    }

    moveToPOI(poiName) {
        const poi = findPOIByName(poiName);
        if (!poi) return;

        const start = this.marker.getLngLat();
        const startLngLat = [start.lng, start.lat];
        const endLngLat = poi.poiData.geometry.coordinates;
        const duration = MAP_CONFIG.personAnimDuration;
        const startTime = performance.now();

        const currentPOI = POI.findPOIForPerson(this);
        if (currentPOI) POI.removePerson(this, currentPOI);

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const currentLng = startLngLat[0] + (endLngLat[0] - startLngLat[0]) * progress;
            const currentLat = startLngLat[1] + (endLngLat[1] - startLngLat[1]) * progress;
            this.marker.setLngLat([currentLng, currentLat]);

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                POI.addPerson(this, poiName);
                this.waitingAtPOI = true;
                this.isMoving = false;
                this.marker.getElement().style.display = 'none';  // Hide the marker while at the POI
                // Swap stations for return journey
                const temp = this.pickupStation;
                this.pickupStation = this.dropoffStation;
                this.dropoffStation = temp;
            }
        };
        requestAnimationFrame(animate);
    }
}

export class POI {
    static allPOIs = {};
    static peopleAtPOIs = {};
    static selectPersonCallback = null;

    constructor(poiData, map, onSelect) {
        this.poiData = poiData;
        this.map = map;
        this.onSelect = onSelect;

        const container = document.createElement('div');
        container.className = 'poi-container';

        const el = document.createElement('div');
        el.className = 'poi-marker';
        el.style.backgroundImage = `url(${this.poiData.properties.image})`;

        const peopleContainer = document.createElement('div');
        peopleContainer.className = 'people-container';
        container.appendChild(el);
        container.appendChild(peopleContainer);

        this.marker = new maptilersdk.Marker({element: container, anchor: 'center'})
            .setLngLat(poiData.geometry.coordinates)
            .addTo(map);

        this.marker.peopleContainer = peopleContainer;

        // Add POI marker to POI.markers map to be used in selectPOI function
        POI.allPOIs[poiData.properties.name] = this;

        el.addEventListener('click', (e) => {
            e.stopPropagation();
            
            Object.values(Person.allPeople).forEach(person => {
                person.marker.getElement().classList.remove('marker-selected');
            });

            this.onSelect(poiData);
        });
    }

    static addPerson(person, poiName) {
        if (!POI.peopleAtPOIs[poiName]) {
            POI.peopleAtPOIs[poiName] = [];
        }
        if (!POI.peopleAtPOIs[poiName].includes(person)) {
            POI.peopleAtPOIs[poiName].push(person);
        }
        POI.updatePeopleDisplay(poiName);
    }

    static removePerson(person, poiName) {
        if (POI.peopleAtPOIs[poiName]) {
            POI.peopleAtPOIs[poiName] = POI.peopleAtPOIs[poiName].filter(p => p !== person);
            POI.updatePeopleDisplay(poiName);
        }
        person.marker.getElement().style.display = 'block';  // Show the marker again
    }

    static updatePeopleDisplay(poiName) {
        const poiMarker = POI.allPOIs[poiName].marker;
        if (!poiMarker || !poiMarker.peopleContainer) return;

        poiMarker.peopleContainer.innerHTML = '';

        if (POI.peopleAtPOIs[poiName]) {
            POI.peopleAtPOIs[poiName].forEach(person => {
                const personIcon = document.createElement('div');
                personIcon.className = 'poi-person';
                personIcon.style.backgroundImage = `url(./img/${person.name}.svg)`;
                personIcon.setAttribute('data-name', person.name);
                
                personIcon.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const personData = person.personData;
                    if (POI.selectPersonCallback && personData) {
                        POI.selectPersonCallback(personData);
                    }
                });
                
                poiMarker.peopleContainer.appendChild(personIcon);
            });
        }
    }

    static getPeopleAtPOI(poiName) {
        return POI.peopleAtPOIs[poiName] || [];
    }

    static findPOIForPerson(person) {
        for (const [poiName, people] of Object.entries(POI.peopleAtPOIs)) {
            if (people.includes(person)) {
                return poiName;
            }
        }
        return null;
    }
}

export class Train {
    static selectPersonCallback = null;

    constructor(startCoords, direction, map) {
        const el = document.createElement('div');
        el.className = 'train-marker';
        this.marker = new maptilersdk.Marker({element: el, anchor: 'bottom'})
            .setLngLat(startCoords)
            .addTo(map);

        this.passengers = []; // Array of passenger markers
        this.direction = direction; // 1 or -1
    }
    /**
     * Makes a person move if the train is approaching their pickup station and will pass their dropoff station
     * @param {Object} route 
     * @param {number} currentIndex 
     */
    checkForPickupStation(route, currentIndex) {
        const lookAheadDistance = MAP_CONFIG.pickupStationsAhead;

        Object.values(Person.allPeople).forEach(person => {
            // Check if the person is ready to move to station and if the train is approaching their pickup station
            if (!person.isReadyToMoveToStation) return;
            const pickupIndex = route.findIndex(point =>
                isNearLocation({lng: point[0], lat: point[1]}, person.pickupStation.location, 0.0001)
            );
            if (pickupIndex === -1) return;

            const isApproachingPickup = this.direction === 1 ?
                (pickupIndex > currentIndex && pickupIndex <= currentIndex + lookAheadDistance) :
                (pickupIndex < currentIndex && pickupIndex >= currentIndex - lookAheadDistance);
            
            const dropoffIndex = route.findIndex(point =>
                isNearLocation({lng: point[0], lat: point[1]}, person.dropoffStation.stationData.geometry.coordinates, 0.0001)
            );
            const willPassDropoff = this.direction === 1 ?
                (dropoffIndex > currentIndex && dropoffIndex <= route.length - 1) :
                (dropoffIndex < currentIndex && dropoffIndex >= 0);

            if (isApproachingPickup && willPassDropoff) {
                person.isReadyToMoveToStation = false;
                person.moveToStation(person.pickupStation);
            };
        });

    }

    moveAlongRoute(route) {
        let currentIndex = this.direction === 1 ? 0 : route.length - 1;
        let destinationIndex = this.direction === 1 ? route.length - 1 : 0;

        let isWaitingAtStation = false;
        let waitStartTime = null;
        const stationWaitTime = 1000;
        let lastStationIndex = null;

        // Display passengers
        const passengerContainer = document.createElement('div');
        passengerContainer.className = 'passenger-container';
        this.marker.getElement().appendChild(passengerContainer);

        const updatePassengerIcons = () => {
            passengerContainer.innerHTML = '';
            this.passengers.forEach(passenger => {
                const icon = document.createElement('img');
                icon.src = svgCache.get(passenger.name) || './img/Hund.svg';
                icon.className = 'person-marker-small';
                icon.setAttribute('data-name', passenger.name);
                if (state.selectedPerson === passenger.name) {
                    icon.classList.add('marker-selected');
                }

                icon.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (passenger.personData && Train.selectPersonCallback) {
                        Train.selectPersonCallback(passenger.personData);
                    }
                });

                passengerContainer.appendChild(icon);
            });
        };

        /**
         * @param {Object} currentPos - Current position of the train {lng, lat}
         * @param {number} currentIndex - Current index of the train on the route
         * @returns {boolean} whether the train should stop at this station
         */
        const shouldStopAtStation = (currentPos, currentIndex) => {
            // Stop if we have a passenger to drop off at this location
            const isDropoffStation = this.passengers.some(passenger => {
                const dropoffStation = findStationByName(passenger.dropoffStation);
                if (!dropoffStation) return false;
                return isNearLocation(currentPos, dropoffStation.stationData.geometry.coordinates, 0.0001);
            });
            if (isDropoffStation) return true;

            // Stop if we have a passenger to pick up at this location
            const hasPickup = Object.values(Person.allPeople).some(person => {
                if (!person.isReadyForPickup) return false;

                const personLngLat = person.marker.getLngLat();
                if (!isNearLocation(currentPos, [personLngLat.lng, personLngLat.lat])) return false;

                const pickupIndex = route.findIndex(point =>
                    isNearLocation({lng: point[0], lat: point[1]}, person.pickupStation.stationData.geometry.coordinates, 0.0001)
                );
                const dropoffIndex = route.findIndex(point =>
                    isNearLocation({lng: point[0], lat: point[1]}, person.dropoffStation.stationData.geometry.coordinates, 0.0001)
                );
                if (pickupIndex === -1 || dropoffIndex === -1) return false;

                const willPassDropoff = this.direction === 1 ?
                    (dropoffIndex > currentIndex && dropoffIndex <= destinationIndex) :
                    (dropoffIndex < currentIndex && dropoffIndex >= destinationIndex);
                if (!willPassDropoff) return false;
                return true;
            });

            return isDropoffStation || hasPickup;
        };

        const animate = (timestamp) => {

            if (isWaitingAtStation) {
                if (!waitStartTime) waitStartTime = timestamp;

                const waitElapsed = timestamp - waitStartTime;
                if (waitElapsed < stationWaitTime) {
                    requestAnimationFrame(animate);
                    return;
                }
                isWaitingAtStation = false;
                waitStartTime = null;
            }

            this.checkForPickupStation(route, currentIndex);

            if ((this.direction === 1 && currentIndex < destinationIndex) ||
                (this.direction === -1 && currentIndex > destinationIndex)) {

                const currentPos = this.marker.getLngLat();
                const nextIndex = currentIndex + this.direction;
                const nextPos = route[nextIndex];

                const step = MAP_CONFIG.trainStepSize;
                const dx = nextPos[0] - currentPos.lng;
                const dy = nextPos[1] - currentPos.lat;
                const distance = Math.sqrt(dx * dx + dy * dy);

                // Move to next point
                if (distance < step) {
                    this.marker.setLngLat(nextPos);
                    currentIndex = nextIndex;
                } else {
                    const angle = Math.atan2(dy, dx);
                    const newLng = currentPos.lng + step * Math.cos(angle);
                    const newLat = currentPos.lat + step * Math.sin(angle);
                    this.marker.setLngLat([newLng, newLat]);
                }

                // Check if we should stop at next location
                if (lastStationIndex !== currentIndex && shouldStopAtStation({lng: nextPos[0], lat: nextPos[1]}, currentIndex)) {
                    isWaitingAtStation = true;
                    waitStartTime = timestamp;
                    return;
                }

                requestAnimationFrame(animate);
            } else {
                // Reached end of route, reverse direction
                setTimeout(() => {
                    this.direction *= -1;
                    currentIndex = this.direction === 1 ? 0 : route.length - 1;
                    destinationIndex = this.direction === 1 ? route.length - 1 : 0;
                    this.marker.setLngLat(route[currentIndex]);
                    lastStationIndex = null;
                    requestAnimationFrame(animate);
                }, 10000);
            }
        };

        requestAnimationFrame(animate);
    }
}