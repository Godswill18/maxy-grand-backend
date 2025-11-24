import express from 'express';
import { getBranchAnalytics } from '../controllers/analyticsController.js';
import {
  adminAndSuperAdminMiddleware,
} from '../middleware/authMiddleware.js'; // Assuming you have this middleware
import { protectedRoute } from '../middleware/protectedRoutes.js';

const router = express.Router();

// @desc    Get all aggregated data for the superadmin dashboard
// @route   GET /api/dashboard/overview
// @access  Private (Superadmin)
router.get(
  '/branch-data',
  protectedRoute,
  adminAndSuperAdminMiddleware,
  getBranchAnalytics
);

export default router;