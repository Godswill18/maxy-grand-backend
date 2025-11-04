import express from 'express';
import {
  createCleaningRequest,
  getMyPendingTasks,
  completeCleaningTask,
  getHotelCleaningRequests,
} from '../controllers/cleaningController.js';

// Import all required middleware
import {
  adminMiddleware,
  cleanerMiddleware, // Import the new middleware
} from '../middleware/authMiddleware.js';
import { protectedRoute } from '../middleware/protectedRoutes.js';

const router = express.Router();

// --- Cleaner Routes (for staff) ---
router.get(
  '/my-tasks',
  protectedRoute,
  cleanerMiddleware,
  getMyPendingTasks
);

router.patch(
  '/:id/complete',
  protectedRoute,
  cleanerMiddleware,
  completeCleaningTask
);

// --- Admin Routes (for management) ---
router.post(
  '/',
  protectedRoute,
  adminMiddleware,
  createCleaningRequest
);

router.get(
  '/hotel',
  protectedRoute,
  adminMiddleware,
  getHotelCleaningRequests
);

export default router;