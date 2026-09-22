import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Tab / segmented control whose active indicator glides between options.
 * Purely presentational: the parent owns `value` and reacts to `onChange`.
 * Variants: default (pill), "line" (underline) and full width via `full`.
 */
const SlidingTabs = ({ options, value, onChange, ariaLabel, variant = 'pill', full = false, className = '' }) => {
  const listRef = useRef(null);
  // Animate the indicator only after its first placement (no grow-in on load).
  const [ready, setReady] = useState(false);

  const measure = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const active = list.querySelector('[data-active="true"]');
    if (!active) return;
    list.style.setProperty('--tab-x', `${active.offsetLeft}px`);
    list.style.setProperty('--tab-w', `${active.offsetWidth}px`);
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [measure, value, options]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    window.addEventListener('resize', measure);
    // Fonts finishing loading can change tab widths.
    if (document.fonts?.ready) document.fonts.ready.then(measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  const handleKeyDown = (event, index) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const next = options[(index + step + options.length) % options.length];
    onChange(next.value);
    requestAnimationFrame(() => listRef.current?.querySelector('[aria-selected="true"]')?.focus());
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      className={`tabs ${variant === 'line' ? 'tabs--line' : ''} ${full ? 'tabs--full' : ''} ${ready ? 'tabs--ready' : ''} ${className}`}
    >
      <span className="tabs__indicator" aria-hidden="true" />
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            id={option.id}
            aria-selected={active}
            aria-controls={option.controls}
            tabIndex={active ? 0 : -1}
            data-active={active}
            className={`tabs__tab ${active ? 'tabs__tab--active' : ''}`}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => handleKeyDown(e, index)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
};

export default SlidingTabs;
