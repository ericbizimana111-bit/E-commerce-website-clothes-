import React, { useEffect, useState } from 'react'
import './Popular.css'
import Item from '../item/item'

const Popular = () => {
  const [popularProducts, setPopularProducts] = useState([])

  useEffect(() => {
    fetch('http://localhost:4000/popularinwomen')
      .then((response) => response.json())
      .then((data) => {
        if (Array.isArray(data)) setPopularProducts(data)
      })
      .catch((err) => console.error('Failed to fetch popular products:', err))
  }, [])

  return (
    <div className="popular">
      <h1>POPULAR IN WOMEN</h1>
      <hr />
      <p className="popular-subtitle">Top picks loved by our customers</p>
      <div className="popular-item">
        {popularProducts.map((item, i) => (
          <Item
            key={item._id || i}
            id={item.id}
            name={item.name}
            image={item.image}
            new_price={item.new_price}
            old_price={item.old_price}
          />
        ))}
      </div>
    </div>
  )
}

export default Popular
