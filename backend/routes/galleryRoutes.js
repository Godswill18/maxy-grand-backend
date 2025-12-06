import express from 'express';
import {
  addGalleryImage,
  getGalleryImages,
  getAllGalleryImagesAdmin,
  getGalleryCategories,
  getGalleryCategoriesAdmin,
  updateGalleryImage,
  toggleImageLive,
  deleteGalleryImage,
} from '../controllers/galleryController.js';
import { superAdminMiddleware } from '../middleware/authMiddleware.js';
import { protectedRoute } from '../middleware/protectedRoutes.js';
import galleryImages from '../config/galleryMulter.js';

const router = express.Router();

// --- Public Routes ---
// Anyone can view live gallery images
router.get('/', getGalleryImages);
router.get('/categories', getGalleryCategories);

// --- SuperAdmin Only Routes ---
// Get all images (including drafts)
router.get(
  '/admin/all',
  protectedRoute,
  superAdminMiddleware,
  getAllGalleryImagesAdmin
);

// Get all categories (admin)
router.get(
  '/admin/categories',
  protectedRoute,
  superAdminMiddleware,
  getGalleryCategoriesAdmin
);

// Upload new images
router.post(
  '/',
  protectedRoute,
  superAdminMiddleware,
  galleryImages.array("images", 2),
  addGalleryImage
);

// Update image (title, category, or toggle isLive)
router.patch(
  '/:id',
  protectedRoute,
  superAdminMiddleware,
  updateGalleryImage
);

// Toggle image live/draft status
router.patch(
  '/:id/toggle-live',
  protectedRoute,
  superAdminMiddleware,
  toggleImageLive
);

// Delete image
router.delete(
  '/:id',
  protectedRoute,
  superAdminMiddleware,
  deleteGalleryImage
);

export default router;