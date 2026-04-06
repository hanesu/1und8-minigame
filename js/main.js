import {MapManager} from "./mapManager.js";
import {DataLoader} from "./dataLoader.js";
import {Person, POI} from "./markers.js";
import {findStationByName, findPOIByName, isNearLocation, calculateDistance} from "./utils.js";


document.getElementById('opt-in-button').addEventListener('click', async () => {
    // Hide opt-in overlay
    // document.getElementById('opt-in-overlay').classList.add('hidden');
    // Show map
    document.getElementById('map').classList.remove('hidden');
    // Initialize map
    const mapManager = new MapManager();
    await mapManager.initMap();

    setTimeout(() => {
        document.getElementById('opt-in-overlay').classList.add('invisible');
    }, 10);
});