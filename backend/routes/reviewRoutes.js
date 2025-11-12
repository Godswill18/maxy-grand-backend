import express from 'express';
import { getAllReviews } from '../controllers/reviewController.js';
import {
  superAdminMiddleware,
} from '../middleware/authMiddleware.js'; // Assuming you have this middleware
import { protectedRoute } from '../middleware/protectedRoutes.js';

const router = express.Router();

// @desc    Get all reviews, with optional hotel filtering
// @route   GET /api/reviews
// @access  Private (Superadmin)
router.get('/', protectedRoute, superAdminMiddleware, getAllReviews);

export default router;