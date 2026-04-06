export class DataLoader {
    static async loadAllData() {
        const [stationData, poiData, personData, route8Data] = await Promise.all([
            fetch('geojson/stations.geojson').then(response => response.json()),
            fetch('geojson/POIs.geojson').then(response => response.json()),
            fetch('geojson/persons.geojson').then(response => response.json()),
            fetch('geojson/route8.geojson').then(response => response.json())
        ]);
        return { stationData, poiData, personData, route8Data };
    }
}