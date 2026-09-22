import React from 'react';
import { Link } from 'react-router-dom';
import { Leaf, Mail, MapPin, Phone, ShieldCheck, Wallet } from 'lucide-react';
import { useLanguage } from '../../Context/LanguageContext';
import useCategories from '../../utils/useCategories';
import LanguageSwitcher from '../LanguageSwitcher/LanguageSwitcher';
import './Footer.css';

const LOGO_SRC = `${process.env.PUBLIC_URL}/logo.png`;
const PAYMENT_METHODS = ['MTN MoMo', 'Airtel Money', 'Visa', 'MasterCard'];

const Footer = () => {
  const { t, getLocalizedField } = useLanguage();
  const { categories } = useCategories();

  return (
    <footer className="um-footer">
      <div className="container">
        <div className="um-footer__grid">
          <div className="um-footer__brand">
            <Link to="/" aria-label={t('brandName')}>
              <img src={LOGO_SRC} alt="" className="um-footer__logo" width="150" height="44" />
            </Link>
            <p>{t('footerDesc')}</p>
            <ul className="um-footer__badges">
              <li>
                <Leaf size={14} aria-hidden="true" /> {t('footerBadgeFarmers')}
              </li>
              <li>
                <ShieldCheck size={14} aria-hidden="true" /> {t('footerBadgeInspect')}
              </li>
              <li>
                <Wallet size={14} aria-hidden="true" /> {t('footerBadgeDeposit')}
              </li>
            </ul>
          </div>

          <nav className="um-footer__col" aria-label={t('footerShop')}>
            <h4>{t('footerShop')}</h4>
            <ul>
              <li>
                <Link to="/catalog">{t('footerAllFood')}</Link>
              </li>
              {categories.slice(0, 5).map((cat) => (
                <li key={cat.id}>
                  <Link to={`/catalog?category=${encodeURIComponent(cat.slug)}`}>
                    {getLocalizedField(cat, 'name') || cat.name}
                  </Link>
                </li>
              ))}
              <li>
                <Link to="/pickup-stations">{t('pickupStations')}</Link>
              </li>
            </ul>
          </nav>

          <nav className="um-footer__col" aria-label={t('footerAccount')}>
            <h4>{t('footerAccount')}</h4>
            <ul>
              <li>
                <Link to="/login">{t('signIn')}</Link>
              </li>
              <li>
                <Link to="/login?signup=true">{t('signup')}</Link>
              </li>
              <li>
                <Link to="/account/orders">{t('footerMyOrders')}</Link>
              </li>
              <li>
                <Link to="/account/addresses">{t('footerSavedAddresses')}</Link>
              </li>
              <li>
                <Link to="/account/notifications">{t('notifications')}</Link>
              </li>
            </ul>
          </nav>

          <div className="um-footer__col">
            <h4>{t('footerSupport')}</h4>
            <ul>
              <li>
                <Link to="/how-it-works">{t('howItWorks')}</Link>
              </li>
              <li>
                <Link to="/how-it-works">{t('footerDepositExplained')}</Link>
              </li>
              <li>
                <Link to="/pickup-stations">{t('footerFindStation')}</Link>
              </li>
            </ul>
            <address className="um-footer__contact">
              <span>
                <MapPin size={14} aria-hidden="true" /> {t('footerLocation')}
              </span>
              <a href="tel:+256700123456">
                <Phone size={14} aria-hidden="true" /> +256 700 123 456
              </a>
              <a href="mailto:support@ugamarket.ug">
                <Mail size={14} aria-hidden="true" /> support@ugamarket.ug
              </a>
            </address>
          </div>
        </div>

        <div className="um-footer__pay">
          <span>{t('footerPayWith')}</span>
          <ul>
            {PAYMENT_METHODS.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>

        <div className="um-footer__bottom">
          <p>{t('footerRights', { year: new Date().getFullYear() })}</p>
          <div className="um-footer__bottom-right">
            <span>{t('footerPricesUgx')}</span>
            <LanguageSwitcher tone="light" />
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
