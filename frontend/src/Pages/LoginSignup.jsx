import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CreditCard, Eye, EyeOff, Lock, MapPin, ShieldCheck, Zap } from 'lucide-react';
import { useAuth } from '../Context/AuthContext';
import { useLanguage } from '../Context/LanguageContext';
import { useToast } from '../Components/Toast/Toast';
import SlidingTabs from '../Components/ui/SlidingTabs';
import LanguageSwitcher from '../Components/LanguageSwitcher/LanguageSwitcher';
import {
  LIMITS,
  normalizeUgandaPhone,
  passwordStrength,
  sanitizeEmail,
  sanitizeName,
  sanitizePassword,
  sanitizePhone,
  validateEmail,
  validateLoginPassword,
  validateName,
  validateNewPassword,
  validatePhone
} from '../utils/inputGuards';
import './LoginSignup.css';

const LOGO_SRC = `${process.env.PUBLIC_URL}/logo.png`;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 30;

/** Only ever redirect to a page inside this app (blocks "//evil.com" style values). */
const safeRedirect = (value) => (typeof value === 'string' && /^\/(?!\/)[\w\-./?=&%]*$/.test(value) ? value : '/');

/** Translate the failure into the customer's language; keep server text only when it is specific. */
const authErrorMessage = (result, isLogin, t) => {
  const { status, error } = result;
  if (status === 0) return t('errNetwork');
  if (status === 429) return t('errTooMany');
  if (typeof status === 'number' && status >= 500) return t('errServer');
  if (isLogin) return status === 400 || status === 401 || status === 404 ? t('errLoginFailed') : error || t('errLoginFailed');
  if (status === 409) return t('errAccountExists');
  return error || t('errRegisterFailed');
};

const GoogleMark = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.5 17.7 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
    <path fill="#FBBC05" d="M10.5 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z" />
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
  </svg>
);

/** Labelled text field with inline error, used for every auth input. */
const Field = ({ id, label, required, hint, error, children }) => (
  <div className="form-group">
    <label className="form-label" htmlFor={id}>
      {label}
      {required && <span className="req"> *</span>}
    </label>
    {children}
    {error ? (
      <span className="field-error" id={`${id}-err`} role="alert">
        {error}
      </span>
    ) : (
      hint && (
        <span className="input-hint" id={`${id}-hint`}>
          {hint}
        </span>
      )
    )}
  </div>
);

