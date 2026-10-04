import { ICON_KEYS, iconFor } from '../../utils/categoryIcons';
import './Modal.css';

/** Grid of storefront icons; the chosen key is stored on the category/service. */
export default function IconPicker({ value, onChange, disabled }) {
  return (
    <div className="icon-picker" role="group" aria-label="Icon">
      {ICON_KEYS.map((key) => {
        const Icon = iconFor(key);
        return (
          <button
            key={key}
            type="button"
            title={key}
            aria-label={key}
            aria-pressed={value === key}
            onClick={() => onChange(value === key ? '' : key)}
            disabled={disabled}
          >
            <Icon size={18} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
