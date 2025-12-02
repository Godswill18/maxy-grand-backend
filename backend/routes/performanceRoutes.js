import express from 'express';
import { 
  getPerformanceStats, 
  getDailyTips, 
  getMonthlyPerformance,
  getPerformanceHighlights 
} from '../controllers/performanceController.js';
import { isStaffOrAdmin } from '../middleware/authMiddleware.js';
import { protectedRoute } from '../middleware/protectedRoutes.js';

const router = express.Router();

// All routes require authentication and staff/admin role
router.use(protectedRoute);
router.use(isStaffOrAdmin);

// GET /api/performance/stats - Get overall performance statistics
router.get('/stats', getPerformanceStats);

// GET /api/performance/daily-tips - Get daily tips for week or month
router.get('/daily-tips', getDailyTips);

// GET /api/performance/monthly - Get monthly performance data
router.get('/monthly', getMonthlyPerformance);

// GET /api/performance/highlights - Get performance highlights
router.get('/highlights', getPerformanceHighlights);

export default router;