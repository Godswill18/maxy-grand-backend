import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getBlogPostsForGuests,
  getBlogBySlug,
  incrementBlogViews,
  getAllBlogsForAdmin,
  createBlog,
  updateBlog,
  deleteBlog,
  toggleBlogLive,
  setBlogLive,
  uploadBlogImage,
  deleteBlogImage,
} from '../controllers/blogController.js';
// import { verifySuperadmin } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Get __dirname equivalent in ES modules
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ======================== MULTER CONFIGURATION ========================

// Create uploads directory if it doesn't exist
import fs from 'fs';

const uploadDir = path.join(__dirname, '../public/uploads/blogs');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  },
});

// File filter for images only
const fileFilter = (req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.'));
  }
};

// Create multer upload middleware
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

// ======================== PUBLIC ROUTES (No Authentication) ========================

/**
 * GET /api/blogs/live
 * Get all published blog posts (for guests)
 * @returns Array of published blog posts
 */
router.get('/live', getBlogPostsForGuests);

/**
 * GET /api/blogs/slug/:slug
 * Get single blog by slug (for guests)
 * @params slug - blog slug
 * @returns Single blog post
 */
router.get('/slug/:slug', getBlogBySlug);

/**
 * PUT /api/blogs/:id/views
 * Increment blog view count (for guests)
 * @params id - blog ID
 * @returns Updated blog with incremented views
 */
router.put('/:id/views', incrementBlogViews);

// ======================== PROTECTED ROUTES (Superadmin Only) ========================

/**
 * GET /api/blogs/admin
 * Get all blogs including drafts (for superadmin)
 * @auth Requires superadmin token
 * @returns Array of all blog posts
 */
router.get('/admin', verifySuperadmin, getAllBlogsForAdmin);

/**
 * POST /api/blogs
 * Create new blog post (for superadmin)
 * @auth Requires superadmin token
 * @body {title, excerpt, content, category, author, readTime, isLive, image}
 * @returns Created blog post
 */
router.post('/', verifySuperadmin, upload.single('image'), createBlog);

/**
 * PUT /api/blogs/:id
 * Update blog post (for superadmin)
 * @auth Requires superadmin token
 * @params id - blog ID
 * @body {title, excerpt, content, category, author, readTime, isLive, image (optional)}
 * @returns Updated blog post
 */
router.put('/:id', verifySuperadmin, upload.single('image'), updateBlog);

/**
 * DELETE /api/blogs/:id
 * Delete blog post (for superadmin)
 * @auth Requires superadmin token
 * @params id - blog ID
 * @returns Success message
 */
router.delete('/:id', verifySuperadmin, deleteBlog);

/**
 * PUT /api/blogs/:id/toggle-live
 * Toggle blog live/draft status (for superadmin)
 * @auth Requires superadmin token
 * @params id - blog ID
 * @body {isLive}
 * @returns Updated blog post
 */
router.put('/:id/toggle-live', verifySuperadmin, toggleBlogLive);

/**
 * PUT /api/blogs/:id/set-live
 * Set blog to live or draft (for superadmin)
 * @auth Requires superadmin token
 * @params id - blog ID
 * @body {isLive}
 * @returns Updated blog post
 */
router.put('/:id/set-live', verifySuperadmin, setBlogLive);

/**
 * POST /api/blogs/:id/images
 * Upload additional image to blog (for superadmin)
 * @auth Requires superadmin token
 * @params id - blog ID
 * @body {image, alt (optional), caption (optional)}
 * @returns Uploaded image and all images
 */
router.post('/:id/images', verifySuperadmin, upload.single('image'), uploadBlogImage);

/**
 * DELETE /api/blogs/:id/images/:imageId
 * Delete image from blog (for superadmin)
 * @auth Requires superadmin token
 * @params id - blog ID, imageId - image ID
 * @returns Updated images array
 */
router.delete('/:id/images/:imageId', verifySuperadmin, deleteBlogImage);

// ======================== ERROR HANDLING FOR MULTER ========================

/**
 * Multer error handling middleware
 */
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File too large. Maximum size is 5MB.',
      });
    }
    return res.status(400).json({
      success: false,
      error: `File upload error: ${error.message}`,
    });
  }
  
  if (error) {
    return res.status(400).json({
      success: false,
      error: error.message,
    });
  }
  
  next();
});

export default router;