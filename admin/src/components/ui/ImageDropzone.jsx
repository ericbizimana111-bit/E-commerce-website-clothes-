import { useState } from 'react';
import { UploadCloud } from 'lucide-react';
import { ACCEPTED_IMAGE_TYPES } from '../../utils/imageFiles';
import './ImageDropzone.css';

/**
 * Drag-and-drop / click-to-browse image picker. It only collects files:
 * validation, previews and uploading stay with the caller.
 */
export default function ImageDropzone({
  id,
  inputLabel,
  multiple = false,
  disabled = false,
  progressText = null,
  idleText,
  hint = 'JPEG, PNG, WebP or GIF · up to 5 MB each',
  onFiles,
}) {
  const [dragging, setDragging] = useState(false);

  const handleChange = (event) => {
    onFiles(event.target.files);
    event.target.value = ''; // allow re-picking the same file after a fix
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    onFiles(event.dataTransfer?.files);
  };

  return (
    <div
      className={`dropzone ${dragging ? 'dropzone--active' : ''} ${disabled ? 'dropzone--disabled' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false);
      }}
      onDrop={handleDrop}
    >
      <input
        id={id}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        multiple={multiple}
        onChange={handleChange}
        disabled={disabled}
        aria-label={inputLabel}
        className="dropzone__input"
      />
      <label htmlFor={id} className="dropzone__label">
        <span className="dropzone__icon">
          <UploadCloud size={24} aria-hidden="true" />
        </span>
        <span className="dropzone__title">{progressText || (dragging ? 'Drop to upload' : idleText)}</span>
        <span className="dropzone__hint">{hint}</span>
      </label>
    </div>
  );
}
