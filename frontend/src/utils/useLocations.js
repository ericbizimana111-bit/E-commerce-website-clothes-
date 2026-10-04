import { useEffect, useState } from 'react';
import apiClient from '../api/client';

/**
 * Uganda regions + districts from GET /api/locations/meta, fetched once per
 * page load and shared by every address form.
 */
let metaPromise = null;

function loadMeta() {
  if (!metaPromise) {
    metaPromise = apiClient
      .get('/locations/meta')
      .then((res) => res?.data || { regions: [], districts: [] })
      .catch((err) => {
        metaPromise = null; // allow a retry on the next mount
        throw err;
      });
  }
  return metaPromise;
}

export function useLocationMeta() {
  const [state, setState] = useState({ regions: [], districts: [], loading: true, error: null });
  useEffect(() => {
    let alive = true;
    loadMeta()
      .then((meta) => alive && setState({ regions: meta.regions || [], districts: meta.districts || [], loading: false, error: null }))
      .catch((error) => alive && setState((s) => ({ ...s, loading: false, error })));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

export const REGION_KEYS = { CENTRAL: 'regionCentral', EASTERN: 'regionEastern', NORTHERN: 'regionNorthern', WESTERN: 'regionWestern' };

/** One-line human address for lists and summaries. */
export function formatAddressLine(a) {
  if (!a) return '';
  return [a.streetAddress, a.division, a.district].filter(Boolean).join(', ');
}

/** Translation key for the built-in address labels; null for custom labels. */
export function addressLabelKey(title) {
  return ['Home', 'Work', 'Other'].includes(title) ? `afLabel${title}` : null;
}
