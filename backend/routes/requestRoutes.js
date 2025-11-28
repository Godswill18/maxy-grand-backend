import express from 'express';
import {
  createRequest,
  updateRequestStatus,
  getAllRequests,
  getHotelRequests,
  getRequestById,
  editRequest,
  getAllRequestsInHotel
} from '../controllers/requestController.js';
import { adminAndSuperAdminMiddleware, adminMiddleware, superAdminMiddleware } from '../middleware/authMiddleware.js'; // Example middleware
import { protectedRoute } from '../middleware/protectedRoutes.js';

const router = express.Router();

// @access  Admin
router.post("/create",protectedRoute, adminMiddleware, createRequest)    // Admin creates a request
router.get("/", protectedRoute, adminMiddleware, getHotelRequests); // Admin gets their hotel's requests
router.patch('/:id/edit-request', protectedRoute, adminMiddleware, editRequest); // Admin edits request status
router.get('/get-hotel-requests', protectedRoute, adminAndSuperAdminMiddleware, getAllRequestsInHotel);

// @access  Superadmin
router.get('/all', protectedRoute, superAdminMiddleware, getAllRequests); // Superadmin gets all requests
router.patch('/:id/status', protectedRoute, superAdminMiddleware, updateRequestStatus); // Superadmin approves/rejects

// @access  Admin or Superadmin
router.get('/:id', protectedRoute, getRequestById); // Get single request (logic inside controller handles auth)

export default router;