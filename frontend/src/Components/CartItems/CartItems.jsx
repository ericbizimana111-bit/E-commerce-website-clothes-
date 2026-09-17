import React, { useContext } from 'react';
import "./CartItems.css";
import { ShopContext } from "../../Context/ShopContext";
import remove_icon from '../Assets/remove_icon.svg';

const CartItems = () => {
    const { all_product, cartItems, addToCart, removeFromCart } = useContext(ShopContext);

    // Calculate subtotal
    const subtotal = Object.keys(cartItems).reduce((sum, id) => {
        const item = all_product.find(p => p.id === Number(id));
        if (item && cartItems[id] > 0) {
            return sum + item.new_price * cartItems[id];
        }
        return sum;
    }, 0);

    const shippingFee = 0; // Can change if you want dynamic shipping
    const total = subtotal + shippingFee;

    return (
        <div className="cartitems">
            {/* Table header */}
            <div className="cartitems-format-main">
                <p>Products</p>
                <p>Title</p>
                <p>Price</p>
                <p>Quantity</p>
                <p>Total</p>
                <p style={{ marginLeft: "25px" }}>Remove</p>
            </div>
            <hr />

            {/* Cart items */}
            {all_product.map((e) => {
                if (cartItems[e.id] > 0) {
                    return (
                        <div key={e.id}>
                            <div className="cartitems-format cartitems-format-main">
                                <img className="cartitem-image" src={e.image} alt={e.name} />
                                <p>{e.name}</p>
                                <p style={{ color: "green" }}>${e.new_price}</p>
                                <div className="cartitems-quantity-group">
                                    <button className="cartitems-qty-btn" onClick={() => removeFromCart(e.id)}>-</button>
                                    <span className="cartitems-quantity">{cartItems[e.id]}</span>
                                    <button className="cartitems-qty-btn" onClick={() => addToCart(e.id)}>+</button>
                                </div>
                                <p style={{ color: "red" }}>${e.new_price * cartItems[e.id]}</p>
                                <img
                                    className='cartitems-remove-icon'
                                    src={remove_icon}
                                    onClick={() => removeFromCart(e.id)}
                                    alt="Remove item"
                                />
                            </div>
                            <hr />
                        </div>
                    )
                }
                return null;
            })}

            {/* Totals and promocode */}
            <div className="cartitems-down">
                <div className="cartitems-total">
                    <div className='middle'>
                        <h1>Cart Totals</h1>

                        <div className="cartitems-total-item">
                            <p>Subtotal</p>
                            <p>${subtotal}</p>
                        </div>

                        <hr />

                        <div className="cartitems-total-item">
                            <p>Shipping Fee</p>
                            <p>{shippingFee === 0 ? "Free" : `$${shippingFee}`}</p>
                        </div>

                        <hr />

                        <div className="cartitems-total-item">
                            <h3>Total</h3>
                            <h3>${total}</h3>
                        </div>

                        <button className='cartitems-total-button'>PROCEED TO CHECKOUT</button>
                    </div>

                    {/* Promocode */}
                    <div className="cartitems-promocode">
                        <p>If you have a promocode, enter it here</p>
                        <div className="cartitems-promobox">
                            <input type="text" placeholder='Promo code' />
                            <button>Submit</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CartItems;