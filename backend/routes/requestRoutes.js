import express from 'express';
import {
  createRequest,
  updateRequestStatus,
  getAllRequests,
  getHotelRequests,
  getRequestById,
} from '../controllers/requestController.js';
import { adminMiddleware, superAdminMiddleware } from '../middleware/authMiddleware.js'; // Example middleware
import { protectedRoute } from '../middleware/protectedRoutes.js';

const router = express.Router();

// @access  Admin
router.route('/')
  .post(protectedRoute, adminMiddleware, createRequest)    // Admin creates a request
  .get(protectedRoute, adminMiddleware, getHotelRequests); // Admin gets their hotel's requests

// @access  Superadmin
router.get('/all', protectedRoute, superAdminMiddleware, getAllRequests); // Superadmin gets all requests
router.patch('/:id/status', protectedRoute, superAdminMiddleware, updateRequestStatus); // Superadmin approves/rejects

// @access  Admin or Superadmin
router.get('/:id', protectedRoute, getRequestById); // Get single request (logic inside controller handles auth)

export default router;