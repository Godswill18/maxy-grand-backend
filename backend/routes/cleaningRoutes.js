import express from 'express';
import {
  createCleaningRequest,
  createGuestCleaningRequest, // NEW
  getMyTasks,
  startCleaningTask,
  completeCleaningTask,
  getHotelCleaningRequests,
  getCleaningRooms,
  getHotelCleaners,
  getCleaningHistory,
  getUnassignedRequests, // NEW
  acceptCleaningRequest, // NEW
} from '../controllers/cleaningController.js';
import {
  adminMiddleware,
  cleanerMiddleware,
  isStaffOrAdmin,
  adminAndSuperAdminMiddleware,
  superAdminMiddleware,
  // guestMiddleware, // You'll need to create this middleware
} from '../middleware/authMiddleware.js';
import { protectedRoute } from '../middleware/protectedRoutes.js';

const router = express.Router();

// --- Guest Routes (for guests to request cleaning) ---
router.post('/guest-request', protectedRoute, createGuestCleaningRequest);

// --- Cleaner Routes (for staff) ---
router.get('/my-tasks', protectedRoute, cleanerMiddleware, getMyTasks);
router.get('/unassigned', protectedRoute, cleanerMiddleware, getUnassignedRequests); // NEW
router.patch('/:id/accept', protectedRoute, cleanerMiddleware, acceptCleaningRequest); // NEW
router.patch('/:id/start', protectedRoute, cleanerMiddleware, startCleaningTask);
router.patch('/:id/complete', protectedRoute, cleanerMiddleware, completeCleaningTask);

// --- Admin Routes (for management) ---
router.post('/', protectedRoute, adminAndSuperAdminMiddleware, createCleaningRequest);
router.get('/hotel', protectedRoute, isStaffOrAdmin, getHotelCleaningRequests);
router.get('/rooms/cleaning', protectedRoute, isStaffOrAdmin, getCleaningRooms);
router.get('/cleaners', protectedRoute, isStaffOrAdmin, getHotelCleaners);
router.get('/get-cleaning-history', protectedRoute, superAdminMiddleware, getCleaningHistory);

export default router;