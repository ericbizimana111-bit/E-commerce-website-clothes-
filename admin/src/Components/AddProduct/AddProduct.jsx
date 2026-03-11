import React, { useState } from 'react';
import './AddProduct.css';
import upload_area from '../../assets/upload_area.svg'

const AddProduct = () => {
  const [image, setImage] = useState(false);
  const [productDetails, setProductDetails] = useState({
    name: "",
    image: "",
    category: "women",
    new_price: "",
    old_price: "",
  });

  const imageHandler = (e) => {
    setImage(e.target.files[0]);
  };

  const changeHandler = (e) => {
    setProductDetails({ ...productDetails, [e.target.name]: e.target.value });
  };

  const Add_Product = async () => {
    console.log(productDetails);
    let responseData;
    let product = { ...productDetails };

    let formData = new FormData();
    formData.append('product', image);

    await fetch('http://localhost:4000/upload', {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: formData,
    }).then((resp) => resp.json())
      .then((data) => { responseData = data });

    if (responseData && responseData.success) {
      product.image = responseData.image_url;
      console.log(product);
      await fetch('http://localhost:4000/addproduct', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(product),
      }).then((resp) => resp.json())
        .then((data) => {
          data.success ? alert("Product added successfully!") : alert("Failed to add product");
        });
    }
  };

  return (
    <div className='add-product'>
      <div className='add-product-card'>

        <h2>Add Product</h2>

        <div className="addproduct-itemfield">
          <label>Product Title</label>
          <input
            value={productDetails.name}
            onChange={changeHandler}
            type="text"
            name='name'
            placeholder='Type here'
            required
          />
        </div>

        <div className="addproduct-price">
          <div className="addproduct-itemfield">
            <label>Price</label>
            <input
              value={productDetails.old_price}
              onChange={changeHandler}
              type="number"
              name='old_price'
              placeholder='Type here'
              required
            />
          </div>

          <div className="addproduct-itemfield">
            <label>Offer Price</label>
            <input
              value={productDetails.new_price}
              onChange={changeHandler}
              type="number"
              name='new_price'
              placeholder='Type here'
              required
            />
          </div>
        </div>

        <div className="addproduct-itemfield">
          <label>Product Category</label>
          <select
            value={productDetails.category}
            onChange={changeHandler}
            name='category'
            className='add-product-selector'
          >
            <option value="women">Women</option>
            <option value="men">Men</option>
            <option value="kid">Kid</option>
          </select>
        </div>

        <div className="addproduct-itemfield">
          <label>Product Image</label>
          <label htmlFor="file-input">
            <img
              src={image ? URL.createObjectURL(image) : upload_area}
              className="addproduct-thumbnail-img"
              alt="Upload area"
            />
          </label>
          <span className="upload-hint">Click image to upload · JPG, PNG, WEBP</span>
          <input onChange={imageHandler} type="file" name='image' id='file-input' hidden />
        </div>

        <button onClick={Add_Product} className="addproduct-btn">
          Add Product
        </button>

      </div>
    </div>
  );
};

export default AddProduct;