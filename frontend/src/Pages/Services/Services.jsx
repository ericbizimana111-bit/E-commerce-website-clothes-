import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, BadgeCheck, CalendarCheck, Clock, Home as HomeIcon, ShieldCheck, Smartphone, UserCheck } from 'lucide-react';
import apiClient from '../../api/client';
import { useLanguage } from '../../Context/LanguageContext';
import { formatUGX } from '../../utils/currency';
import { iconFor } from '../../utils/categoryIcons';
import Reveal from '../../Components/ui/Reveal';
import './Services.css';

export function priceLabel(service, t) {
  if (!service) return '';
  const amount = formatUGX(service.priceFromUgx);
  if (service.priceType === 'FIXED') return t('priceFixed', { amount });
  if (service.priceType === 'HOURLY') return t('priceHourly', { amount });
  return t('priceInspection', { amount });
}

/** Home services catalogue: GET /api/services?lang= */
const Services = () => {
  const { t, currentLang } = useLanguage();
  const [services, setServices] = useState([]);
  const [state, setState] = useState('loading');

  useEffect(() => {
    let alive = true;
    setState('loading');
    apiClient
      .get(`/services?lang=${currentLang}`)
      .then((res) => {
        if (!alive) return;
        setServices(res?.data?.services || []);
        setState('ready');
      })
      .catch(() => alive && setState('error'));
    return () => {
      alive = false;
    };
  }, [currentLang]);

  return (
    <div className="services container">
      <section className="services__hero">
        <div>
          <span className="section-kicker">{t('servicesKicker')}</span>
          <h1 className="page-title">{t('servicesTitle')}</h1>
          <p className="section-desc">{t('servicesSubtitle')}</p>
          <ul className="services__promises">
            <li>
              <BadgeCheck size={16} aria-hidden="true" /> {t('servicesPromise1')}
            </li>
            <li>
              <ShieldCheck size={16} aria-hidden="true" /> {t('servicesPromise2')}
            </li>
            <li>
              <Smartphone size={16} aria-hidden="true" /> {t('servicesPromise3')}
            </li>
          </ul>
        </div>
        <span className="services__hero-art" aria-hidden="true">
          <HomeIcon size={88} strokeWidth={1.1} />
        </span>
      </section>

      {state === 'loading' && (
        <div className="services__grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="svc-card svc-card--skeleton" />
          ))}
        </div>
      )}
      {state === 'error' && (
        <div className="state-block">
          <AlertCircle size={32} aria-hidden="true" />
          <p>{t('servicesLoadError')}</p>
        </div>
      )}
      {state === 'ready' && services.length === 0 && <div className="um-empty-state">{t('servicesEmpty')}</div>}
      {state === 'ready' && services.length > 0 && (
        <div className="services__grid">
          {services.map((s) => {
            const Icon = iconFor(s.icon);
            return (
              <Link key={s.id} to={`/services/${s.slug}`} className="svc-card">
                <span className="svc-card__icon">
                  <Icon size={26} strokeWidth={1.7} aria-hidden="true" />
                </span>
                <h2>{s.name}</h2>
                {s.description && <p>{s.description}</p>}
                <div className="svc-card__meta">
                  <strong>{priceLabel(s, t)}</strong>
                  {s.durationText && (
                    <span>
                      <Clock size={13} aria-hidden="true" /> {s.durationText}
                    </span>
                  )}
                </div>
                <span className="svc-card__cta">
                  {t('bookNow')} <ArrowRight size={15} aria-hidden="true" className="btn__nudge" />
                </span>
              </Link>
            );
          })}
        </div>
      )}

      <Reveal as="section" className="services__how">
        <h2 className="section-title">{t('servicesHowTitle')}</h2>
        <ol>
          {[
            { Icon: CalendarCheck, title: t('servicesHow1Title'), desc: t('servicesHow1Desc') },
            { Icon: UserCheck, title: t('servicesHow2Title'), desc: t('servicesHow2Desc') },
            { Icon: HomeIcon, title: t('servicesHow3Title'), desc: t('servicesHow3Desc') },
            { Icon: Smartphone, title: t('servicesHow4Title'), desc: t('servicesHow4Desc') }
          ].map(({ Icon, title, desc }, i) => (
            <li key={title}>
              <span className="services__how-num">{i + 1}</span>
              <Icon size={22} aria-hidden="true" />
              <strong>{title}</strong>
              <p>{desc}</p>
            </li>
          ))}
        </ol>
      </Reveal>
    </div>
  );
};

export default Services;
