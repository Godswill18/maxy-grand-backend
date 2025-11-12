import express from 'express';
import { getDashboardOverview } from '../controllers/dashboardController.js';
import {
  superAdminMiddleware,
} from '../middleware/authMiddleware.js'; // Assuming you have this middleware
import { protectedRoute } from '../middleware/protectedRoutes.js';

const router = express.Router();

// @desc    Get all aggregated data for the superadmin dashboard
// @route   GET /api/dashboard/overview
// @access  Private (Superadmin)
router.get(
  '/overview',
  protectedRoute,
  superAdminMiddleware,
  getDashboardOverview
);

export default router;