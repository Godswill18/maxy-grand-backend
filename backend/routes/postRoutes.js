import express from 'express';
import {
  createPost,
  getPublicPosts,
//   getPublicPostBySlug,
  getAdminPosts,
  updatePost,
  deletePost,
} from '../controllers/postController.js';
import { adminAndSuperAdminMiddleware } from '../middleware/authMiddleware.js';
import { protectedRoute } from '../middleware/protectedRoutes.js';
import postImages from '../config/postMulter.js';

const router = express.Router();

// --- Public Routes ---
router.get('/public', getPublicPosts); // e.g., /api/posts/public?type=blog
// router.get('/public/:slug', getPublicPostBySlug);

// --- Admin Routes ---
router.post('/', protectedRoute, adminAndSuperAdminMiddleware, postImages.array("featuredImage", 10), createPost);
router.get('/admin', protectedRoute, adminAndSuperAdminMiddleware, getAdminPosts);

router.route('/:id')
  .patch(protectedRoute, adminAndSuperAdminMiddleware, postImages.array("featuredImage", 10), updatePost)
  .delete(protectedRoute, deletePost);

export default router;