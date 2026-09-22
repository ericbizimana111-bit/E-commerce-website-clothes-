import React from 'react';
import useReveal from './useReveal';

/** Wrapper that fades/slides its children in when scrolled into view. */
const Reveal = ({ as: Tag = 'div', className = '', children, ...rest }) => {
  const ref = useReveal();
  return (
    <Tag ref={ref} className={`reveal ${className}`} {...rest}>
      {children}
    </Tag>
  );
};

export default Reveal;
