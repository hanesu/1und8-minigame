import { MAP_CONFIG, svgCache } from "./config.js";
import { isNearLocation } from "./utils.js";

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

        this.isReadyForPickup = false; // Person ready to be picked up at station
        this.isReadyToMoveToStation = true; // Person ready to move to station when train is approaching

        this.poiTimer = personData.properties.poiTimer || MAP_CONFIG.defaultPOITimer;

        this.isReturning = false; // Person is on their return journey from POI to home
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
    /**
     * moves Person from dropoff station back to home location. Also resets pickup and dropoff stations
     */
    moveToHome() {
        console.log(`Moving ${this.name} back home...`);
        const start = this.marker.getLngLat();
        const startLngLat = [start.lng, start.lat];
        const endLngLat = this.home;
        const duration = 1500;
        const startTime = performance.now();

        const popup = new maptilersdk.Popup({
            className: 'destination-popup',
            closeButton: false,
            closeOnClick: true,
            offset: 25
        }).setHTML('&#x1F3E0;');

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const currentLng = startLngLat[0] + (endLngLat[0] - startLngLat[0]) * progress;
            const currentLat = startLngLat[1] + (endLngLat[1] - startLngLat[1]) * progress;
            this.marker.setLngLat([currentLng, currentLat]);

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                // Return stations to original state
                this.pickupStation = Station.allStations[this.personData.properties.homeStation] || {
                    name: this.personData.properties.homeStation,
                    location: null,
                };
                this.dropoffStation = Station.allStations[this.personData.properties.poiStation] || {
                    name: this.personData.properties.poiStation,
                    location: null,
                };
                this.isReturning = false;
                this.journeyCompleted = true;
                this.marker.setPopup(popup);
                this.marker.togglePopup();

                setTimeout(() => {
                    popup.remove();
                }, MAP_CONFIG.popupTimer);
            }
        };
        requestAnimationFrame(animate);
    }
    /**
     * Moves person from home to pickup station
     * @param {Object} station 
     */
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
                this.isReadyForPickup = true;
            }
        }
        requestAnimationFrame(animate);
    }
    /**
     * Moves person from dropoff station to POI. Also handles swapping pickup and dropoff stations for return journey
     */
    moveToPOI(poiName) {
        const poi = POI.allPOIs[poiName];
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
                this.marker.getElement().style.display = 'none';  // Hide the marker while at the POI
                // Swap stations for return journey
                const temp = this.pickupStation;
                this.pickupStation = this.dropoffStation;
                this.dropoffStation = temp;

                setTimeout(() => {
                    this.isReturning = true;
                    this.isReadyToMoveToStation = true;
                }, this.poiTimer);
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

        // Display passengers
        const passengerContainer = document.createElement('div');
        passengerContainer.className = 'passenger-container';
        this.marker.getElement().appendChild(passengerContainer);
        this.passengerContainer = passengerContainer;
    }

    buildStationRouteIndices(route, stationFeatures) {
        return stationFeatures
            .map(station => {
                const coordinates = station.geometry.coordinates;
                const routeIndex = route.findIndex(point =>
                    isNearLocation({lng: point[0], lat: point[1]}, coordinates, 0.0001)
                );
                if (routeIndex === -1) return null;

                return {
                    name: station.properties.name,
                    coordinates,
                    routeIndex,
                };
            })
            .filter(Boolean)
            .sort((left, right) => left.routeIndex - right.routeIndex);
    }

    getCurrentStationListIndex(currentRouteIndex, stationRouteIndices) {
        if (this.direction === 1) {
            for (let index = stationRouteIndices.length - 1; index >= 0; index -= 1) {
                if (stationRouteIndices[index].routeIndex <= currentRouteIndex) {
                    return index;
                }
            }
            return -1;
        }

        for (let index = 0; index < stationRouteIndices.length; index += 1) {
            if (stationRouteIndices[index].routeIndex >= currentRouteIndex) {
                return index;
            }
        }

        return stationRouteIndices.length;
    }

    findStationListIndexByName(stationRouteIndices, stationName) {
        return stationRouteIndices.findIndex(station => station.name === stationName);
    }

    willPassDropoffStation(person, currentStationIndex, stationRouteIndices) {
        const dropoffIndex = this.findStationListIndexByName(stationRouteIndices, person.dropoffStation?.name);
        if (dropoffIndex === -1) return false;

        return this.direction === 1 ?
            dropoffIndex > currentStationIndex :
            dropoffIndex < currentStationIndex;
    }

    getBoardablePassengersAtStation(currentPos, currentStationIndex, stationRouteIndices) {
        return Object.values(Person.allPeople).filter(person => {
            if (!person.isReadyForPickup) return false;
            if (this.passengers.includes(person)) return false;

            const personLngLat = person.marker.getLngLat();
            if (!isNearLocation(currentPos, [personLngLat.lng, personLngLat.lat])) return false;

            return this.willPassDropoffStation(person, currentStationIndex, stationRouteIndices);
        });
    }

    dropoffPassengersAtStation(currentPos) {
        const droppedOff = this.passengers.filter(person => {
            const dropoffCoords = person.dropoffStation?.stationData?.geometry?.coordinates;
            if (!dropoffCoords) return false;
            return isNearLocation(currentPos, dropoffCoords, 0.0001);
        });

        droppedOff.forEach(person => {
            this.passengers = this.passengers.filter(p => p !== person);
            person.marker.setLngLat(person.dropoffStation.stationData.geometry.coordinates);
            person.marker.getElement().style.display = 'block';
            if (person.isReturning) {
                person.moveToHome();
            } else {
                person.moveToPOI(person.personData.properties.poi);
            }
        });

        if (droppedOff.length > 0) this.updatePassengerIcons();
    }

    pickupPassengersAtStation(currentPos, currentStationIndex, stationRouteIndices) {
        this.getBoardablePassengersAtStation(currentPos, currentStationIndex, stationRouteIndices).forEach(person => {
            this.passengers.push(person);
            person.isReadyForPickup = false;
            person.isReadyToMoveToStation = false;
            person.marker.getElement().style.display = 'none';
        });

        this.updatePassengerIcons();
    }

    updatePassengerIcons() {
        this.passengerContainer.innerHTML = '';
        this.passengers.forEach(passenger => {
            const icon = document.createElement('img');
            icon.src = svgCache.get(passenger.name) || './img/Hund.svg';
            icon.className = 'person-marker-small';
            icon.setAttribute('data-name', passenger.name);
            /*
            if (state.selectedPerson === passenger.name) {
                icon.classList.add('marker-selected');
            }
                */

            icon.addEventListener('click', (e) => {
                e.stopPropagation();
                if (passenger.personData && Train.selectPersonCallback) {
                    Train.selectPersonCallback(passenger.personData);
                }
            });

            this.passengerContainer.appendChild(icon);
        });
    }
    /**
     * Makes a person move if the train is approaching their pickup station and will pass their dropoff station
     * @param {number} currentStationIndex 
     * @param {Array} stationRouteIndices
     */
    checkForPickupStation(currentStationIndex, stationRouteIndices) {
        const lookAheadDistance = MAP_CONFIG.pickupStationsAhead;

        Object.values(Person.allPeople).forEach(person => {
            // Check if the person is ready to move to station and if the train is approaching their pickup station
            if (!person.isReadyToMoveToStation) return;
            const pickupIndex = this.findStationListIndexByName(stationRouteIndices, person.pickupStation?.name);
            if (pickupIndex === -1) return;

            const isApproachingPickup = this.direction === 1 ?
                (pickupIndex > currentStationIndex && pickupIndex <= currentStationIndex + lookAheadDistance) :
                (pickupIndex < currentStationIndex && pickupIndex >= currentStationIndex - lookAheadDistance);

            const willPassDropoff = this.willPassDropoffStation(person, currentStationIndex, stationRouteIndices);

            if (isApproachingPickup && willPassDropoff) {
                person.isReadyToMoveToStation = false;
                person.moveToStation(person.pickupStation);
            };
        });
    }

    moveAlongRoute(route, stationFeatures) {
        const stationRouteIndices = this.buildStationRouteIndices(route, stationFeatures);
        const stationByRouteIndex = new Map(
            stationRouteIndices.map((station, index) => [station.routeIndex, { ...station, stationListIndex: index }])
        );

        let currentIndex = this.direction === 1 ? 0 : route.length - 1;
        let destinationIndex = this.direction === 1 ? route.length - 1 : 0;

        let isWaitingAtStation = false;
        let waitStartTime = null;
        const stationWaitTime = MAP_CONFIG.trainWaitTimeAtStation;
        const maxFrameTime = 100;
        let lastStationIndex = null;
        let lastFrameTime = null;

        /**
         * @param {Object} currentPos - Current position of the train {lng, lat}
         * @param {number} currentIndex - Current index of the train on the route
         * @returns {boolean} whether the train should stop at this station
         */
        const shouldStopAtStation = (currentPos, currentStationIndex) => {
            // Stop if we have a passenger to drop off at this location
            const isDropoffStation = this.passengers.some(passenger => {
                const dropoffStation = passenger.dropoffStation;
                if (!dropoffStation) return false;
                return isNearLocation(currentPos, dropoffStation.stationData.geometry.coordinates, 0.0001);
            });
            if (isDropoffStation) return true;

            // Stop if we have a passenger to pick up at this location
            const hasPickup = this.getBoardablePassengersAtStation(
                currentPos,
                currentStationIndex,
                stationRouteIndices
            ).length > 0;

            return isDropoffStation || hasPickup;
        };

        const animate = (timestamp) => {
            if (lastFrameTime === null) {
                lastFrameTime = timestamp;
            }

            const deltaTime = Math.min(timestamp - lastFrameTime, maxFrameTime);
            lastFrameTime = timestamp;

            if (isWaitingAtStation) {
                console.log("Waiting at station...");
                if (!waitStartTime) waitStartTime = timestamp;

                const waitElapsed = timestamp - waitStartTime;
                if (waitElapsed < stationWaitTime) {
                    requestAnimationFrame(animate);
                    return;
                }
                isWaitingAtStation = false;
                waitStartTime = null;
            }

            const currentStationIndex = this.getCurrentStationListIndex(currentIndex, stationRouteIndices);
            this.checkForPickupStation(currentStationIndex, stationRouteIndices);

            if ((this.direction === 1 && currentIndex < destinationIndex) ||
                (this.direction === -1 && currentIndex > destinationIndex)) {
                let remainingDistance = MAP_CONFIG.trainSpeed * (deltaTime / 1000);

                while (
                    remainingDistance > 0 &&
                    ((this.direction === 1 && currentIndex < destinationIndex) ||
                    (this.direction === -1 && currentIndex > destinationIndex))
                ) {
                    const currentPos = this.marker.getLngLat();
                    const nextIndex = currentIndex + this.direction;
                    const nextPos = route[nextIndex];
                    const dx = nextPos[0] - currentPos.lng;
                    const dy = nextPos[1] - currentPos.lat;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance <= remainingDistance) {
                        this.marker.setLngLat(nextPos);
                        currentIndex = nextIndex;
                        remainingDistance -= distance;

                        const reachedStation = stationByRouteIndex.get(currentIndex);

                        if (
                            reachedStation &&
                            lastStationIndex !== reachedStation.stationListIndex &&
                            shouldStopAtStation(
                                {lng: reachedStation.coordinates[0], lat: reachedStation.coordinates[1]},
                                reachedStation.stationListIndex
                            )
                        ) {
                            this.dropoffPassengersAtStation(
                                {lng: reachedStation.coordinates[0], lat: reachedStation.coordinates[1]}
                            );
                            this.pickupPassengersAtStation(
                                {lng: reachedStation.coordinates[0], lat: reachedStation.coordinates[1]},
                                reachedStation.stationListIndex,
                                stationRouteIndices
                            );
                            lastStationIndex = reachedStation.stationListIndex;
                            waitStartTime = timestamp;
                            isWaitingAtStation = true;
                            requestAnimationFrame(animate);
                            return;
                        }
                    } else {
                        const ratio = remainingDistance / distance;
                        const newLng = currentPos.lng + dx * ratio;
                        const newLat = currentPos.lat + dy * ratio;
                        this.marker.setLngLat([newLng, newLat]);
                        remainingDistance = 0;
                    }
                }

                requestAnimationFrame(animate);
            } else {
                // if all people are back home, reset all people to initial state
                const allCompleted = Object.values(Person.allPeople).every(person => person.journeyCompleted); 
                if (allCompleted) {
                    console.log("All journeys completed, resetting all people to initial state...");
                    Object.values(Person.allPeople).forEach(person => {
                        person.journeyCompleted = false;
                        person.isReadyForPickup = false;
                        person.isReadyToMoveToStation = true;
                    });
                }

                // Reached end of route, reverse direction
                setTimeout(() => {
                    this.direction *= -1;
                    currentIndex = this.direction === 1 ? 0 : route.length - 1;
                    destinationIndex = this.direction === 1 ? route.length - 1 : 0;
                    this.marker.setLngLat(route[currentIndex]);
                    lastStationIndex = null;
                    lastFrameTime = null;

                    requestAnimationFrame(animate);
                }, 1000);
            }
        };

        requestAnimationFrame(animate);
    }
}