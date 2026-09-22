import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, CreditCard, MapPin, ShieldCheck, ShoppingBasket, ShoppingCart } from 'lucide-react';
import { useLanguage } from '../Context/LanguageContext';
import './HowItWorks.css';

const HowItWorks = () => {
  const { t } = useLanguage();

  const steps = [
    { n: 1, Icon: ShoppingBasket, title: t('howStep1Title'), text: t('howLongStep1') },
    { n: 2, Icon: CreditCard, title: t('howStep2Title'), text: t('howLongStep2') },
    { n: 3, Icon: ShieldCheck, title: t('howStep3Title'), text: t('howLongStep3') }
  ];
  const faqs = [1, 2, 3, 4].map((n) => ({ q: t(`faq${n}Q`), a: t(`faq${n}A`) }));

  return (
    <div className="hiw container">
      <header className="hiw__head">
        <span className="section-kicker">{t('howKicker')}</span>
        <h1 className="page-title">{t('howItWorks')}</h1>
        <p className="section-desc">{t('howSubtitle')}</p>
      </header>

      <ol className="hiw__steps">
        {steps.map(({ n, Icon, title, text }) => (
          <li key={n} className="hiw__step panel">
            <span className="hiw__badge">
              <Icon size={24} strokeWidth={1.6} aria-hidden="true" />
              <b>{n}</b>
            </span>
            <div>
              <h2>{title}</h2>
              <p>{text}</p>
            </div>
          </li>
        ))}
      </ol>

      <section className="hiw__faq" aria-labelledby="faq-title">
        <h2 id="faq-title" className="section-title">
          {t('howFaqTitle')}
        </h2>
        <div className="hiw__faq-list">
          {faqs.map(({ q, a }) => (
            <details key={q} className="hiw__qa panel">
              <summary>
                {q}
                <ChevronDown size={18} aria-hidden="true" />
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="cta hiw__cta">
        <div>
          <h2>{t('finalCtaTitle')}</h2>
          <p>{t('finalCtaDesc')}</p>
        </div>
        <div className="cta__actions">
          <Link to="/catalog" className="btn btn-lg cta__primary">
            <ShoppingCart size={18} aria-hidden="true" /> {t('ctaBrowse')}
          </Link>
          <Link to="/pickup-stations" className="btn btn-lg btn-outline-light">
            <MapPin size={18} aria-hidden="true" /> {t('ctaStations')}
          </Link>
        </div>
      </section>
    </div>
  );
};

export default HowItWorks;
