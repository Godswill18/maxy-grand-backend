import express from 'express';
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
import { superAdminMiddleware } from '../middleware/authMiddleware.js';
import blogImages from '../config/blogMulter.js';
import { protectedRoute } from '../middleware/protectedRoutes.js';

const router = express.Router();

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
router.get('/admin',protectedRoute, superAdminMiddleware, getAllBlogsForAdmin);

/**
 * POST /api/blogs
 * Create new blog post (for superadmin)
 * @auth Requires superadmin token
 * @body {title, excerpt, content, category, author, readTime, isLive, image}
 * @returns Created blog post
 */
router.post('/', protectedRoute, superAdminMiddleware, blogImages.single('image'), createBlog);

/**
 * PUT /api/blogs/:id
 * Update blog post (for superadmin)
 * @auth Requires superadmin token
 * @params id - blog ID
 * @body {title, excerpt, content, category, author, readTime, isLive, image (optional)}
 * @returns Updated blog post
 */
router.put('/:id', protectedRoute,superAdminMiddleware, blogImages.single('image'), updateBlog);

/**
 * DELETE /api/blogs/:id
 * Delete blog post (for superadmin)
 * @auth Requires superadmin token
 * @params id - blog ID
 * @returns Success message
 */
router.delete('/:id', protectedRoute, superAdminMiddleware, deleteBlog);

/**
 * PUT /api/blogs/:id/toggle-live
 * Toggle blog live/draft status (for superadmin)
 * @auth Requires superadmin token
 * @params id - blog ID
 * @body {isLive}
 * @returns Updated blog post
 */
router.put('/:id/toggle-live', protectedRoute,superAdminMiddleware, toggleBlogLive);

/**
 * PUT /api/blogs/:id/set-live
 * Set blog to live or draft (for superadmin)
 * @auth Requires superadmin token
 * @params id - blog ID
 * @body {isLive}
 * @returns Updated blog post
 */
router.put('/:id/set-live', protectedRoute,superAdminMiddleware, setBlogLive);

/**
 * POST /api/blogs/:id/images
 * Upload additional image to blog (for superadmin)
 * @auth Requires superadmin token
 * @params id - blog ID
 * @body {image, alt (optional), caption (optional)}
 * @returns Uploaded image and all images
 */
router.post('/:id/images',protectedRoute, superAdminMiddleware, blogImages.single('image'), uploadBlogImage);

/**
 * DELETE /api/blogs/:id/images/:imageId
 * Delete image from blog (for superadmin)
 * @auth Requires superadmin token
 * @params id - blog ID, imageId - image ID
 * @returns Updated images array
 */
router.delete('/:id/images/:imageId',protectedRoute, superAdminMiddleware, deleteBlogImage);


export default router;