export interface BBox {
  west: number;
  east: number;
  south: number;
  north: number;
}

export function subcontinentBounds(): BBox {
  return { west: 65, east: 100, south: 5, north: 38 };
}

export function fitsInsideSubcontinent(lng: number, lat: number): boolean {
  const b = subcontinentBounds();
  return lng >= b.west && lng <= b.east && lat >= b.south && lat <= b.north;
}
