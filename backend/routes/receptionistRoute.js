import express from 'express';
import { protectedRoute } from '../middleware/protectedRoutes.js';
import {
  getAllRooms,
  getAvailableRooms,
  notifyCheckouts,
  updateRoomStatus,
  requestCleaning,
} from '../controllers/receptionistController.js';

const router = express.Router();

// Receptionist endpoints
router.get('/rooms', protectedRoute, getAllRooms);
router.get('/rooms/available', protectedRoute, getAvailableRooms);
router.post('/rooms/notify-checkouts', protectedRoute, notifyCheckouts);
router.patch('/rooms/:roomId/status', protectedRoute, updateRoomStatus);
router.post('/rooms/:roomId/clean', protectedRoute, requestCleaning);

export default router;
