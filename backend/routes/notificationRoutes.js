// routes/notificationRoutes.js
import express from 'express';
import { protectedRoute } from '../middleware/protectedRoutes.js';
import {
  getMyNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearAll,
} from '../controllers/notificationController.js';

const router = express.Router();

// All routes require authentication
router.use(protectedRoute);

// GET /api/notifications - Get my notifications
router.get('/', getMyNotifications);

// PATCH /api/notifications/:id/read - Mark as read
router.patch('/:id/read', markAsRead);

// PATCH /api/notifications/read-all - Mark all as read
router.patch('/read-all', markAllAsRead);

// DELETE /api/notifications/:id - Delete notification
router.delete('/:id', deleteNotification);

// DELETE /api/notifications/clear-all - Clear all notifications
router.delete('/clear-all', clearAll);

export default router;