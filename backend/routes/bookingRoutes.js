import express from 'express';
import { protectedRoute } from '../middleware/protectedRoutes.js';
import {
  createBooking,
  getAllBookings,
  getBookingById,
  updateBookingStatus,
  deleteBooking,
  getUserBookings,
  createBookingWithPayment,
  verifyBookingConfirmationCode,
  getHotelBookingSummary,
  updateBooking,
  cancelBooking,
  getAllBookingsInHotel,
  checkRoomAvailability
} from '../controllers/bookingController.js';
import { adminAndSuperAdminMiddleware, isStaffOrAdmin, receptionistMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

// ✅ FIXED ORDER - Most specific routes first
router.get('/get-hotel-bookings', protectedRoute, adminAndSuperAdminMiddleware, getAllBookingsInHotel);
router.get('/hotel-summary/:hotelId', protectedRoute, adminAndSuperAdminMiddleware, getHotelBookingSummary);

// Create bookings
router.post('/create-with-payment', protectedRoute, createBookingWithPayment);
router.post('/create-walkin', protectedRoute, isStaffOrAdmin, createBooking);

// Get all bookings (Admin/Receptionist)
router.get('/all', protectedRoute, isStaffOrAdmin, getAllBookings);

router.post('/check-availability', protectedRoute, checkRoomAvailability);

// Get all bookings for a specific user - MUST come before /:id
router.get('/user/:userId', protectedRoute, getUserBookings);

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