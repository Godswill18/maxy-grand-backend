import express from 'express';
import {
  createCleaningRequest,
  getMyPendingTasks,
  completeCleaningTask,
  getHotelCleaningRequests,
  getCleaningRooms,
  getHotelCleaners,
  getCleaningHistory
} from '../controllers/cleaningController.js';
import {
  adminMiddleware,
  cleanerMiddleware,
  isStaffOrAdmin,
  adminAndSuperAdminMiddleware,
  superAdminMiddleware
} from '../middleware/authMiddleware.js';
import { protectedRoute } from '../middleware/protectedRoutes.js';

const router = express.Router();

// --- Cleaner Routes (for staff) ---
router.get('/my-tasks', protectedRoute, cleanerMiddleware, getMyPendingTasks);
router.patch('/:id/complete', protectedRoute, cleanerMiddleware, completeCleaningTask);

// --- Admin Routes (for management) ---
router.post('/', protectedRoute, adminAndSuperAdminMiddleware, createCleaningRequest);
router.get('/hotel', protectedRoute, isStaffOrAdmin, getHotelCleaningRequests);
router.get('/rooms/cleaning', protectedRoute, isStaffOrAdmin, getCleaningRooms);
router.get('/cleaners', protectedRoute, isStaffOrAdmin, getHotelCleaners);
router.get('/get-cleaning-history', protectedRoute, superAdminMiddleware, getCleaningHistory);

export default router;