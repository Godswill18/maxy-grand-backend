import express from 'express';
import {
  addGalleryImage,
  getGalleryImages,
  getGalleryCategories,
  deleteGalleryImage,
} from '../controllers/galleryController.js';
import { adminAndSuperAdminMiddleware, adminMiddleware } from '../middleware/authMiddleware.js';
import { protectedRoute } from '../middleware/protectedRoutes.js';
import galleryImages from '../config/galleryMulter.js';


const router = express.Router();

// --- Public Routes ---
router.get('/hotel/:hotelId', getGalleryImages);
router.get('/hotel/:hotelId/categories', getGalleryCategories);

// --- Admin Routes ---
router.post('/', protectedRoute, adminAndSuperAdminMiddleware, galleryImages.array("imageUrl", 2), addGalleryImage);
router.delete('/:id', protectedRoute, adminAndSuperAdminMiddleware, deleteGalleryImage);

export default router;