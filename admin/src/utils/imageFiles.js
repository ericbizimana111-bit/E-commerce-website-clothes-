/** Image upload rules shared by the product and category forms. */
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // must match the backend limit (5 MB)

/** Client-side mirror of the backend image checks; returns a message or null. */
export function validateImageFile(file) {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return `"${file.name}" is not supported. Use JPEG, PNG, WebP, or GIF.`;
  }
  if (file.size === 0) return `"${file.name}" is empty.`;
  if (file.size > MAX_IMAGE_BYTES) return `"${file.name}" is larger than the 5 MB limit.`;
  return null;
}
