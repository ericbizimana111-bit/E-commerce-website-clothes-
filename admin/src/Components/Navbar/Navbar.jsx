
// Add this at the top of Navbar.jsx
import React from 'react';
import "./Navbar.css";
import navlogo from "../../assets/nav-logo.svg";
import navProfile from "../../assets/men (12).jpg";

const Navbar = () => {
  return (
    <div className="navbar">
      <div className="nav-left">
        <img src={navlogo} alt="logo" className="logo" />
        <div>
          <h2>SHOPPER</h2>
          <p>Admin Panel</p>
        </div>
      </div>

      <div className="nav-right">
        <img src={navProfile} alt="profile" className="profile" />
        <span className="arrow">▼</span>
      </div>
    </div>
  );
};

export default Navbar;