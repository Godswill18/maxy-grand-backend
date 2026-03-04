import express from 'express';
import {
    validateToken,
    submitReview,
    getManagerReviews,
    getAllReviews,
} from '../controllers/reviewController.js';
import {
    adminMiddleware,
    adminAndSuperAdminMiddleware,
} from '../middleware/authMiddleware.js';
import { protectedRoute } from '../middleware/protectedRoutes.js';
import { reviewSubmitLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// ── Public routes (no auth required) ────────────────────────────────────────
// Rate-limited to prevent abuse
router.get('/validate-token/:token', reviewSubmitLimiter, validateToken);
router.post('/submit', reviewSubmitLimiter, submitReview);

// ── Branch Manager route (admin only) ───────────────────────────────────────
// Returns only reviews for the manager's assigned hotel (enforced server-side)
router.get('/branch', protectedRoute, adminMiddleware, getManagerReviews);

// ── Superadmin route (admin + superadmin) ────────────────────────────────────
// Superadmin sees all; admin is further restricted server-side
router.get('/', protectedRoute, adminAndSuperAdminMiddleware, getAllReviews);

export default router;
