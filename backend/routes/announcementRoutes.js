import express from 'express';
import {
    createAnnouncement,
    updateAnnouncement,
    deleteAnnouncement,
    getAdminAnnouncements,
    getActiveAnnouncement,
    toggleVisibility,
    getStaffAnnouncement,
} from '../controllers/announcementController.js';
import { adminAndSuperAdminMiddleware, isStaffOrAdmin } from '../middleware/authMiddleware.js';
import { protectedRoute } from '../middleware/protectedRoutes.js';
import postImages from '../config/postMulter.js';

const router = express.Router();

// --- Public Route (no auth) ---
router.get('/public', getActiveAnnouncement);

// --- Staff Route (any logged-in staff/admin) ---
router.get('/staff', protectedRoute, isStaffOrAdmin, getStaffAnnouncement);

// --- Admin Routes ---
router.get('/admin', protectedRoute, adminAndSuperAdminMiddleware, getAdminAnnouncements);

router.post(
    '/',
    protectedRoute,
    adminAndSuperAdminMiddleware,
    postImages.single('image'),
    createAnnouncement
);

router.patch(
    '/:id/toggle-visibility',
    protectedRoute,
    adminAndSuperAdminMiddleware,
    toggleVisibility
);

router.patch(
    '/:id',
    protectedRoute,
    adminAndSuperAdminMiddleware,
    postImages.single('image'),
    updateAnnouncement
);

router.delete(
    '/:id',
    protectedRoute,
    adminAndSuperAdminMiddleware,
    deleteAnnouncement
);

export default router;
