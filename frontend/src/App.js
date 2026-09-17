import React from 'react';
import './App.css';
import Navbar from './Components/Navbar/Navbar';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import Shop from './Pages/Shop';
import ShopCategory from './Pages/ShopCategory';
import Product from './Pages/Product';
import LoginSignup from './Pages/LoginSignup';
import Cart from './Pages/Cart';
import Footer from './Components/Footer/Footer';

function AppRoutes() {
  const location = useLocation();
  const isAuthPage = location.pathname === '/login';

  return (
    <>
      {!isAuthPage && <Navbar />}
      <Routes>
        <Route path='/' element={<Shop />} />
        <Route path='/mens' element={<ShopCategory category="men" />} />
        <Route path='/womens' element={<ShopCategory category="women" />} />
        <Route path='/kids' element={<ShopCategory category="kid" />} />
        <Route path='/product' element={<Product />}>
          <Route path=':productId' element={<Product />} />
        </Route>
        <Route path='/cart' element={<Cart />} />
        <Route path='/login' element={<LoginSignup />} />
      </Routes>
      {!isAuthPage && <Footer />}
    </>
  );
}

function App() {
  return (
    <div>
      <Router>
        <AppRoutes />
      </Router>
    </div>
  );
}

export default App;
