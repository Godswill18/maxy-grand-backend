import express from 'express';
import { 
  getDashboardStats, 
  getRecentOrders,
  getQuickStats,
  getOrdersByStatus
} from '../controllers/waiterDashController.js';
import { isStaffOrAdmin } from '../middleware/authMiddleware.js';
import { protectedRoute } from '../middleware/protectedRoutes.js';

const router = express.Router();

// All routes require authentication and staff/admin role
router.use(protectedRoute);
router.use(isStaffOrAdmin);

// GET /api/dashboard/stats - Get dashboard statistics
router.get('/stats', getDashboardStats);

// GET /api/dashboard/recent-orders - Get recent orders
router.get('/recent-orders', getRecentOrders);

// GET /api/dashboard/quick-stats - Get quick stats (for widgets)
router.get('/quick-stats', getQuickStats);

// GET /api/dashboard/orders-by-status - Get orders grouped by status
router.get('/orders-by-status', getOrdersByStatus);

export default router;