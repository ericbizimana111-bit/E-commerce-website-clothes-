import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './AdminMap.css';

/**
 * Leaflet map for the console (OpenStreetMap tiles).
 *
 * Route mode:  origin + destination markers and the route polyline
 *              ([lat, lng] pairs); the view fits the whole route.
 * Picker mode: `picker` = { value: {lat,lng}, onChange } — a single draggable
 *              pin; clicking the map moves it (used for the dispatch point).
 */
const TILE_URL = import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const pin = (variant, label) =>
  L.divIcon({
    className: `admin-pin admin-pin--${variant}`,
    html: `<span></span>${label ? `<b>${label}</b>` : ''}`,
    iconSize: [30, 42],
    iconAnchor: [15, 40],
  });

export default function AdminMap({ origin, destination, geometry, picker, height = 340 }) {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const pickerRef = useRef(picker);

  useEffect(() => {
    pickerRef.current = picker;
  });

  useEffect(() => {
    if (!ref.current || mapRef.current) return undefined;
    const map = L.map(ref.current, { center: [1.3733, 32.2903], zoom: 7, scrollWheelZoom: false });
    L.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    map.on('click', (e) => pickerRef.current?.onChange?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
    mapRef.current = map;
    const timer = setTimeout(() => map.invalidateSize(), 200);
    return () => {
      clearTimeout(timer);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    if (picker) {
      if (!picker.value) return;
      const marker = L.marker([picker.value.lat, picker.value.lng], { icon: pin('primary'), draggable: true }).addTo(layer);
      marker.on('dragend', () => {
        const p = marker.getLatLng();
        pickerRef.current?.onChange?.({ lat: p.lat, lng: p.lng });
      });
      map.setView([picker.value.lat, picker.value.lng], Math.max(map.getZoom(), 14));
      return;
    }

    const points = [];
    if (origin) {
      L.marker([origin.lat, origin.lng], { icon: pin('ink', 'A'), title: origin.name || 'Dispatch' }).addTo(layer);
      points.push([origin.lat, origin.lng]);
    }
    if (destination) {
      L.marker([destination.lat, destination.lng], { icon: pin('accent', 'B'), title: destination.label || 'Customer' }).addTo(layer);
      points.push([destination.lat, destination.lng]);
    }
    if (Array.isArray(geometry) && geometry.length > 1) {
      const straight = geometry.length === 2;
      L.polyline(geometry, {
        color: '#1C5233',
        weight: straight ? 3 : 5,
        opacity: 0.85,
        dashArray: straight ? '8 8' : null,
      }).addTo(layer);
      geometry.forEach((p) => points.push(p));
    }
    if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [36, 36] });
    else if (points.length === 1) map.setView(points[0], 15);
  }, [origin, destination, geometry, picker]);

  return <div ref={ref} className="admin-map" style={{ height }} role="application" aria-label="Map" />;
}
