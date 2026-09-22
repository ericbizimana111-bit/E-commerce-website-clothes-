import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

/**
 * Search box that searches as you type.
 *
 * `value` is the committed search term (from the URL or page state) and
 * `onSearch(term)` is called ~`delay` ms after typing stops, or immediately on
 * Enter and on clear. If `value` changes from outside (e.g. "Clear filters")
 * the box follows it.
 */
export default function SearchInput({
  value = '',
  onSearch,
  placeholder = 'Search…',
  label = 'Search',
  delay = 350,
}) {
  const [text, setText] = useState(value);
  const [prevValue, setPrevValue] = useState(value);
  const onSearchRef = useRef(onSearch);

  useEffect(() => {
    onSearchRef.current = onSearch;
  }, [onSearch]);

  // Follow committed-value changes made elsewhere (adjust state during render).
  if (value !== prevValue) {
    setPrevValue(value);
    if (value !== text.trim()) setText(value);
  }

  // Debounced commit while typing.
  useEffect(() => {
    const term = text.trim();
    if (term === value) return undefined;
    const timer = setTimeout(() => onSearchRef.current(term), delay);
    return () => clearTimeout(timer);
  }, [text, value, delay]);

  const commitNow = (next) => {
    const term = next.trim();
    if (term !== value) onSearchRef.current(term);
  };

  const clear = () => {
    setText('');
    commitNow('');
  };

  return (
    <div className="search-input" role="search">
      <Search size={16} aria-hidden="true" className="search-input__icon" />
      <input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commitNow(text);
          } else if (e.key === 'Escape' && text) {
            e.preventDefault();
            clear();
          }
        }}
        placeholder={placeholder}
        aria-label={label}
        autoComplete="off"
        spellCheck="false"
      />
      {text && (
        <button type="button" className="search-input__clear" onClick={clear} aria-label="Clear search">
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
