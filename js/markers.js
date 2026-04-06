import { MAP_CONFIG, svgCache } from "./config.js";
import { findStationByName, findPOIByName, isNearLocation, calculateDistance } from "./utils.js";

export class Station {
    static markers = {};

    constructor(stationData, map, onSelect) {
        this.stationData = stationData;
        this.map = map;
        this.onSelect = onSelect;

        const el = document.createElement('div');
        el.className = 'station-marker';

        this.marker = new maptilersdk.Marker({element: el, anchor: 'bottom'})
            .setLngLat(stationData.geometry.coordinates)
            .addTo(map);

        this.marker.getElement().addEventListener('click', (e) => {
            e.stopPropagation(); 
            this.onSelect(stationData);
        });
        
        Station.markers[stationData.properties.name] = this.marker;
    }
}

export class Person {
    static markers = {};

    constructor(personData, map, onSelect) {
        this.personData = personData;
        this.map = map;
        this.onSelect = onSelect;

        const el = document.createElement('div');
        el.className = 'person-marker';
        el.setAttribute('data-name', personData.properties.name);
        el.style.backgroundImage = `url(./img/${personData.properties.name}.svg)`;

        fetch(`./img/${personData.properties.name}.svg`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Image for ${personData.properties.name} not found`);
                }
                const url = `./img/${personData.properties.name}.svg`;
                svgCache.set(personData.properties.name, url);
                el.style.backgroundImage = `url(${url})`;
            })
            .catch(error => {
                console.warn(error);
                const fallbackUrl = './img/Hund.svg';
                svgCache.set(personData.properties.name, fallbackUrl);
                el.style.backgroundImage = `url(${fallbackUrl})`; 
            });
        
        this.marker = new maptilersdk.Marker({element: el})
            .setLngLat(personData.geometry.coordinates)
            .addTo(map);

        this.marker.isAvailable = true;
        this.marker.name = personData.properties.name;
        this.marker.home = personData.geometry.coordinates;
        this.marker.homeStation = personData.properties.homeStation;
        this.marker.destinationStation = personData.properties.destinationStation;
        this.marker.currentDestination = personData.properties.destinationStation;
        this.marker.isReturning = false;
        this.marker.waitingAtPOI = false;
        this.marker.isMoving = false;
        this.marker.journeyCompleted = false;

        // Add person marker to Person.markers map to be used in selectPerson function
        Person.markers[personData.properties.name] = this.marker;
        this.marker.personData = personData; // Need for selectPerson function

        this.marker.getElement().addEventListener('click', (e) => {
            e.stopPropagation(); 
            this.onSelect(personData);
        });
    }

    moveToHome() {
        const start = this.marker.getLngLat();
        const startLngLat = [start.lng, start.lat];
        const endLngLat = this.marker.home;
        const duration = 1500;
        const startTime = performance.now();

        const currentPOI = POI.findPOIForPerson(this.marker);
        if (currentPOI) POI.removePerson(this.marker, currentPOI);

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const currentLng = startLngLat[0] + (endLngLat[0] - startLngLat[0]) * progress;
            const currentLat = startLngLat[1] + (endLngLat[1] - startLngLat[1]) * progress;
            this.marker.setLngLat([currentLng, currentLat]);

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                this.marker.waitingAtPOI = false;
                this.marker.isAvailable = true;
            }
        };
        requestAnimationFrame(animate);
    }

    moveToStation(stationName) {
        const station = findStationByName(stationName);
        const start = this.marker.getLngLat();
        const startLngLat = [start.lng, start.lat];
        const endLngLat = station.geometry.coordinates;
        const duration = MAP_CONFIG.personAnimDuration;
        const startTime = performance.now();

        const currentPOI = POI.findPOIForPerson(this.marker);
        if (currentPOI) POI.removePerson(this.marker, currentPOI);

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const currentLng = startLngLat[0] + (endLngLat[0] - startLngLat[0]) * progress;
            const currentLat = startLngLat[1] + (endLngLat[1] - startLngLat[1]) * progress;
            this.marker.setLngLat([currentLng, currentLat]);

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                this.marker.isMoving = false;
            }
        }
        requestAnimationFrame(animate);
    }

    moveToPOI(poiName) {
        const poi = findPOIByName(poiName);
        if (!poi) return;

        const start = this.marker.getLngLat();
        const startLngLat = [start.lng, start.lat];
        const endLngLat = poi.geometry.coordinates;
        const duration = MAP_CONFIG.personAnimDuration;
        const startTime = performance.now();

        const currentPOI = POI.findPOIForPerson(this.marker);
        if (currentPOI) POI.removePerson(this.marker, currentPOI);

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const currentLng = startLngLat[0] + (endLngLat[0] - startLngLat[0]) * progress;
            const currentLat = startLngLat[1] + (endLngLat[1] - startLngLat[1]) * progress;
            this.marker.setLngLat([currentLng, currentLat]);

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                POI.addPerson(this.marker, poiName);
                this.marker.waitingAtPOI = true;
                this.marker.getElement().style.display = 'none';  // Hide the marker while at the POI
            }
        };
        requestAnimationFrame(animate);
    }
}

export class POI {
    static markers = {};
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
        POI.markers[poiData.properties.name] = this.marker;

        el.addEventListener('click', (e) => {
            e.stopPropagation();
            
            Object.values(Person.markers).forEach(marker => {
                marker.getElement().classList.remove('marker-selected');
            });

            this.onSelect(poiData);
        });
    }

    static addPerson(marker, poiName) {
        if (!POI.peopleAtPOIs[poiName]) {
            POI.peopleAtPOIs[poiName] = [];
        }
        if (!POI.peopleAtPOIs[poiName].includes(marker)) {
            POI.peopleAtPOIs[poiName].push(marker);
        }
        POI.updatePeopleDisplay(poiName);
    }

    static removePerson(marker, poiName) {
        if (POI.peopleAtPOIs[poiName]) {
            POI.peopleAtPOIs[poiName] = POI.peopleAtPOIs[poiName].filter(m => m !== marker);
            POI.updatePeopleDisplay(poiName);
        }
        marker.getElement().style.display = 'block';  // Show the marker again
    }

    static updatePeopleDisplay(poiName) {
        const poiMarker = POI.markers[poiName];
        if (!poiMarker || !poiMarker.peopleContainer) return;

        poiMarker.peopleContainer.innerHTML = '';

        if (POI.peopleAtPOIs[poiName]) {
            POI.peopleAtPOIs[poiName].forEach(personMarker => {
                const personIcon = document.createElement('div');
                personIcon.className = 'poi-person';
                personIcon.style.backgroundImage = `url(./img/${personMarker.name}.svg)`;
                personIcon.setAttribute('data-name', personMarker.name);
                
                personIcon.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const personData = personMarker.personData;
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

    static findPOIForPerson(marker) {
        for (const [poiName, markers] of Object.entries(POI.peopleAtPOIs)) {
            if (markers.includes(marker)) {
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
        this.marker = new maptilersdk.Marker({element: el, anchor: 'center'})
            .setLngLat(startCoords)
            .addTo(map);

        this.marker.passengers = []; // Array of passenger markers
        this.direction = direction; // 1 or -1
    }

    moveAlongRoute(route) {
        let startPoint = this.marker.direction === 1 ? route[0] : route[route.length - 1];
        let endPoint = this.marker.direction === 1 ? route[route.length - 1] : route[0];
        let currentIndex = route.indexOf(startPoint);
        let destinationIndex = route.indexOf(endPoint);
        let isWaitingAtStation = false;
        let waitStartTime = null;
        const stationWaitTime = 1000;
        let hasStoppedAtCurrentStation = false;
        let lastStationCoords = null;

        // Display passengers
        const passengerContainer = document.createElement('div');
        passengerContainer.className = 'passenger-container';
        this.marker.getElement().appendChild(passengerContainer);

        const updatePassengerIcons = () => {
            passengerContainer.innerHTML = '';
            this.marker.passengers.forEach(passenger => {
                const icon = document.createElement('img');
                icon.src = svgCache.get(passenger.name) || './img/Hund.svg';
                icon.className = 'person-marker-small';
                icon.setAttribute('data-name', passenger.name);
                if (state.selectedPerson === passenger.name) {
                    icon.classList.add('marker-selected');
                }

                icon.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const personData = passenger.personData;
                    if (personData && Train.selectPersonCallback) {
                        Train.selectPersonCallback(personData);
                    }
                });

                passengerContainer.appendChild(icon);
            });
        };

        const handlePickup = (personMarker, currentPos, currentIndex) => {
            if (state.activePassengers.has(personMarker.name)) return false;

            const personLngLat = personMarker.getLngLat();
            const distance = calculateDistance(currentPos, [personLngLat.lng, personLngLat.lat]);
            
            const destinationStation = findStationByName(personMarker.currentDestination);
            if (!destinationStation) return;

            const destIndex = route.findIndex(point => 
                isNearLocation({lng: point[0], lat: point[1]}, destinationStation.geometry.coordinates, 0.0001)
            );
            
            const willPassDestination = this.marker.direction === 1 ? 
                (destIndex > currentIndex && destIndex <= route.length - 1) :
                (destIndex < currentIndex && destIndex >= 0);
            
            if (distance < 0.0002 && personMarker.isAvailable && willPassDestination) {
                this.marker.passengers.push(personMarker);
                personMarker.isAvailable = false;
                personMarker.getElement().style.display = 'none';
                state.activePassengers.add(personMarker.name);
                updatePassengerIcons();
                return true;
            }
            return false;
        };

        const handleDropoff = (personMarker, currentPos) => {
            if (personMarker.isAvailable) return false;

            const destinationStation = findStationByName(personMarker.currentDestination);
            if (!destinationStation) return false;

            if (isNearLocation({lng: currentPos.lng, lat: currentPos.lat}, destinationStation.geometry.coordinates)) {
                personMarker.setLngLat(destinationStation.geometry.coordinates);
                personMarker.getElement().style.display = 'block';
                state.activePassengers.delete(personMarker.name);

                if (personMarker.isReturning) {
                    // movePersonToHome(personMarker, personMarker.home); // Call from Person instance
                } else {
                    const person = state.personsGeoJSON.features.find(p => p.properties.name === personMarker.name);
                    // movePersonToPOI(personMarker, person.properties.destination); // Call from Person instance
                }
                return true;
            }
            return false;
        };

        const shouldStopAtLocation = (currentPos, currentIndex) => {
            const hasViablePassenger = Object.values(Person.markers).some(personMarker => {
                if (!personMarker.isAvailable) return false;
                const personLngLat = personMarker.getLngLat();
                if (!isNearLocation(currentPos, [personLngLat.lng, personLngLat.lat])) return false;

                const destinationStation = findStationByName(personMarker.currentDestination);
                if (!destinationStation) return false;

                const destIndex = route.findIndex(point => 
                    isNearLocation({lng: point[0], lat: point[1]}, destinationStation.geometry.coordinates, 0.0001)
                );

                return this.marker.direction === 1 ? 
                    (destIndex > currentIndex && destIndex <= route.length - 1) :
                    (destIndex < currentIndex && destIndex >= 0);
            });

            const isDestinationStation = this.marker.passengers.some(passenger => {
                const destinationStation = findStationByName(passenger.currentDestination);
                if (!destinationStation) return false;
                return isNearLocation(currentPos, destinationStation.geometry.coordinates);
            });

            return hasViablePassenger || isDestinationStation;
        };

        const checkForPersonMovement = (currentPos) => {
            Object.values(Person.markers).forEach(personMarker => {
                if (!personMarker.isMoving && !personMarker.waitingAtPOI && !personMarker.journeyCompleted) {
                    const targetStation = personMarker.isReturning ? 
                        personMarker.destinationStation : 
                        personMarker.homeStation; 
                    
                    // const triggerStation = findStationBeforeTarget(personMarker, targetStation, this.marker.direction, 3);
                    // if (!triggerStation) return;
                    
                    // const triggerStationData = findStationByName(triggerStation);
                    // if (!triggerStationData) return;
                    
                    // if (isNearLocation(currentPos, triggerStationData.geometry.coordinates)) {
                    //     personMarker.isMoving = true;
                    //     // movePersonToStation(personMarker, targetStation); // Call from Person instance
                    // }
                }
            });
        };

        const animate = (timestamp) => {
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
                lastStationCoords = this.marker.getLngLat();

                const availablePassengers = Object.values(Person.markers).filter(personMarker => 
                    personMarker.isAvailable && 
                    isNearLocation(this.marker.getLngLat(), [personMarker.getLngLat().lng, personMarker.getLngLat().lat])
                );

                availablePassengers.forEach(personMarker => {
                    handlePickup(personMarker, this.marker.getLngLat(), currentIndex);
                });

                if (this.marker.passengers.length > 0) {
                    const passengersToProcess = [...this.marker.passengers];
                    const droppedOffPassengers = passengersToProcess.filter(passenger => 
                        handleDropoff(passenger, this.marker.getLngLat())
                    );
                    
                    droppedOffPassengers.forEach(passenger => {
                        const index = this.marker.passengers.indexOf(passenger);
                        if (index > -1) {
                            this.marker.passengers.splice(index, 1);
                        }
                    });
                    
                    updatePassengerIcons();
                }
            }

            if ((this.marker.direction === 1 && currentIndex < destinationIndex) || 
                (this.marker.direction === -1 && currentIndex > destinationIndex)) {
                const currentPos = this.marker.getLngLat();
                const nextIndex = currentIndex + this.marker.direction;
                const nextPos = route[nextIndex];

                const step = 0.00005;
                const dx = nextPos[0] - currentPos.lng;
                const dy = nextPos[1] - currentPos.lat;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (lastStationCoords) {
                    if (Math.abs(currentPos.lng - lastStationCoords.lng) > 0.0002 || 
                        Math.abs(currentPos.lat - lastStationCoords.lat) > 0.0002) {
                            hasStoppedAtCurrentStation = false;
                            lastStationCoords = null;
                        }
                }

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
                    this.marker.setLngLat(nextPos);
                    currentIndex = nextIndex;
                } else {
                    const angle = Math.atan2(dy, dx);
                    const newLng = currentPos.lng + step * Math.cos(angle);
                    const newLat = currentPos.lat + step * Math.sin(angle);
                    this.marker.setLngLat([newLng, newLat]);   
                }

                requestAnimationFrame(animate);
            } else {
                setTimeout(() => {
                        this.marker.direction *= -1;
                        const temp = startPoint;
                        startPoint = endPoint;
                        endPoint = temp;
                        currentIndex = this.marker.direction === 1 ? route.indexOf(startPoint) : route.length - 1;
                        destinationIndex = this.marker.direction === 1 ? route.length - 1 : 0;
                        this.marker.setLngLat(route[currentIndex]);
                        requestAnimationFrame(animate);
                    }, 10000);
            }
        };

        requestAnimationFrame(animate);
    }
}