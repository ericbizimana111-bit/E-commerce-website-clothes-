import React, { useEffect, useState } from 'react'
import './RelatedProducts.css'
import Item from '../item/item'

export const RelatedProducts = () => {
    const [relatedProducts, setRelatedProducts] = useState([])

    useEffect(() => {
        fetch('http://localhost:4000/allproducts')
            .then((res) => res.json())
            .then((data) => {
                if (Array.isArray(data)) {
                    // Show latest 4 products as related
                    setRelatedProducts(data.slice(-4).reverse())
                }
            })
            .catch((err) => console.error('Failed to fetch related products:', err))
    }, [])

    return (
        <div className='relatedproducts'>

            <h1>Related Products</h1>
            <hr />
            <div className='relatedproducts-item'>
                {relatedProducts.map((item, i) => {
                    return <Item
                        key={item._id || i}
                        id={item.id}
                        name={item.name}
                        image={item.image}
                        new_price={item.new_price}
                        old_price={item.old_price}
                    />
                })}
            </div>
        </div>
    )
}
export default RelatedProducts