const LoginSignup = () => {
  const { login, register, isAuthenticated } = useAuth();
  const { t } = useLanguage();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const redirectUrl = safeRedirect(searchParams.get('redirect'));
  const mode = searchParams.get('signup') === 'true' ? 'signup' : 'login';
  const isLogin = mode === 'login';

  const [values, setValues] = useState({ fullName: '', phone: '', email: '', password: '' });
  const [touched, setTouched] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [failures, setFailures] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  // Countdown while locked out after repeated failed sign-ins.
  useEffect(() => {
    if (lockedUntil <= Date.now()) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [lockedUntil]);

  const secondsLeft = Math.max(0, Math.ceil((lockedUntil - now) / 1000));
  const locked = secondsLeft > 0;

  const tabOptions = useMemo(
    () => [
      { value: 'login', label: t('tabLogin'), id: 'auth-tab-login', controls: 'auth-panel' },
      { value: 'signup', label: t('tabSignup'), id: 'auth-tab-signup', controls: 'auth-panel' }
    ],
    [t]
  );

  if (isAuthenticated) return <Navigate to={redirectUrl} replace state={location.state} />;

  const switchMode = (next) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'signup') params.set('signup', 'true');
    else params.delete('signup');
    setSearchParams(params, { replace: true });
    setTouched({});
    setFormError('');
    setShowPassword(false);
  };

  const setField = (field, sanitizer) => (e) => {
    setValues((prev) => ({ ...prev, [field]: sanitizer(e.target.value) }));
    if (formError) setFormError('');
  };
  const markTouched = (field) => () => setTouched((prev) => ({ ...prev, [field]: true }));

  const fieldErrors = {
    fullName: isLogin ? null : validateName(values.fullName),
    phone: validatePhone(values.phone),
    email: isLogin ? null : validateEmail(values.email),
    password: isLogin ? validateLoginPassword(values.password) : validateNewPassword(values.password)
  };
  const visibleError = (field) => (touched[field] && fieldErrors[field] ? t(fieldErrors[field]) : null);

  const strength = passwordStrength(values.password);
  const strengthLabel = ['', t('strengthWeak'), t('strengthFair'), t('strengthGood'), t('strengthStrong')][strength];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting || locked) return;
    setFormError('');

    const invalid = Object.keys(fieldErrors).filter((f) => fieldErrors[f]);
    if (invalid.length > 0) {
      setTouched({ fullName: true, phone: true, email: true, password: true });
      const first = document.getElementById(`auth-${invalid[0]}`);
      first?.focus();
      return;
    }

    setSubmitting(true);
    const phone = normalizeUgandaPhone(values.phone);
    const result = isLogin
      ? await login(phone, values.password)
      : await register({
          fullName: values.fullName.trim(),
          phone,
          email: values.email.trim() || undefined,
          password: values.password
        });
    setSubmitting(false);

    if (result.success) {
      navigate(redirectUrl, { replace: true });
      return;
    }

    if (isLogin) {
      const next = failures + 1;
      setFailures(next);
      if (next >= MAX_FAILED_ATTEMPTS) {
        setFailures(0);
        setLockedUntil(Date.now() + LOCKOUT_SECONDS * 1000);
        setNow(Date.now());
      }
    }
    setFormError(authErrorMessage(result, isLogin, t));
    setValues((prev) => ({ ...prev, password: '' }));
  };

  const handleGoogle = () => {
    // Google sign-up is wired up here once the OAuth client is configured.
    showToast(t('googleSoon'), { type: 'info', duration: 5000 });
  };

  const perks = [
    { Icon: ShieldCheck, text: t('authPerk1') },
    { Icon: Zap, text: t('authPerk2') },
    { Icon: MapPin, text: t('authPerk3') },
    { Icon: CreditCard, text: t('authPerk4') }
  ];

  return (
    <div className="auth">
      <aside className="auth__brand">
        <div className="auth__brand-inner">
          <Link to="/" className="auth__brand-logo" aria-label={t('brandName')}>
            <img src={LOGO_SRC} alt="" width="150" height="44" />
          </Link>
          <h2>{t('authBrandTitle')}</h2>
          <p>{t('authBrandDesc')}</p>
          <ul>
            {perks.map(({ Icon, text }) => (
              <li key={text}>
                <span>
                  <Icon size={16} aria-hidden="true" />
                </span>
                {text}
              </li>
            ))}
          </ul>
          <blockquote>{t('authQuote')}</blockquote>
        </div>
      </aside>

      <section className="auth__panel">
        <div className="auth__top">
          <Link to="/" className="auth__mobile-logo" aria-label={t('brandName')}>
            <img src={LOGO_SRC} alt="" width="130" height="38" />
          </Link>
          <LanguageSwitcher />
        </div>

        <div className="auth__card">
          <h1>{isLogin ? t('authLoginTitle') : t('authSignupTitle')}</h1>
          <p className="auth__lead">{isLogin ? t('authLoginDesc') : t('authSignupDesc')}</p>

          <SlidingTabs options={tabOptions} value={mode} onChange={switchMode} ariaLabel={t('account')} full />

          <div id="auth-panel" role="tabpanel" aria-labelledby={`auth-tab-${mode}`} className="auth__form-wrap" key={mode}>
            {(formError || locked) && (
              <div className="alert alert-error" role="alert">
                <AlertTriangle size={16} aria-hidden="true" />
                <span>{locked ? t('errLockout', { s: secondsLeft }) : formError}</span>
              </div>
            )}

            {!isLogin && (
              <>
                <button type="button" className="auth__google" onClick={handleGoogle}>
                  <GoogleMark />
                  {t('continueWithGoogle')}
                </button>
                <div className="auth__divider">
                  <span>{t('orDivider')}</span>
                </div>
              </>
            )}

            <form onSubmit={handleSubmit} noValidate autoComplete="on">
              {!isLogin && (
                <Field id="auth-fullName" label={t('fullName')} required error={visibleError('fullName')}>
                  <input
                    id="auth-fullName"
                    type="text"
                    className="form-input"
                    placeholder={t('fullNamePlaceholder')}
                    value={values.fullName}
                    onChange={setField('fullName', sanitizeName)}
                    onBlur={markTouched('fullName')}
                    maxLength={LIMITS.fullName}
                    autoComplete="name"
                    autoCapitalize="words"
                    spellCheck="false"
                    aria-invalid={Boolean(visibleError('fullName'))}
                    aria-describedby={visibleError('fullName') ? 'auth-fullName-err' : undefined}
                    disabled={submitting}
                  />
                </Field>
              )}

              <Field id="auth-phone" label={t('phoneLabel')} required hint={t('phoneHint')} error={visibleError('phone')}>
                <input
                  id="auth-phone"
                  type="tel"
                  inputMode="tel"
                  className="form-input"
                  placeholder={t('phonePlaceholder')}
                  value={values.phone}
                  onChange={setField('phone', sanitizePhone)}
                  onBlur={markTouched('phone')}
                  maxLength={LIMITS.phoneIntl}
                  autoComplete="username tel"
                  autoCapitalize="off"
                  spellCheck="false"
                  aria-invalid={Boolean(visibleError('phone'))}
                  aria-describedby={visibleError('phone') ? 'auth-phone-err' : 'auth-phone-hint'}
                  disabled={submitting}
                />
              </Field>

              {!isLogin && (
                <Field id="auth-email" label={`${t('emailLabel')} (${t('optional')})`} error={visibleError('email')}>
                  <input
                    id="auth-email"
                    type="email"
                    inputMode="email"
                    className="form-input"
                    placeholder={t('emailPlaceholder')}
                    value={values.email}
                    onChange={setField('email', sanitizeEmail)}
                    onBlur={markTouched('email')}
                    maxLength={LIMITS.email}
                    autoComplete="email"
                    autoCapitalize="off"
                    spellCheck="false"
                    aria-invalid={Boolean(visibleError('email'))}
                    aria-describedby={visibleError('email') ? 'auth-email-err' : undefined}
                    disabled={submitting}
                  />
                </Field>
              )}

              <Field id="auth-password" label={t('passwordLabel')} required hint={isLogin ? undefined : t('passwordRules')} error={visibleError('password')}>
                <div className="pw">
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    className="form-input"
                    placeholder={isLogin ? t('passwordPlaceholder') : t('passwordNewPlaceholder')}
                    value={values.password}
                    onChange={setField('password', (v) => sanitizePassword(v, isLogin ? LIMITS.passwordLogin : LIMITS.passwordSignup))}
                    onBlur={markTouched('password')}
                    maxLength={isLogin ? LIMITS.passwordLogin : LIMITS.passwordSignup}
                    autoComplete={isLogin ? 'current-password' : 'new-password'}
                    autoCapitalize="off"
                    spellCheck="false"
                    aria-invalid={Boolean(visibleError('password'))}
                    aria-describedby={visibleError('password') ? 'auth-password-err' : !isLogin ? 'auth-password-hint' : undefined}
                    disabled={submitting}
                  />
                  <button
                    type="button"
                    className="pw__toggle"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                  </button>
                </div>

                {!isLogin && values.password && (
                  <div className="strength" role="status" aria-label={`${t('strengthLabel')}: ${strengthLabel}`}>
                    <span className="strength__bars" aria-hidden="true">
                      {[1, 2, 3, 4].map((n) => (
                        <i key={n} className={n <= strength ? `strength__bar strength__bar--${strength}` : 'strength__bar'} />
                      ))}
                    </span>
                    <span className={`strength__text strength__text--${strength}`}>{strengthLabel}</span>
                  </div>
                )}
              </Field>

              <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={submitting || locked}>
                {submitting ? t('processing2') : isLogin ? t('loginButton') : t('signupButton')}
              </button>
            </form>
          </div>

          <p className="auth__switch">
            {isLogin ? t('noAccountYet') : t('haveAccount')}{' '}
            <button type="button" onClick={() => switchMode(isLogin ? 'signup' : 'login')}>
              {isLogin ? t('createOneHere') : t('loginHere')}
            </button>
          </p>

          <ul className="auth__trust">
            <li>
              <ShieldCheck size={14} aria-hidden="true" /> {t('authTrust1')}
            </li>
            <li>
              <Lock size={14} aria-hidden="true" /> {t('authTrust2')}
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
};

export default LoginSignup;
