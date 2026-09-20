const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const prisma = require('../config/db');
const { AppError } = require('../middleware/errorHandler');

/**
 * Product image file storage service.
 *
 * Files live in backend/uploads/images and are served publicly (no auth) via
 * GET /images/<name> (express.static in app.js). The database stores only the
 * reference ("/images/<name>" or an absolute http(s) URL), so images survive
 * application restarts and are independent of any session.
 *
 * Security model:
 *  - Filename is ALWAYS server-generated (crypto.randomUUID) — user-supplied
 *    filenames are never used, so path traversal via filename is impossible.
 *  - Extension is derived from the validated MIME type allowlist, not from the
 *    user-supplied name.
 *  - Actual file content is verified against magic bytes (signature), so a
 *    .png-named executable or text payload is rejected even if it fakes a
 *    multipart content type.
 *  - Deletion only removes files that are provably unreferenced by any other
 *    ProductImage row, Product.imageUrl, or Category.imageUrl.
 */

const UPLOADS_DIR = path.resolve(__dirname, '../../uploads/images');

// MIME type -> canonical extension allowlist (images only, nothing executable)
const ALLOWED_IMAGE_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

/**
 * Detect the actual image type from magic bytes (file signature).
 * Returns the canonical extension (e.g. '.png') or null if unrecognized.
 */
function detectImageSignature(buffer) {
  if (!buffer || buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return '.jpg';
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return '.png';
  }
  // GIF: 'GIF87a' | 'GIF89a'
  const gifHeader = buffer.slice(0, 6).toString('ascii');
  if (gifHeader === 'GIF87a' || gifHeader === 'GIF89a') {
    return '.gif';
  }
  // WEBP: 'RIFF' .... 'WEBP'
  if (
    buffer.slice(0, 4).toString('ascii') === 'RIFF' &&
    buffer.slice(8, 12).toString('ascii') === 'WEBP'
  ) {
    return '.webp';
  }
  return null;
}

/**
 * Validate an uploaded image buffer against the allowlist and its signature.
 * Returns the canonical extension for the safe generated filename.
 */
function validateImageBuffer(buffer, declaredMimetype) {
  if (!buffer || buffer.length === 0) {
    throw new AppError('Uploaded file is empty', 400);
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new AppError('Image exceeds the 5 MB size limit', 400);
  }
  const allowedExt = ALLOWED_IMAGE_TYPES[declaredMimetype];
  if (!allowedExt) {
    throw new AppError(
      `Unsupported image type '${declaredMimetype || 'unknown'}'. Allowed: JPEG, PNG, WebP, GIF`,
      400
    );
  }
  const signatureExt = detectImageSignature(buffer);
  if (!signatureExt) {
    throw new AppError('File content is not a valid JPEG, PNG, WebP, or GIF image', 400);
  }
  // MIME <-> signature agreement (jpg/jpeg map to the same signature)
  const compatible =
    signatureExt === allowedExt ||
    (signatureExt === '.jpg' && (declaredMimetype === 'image/jpeg' || declaredMimetype === 'image/pjpeg'));
  if (!compatible) {
    throw new AppError('Image content does not match its declared file type', 400);
  }
  return allowedExt;
}

/**
 * Persist a validated image buffer under a server-generated safe filename.
 * Returns the public URL path ("/images/<name>") stored in the database.
 */
function saveImageFile(buffer, declaredMimetype) {
  const ext = validateImageBuffer(buffer, declaredMimetype);
  ensureUploadsDir();
  const filename = `${crypto.randomUUID()}${ext}`;
  const absolutePath = path.join(UPLOADS_DIR, filename);
  fs.writeFileSync(absolutePath, buffer);
  return `/images/${filename}`;
}

/**
 * True when the URL is a local "/images/<safe-name>" reference (not external).
 */
function isLocalImageUrl(imageUrl) {
  return (
    typeof imageUrl === 'string' &&
    imageUrl.startsWith('/images/') &&
    !imageUrl.includes('..') &&
    !imageUrl.includes('\\') &&
    !path.basename(imageUrl).includes('/')
  );
}

/**
 * Collect every image reference currently used in the database, so a file is
 * only removed from disk when it is provably orphaned. Cheap at catalog scale
 * and safe: when in doubt the file is kept (DB row deletion is the source of
 * truth for visibility; leftover files are harmless).
 */
async function findImageReferences(imageUrl) {
  const [imageRows, productRefs, categoryRefs] = await Promise.all([
    prisma.productImage.count({ where: { imageUrl } }),
    prisma.product.count({ where: { imageUrl } }),
    prisma.category.count({ where: { imageUrl } }),
  ]);
  return imageRows + productRefs + categoryRefs;
}

/**
 * Delete the local file behind imageUrl if (and only if) it is a local
 * /images/ reference that no longer appears anywhere in the database.
 * Never throws: a failed cleanup must not fail the API response because the
 * database state is already authoritative.
 */
async function cleanupOrphanedImageFile(imageUrl) {
  try {
    if (!isLocalImageUrl(imageUrl)) return false;
    const references = await findImageReferences(imageUrl);
    if (references > 0) return false; // still referenced elsewhere — keep the file

    const filename = path.basename(imageUrl);
    const absolutePath = path.join(UPLOADS_DIR, filename);
    // Defense in depth: the resolved path must stay inside the uploads dir
    if (path.resolve(absolutePath).startsWith(UPLOADS_DIR + path.sep) && fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
      return true;
    }
    return false;
  } catch (error) {
    // Orphan cleanup is best-effort; never break the caller.
    return false;
  }
}

module.exports = {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  UPLOADS_DIR,
  detectImageSignature,
  validateImageBuffer,
  saveImageFile,
  isLocalImageUrl,
  findImageReferences,
  cleanupOrphanedImageFile,
};
