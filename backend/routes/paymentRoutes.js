import express from 'express';
import { verifyPayment, handleWebhook } from '../controllers/paymentController.js';
import { protectedRoute } from '../middleware/protectedRoutes.js';
import { superAdminMiddleware } from '../middleware/authMiddleware.js';
import { getHotelPayments, getAllPayments, getPaymentStats, getPaymentById, createPayment } from '../controllers/paymentController.js';
import { paymentLimiter } from '../middleware/rateLimiter.js';
import { paymentIdempotency } from '../middleware/idempotency.js';

const router = express.Router();

// Payment verification — rate limited (5/min per user) + idempotency guard
router.post('/verify', protectedRoute, paymentLimiter, paymentIdempotency, verifyPayment);

// Webhook — no auth (Paystack-signed), no rate limit (trusted source)
router.post('/webhook', handleWebhook);

router.get('/hotel/:hotelId', protectedRoute, superAdminMiddleware, getHotelPayments);

// Get all payments (Super Admin only)
router.get('/all', protectedRoute, superAdminMiddleware, getAllPayments);

// Get payment statistics
router.get('/stats/:hotelId', protectedRoute, superAdminMiddleware, getPaymentStats);

// Get single payment by ID
router.get('/:id', protectedRoute, superAdminMiddleware, getPaymentById);

// Create a payment record (used internally) — rate limited
router.post('/create', protectedRoute, paymentLimiter, createPayment);


export default router;