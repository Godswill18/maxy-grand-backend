import express from 'express';
import {
    createAnnouncement,
    updateAnnouncement,
    deleteAnnouncement,
    getAdminAnnouncements,
    getActiveAnnouncement
} from '../controllers/announcementController.js';
import { adminAndSuperAdminMiddleware } from '../middleware/authMiddleware.js';
import { protectedRoute } from '../middleware/protectedRoutes.js';
// Use your Multer config for single image uploads
import postImages from '../config/postMulter.js'; // Adjust path as needed

const router = express.Router();

// --- Public Route ---
// Your homepage frontend will call this on page load
router.get('/public/:hotelId', getActiveAnnouncement);

// --- Admin Routes ---
router.post(
    '/',
    protectedRoute,
    adminAndSuperAdminMiddleware,
    postImages.single('image'), // Assumes your multer uses 'image'
    createAnnouncement
);

router.get(
    '/admin',
    protectedRoute,
    adminAndSuperAdminMiddleware,
    getAdminAnnouncements
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