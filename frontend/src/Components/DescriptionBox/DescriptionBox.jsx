import React, { useState } from 'react'
import "./DescriptionBox.css"

export const DescriptionBox = () => {
    const [activeTab, setActiveTab] = useState('description');

    return (
        <div className='descriptionbox'>

            <div className='descriptionbox-navigator'>
                <div 
                    className={`descriptionbox-nav-box ${activeTab === 'description' ? '' : 'fade'}`}
                    onClick={() => setActiveTab('description')}
                    role="button"
                    tabIndex={0}
                >
                    Description
                </div>
                <div 
                    className={`descriptionbox-nav-box ${activeTab === 'reviews' ? '' : 'fade'}`}
                    onClick={() => setActiveTab('reviews')}
                    role="button"
                    tabIndex={0}
                >
                    Reviews (122)
                </div>
            </div>

            <div className='descriptionbox-description'>
                {activeTab === 'description' ? (
                    <>
                        <p>This premium product is crafted with the finest materials to ensure comfort, durability, and style. Perfect for everyday wear, it combines modern design with classic elegance.</p>
                        <p>Each piece goes through rigorous quality control to meet our high standards. Available in multiple sizes and colors to suit your personal style.</p>
                        <p>We believe in sustainable fashion — responsibly sourced materials and eco-friendly packaging for a better tomorrow.</p>
                    </>
                ) : (
                    <>
                        <p><strong>Amazing quality!</strong> — The fabric feels premium and the fit is perfect. Highly recommend!</p>
                        <p><strong>Fast shipping</strong> — Received my order in 2 days. Packaging was also excellent.</p>
                        <p><strong>Great value</strong> — Looks exactly like the photos. Very happy with my purchase.</p>
                    </>
                )}
            </div>

        </div>
    )
}
