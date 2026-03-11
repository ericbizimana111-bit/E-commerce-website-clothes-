import React from 'react';
import './Admin.css';
import { Outlet } from 'react-router-dom';
import Sidebar from '../../Components/Sidebar/Sidebar';

const Admin = () => {
  return (
    <div className='admin'>
      <Sidebar />
      <Outlet />
    </div>
  );
};

export default Admin;