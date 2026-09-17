import React, { createContext, useEffect, useState } from 'react';

export const ShopContext = createContext(null);

const getDefaultCart = () => {
  let cart = {};
  for (let index = 0; index <= 300; index++) {
    cart[index] = 0;
  }
  return cart;
};

const ShopContextProvider = (props) => {
  const [all_product, setAll_Product] = useState([]);
  const [cartItems, setCartItems] = useState(getDefaultCart());

  useEffect(() => {
    // Fetch all products
    fetch("http://localhost:4000/allproducts")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setAll_Product(data);
        }
      })
      .catch((err) => console.error("Failed to fetch products:", err));

    // If user is logged in, fetch their cart
    const token = localStorage.getItem('auth-token');
    if (token) {
      fetch('http://localhost:4000/getcart', {
        method: 'POST',
        headers: {
          'auth-token': token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      })
        .then((response) => response.json())
        .then((data) => {
          if (data && typeof data === 'object' && !data.errors) {
            setCartItems(data);
          }
        })
        .catch((err) => console.error("Failed to fetch cart:", err));
    }
  }, []);

  const addToCart = (itemId) => {
    setCartItems((prev) => ({
      ...prev,
      [itemId]: (prev[itemId] || 0) + 1,
    }));

    const token = localStorage.getItem('auth-token');
    if (token) {
      fetch('http://localhost:4000/addtocart', {
        method: 'POST',
        headers: {
          'auth-token': token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ itemId: itemId }),
      })
        .then((response) => response.json())
        .then((data) => console.log("Added to cart:", data))
        .catch((err) => console.error("Failed to add to cart:", err));
    }
  };

  const removeFromCart = (itemId) => {
    setCartItems((prev) => ({
      ...prev,
      [itemId]: Math.max((prev[itemId] || 0) - 1, 0),
    }));

    const token = localStorage.getItem('auth-token');
    if (token) {
      fetch('http://localhost:4000/removefromcart', {
        method: 'POST',
        headers: {
          'auth-token': token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ itemId: itemId }),
      })
        .then((response) => response.json())
        .then((data) => console.log("Removed from cart:", data))
        .catch((err) => console.error("Failed to remove from cart:", err));
    }
  };

  const getTotalCartItems = () => {
    let totalItem = 0;
    for (const item in cartItems) {
      if (cartItems[item] > 0) {
        totalItem += cartItems[item];
      }
    }
    return totalItem;
  };

  const contextValue = { getTotalCartItems, all_product, cartItems, addToCart, removeFromCart };

  return (
    <ShopContext.Provider value={contextValue}>
      {props.children}
    </ShopContext.Provider>
  );
};

export default ShopContextProvider;
