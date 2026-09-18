import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { LanguageProvider } from './Context/LanguageContext';
import { AuthProvider } from './Context/AuthContext';
import { CartProvider } from './Context/CartContext';
import ShopContextProvider from './Context/ShopContext';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <LanguageProvider>
      <AuthProvider>
        <CartProvider>
          <ShopContextProvider>
            <App />
          </ShopContextProvider>
        </CartProvider>
      </AuthProvider>
    </LanguageProvider>
  </React.StrictMode>
);