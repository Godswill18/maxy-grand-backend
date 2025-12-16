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
  checkOutGuest,
  extendGuestStay, // NEW
  getCheckoutAlerts, // NEW
  reassignRoom,
  getDashboardStats,
  getCheckInActivity,
  getWeeklyRevenue,
  getPendingCheckIns,
  getExpectedCheckOuts,
  updateRoomStatus
} from '../controllers/receptionistController.js';
import { isStaffOrAdmin, receptionistMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

// ===== ROOM MANAGEMENT =====
router.get('/rooms', protectedRoute, isStaffOrAdmin, getAllRooms);
router.get('/rooms/available', protectedRoute, receptionistMiddleware, getAvailableRooms);
router.post('/rooms/available-range', protectedRoute, receptionistMiddleware, findAvailableRoomsForRange);
router.post('/rooms/:roomId/clean', protectedRoute, receptionistMiddleware, requestCleaning);

// ===== BOOKING MANAGEMENT =====
router.get('/dashboard/bookings', protectedRoute, receptionistMiddleware, getDashboardBookings);
router.post('/book-guest', protectedRoute, receptionistMiddleware, bookGuest);

// ===== CHECK-IN / CHECK-OUT =====
router.patch('/:bookingId/check-in', protectedRoute, receptionistMiddleware, updateBookingStatusCheckIn);
router.patch('/:bookingId/check-out', protectedRoute, receptionistMiddleware, checkOutGuest);
router.patch('/:bookingId/extend', protectedRoute, receptionistMiddleware, extendGuestStay); // NEW
router.patch('/rooms/:roomId/status', protectedRoute, receptionistMiddleware, updateRoomStatus); // NEW

// ===== ALERTS & NOTIFICATIONS =====
router.get('/checkout-alerts', protectedRoute, receptionistMiddleware, getCheckoutAlerts); // NEW
router.post('/rooms/notify-checkouts', protectedRoute, receptionistMiddleware, notifyCheckouts);

router.post('/rooms/reassign', protectedRoute, receptionistMiddleware, reassignRoom);

router.get('/dashboard-stats', protectedRoute, receptionistMiddleware, getDashboardStats);
router.get('/checkin-activity', protectedRoute, receptionistMiddleware, getCheckInActivity);
router.get('/weekly-revenue', protectedRoute, receptionistMiddleware, getWeeklyRevenue);
router.get('/pending-checkins', protectedRoute, receptionistMiddleware, getPendingCheckIns);
router.get('/expected-checkouts', protectedRoute, receptionistMiddleware, getExpectedCheckOuts);

export default router;