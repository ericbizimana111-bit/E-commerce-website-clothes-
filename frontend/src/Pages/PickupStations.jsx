import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BadgeDollarSign, Clock, MapPin, Navigation, Phone, Search, ShoppingBasket, X } from 'lucide-react';
import apiClient from '../api/client';
import { useLanguage } from '../Context/LanguageContext';
import useDebouncedValue from '../utils/useDebouncedValue';
import { LIMITS, sanitizeLine } from '../utils/inputGuards';
import { isOpenNow, mapsUrl } from '../utils/stations';
import './PickupStations.css';

const PickupStations = () => {
  const { t } = useLanguage();
  const [stations, setStations] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [district, setDistrict] = useState('');
  const [query, setQuery] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let mounted = true;
    setStatus('loading');
    apiClient
      .get('/pickup-stations')
      .then((res) => {
        if (!mounted) return;
        setStations(Array.isArray(res?.data?.stations) ? res.data.stations : []);
        setStatus('ready');
      })
      .catch(() => mounted && setStatus('error'));
    return () => {
      mounted = false;
    };
  }, [reloadKey]);

  // Keep the "open now" badges honest if the page stays open.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const debouncedQuery = useDebouncedValue(query.trim().toLowerCase(), 200);
  const districts = useMemo(() => Array.from(new Set(stations.map((s) => s.district).filter(Boolean))), [stations]);

  const filtered = useMemo(
    () =>
      stations.filter((s) => {
        if (district && s.district !== district) return false;
        if (!debouncedQuery) return true;
        return [s.name, s.district, s.addressText].some((field) => String(field || '').toLowerCase().includes(debouncedQuery));
      }),
    [stations, district, debouncedQuery]
  );

  const benefits = [
    { Icon: BadgeDollarSign, title: t('stationsBenefit1'), desc: t('stationsBenefit1Desc') },
    { Icon: MapPin, title: t('stationsBenefit2'), desc: t('stationsBenefit2Desc') },
    { Icon: Clock, title: t('stationsBenefit3'), desc: t('stationsBenefit3Desc') }
  ];

  return (
    <div className="stations container">
      <header className="stations__hero">
        <div>
          <h1 className="page-title">{t('stationsTitle')}</h1>
          <p className="section-desc">{t('stationsSubtitle')}</p>
        </div>
        <Link to="/catalog" className="btn btn-primary">
          {t('startShopping')} <ArrowRight size={16} aria-hidden="true" className="btn__nudge" />
        </Link>
      </header>

      <ul className="stations__benefits panel">
        {benefits.map(({ Icon, title, desc }) => (
          <li key={title}>
            <span>
              <Icon size={20} aria-hidden="true" />
            </span>
            <div>
              <strong>{title}</strong>
              <small>{desc}</small>
            </div>
          </li>
        ))}
      </ul>

      <div className="stations__tools">
        <div className="stations__search">
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(sanitizeLine(e.target.value, LIMITS.search))}
            placeholder={t('stationsSearch')}
            aria-label={t('stationsSearch')}
            maxLength={LIMITS.search}
            autoComplete="off"
            spellCheck="false"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label={t('searchClear')}>
              <X size={15} aria-hidden="true" />
            </button>
          )}
        </div>

        {districts.length > 1 && (
          <div className="stations__districts" role="group" aria-label={t('allLocations')}>
            <button type="button" className={`chip ${!district ? 'chip--active' : ''}`} aria-pressed={!district} onClick={() => setDistrict('')}>
              {t('allLocations')} ({stations.length})
            </button>
            {districts.map((d) => (
              <button key={d} type="button" className={`chip ${district === d ? 'chip--active' : ''}`} aria-pressed={district === d} onClick={() => setDistrict(d)}>
                {d}
              </button>
            ))}
          </div>
        )}
      </div>

      {status === 'loading' ? (
        <div className="um-loading-box" role="status">
          <div className="um-spinner" />
          <p>{t('stationsLoadingLabel')}</p>
        </div>
      ) : status === 'error' ? (
        <div className="state-block panel">
          <p>{t('stationsLoadError')}</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setReloadKey((k) => k + 1)}>
            {t('retry')}
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="um-empty-state">{t('stationsNone')}</div>
      ) : (
        <>
          <p className="stations__count" role="status" aria-live="polite">
            {t('stationsFound', { count: filtered.length })}
          </p>
          <ul className="stations__grid">
            {filtered.map((station) => {
              const open = isOpenNow(station.operatingHours, now);
              return (
                <li key={station.id} className="station panel">
                  <div className="station__head">
                    <span className="station__pin">
                      <MapPin size={20} aria-hidden="true" />
                    </span>
                    <div>
                      <h2>{station.name}</h2>
                      <span className="station__district">{station.district}</span>
                    </div>
                    {open !== null ? (
                      <span className={`badge ${open ? 'badge-success' : 'badge-neutral'} station__status`}>
                        <span className="station__dot" aria-hidden="true" />
                        {open ? t('openNow') : t('closedNow')}
                      </span>
                    ) : (
                      <span className="badge badge-success station__status">{t('activeHub')}</span>
                    )}
                  </div>

                  <dl className="station__details">
                    <div>
                      <dt>
                        <MapPin size={14} aria-hidden="true" /> {t('address')}
                      </dt>
                      <dd>{station.addressText}</dd>
                    </div>
                    <div>
                      <dt>
                        <Clock size={14} aria-hidden="true" /> {t('operatingHours')}
                      </dt>
                      <dd>{station.operatingHours || t('contactForHours')}</dd>
                    </div>
                    {station.contactPhone && (
                      <div>
                        <dt>
                          <Phone size={14} aria-hidden="true" /> {t('stationContact')}
                        </dt>
                        <dd>{station.contactPhone}</dd>
                      </div>
                    )}
                  </dl>

                  <div className="station__actions">
                    <a href={mapsUrl(station)} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
                      <Navigation size={15} aria-hidden="true" /> {t('getDirections')}
                    </a>
                    {station.contactPhone && (
                      <a href={`tel:${String(station.contactPhone).replace(/[^\d+]/g, '')}`} className="btn btn-secondary btn-sm">
                        <Phone size={15} aria-hidden="true" /> {t('callStation')}
                      </a>
                    )}
                    <Link to="/catalog" className="btn btn-primary btn-sm">
                      <ShoppingBasket size={15} aria-hidden="true" /> {t('browseProduce')}
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
};

export default PickupStations;
