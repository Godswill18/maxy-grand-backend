import express from 'express';
import { protectedRoute } from '../middleware/protectedRoutes.js';
import {
  createBooking,
  getAllBookings,
  getBookingById,
  updateBookingStatus,
  deleteBooking,
  getUserBookings,
  getGuestBookings,
  createBookingWithPayment,
  verifyBookingConfirmationCode,
  getHotelBookingSummary,
  updateBooking,
  cancelBooking,
  getAllBookingsInHotel,
  checkRoomAvailability,
  updateBookingPayment
} from '../controllers/bookingController.js';
import { adminAndSuperAdminMiddleware, isStaffOrAdmin, receptionistMiddleware, superAdminMiddleware } from '../middleware/authMiddleware.js';
import { bookingLimiter, availabilityLimiter } from '../middleware/rateLimiter.js';
import { acquireReservationLock, releaseOnSuccess } from '../middleware/reservationLock.js';

const router = express.Router();

// ✅ FIXED ORDER - Most specific routes first
router.get('/get-hotel-bookings', protectedRoute, adminAndSuperAdminMiddleware, getAllBookingsInHotel);
router.get('/hotel-summary/:hotelId', protectedRoute, adminAndSuperAdminMiddleware, getHotelBookingSummary);

// Create bookings — rate limited per user + reservation lock released on success
router.post('/create-with-payment', protectedRoute, bookingLimiter, releaseOnSuccess, createBookingWithPayment);
router.post('/create-walkin',       protectedRoute, isStaffOrAdmin, bookingLimiter, createBooking);

// Get all bookings (Admin/Receptionist)
router.get('/all', protectedRoute, isStaffOrAdmin, getAllBookings);

// Availability check — rate limited + acquires 15-min reservation lock
router.post('/check-availability', protectedRoute, availabilityLimiter, acquireReservationLock, checkRoomAvailability);

// Get all bookings for a specific user - MUST come before /:id
router.get('/user/:userId', protectedRoute, getUserBookings);

// Get all bookings for a specific guest (super admin only)
router.get('/guest/:guestId', protectedRoute, adminAndSuperAdminMiddleware, getGuestBookings);

router.patch('/:id/payment', protectedRoute, isStaffOrAdmin, updateBookingPayment);

// Update/Cancel booking
router.put('/update/:id', protectedRoute, isStaffOrAdmin, updateBooking);
router.patch('/cancel/:id', protectedRoute, isStaffOrAdmin, cancelBooking);
router.patch('/:id/status', protectedRoute, updateBookingStatus);

// Verify confirmation code
router.post('/verify-code/:bookingId', protectedRoute, receptionistMiddleware, verifyBookingConfirmationCode);

// Get a single booking by ID - MUST come AFTER /user/:userId
router.get('/:id', protectedRoute, getBookingById);  // ✅ CHANGED FROM /user/:id

// Delete booking
router.delete('/:id', protectedRoute, deleteBooking);

export default router;