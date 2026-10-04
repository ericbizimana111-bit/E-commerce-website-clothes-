import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './MapPicker.css';

/**
 * Map with a single draggable delivery pin (Leaflet + OpenStreetMap tiles).
 * Click anywhere or drag the pin to set the exact location; `onChange`
 * receives { lat, lng }. Uganda is the default view.
 *
 * Tiles: REACT_APP_MAP_TILE_URL overrides the default OSM tile server, which
 * is fine for development and light traffic; use a commercial tile provider
 * for high-volume production traffic.
 */
const TILE_URL = process.env.REACT_APP_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const UGANDA_CENTER = [1.3733, 32.2903];
const UGANDA_BOUNDS = L.latLngBounds([-1.6, 29.4], [4.4, 35.2]);

export const pinIcon = (variant = 'primary') =>
  L.divIcon({
    className: `um-map-pin um-map-pin--${variant}`,
    html: '<span></span>',
    iconSize: [30, 42],
    iconAnchor: [15, 40]
  });

const MapPicker = ({ value, onChange, height = 300, readOnly = false, label }) => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;
    const map = L.map(containerRef.current, {
      center: value ? [value.lat, value.lng] : UGANDA_CENTER,
      zoom: value ? 16 : 7,
      minZoom: 6,
      maxBounds: UGANDA_BOUNDS.pad(0.2),
      scrollWheelZoom: false,
      zoomControl: true
    });
    L.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(map);
    mapRef.current = map;

    if (!readOnly) {
      map.on('click', (e) => onChangeRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
    }
    // Containers that start hidden/animated need a size refresh.
    const timer = setTimeout(() => map.invalidateSize(), 200);
    return () => {
      clearTimeout(timer);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the pin in sync with `value`.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!value) {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      return;
    }
    const latlng = [value.lat, value.lng];
    if (!markerRef.current) {
      markerRef.current = L.marker(latlng, { icon: pinIcon(), draggable: !readOnly, keyboard: true, title: label || 'Delivery location' }).addTo(map);
      markerRef.current.on('dragend', () => {
        const p = markerRef.current.getLatLng();
        onChangeRef.current?.({ lat: p.lat, lng: p.lng });
      });
    } else {
      markerRef.current.setLatLng(latlng);
    }
    const current = map.getCenter();
    if (map.distance(current, latlng) > 150 || map.getZoom() < 14) {
      map.setView(latlng, Math.max(map.getZoom(), 16), { animate: true });
    }
  }, [value, readOnly, label]);

  return <div ref={containerRef} className="um-map" style={{ height }} role="application" aria-label={label || 'Map'} />;
};

export default MapPicker;
