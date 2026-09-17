import React, { useContext, useState } from 'react';
import './ProductDisplay.css';
import StarRating from '../StarRating/StarRating';
import { ShopContext } from '../../Context/ShopContext';

export const ProductDisplay = ({ product }) => {

    const { addToCart } = useContext(ShopContext);
    const [selectedSize, setSelectedSize] = useState(null);

    return (
        <div className="productdisplay">

            {/* LEFT SIDE */}
            <div className="productdisplay-left">

                <div className="productdisplay-img-list">
                    <img src={product.image} alt="" />
                    <img src={product.image} alt="" />
                    <img src={product.image} alt="" />
                    <img src={product.image} alt="" />
                </div>

                <div className="productdisplay-img">
                    <img
                        className="productdisplay-main-img"
                        src={product.image}
                        alt={product.name}
                    />
                </div>
            </div>

            {/* RIGHT SIDE */}
            <div className="productdisplay-right">

                <h1>{product.name}</h1>

                <div className="productdisplay-right-stars">
                    <StarRating />
                </div>

                <div className="productdisplay-right-prices">
                    <div className="productdisplay-right-price-old">
                        ${product.old_price}
                    </div>

                    <div className="productdisplay-right-price-new">
                        ${product.new_price}
                    </div>
                </div>

                <div className="productdisplay-right-description">
                    A lightweight, usually knitted, pullover shirt, close-fitting and stylish for modern wear.
                </div>

                <div className="productdisplay-right-size">
                    <h3 className='select-size'>Select Size</h3>
                    <div className="productdisplay-right-sizes">
                        {["S", "M", "L", "XL", "XXL"].map((size) => (
                            <div
                                key={size}
                                className={`size-box ${selectedSize === size ? "active" : ""}`}
                                onClick={() => setSelectedSize(size)}
                            >
                                {size}
                            </div>
                        ))}
                    </div>
                </div>

                <button
                    className="add-to-cart-btn"
                    onClick={() => addToCart(product.id)}
                >
                    ADD TO CART
                </button>

                <p className="productdisplay-right-category">
                    <span>Category :</span> {product.category}
                </p>

                <p className="productdisplay-right-category">
                    <span>Tags :</span> Modern, Latest
                </p>

            </div>
        </div>
    );
};