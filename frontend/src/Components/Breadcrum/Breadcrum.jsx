import React from 'react'
import './Breadcrum.css'
import { Link } from 'react-router-dom';
import arrow_icon from '../Assets/arrow_icon.png';

const Breadcrum = (props) => {
    const { product } = props;
    return (
        <div className='breadcrum'>
            <Link to="/" onClick={() => window.scrollTo(0, 0)}>HOME</Link>
            <img src={arrow_icon} style={{width:"20px", height: "20px"}} alt="" />
            <Link to="/" onClick={() => window.scrollTo(0, 0)}>SHOP</Link>
            <img src={arrow_icon} style={{width:"20px", height: "20px"}} alt="" />
            {product.category}
            <img src={arrow_icon} style={{width:"20px", height: "20px"}} alt="" />
            {product.name}
        </div>
    )
}

export default Breadcrum;