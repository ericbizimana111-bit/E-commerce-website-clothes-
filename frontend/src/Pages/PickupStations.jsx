import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../api/client';
import './PickupStations.css';

const PickupStations = () => {
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterCity, setFilterCity] = useState('');

  useEffect(() => {
    let isMounted = true;
    const fetchStations = async () => {
      try {
        setLoading(true);
        const res = await apiClient.get('/pickup-stations');
        if (isMounted && res?.data) {
          setStations(res.data);
        }
      } catch (err) {
        console.error('Failed to load stations', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchStations();
    return () => {
      isMounted = false;
    };
  }, []);

  const cities = Array.from(new Set(stations.map((s) => s.city || s.district).filter(Boolean)));
  const filtered = filterCity
    ? stations.filter((s) => (s.city || s.district) === filterCity)
    : stations;

  return (
    <div className="um-stations-page">
      <div className="container">
        <div className="um-stations-header">
          <div>
            <h1 className="um-stations-title">UgaMarket Pickup Stations</h1>
            <p className="um-stations-subtitle">
              Collect your farm-fresh produce with zero delivery surcharges at verified neighborhood hubs.
            </p>
          </div>
          <Link to="/catalog" className="btn btn-primary">
            Start Shopping →
          </Link>
        </div>

        {/* Benefits Banner */}
        <div className="um-stations-benefits card">
          <div className="um-benefit-item">
            <span className="um-benefit-icon">🆓</span>
            <div>
              <strong>100% Free Collection</strong>
              <span>Save on home delivery fees when collecting at our hubs</span>
            </div>
          </div>
          <div className="um-benefit-item">
            <span className="um-benefit-icon">❄️</span>
            <div>
              <strong>Secure Cold Storage</strong>
              <span>Your leafy greens, milk, and meats are kept chilled until pickup</span>
            </div>
          </div>
          <div className="um-benefit-item">
            <span className="um-benefit-icon">🕒</span>
            <div>
              <strong>Extended Hours</strong>
              <span>Collect after work up to 8:00 PM on weekdays</span>
            </div>
          </div>
        </div>

        {/* Filter */}
        {cities.length > 1 && (
          <div className="um-stations-filter">
            <button
              type="button"
              className={`um-pill ${!filterCity ? 'um-pill--active' : ''}`}
              onClick={() => setFilterCity('')}
            >
              All Locations ({stations.length})
            </button>
            {cities.map((city) => (
              <button
                key={city}
                type="button"
                className={`um-pill ${filterCity === city ? 'um-pill--active' : ''}`}
                onClick={() => setFilterCity(city)}
              >
                {city}
              </button>
            ))}
          </div>
        )}

        {/* Stations Grid */}
        {loading ? (
          <div className="um-loading-box">
            <div className="um-spinner" />
            <p>Loading active pickup stations...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="um-empty-state card">
            <p>No pickup stations currently available in this area.</p>
          </div>
        ) : (
          <div className="um-stations-grid">
            {filtered.map((station) => (
              <div key={station.id} className="um-station-item-card card">
                <div className="um-station-item-head">
                  <div className="um-station-pin-icon">📍</div>
                  <div>
                    <h3 className="um-station-item-title">{station.name}</h3>
                    <span className="um-station-item-district">
                      {station.district || station.city}
                    </span>
                  </div>
                  <span className="badge badge-success" style={{ marginLeft: 'auto' }}>
                    Active Hub
                  </span>
                </div>

                <div className="um-station-item-body">
                  <p className="um-station-item-address">
                    <strong>Address:</strong> {station.addressLine}
                  </p>
                  <p className="um-station-item-hours">
                    <strong>🕒 Operating Hours:</strong> {station.operatingHours || '8:00 AM - 7:00 PM'}
                  </p>
                  {station.contactPhone && (
                    <p className="um-station-item-phone">
                      <strong>📞 Station Contact:</strong> {station.contactPhone}
                    </p>
                  )}
                </div>

                <div className="um-station-item-footer">
                  <Link to={`/catalog?pickupStationId=${station.id}`} className="btn btn-secondary btn-sm btn-block">
                    Select & Browse Produce
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PickupStations;
