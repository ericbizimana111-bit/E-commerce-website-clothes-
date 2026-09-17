import React from 'react'
import './Offers.css'

const Offers = () => {
    return (
        <div className='offers'>
            <div className='offers-left'>
                <div className='offers-tag'>LIMITED TIME</div>
                <h1>Exclusive</h1>
                <h1>Offers For You</h1>
                <p>ONLY ON BEST SELLERS PRODUCTS</p>
                <button>Check Now</button>
            </div>

            <div className='offers-right'>
                <div className='offers-visual'>
                    <div className='offers-badge-large'>
                        <span className='offers-badge-percent'>50%</span>
                        <span className='offers-badge-off'>OFF</span>
                    </div>
                    <div className='offers-badge-small offers-badge-1'>HOT</div>
                    <div className='offers-badge-small offers-badge-2'>NEW</div>
                    <div className='offers-ring offers-ring-1' />
                    <div className='offers-ring offers-ring-2' />
                    <div className='offers-ring offers-ring-3' />
                </div>
            </div>
        </div>
    )
}
export default Offers
