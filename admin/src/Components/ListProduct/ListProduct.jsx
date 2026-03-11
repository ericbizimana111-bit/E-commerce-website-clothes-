import React, { useEffect, useState } from 'react'
import './ListProduct.css'
import cross_icon from '../../assets/remove_icon.svg'

const ListProduct = () => {

  const [allproducts, setAllProducts] = useState([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [productToDelete, setProductToDelete] = useState(null); 

  const fetchInfo = async () => {
    await fetch('http://localhost:4000/allproducts')
      .then((res) => res.json())
      .then((data) => { setAllProducts(data) })
  }

  useEffect(() => {
    fetchInfo();
  }, [])



  // actual delete function
  const remove_product = async (id) => {
    await fetch('http://localhost:4000/removeproduct', {
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
        'Content-type': 'application/json',
      },
      body: JSON.stringify({ id: id })
    });

    await fetchInfo(); // refresh product list
  }



  // confirm deletion
  const confirmDelete = async () => {
    if (productToDelete) {
      await remove_product(productToDelete);
      setShowConfirm(false);
      setProductToDelete(null);
    }
  }


  const cancelDelete = () => {
    setShowConfirm(false);
    setProductToDelete(null);
  }

  return (
    <div className='list-product'>
      <h1>All Products List</h1>

      <div className="listproduct-format-main">
        <p>Products</p>
        <p>Title</p>
        <p>Old Price</p>
        <p>New Price</p>
        <p>Category</p>
        <p>Remove</p>
      </div>

      <div className="listproduct-allproducts">
        <hr />
        {allproducts.map((product, index) => {
          return <>
            <div key={index} className="listproduct-format-main  listproduct-format">
              <img src={product.image} alt="" className="listproduct-product-icon" />
              <p>{product.name}</p>
              <p>${product.old_price}</p>
              <p>${product.new_price}</p>
              <p>{product.category}</p>
            
              <img
                onClick={() => { setProductToDelete(product.id); setShowConfirm(true); }}
                className='listproduct-remove-icon'
                src={cross_icon}
                alt=""
              />
            </div>
            <hr />
          </>
        })}
      </div>

      
      {showConfirm && (
        <div className="delete-overlay">
          <div className="delete-card">
            <h3>Delete Product</h3>
            <p>Are you sure you want to delete this product?</p>
            <div className="delete-buttons">
              <button className="confirm-btn" onClick={confirmDelete}>Yes, Delete</button>
              <button className="cancel-btn" onClick={cancelDelete}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ListProduct;