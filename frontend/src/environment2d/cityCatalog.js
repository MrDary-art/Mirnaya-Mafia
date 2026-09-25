// Small, offline city-centre catalog. Coordinates are approximate, not user location.
// GeoNames data: https://www.geonames.org/export/ (CC BY 4.0, © GeoNames).
export const FOREST_CITIES = Object.freeze([
  { id: "moscow", name: "Москва", country: "Россия", latitude: 55.7558, longitude: 37.6173, timeZone: "Europe/Moscow" },
  { id: "london", name: "Лондон", country: "Великобритания", latitude: 51.5074, longitude: -0.1278, timeZone: "Europe/London" },
  { id: "new-york", name: "Нью-Йорк", country: "США", latitude: 40.7128, longitude: -74.0060, timeZone: "America/New_York" },
  { id: "sydney", name: "Сидней", country: "Австралия", latitude: -33.8688, longitude: 151.2093, timeZone: "Australia/Sydney" },
  { id: "quito", name: "Кито", country: "Эквадор", latitude: -0.1807, longitude: -78.4678, timeZone: "America/Guayaquil" },
  { id: "tromso", name: "Тромсё", country: "Норвегия", latitude: 69.6492, longitude: 18.9553, timeZone: "Europe/Oslo" },
  { id: "kathmandu", name: "Катманду", country: "Непал", latitude: 27.7172, longitude: 85.3240, timeZone: "Asia/Kathmandu" },
].map((city) => Object.freeze({
  ...city, source: "GeoNames city-centre coordinates, manually rounded", license: "CC BY 4.0",
})));

export function findForestCity(id) {
  return FOREST_CITIES.find((city) => city.id === id) || null;
}
