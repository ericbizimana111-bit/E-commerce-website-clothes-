import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Admin from './Pages/Admin/Admin';
import Navbar from './Components/Navbar/Navbar';
import AddProduct from './Components/AddProduct/AddProduct';
import ListProduct from './Components/ListProduct/ListProduct';

const App = () => {
  return (
    <div className='app'>
      <Navbar />
      <Routes>
        <Route path="/" element={<Admin />}>
          <Route
            path=""
            element={
              <div
                style={{
                 
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  height: "50vh",
                  borderRadius: '30px',
                  margin: '100px auto',
                  marginTop: "70px",
                  padding: "50px",
                  color: "black",
                  border: "2px solid violet",
                  boxShadow: "0px 4px 10px violet",
                    background: "linear-gradient(90deg, var(--accent) 0%, var(--accent-mid) 100%)",
                }}>
                <div
                  style={{
                  
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    height: "50vh",
                    borderRadius: '30px',
                    margin: '100px auto',
                    marginTop: "70px",
                    padding: "50px",
                    color: "black",
                    border: "2px solid violet",
                    boxShadow: "0px 4px 10px violet",
                    background: "linear-gradient(90deg, var(--accent) 0%, var(--accent-mid) 100%)",


                  }}

                >
                  <div

                    style={{

                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      height: "50vh",
                      borderRadius: '30px',
                      margin: '100px auto',
                      marginTop: "70px",
                      padding: "50px",
                    
                      color:"white"
                    }}>
                    <h2>Welcome To Admin Panel</h2>
                  </div>
                </div>

              </div>
            }
          />
          <Route path="addproduct" element={<AddProduct />} />
          <Route path="listproduct" element={<ListProduct />} />
        </Route>
      </Routes>
    </div>
  );
};

export default App;


