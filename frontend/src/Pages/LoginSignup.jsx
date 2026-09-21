import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../Context/AuthContext';
import { AlertTriangle, ShieldCheck, Lock, Leaf, MapPin, CreditCard, Zap } from 'lucide-react';
import './LoginSignup.css';

const LOGO_SRC = `${process.env.PUBLIC_URL}/logo.png`;

const LoginSignup = () => {
  const { login, register, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const query = new URLSearchParams(location.search);
  const redirectUrl = query.get('redirect') || '/';
  const initialSignup = query.get('signup') === 'true';

  const [isLogin, setIsLogin] = useState(!initialSignup);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isAuthenticated) {
      navigate(redirectUrl, { replace: true });
    }
  }, [isAuthenticated, navigate, redirectUrl]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setIsLogin(params.get('signup') !== 'true');
  }, [location.search]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const cleanPhone = phone.trim();
    if (!cleanPhone.startsWith('07') && !cleanPhone.startsWith('+2567')) {
      setError('Please enter a valid Uganda phone number (e.g. 0770000000 or +256770000000)');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    if (isLogin) {
      const res = await login(cleanPhone, password);
      setLoading(false);
      if (res.success) {
        navigate(redirectUrl, { replace: true });
      } else {
        setError(res.error || 'Invalid phone number or password.');
      }
    } else {
      if (!fullName.trim() || fullName.trim().length < 2) {
        setLoading(false);
        setError('Please enter your full name (minimum 2 characters)');
        return;
      }

      const res = await register({
        fullName: fullName.trim(),
        phone: cleanPhone,
        email: email.trim() || undefined,
        password
      });
      setLoading(false);
      if (res.success) {
        navigate(redirectUrl, { replace: true });
      } else {
        setError(res.error || 'Registration failed. Please try again.');
      }
    }
  };

  return (
    <div className="um-auth-page">
      {/* Brand panel — visible on desktop only */}
      <div className="um-auth-brand-panel">
        <div className="um-auth-brand-inner">
          <div className="um-auth-brand-logo">
            <Leaf size={30} strokeWidth={1.5} />
            <span>UgaMarket</span>
          </div>
          <h2 className="um-auth-brand-title">Uganda's Fresh Food Marketplace</h2>
          <p className="um-auth-brand-tagline">
            Farm-fresh produce from Ugandan farmers to your table — transparent, fair, and quality-checked.
          </p>
          <div className="um-auth-brand-perks">
            <div className="um-auth-brand-perk">
              <span className="um-auth-brand-perk-icon"><ShieldCheck size={15} strokeWidth={1.75} /></span>
              <span>Inspect before paying the balance</span>
            </div>
            <div className="um-auth-brand-perk">
              <span className="um-auth-brand-perk-icon"><Zap size={15} strokeWidth={1.75} /></span>
              <span>Only 30% deposit to place your order</span>
            </div>
            <div className="um-auth-brand-perk">
              <span className="um-auth-brand-perk-icon"><MapPin size={15} strokeWidth={1.75} /></span>
              <span>Free pickup at nearby stations</span>
            </div>
            <div className="um-auth-brand-perk">
              <span className="um-auth-brand-perk-icon"><CreditCard size={15} strokeWidth={1.75} /></span>
              <span>MTN &amp; Airtel Mobile Money</span>
            </div>
          </div>
          <p className="um-auth-brand-quote">
            "Connecting Ugandan farmers with families who value freshness."
          </p>
        </div>
      </div>

      {/* Form panel */}
      <div className="um-auth-form-panel">
        <div className="um-auth-card card">
          <div className="um-auth-header">
            <Link to="/" className="um-auth-logo">
              <img
                src={LOGO_SRC}
                alt="UgaMarket — home to home"
                className="um-auth-logo-img"
                width="168"
                height="48"
              />
            </Link>
            <h2>{isLogin ? 'Customer Login' : 'Create Customer Account'}</h2>
            <p>
              {isLogin
                ? 'Access your fresh farm orders, track deliveries, and manage saved addresses.'
                : 'Join UgaMarket to purchase farm-fresh Ugandan food direct to your home or station.'}
            </p>
          </div>

          {error && (
            <div className="alert alert-error">
              <AlertTriangle size={16} strokeWidth={1.75} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="um-auth-form">
            {!isLogin && (
              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sarah Namubiru"
                  className="form-input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Uganda Phone Number (MTN / Airtel) *</label>
              <input
                type="tel"
                required
                placeholder="0770000000 or +256770000000"
                className="form-input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <small className="um-input-hint">Format: 07XXXXXXXX or +2567XXXXXXXX</small>
            </div>

            {!isLogin && (
              <div className="form-group">
                <label className="form-label">Email Address (Optional)</label>
                <input
                  type="email"
                  placeholder="sarah@example.com"
                  className="form-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Password (Min 8 characters) *</label>
              <input
                type="password"
                required
                minLength={8}
                placeholder="••••••••"
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary btn-lg btn-block um-auth-submit"
            >
              {loading
                ? 'Processing...'
                : isLogin
                ? 'Login to UgaMarket'
                : 'Create Account & Continue'}
            </button>
          </form>

          <div className="um-auth-footer">
            {isLogin ? (
              <p>
                Don&apos;t have an account yet?{' '}
                <button
                  type="button"
                  className="um-auth-switch-btn"
                  onClick={() => { setIsLogin(false); setError(''); }}
                >
                  Create one here
                </button>
              </p>
            ) : (
              <p>
                Already have an account?{' '}
                <button
                  type="button"
                  className="um-auth-switch-btn"
                  onClick={() => { setIsLogin(true); setError(''); }}
                >
                  Login here
                </button>
              </p>
            )}
          </div>

          <div className="um-auth-trust-box">
            <span><ShieldCheck size={13} strokeWidth={1.75} /> Verified Ugandan Customer Marketplace</span>
            <span><Lock size={13} strokeWidth={1.75} /> Secure password hashing &amp; JWT token sessions</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginSignup;
