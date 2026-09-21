import React from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart, MapPin } from 'lucide-react';

const HowItWorks = () => {
  return (
    <div className="container" style={{ padding: '3rem 0 5rem' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
        <div style={{ textAlign: 'center' }}>
          <span className="badge badge-success" style={{ marginBottom: '0.75rem' }}>
            Fair &amp; Transparent Marketplace
          </span>
          <h1 style={{ fontSize: '2.4rem', fontWeight: 800, color: 'var(--dark)' }}>
            How UgaMarket Works
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '1.1rem', marginTop: '0.5rem' }}>
            A fair, transparent way to buy food: a small deposit secures your order, and you pay the balance only after inspecting your produce.
          </p>
        </div>

        <div className="card" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <div style={{ display: 'flex', gap: '1.25rem' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.2rem', flexShrink: 0 }}>
              1
            </div>
            <div>
              <h3 style={{ fontSize: '1.2rem', color: 'var(--dark)', marginBottom: '0.35rem' }}>
                Select Authentic Ugandan Farm Produce
              </h3>
              <p style={{ color: 'var(--slate)', lineHeight: 1.6 }}>
                Browse our verified catalog of fresh staple foods including Green Matooke from western farms, yellow beans, Super rice, Sukuma wiki, sweet potatoes, and farm milk. All produce is sourced directly from Ugandan growers at honest market rates.
              </p>
            </div>
          </div>

          <div style={{ height: '1px', background: 'var(--border)' }} />

          <div style={{ display: 'flex', gap: '1.25rem' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'var(--accent-light)', color: '#92400E', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.2rem', flexShrink: 0 }}>
              2
            </div>
            <div>
              <h3 style={{ fontSize: '1.2rem', color: 'var(--dark)', marginBottom: '0.35rem' }}>
                Secure With a Small Commitment Deposit
              </h3>
              <p style={{ color: 'var(--slate)', lineHeight: 1.6 }}>
                Unlike traditional stores that demand full payment upfront, UgaMarket only requires a <strong>small commitment deposit</strong> via Mobile Money (MTN / Airtel). This small deposit guarantees your commitment so our farming partners can harvest and pack fresh produce specifically for your order.
              </p>
            </div>
          </div>

          <div style={{ height: '1px', background: 'var(--border)' }} />

          <div style={{ display: 'flex', gap: '1.25rem' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'var(--primary-light)', color: 'var(--secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.2rem', flexShrink: 0 }}>
              3
            </div>
            <div>
              <h3 style={{ fontSize: '1.2rem', color: 'var(--dark)', marginBottom: '0.35rem' }}>
                Inspect Produce &amp; Pay the Balance
              </h3>
              <p style={{ color: 'var(--slate)', lineHeight: 1.6 }}>
                Your order is safely dispatched to your doorstep in Kampala or your preferred pickup station. When your produce arrives, inspect the freshness and quality firsthand. Once satisfied, complete the remaining balance on your phone.
              </p>
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: '2rem', textAlign: 'center', background: 'linear-gradient(135deg, #1C5233, #16A34A)', color: '#FFFFFF' }}>
          <h2 style={{ fontSize: '1.8rem', color: '#FFFFFF', marginBottom: '0.5rem' }}>
            Ready to experience fresh food shopping?
          </h2>
          <p style={{ opacity: 0.9, marginBottom: '1.5rem' }}>
            Taste the difference of true Ugandan soil, harvested fresh and delivered home to home.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/catalog" className="btn btn-accent btn-lg">
              <ShoppingCart size={18} strokeWidth={1.75} /> Browse Food Catalog
            </Link>
            <Link to="/pickup-stations" className="btn btn-secondary btn-lg" style={{ background: '#FFFFFF', color: 'var(--primary)' }}>
              <MapPin size={18} strokeWidth={1.75} /> View Pickup Stations
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HowItWorks;
