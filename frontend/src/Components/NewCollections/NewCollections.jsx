import React, { useEffect, useState, useRef } from 'react'
import './NewCollections.css'
import { Link } from 'react-router-dom'

const NewCollections = () => {
  const [allItems, setAllItems] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isHovered, setIsHovered] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    fetch('http://localhost:4000/newcollections')
      .then((response) => response.json())
      .then((data) => {
        if (Array.isArray(data)) setAllItems(data)
      })
      .catch((err) => console.error('Failed to fetch new collections:', err))
  }, [])

  // Auto-rotate every 3 seconds, pause on hover
  useEffect(() => {
    if (allItems.length === 0) return

    if (!isHovered) {
      timerRef.current = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % allItems.length)
      }, 3000)
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [allItems.length, isHovered])

  const getVisibleItems = () => {
    if (allItems.length === 0) return []
    const items = []
    for (let i = 0; i < 4; i++) {
      items.push(allItems[(currentIndex + i) % allItems.length])
    }
    return items
  }

  const goToSlide = (index) => {
    setCurrentIndex(index)
  }

  const goPrev = () => {
    setCurrentIndex((prev) => (prev - 1 + allItems.length) % allItems.length)
  }

  const goNext = () => {
    setCurrentIndex((prev) => (prev + 1) % allItems.length)
  }

  const visibleItems = getVisibleItems()

  return (
    <div className="new-collections-section">
      <h1>NEW COLLECTIONS</h1>
      <hr />
      <p className="new-collections-subtitle">
        Recently added &mdash; shop the latest arrivals
      </p>

      <div
        className="carousel-wrapper"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <button className="carousel-arrow carousel-arrow-left" onClick={goPrev} aria-label="Previous">
          &#8249;
        </button>

        <div className="carousel-track">
          {visibleItems.map((item, i) => (
            <Link
              to={'/product/' + item.id}
              className="carousel-card"
              key={item._id + '-' + i}
              onClick={() => window.scrollTo(0, 0)}
            >
              <div className="carousel-card-image">
                <img src={item.image} alt={item.name} />
                <span className="carousel-card-badge">NEW</span>
              </div>
              <div className="carousel-card-info">
                <p className="carousel-card-name">{item.name}</p>
                <div className="carousel-card-prices">
                  <span className="carousel-card-new-price">${item.new_price}</span>
                  <span className="carousel-card-old-price">${item.old_price}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <button className="carousel-arrow carousel-arrow-right" onClick={goNext} aria-label="Next">
          &#8250;
        </button>
      </div>

      {/* Dots */}
      <div className="carousel-dots">
        {allItems.map((_, i) => (
          <button
            key={i}
            className={'carousel-dot' + (i === currentIndex ? ' active' : '')}
            onClick={() => goToSlide(i)}
            aria-label={'Go to slide ' + (i + 1)}
          />
        ))}
      </div>
    </div>
  )
}

export default NewCollections
