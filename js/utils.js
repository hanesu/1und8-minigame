export function isNearLocation(position1, position2, tolerance = 0.0001) { 
    return Math.abs(position1.lng - position2[0]) < tolerance && 
           Math.abs(position1.lat - position2[1]) < tolerance;
}
export function calculateDistance(point1, point2) {
    const dx = point1.lng - point2[0];
    const dy = point1.lat - point2[1];
    return Math.sqrt(dx * dx + dy * dy);
}