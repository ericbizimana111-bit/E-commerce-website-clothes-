const multer = require('multer');
const { AppError } = require('../middleware/errorHandler');
const { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } = require('../services/image.service');

/**
 * Multer configuration for product image uploads.
 *
 * - memoryStorage: the buffer is validated (magic bytes) BEFORE anything is
 *   written to disk, so invalid payloads never touch the filesystem.
 * - field name: "image"
 * - size limit: 5 MB (enforced by multer and re-verified in image.service).
 * - MIME allowlist: only real image types; extensions are derived server-side
 *   from the validated type (user filenames are never used).
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_TYPES[file.mimetype]) {
      cb(
        new AppError(
          `Unsupported image type '${file.mimetype || 'unknown'}'. Allowed: JPEG, PNG, WebP, GIF`,
          400
        )
      );
      return;
    }
    cb(null, true);
  },
});

/**
 * Wrap the multer middleware so MulterErrors (e.g. LIMIT_FILE_SIZE) become
 * clean 400 AppErrors handled by the central error handler instead of
 * unhandled middleware errors.
 */
function uploadProductImageMiddleware(req, res, next) {
  upload.single('image')(req, res, (err) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        next(new AppError('Image exceeds the 5 MB size limit', 400));
      } else if (err.code === 'LIMIT_FILE_COUNT') {
        next(new AppError('Only one image file can be uploaded per request', 400));
      } else {
        next(new AppError(`Image upload failed: ${err.code}`, 400));
      }
      return;
    }
    next(err); // AppError from fileFilter or unexpected error
  });
}

module.exports = { uploadProductImageMiddleware };
