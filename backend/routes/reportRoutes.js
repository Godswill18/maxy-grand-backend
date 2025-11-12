import express from 'express';
import { getAnalyticsData } from '../controllers/reportController.js';
import {
  superAdminMiddleware,
} from '../middleware/authMiddleware.js'; // Assuming you have these
import { protectedRoute } from '../middleware/protectedRoutes.js';

const router = express.Router();

// @desc    Get aggregated analytics data
// @route   GET /api/reports/analytics
// @access  Private (Superadmin)
router.get(
  '/analytics',
  protectedRoute,
  superAdminMiddleware,
  getAnalyticsData
);

export default router;