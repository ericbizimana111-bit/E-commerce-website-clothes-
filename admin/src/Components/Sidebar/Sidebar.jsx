import React from 'react';
import './Sidebar.css';
import { NavLink } from 'react-router-dom';
import add_product_icon from '../../assets/Product_Cart.png';
import list_product_icon from '../../assets/product_list.svg';

const Sidebar = () => {
  return (
    <div className="sidebar">
     

      <NavLink to='/addproduct' style={{ textDecoration: "none" }}>
        <div className="sidebar-item">
          <img src={add_product_icon} alt="Add Product Icon" />
          <p>Add Product</p>
        </div>
      </NavLink>

      <NavLink to='/listproduct' style={{ textDecoration: "none" }}>
        <div className="sidebar-item">
          <img className="product_list_icon" src={list_product_icon} alt="Product List Icon" />
          <p>Product List</p>
        </div>
      </NavLink>
    </div>
  );
};

export default Sidebar;