import express from 'express';
import { protectedRoute } from '../middleware/protectedRoutes.js';
import {
  getAllRooms,
  getAvailableRooms,
  notifyCheckouts,
  updateBookingStatusCheckIn,
  requestCleaning,
  bookGuest,
  findAvailableRoomsForRange,
  getDashboardBookings,
  checkOutGuest
} from '../controllers/receptionistController.js';
import { receptionistMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

// Receptionist endpoints
router.get('/rooms', protectedRoute, getAllRooms);
router.post('/book-guest', protectedRoute, bookGuest);
router.get('/rooms/available', protectedRoute, getAvailableRooms);
router.post('/rooms/available-range', protectedRoute, findAvailableRoomsForRange);
router.post('/rooms/notify-checkouts', protectedRoute, notifyCheckouts);
router.patch('/:bookingId/check-in', protectedRoute, updateBookingStatusCheckIn);
router.patch('/:bookingId/check-out', protectedRoute, checkOutGuest);
router.post('/rooms/:roomId/clean', protectedRoute, requestCleaning);
router.get('/dashboard/bookings', protectedRoute, receptionistMiddleware, getDashboardBookings);

export default router;
