import { MAP_CONFIG } from "./config.js";
import { DataLoader } from "./dataLoader.js";
import { Person, POI, Train, Station } from "./markers.js";

export class MapManager {
    constructor(map) {
        this.map = null;
        this.route8Data = null;
        this.stationData = null;
        this.poiData = null;
        this.personData = null;

        this.canSelectPerson = true;
        this.selectedMarker = null;
    }

    pauseAllMarkers() {
        this.canSelectPerson = false;
        Object.values(Person.allPeople).forEach(person => person.pause());
        Object.values(POI.allPOIs).forEach(poi => poi.pause());
        Object.values(Station.allStations).forEach(station => station.pause());
        this.trains.forEach(train => train.pause());
    }

    closeInfoBox() {
        document.getElementById('map-overlay').classList.remove('darkened');
        document.getElementById('info-box').classList.add('hidden');
        document.querySelectorAll('.person-marker, .person-marker-small, .poi-container, .station-marker')
            .forEach(el => el.classList.remove('marker-selected'));
        this.selectedMarker = null;
    }

    selectPerson = (person) => {
        if (!this.canSelectPerson) return;

        this.selectedMarker = Person.allPeople[person.properties.name].marker;

        document.getElementById('info-image').innerHTML = `<img id="info-image" src="./img/${person.properties.name}.svg" class="info-image">`;
        document.getElementById('info-image').classList.remove('hidden');
        document.getElementById('info-title').innerHTML = person.properties.name;
        document.getElementById('info-ul').classList.remove('hidden');
        document.getElementById('info-start').innerHTML = person.properties.homeStation;
        document.getElementById('info-destination').innerHTML = person.properties.poiStation;
        document.getElementById('info-text').innerHTML = person.properties.info;
        document.getElementById('poi-image-container').innerHTML = '';
        document.getElementById('map-overlay').classList.add('darkened');
        document.getElementById('info-box').classList.remove('hidden');
        document.getElementById('info-button-wrapper').classList.remove('hidden');

        document.querySelectorAll('.person-marker, .person-marker-small, .poi-container, .station-marker')
            .forEach(el => el.classList.remove('marker-selected'));
        this.selectedMarker.getElement().classList.add('marker-selected');
    }
    selectPOI = (poi) => {
        this.selectedMarker = POI.allPOIs[poi.properties.name].marker;

        document.getElementById('poi-image-container').innerHTML = `<img id="poi-image" src="${poi.properties.image}">`;
        document.getElementById('info-title').innerHTML = poi.properties.name;
        document.getElementById('info-image').classList.add('hidden');
        document.getElementById('info-ul').classList.add('hidden');
        document.getElementById('info-text').innerHTML = poi.properties.info;
        document.getElementById('map-overlay').classList.add('darkened');
        document.getElementById('info-box').classList.remove('hidden');
        document.getElementById('info-button-wrapper').classList.add('hidden');

        document.querySelectorAll('.person-marker, .person-marker-small, .poi-container, .station-marker')
            .forEach(el => el.classList.remove('marker-selected'));
        this.selectedMarker.getElement().classList.add('marker-selected');
        
    }
    selectStation = (station) => {
        this.selectedMarker = Station.allStations[station.properties.name].marker;

        document.getElementById('poi-image-container').innerHTML = '';
        document.getElementById('info-title').innerHTML = station.properties.name;
        document.getElementById('info-image').classList.add('hidden');
        document.getElementById('info-ul').classList.add('hidden');
        document.getElementById('info-text').innerHTML = station.properties.info;
        document.getElementById('map-overlay').classList.add('darkened');
        document.getElementById('info-box').classList.remove('hidden');
        document.getElementById('info-button-wrapper').classList.add('hidden');

        document.querySelectorAll('.person-marker, .person-marker-small, .poi-container, .station-marker')
            .forEach(el => el.classList.remove('marker-selected'));
        this.selectedMarker.getElement().classList.add('marker-selected');
    }

    async initMap() {
        // Load all data before initializing map
        const data = await DataLoader.loadAllData();
        this.route8Data = data.route8Data;
        this.stationData = data.stationData;
        this.poiData = data.poiData;
        this.personData = data.personData;

        this.map = new maptilersdk.Map({
            container: 'map',
            style: maptilersdk.MapStyle.STREETS,
            ...MAP_CONFIG
        });
        this.map.dragRotate.disable();

        // CREATE STATIONS
        this.stationData.features.forEach(station => {
            new Station(station, this.map, this.selectStation);
        });

        // CREATE PEOPLE
        this.personData.features.forEach(person => {
            new Person(person, this.map, this.selectPerson);
        });
        Person.initializeStations();

        // CREATE POIs
        this.poiData.features.forEach(poi => {
            new POI(poi, this.map, this.selectPOI);
        });

        // CREATE TRAINS
        const routeCoords = this.route8Data.features[0].geometry.coordinates;
        POI.selectPersonCallback = this.selectPerson;
        Train.selectPersonCallback = this.selectPerson;
        this.trains = [
            new Train(routeCoords[0], 1, this.map),
            new Train(routeCoords[routeCoords.length - 1], -1, this.map)
        ];
        this.trains.forEach(train => train.moveAlongRoute(routeCoords, this.stationData.features));

        var route = {
            type: 'FeatureCollection',
            features: [
                {
                    type: 'Feature',
                    geometry: {
                        type: 'LineString',
                        coordinates: this.route8Data.features[0].geometry.coordinates
                    }
                }
            ]
        };

        this.map.on('load', async () => {
            console.log("Map loaded, adding sources and layers...");
            this.map.addSource('stations', {
                type: 'geojson',
                data: '/geojson/stations.geojson'
            });

            this.map.addSource('route', {
                type: 'geojson',
                data: route
            });

            const stationImage = new Image();
            stationImage.src = './img/Haltestelle.svg';
            stationImage.onload = () => {
                this.map.addImage('stationIcon', stationImage);
            };

            this.loadPOIImages();

            this.map.addLayer({
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

            this.map.on('click', (e) => {
                this.closeInfoBox();
            });
             /* Zoom-based scaling, has problems with people icons
            this.map.on('zoom', () => {
                const zoom = this.map.getZoom();
                const scale = Math.pow(2, zoom - 14); // adjust base zoom
                document.querySelectorAll('.poi-marker').forEach(el => {
                    el.style.transform = `scale(${scale})`;
                });
                });
            */

            this.map.dragRotate.disable();
            this.map.keyboard.disable();
        });

        document.getElementById('close-button').addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeInfoBox();
        });
    }

    loadPOIImages() {
        this.poiData.features.forEach(POI => {
            if (!POI.properties.image) {
                console.warn(`POI ${POI.properties.name} does not have an image defined.`);
                return;
            }
            const poiImage = new Image();
            poiImage.src = POI.properties.image;
            poiImage.onload = () => {
                this.map.addImage(POI.properties.name, poiImage);
            };
        });
    }

}