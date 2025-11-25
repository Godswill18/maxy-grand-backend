// Backend: Updated orderRoutes.js
import express from 'express';
import { protectedRoute } from '../middleware/protectedRoutes.js';
import { adminAndSuperAdminMiddleware, isStaffOrAdmin, superAdminMiddleware } from '../middleware/authMiddleware.js';
import {
  createOrder,
  getOrderStatus,
  getAllOrders,
  updateOrderStatus,
  getMyOrders,
  trackOrdersByIds,
  getAdminOrders, // New
  getOrderSummary, // New
} from '../controllers/orderController.js';

const router = express.Router();

// --- Public / Guest Routes ---
// POST /api/orders/            -> Place a new order (anonymous or logged-in)
router.post('/', createOrder); // protectedRoute is optional here
// GET /api/orders/my-orders    -> Get order history for logged-in user
router.get('/my-orders', protectedRoute, getMyOrders);
// GET /api/orders/:id          -> Get status of a single order
router.get('/:id/get-status', protectedRoute, getOrderStatus);
// POST /api/orders/track
router.post('/track', trackOrdersByIds);

// --- Staff/Admin Routes (Protected) ---
// GET /api/orders/all          -> Get all orders for kitchen/bar
router.get('/all-orders', protectedRoute, isStaffOrAdmin, getAllOrders);
// PATCH /api/orders/:id/status -> Update an order's status
router.patch('/:id/status', protectedRoute, isStaffOrAdmin, updateOrderStatus);

// --- Admin/SuperAdmin Routes ---
// GET /api/orders/admin        -> Get all orders for admin/superadmin with filters/pagination
router.get('/admin', protectedRoute, adminAndSuperAdminMiddleware, getAdminOrders);
// GET /api/orders/summary      -> Get order summaries (daily, weekly, monthly)
router.get('/summary', protectedRoute, isStaffOrAdmin, getOrderSummary);

export default router;