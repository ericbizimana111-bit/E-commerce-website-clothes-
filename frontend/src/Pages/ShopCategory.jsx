import React, { useContext } from 'react'
import './CSS/ShopCategory.css'
import { ShopContext } from '../Context/ShopContext'
import dropdown_icon from '../Components/Assets/dropdown_icon.png'
import Item from '../Components/item/item'

const bannerConfig = {
    men: {
        title: 'Men\'s Collection',
        subtitle: 'Bold styles for the modern gentleman',
        gradient: 'linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #334155 100%)',
        accent: '#16A34A',
        shape1: 'rgba(22, 163, 74, 0.15)',
        shape2: 'rgba(245, 158, 11, 0.1)',
        icon: 'M',
    },
    women: {
        title: 'Women\'s Collection',
        subtitle: 'Elegance redefined for every occasion',
        gradient: 'linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #16A34A 100%)',
        accent: '#F59E0B',
        shape1: 'rgba(245, 158, 11, 0.15)',
        shape2: 'rgba(22, 163, 74, 0.1)',
        icon: 'W',
    },
    kid: {
        title: 'Kids\' Collection',
        subtitle: 'Fun, colorful & comfortable for little ones',
        gradient: 'linear-gradient(135deg, #0F172A 0%, #1E293B 40%, #F59E0B 100%)',
        accent: '#16A34A',
        shape1: 'rgba(22, 163, 74, 0.12)',
        shape2: 'rgba(245, 158, 11, 0.15)',
        icon: 'K',
    },
};

const CategoryBanner = ({ category }) => {
    const config = bannerConfig[category] || bannerConfig.men;
    return (
        <div className="cb" style={{ background: config.gradient }}>
            <div className="cb-shapes">
                <div className="cb-shape cb-shape-1" style={{ background: `radial-gradient(circle, ${config.shape1}, transparent 70%)` }} />
                <div className="cb-shape cb-shape-2" style={{ background: `radial-gradient(circle, ${config.shape2}, transparent 70%)` }} />
                <div className="cb-shape cb-shape-3" style={{ background: `radial-gradient(circle, rgba(255,255,255,0.06), transparent 70%)` }} />
                <div className="cb-grid" />
            </div>
            <div className="cb-content">
                <div className="cb-icon" style={{ borderColor: config.accent }}>
                    <span style={{ color: config.accent }}>{config.icon}</span>
                </div>
                <h1 className="cb-title">{config.title}</h1>
                <p className="cb-subtitle">{config.subtitle}</p>
                <div className="cb-tags">
                    <span className="cb-tag">New Arrivals</span>
                    <span className="cb-tag">Trending</span>
                    <span className="cb-tag">Best Sellers</span>
                </div>
            </div>
            <div className="cb-scroll-hint">
                <span>Explore below</span>
                <div className="cb-scroll-arrow">↓</div>
            </div>
        </div>
    );
};

const ShopCategory = (props) => {
    const { all_product } = useContext(ShopContext);
    const filtered = all_product.filter((item) => props.category === item.category);
    return (
        <div className='shop-category'>
            <CategoryBanner category={props.category} />
            <div className="shopcategory-indexSort">
                <p>
                    <span>Showing {filtered.length}</span> products
                </p>
                
                <div className="shopcategory-sort" role="button" tabIndex="0" aria-label="Sort products">
                    <span>Sort by</span>
                    <img src={dropdown_icon} className="dropdown-icon" alt="" aria-hidden="true" />
                </div>
            </div>

            <div className="shopcategory-products">
                {filtered.map((item, i) => {
                    return <Item
                        key={item._id || i}
                        id={item.id}
                        name={item.name}
                        image={item.image}
                        new_price={item.new_price}
                        old_price={item.old_price} />
                })}
            </div>

            <button className="shopcategory-loadmore" type="button" aria-label="Explore more products" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                Explore now
            </button>
        </div >
    )
}

export default ShopCategory

