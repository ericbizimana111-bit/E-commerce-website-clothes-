import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, LogIn, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { LIMITS, isValidEmail, sanitizeEmail, sanitizePassword } from '../../utils/inputGuards';
import './LoginPage.css';

const LOGO_SRC = '/logo.png';
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 30;

/**
 * Admin login against the backend's dedicated admin auth context
 * (email + password, admin JWT with a separate secret from customer tokens).
 */
export default function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = location.state?.from || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
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

  // Already signed in: go straight to the console. Declarative redirect —
  // calling navigate() during render would trigger a React warning.
  if (isAuthenticated) {
    return <Navigate to={redirectTo} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting || locked) return;
    setError(null);

    if (!email.trim()) {
      setError('Enter your admin email address.');
      return;
    }
    if (!isValidEmail(email)) {
      setError('Enter a valid email address.');
      return;
    }
    if (!password) {
      setError('Enter your password.');
      return;
    }

    setSubmitting(true);
    try {
      await login(email, password);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      const next = failures + 1;
      if (next >= MAX_FAILED_ATTEMPTS) {
        setFailures(0);
        setLockedUntil(Date.now() + LOCKOUT_SECONDS * 1000);
        setNow(Date.now());
      } else {
        setFailures(next);
      }
      setPassword('');
      setError(err.message || 'Sign in failed. Check your credentials and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <img src={LOGO_SRC} alt="UgaMarket — home to home" className="login-brand__logo" />
          <h1>Operations Console</h1>
          <p>Sign in with your UgaMarket staff account.</p>
        </div>

        {(error || locked) && (
          <div className="alert alert--error" role="alert">
            <AlertCircle size={15} aria-hidden="true" />
            <span>
              {locked ? `Too many failed attempts. Try again in ${secondsLeft} seconds.` : error}
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-field">
            <label htmlFor="login-email" className="required">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              autoCapitalize="off"
              spellCheck="false"
              maxLength={LIMITS.email}
              value={email}
              onChange={(e) => setEmail(sanitizeEmail(e.target.value))}
              placeholder="admin@ugamarket.ug"
              disabled={submitting}
            />
          </div>

          <div className="form-field">
            <label htmlFor="login-password" className="required">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              maxLength={LIMITS.password}
              value={password}
              onChange={(e) => setPassword(sanitizePassword(e.target.value))}
              placeholder="••••••••"
              disabled={submitting}
            />
          </div>

          <button
            type="submit"
            className="btn btn--primary btn--block"
            disabled={submitting || locked}
          >
            <LogIn size={15} aria-hidden="true" />
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="login-footnote">
          <ShieldCheck size={14} aria-hidden="true" />
          <span>
            Staff access only. Customer accounts cannot sign in here.{' '}
            <Link to="/">Back to console</Link>
          </span>
        </div>
      </div>
    </div>
  );
}
