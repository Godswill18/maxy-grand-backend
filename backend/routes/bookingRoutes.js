import express from 'express';
import { protectedRoute } from '../middleware/protectedRoutes.js';
import {
  createBooking,
  getAllBookings,
  getBookingById,
  updateBookingStatus,
  deleteBooking,
  getUserBookings,
  checkoutRoom,
  getHotelBookingSummary
} from '../controllers/bookingController.js';
import { adminAndSuperAdminMiddleware, isStaffOrAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

// Create booking (online or in-person)
router.post('/create', protectedRoute, createBooking);

// Get all bookings (Admin/Receptionist)
router.get('/all', protectedRoute, isStaffOrAdmin, getAllBookings);

// Get a single booking by ID
router.get('/:id', protectedRoute, getBookingById);

// Update booking status (Admin/Receptionist)
router.patch('/:id/status', protectedRoute, updateBookingStatus);

// Delete booking (Admin/Receptionist)
router.delete('/:id', protectedRoute, deleteBooking);

// Get all bookings made by a user
router.get('/user/:userId', protectedRoute, getUserBookings);

router.put('/checkout/:roomId', checkoutRoom);

router.get('/hotel-summary/:hotelId', protectedRoute, adminAndSuperAdminMiddleware, getHotelBookingSummary);

export default router;
