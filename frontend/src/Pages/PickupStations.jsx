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
        // GET /api/pickup-stations -> { data: { stations: [...] } }
        const res = await apiClient.get('/pickup-stations');
        if (isMounted && Array.isArray(res?.data?.stations)) {
          setStations(res.data.stations);
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

  // Backend station fields: name, district, addressText, contactPhone,
  // operatingHours, pickupFeeUgx
  const districts = Array.from(new Set(stations.map((s) => s.district).filter(Boolean)));
  const filtered = filterCity
    ? stations.filter((s) => s.district === filterCity)
    : stations;

  return (
    <div className="um-stations-page">
      <div className="container">
        <div className="um-stations-header">
          <div>
            <h1 className="um-stations-title">UgaMarket Pickup Stations</h1>
            <p className="um-stations-subtitle">
              Collect your order yourself at a UgaMarket station — no delivery fee added.
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
              <strong>Free Collection</strong>
              <span>Avoid home delivery fees by collecting your order yourself</span>
            </div>
          </div>
          <div className="um-benefit-item">
            <span className="um-benefit-icon">📍</span>
            <div>
              <strong>Convenient Locations</strong>
              <span>Verified neighborhood hubs you can visit on your normal route</span>
            </div>
          </div>
          <div className="um-benefit-item">
            <span className="um-benefit-icon">🕒</span>
            <div>
              <strong>Clear Opening Hours</strong>
              <span>Each station lists its hours and contact number</span>
            </div>
          </div>
        </div>

        {/* Filter */}
        {districts.length > 1 && (
          <div className="um-stations-filter">
            <button
              type="button"
              className={`um-pill ${!filterCity ? 'um-pill--active' : ''}`}
              onClick={() => setFilterCity('')}
            >
              All Locations ({stations.length})
            </button>
            {districts.map((district) => (
              <button
                key={district}
                type="button"
                className={`um-pill ${filterCity === district ? 'um-pill--active' : ''}`}
                onClick={() => setFilterCity(district)}
              >
                {district}
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
                      {station.district}
                    </span>
                  </div>
                  <span className="badge badge-success" style={{ marginLeft: 'auto' }}>
                    Active Hub
                  </span>
                </div>

                <div className="um-station-item-body">
                  <p className="um-station-item-address">
                    <strong>Address:</strong> {station.addressText}
                  </p>
                  <p className="um-station-item-hours">
                    <strong>🕒 Operating Hours:</strong> {station.operatingHours || 'Contact station for hours'}
                  </p>
                  {station.contactPhone && (
                    <p className="um-station-item-phone">
                      <strong>📞 Station Contact:</strong> {station.contactPhone}
                    </p>
                  )}
                </div>

                <div className="um-station-item-footer">
                  <Link to="/catalog" className="btn btn-secondary btn-sm btn-block">
                    Browse Produce
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
