import { CONFIG } from '../../config';

export interface RouteRequest {
  from: { lat: number; lon: number };
  to: { lat: number; lon: number };
  profile?: 'driving' | 'cycling' | 'walking';
}

export interface RouteResult {
  provider: 'mapbox';
  distanceMeters: number;
  durationSeconds: number;
  geometry: Array<[number, number]>; // [lat, lon] for Leaflet/Mapbox consumers
}

export interface RoutingProvider {
  getRoute(request: RouteRequest): Promise<RouteResult>;
}

function assertPoint(point: RouteRequest['from'], label: string) {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon) || point.lat < -90 || point.lat > 90 || point.lon < -180 || point.lon > 180) {
    throw new Error(`${label} không hợp lệ`);
  }
}

export class MapboxRoutingProvider implements RoutingProvider {
  async getRoute(request: RouteRequest): Promise<RouteResult> {
    assertPoint(request.from, 'Điểm bắt đầu');
    assertPoint(request.to, 'Điểm kết thúc');
    if (!CONFIG.MAPBOX_ACCESS_TOKEN) throw new Error('Mapbox chưa được cấu hình MAPBOX_ACCESS_TOKEN');

    const profile = request.profile || 'driving';
    const coordinates = `${request.from.lon},${request.from.lat};${request.to.lon},${request.to.lat}`;
    const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordinates}?alternatives=false&overview=full&geometries=geojson&steps=false&access_token=${encodeURIComponent(CONFIG.MAPBOX_ACCESS_TOKEN)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Mapbox Directions lỗi HTTP ${response.status}`);
    const data = await response.json() as any;
    const route = data.routes?.[0];
    if (!route?.geometry?.coordinates?.length) throw new Error('Mapbox không tìm thấy tuyến đường');

    return {
      provider: 'mapbox',
      distanceMeters: Math.round(route.distance),
      durationSeconds: Math.round(route.duration),
      geometry: route.geometry.coordinates.map(([lon, lat]: [number, number]) => [lat, lon]),
    };
  }
}

export class RoutingService {
  private static provider: RoutingProvider = new MapboxRoutingProvider();

  static setProvider(provider: RoutingProvider) {
    this.provider = provider;
  }

  static getRoute(request: RouteRequest) {
    return this.provider.getRoute(request);
  }
}
