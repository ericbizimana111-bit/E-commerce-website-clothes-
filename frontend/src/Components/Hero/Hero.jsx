import React, { useEffect, useState } from 'react';
import './Hero.css';
import { Link } from 'react-router-dom';

const Hero = () => {
  const [products, setProducts] = useState([]);

  useEffect(() => {
    fetch('http://localhost:4000/allproducts')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setProducts(data);
      })
      .catch((err) => console.error('Failed to fetch products for hero:', err));
  }, []);

  const leftCards = products.slice(0, 4);
  const rightCards = products.slice(4, 8);

  return (
    <div className="hero-new">
      {/* Left side images */}
      <div className="hero-side hero-side-left">
        {leftCards.map((card, i) => (
          <Link
            to={`/product/${card.id}`}
            key={card._id || i}
            className={`hero-float-card hero-float-card-${i + 1}`}
            onClick={() => window.scrollTo(0, 0)}
          >
            <div className="hero-float-card-inner">
              <img src={card.image} alt={card.name} />
            </div>
          </Link>
        ))}
      </div>

      {/* Right side images */}
      <div className="hero-side hero-side-right">
        {rightCards.map((card, i) => (
          <Link
            to={`/product/${card.id}`}
            key={card._id || i}
            className={`hero-float-card hero-float-card-${i + 1}`}
            onClick={() => window.scrollTo(0, 0)}
          >
            <div className="hero-float-card-inner">
              <img src={card.image} alt={card.name} />
            </div>
          </Link>
        ))}
      </div>

      {/* Main content */}
      <div className="hero-content">
        <h1 className="hero-title">
          <span className="hero-title-line">Discover Your</span>
          <span className="hero-title-line">Perfect Style</span>
        </h1>
        <p className="hero-subtitle">
          Explore the latest fashion trends. Curated collections for men, women, and kids — all in one place.
        </p>
        <div className="hero-actions">
          <Link to="/womens" className="hero-btn hero-btn-primary" onClick={() => window.scrollTo(0, 0)}>
            Shop Women
          </Link>
          <Link to="/mens" className="hero-btn hero-btn-secondary" onClick={() => window.scrollTo(0, 0)}>
            Shop Men
          </Link>
        </div>
        <div className="hero-stats">
          <div className="hero-stat">
            <span className="hero-stat-num">500+</span>
            <span className="hero-stat-label">Products</span>
          </div>
          <div className="hero-stat-divider" />
          <div className="hero-stat">
            <span className="hero-stat-num">50K+</span>
            <span className="hero-stat-label">Happy Customers</span>
          </div>
          <div className="hero-stat-divider" />
          <div className="hero-stat">
            <span className="hero-stat-num">4.9</span>
            <span className="hero-stat-label">Rating</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Hero;
