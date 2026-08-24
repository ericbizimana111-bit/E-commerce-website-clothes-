import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Admin from './Pages/Admin/Admin';
import Navbar from './Components/Navbar/Navbar';
import AddProduct from './Components/AddProduct/AddProduct';
import ListProduct from './Components/ListProduct/ListProduct';

const WelcomeCard = () => (
  <div style={{
    flex: 1,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '60vh',
    margin: '30px',
  }}>
    <div style={{
      textAlign: 'center',
      padding: '60px 40px',
      borderRadius: '20px',
      background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-mid) 100%)',
      color: 'white',
      boxShadow: '0 8px 32px rgba(200, 87, 42, 0.3)',
      maxWidth: '500px',
      width: '100%',
    }}>
      <h2 style={{ fontSize: '28px', marginBottom: '12px', fontWeight: 700 }}>
        Welcome to Shopper Admin
      </h2>
      <p style={{ fontSize: '15px', opacity: 0.9, lineHeight: 1.6 }}>
        Manage your products, track inventory, and grow your store from here.
      </p>
    </div>
  </div>
);

const App = () => {
  return (
    <div className='app'>
      <Navbar />
      <Routes>
        <Route path="/" element={<Admin />}>
          <Route path="" element={<WelcomeCard />} />
          <Route path="addproduct" element={<AddProduct />} />
          <Route path="listproduct" element={<ListProduct />} />
        </Route>
      </Routes>
    </div>
  );
};

export default App;
