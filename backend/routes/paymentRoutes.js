import express from 'express';
import { verifyPayment, handleWebhook } from '../controllers/paymentController.js';
import { protectedRoute } from '../middleware/protectedRoutes.js';
import { superAdminMiddleware } from '../middleware/authMiddleware.js';
import { getHotelPayments, getAllPayments, getPaymentStats, getPaymentById, createPayment } from '../controllers/paymentController.js';

const router = express.Router();

router.post('/verify', protectedRoute, verifyPayment);
router.post('/webhook', handleWebhook); // No auth - Paystack calls this

router.get('/hotel/:hotelId', protectedRoute, superAdminMiddleware, getHotelPayments);

// Get all payments (Super Admin only)
router.get('/all', protectedRoute, superAdminMiddleware, getAllPayments);

// Get payment statistics
router.get('/stats/:hotelId', protectedRoute, superAdminMiddleware, getPaymentStats);

// Get single payment by ID
router.get('/:id', protectedRoute, superAdminMiddleware, getPaymentById);

// Create a payment record (used internally)
router.post('/create', protectedRoute, createPayment);


export default router;