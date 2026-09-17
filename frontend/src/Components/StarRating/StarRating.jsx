// StarRating.jsx
import React from "react";
import "./StarRating.css";

const StarRating = ({ rating = 4, maxRating = 5 }) => {
  return (
    <div className="star-rating">
      {[...Array(maxRating)].map((_, i) => (
        <span key={i} className={i < rating ? "filled" : "empty"}>
          ★
        </span>
      ))}
    </div>
  );
};

export default StarRating;