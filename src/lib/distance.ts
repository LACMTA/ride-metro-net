/**
 * Great-circle distance between two lat/lon points in meters, using the
 * haversine formula. Used for client-side "nearest stops" sorting.
 *
 * Accurate enough for city-scale nearest-N ordering (the previous SSR
 * nearby query used a flat squared-euclidean approximation on degrees).
 */
export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  // Mean Earth radius (meters).
  const R = 6371000;
  const toRad = (deg: number): number => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
