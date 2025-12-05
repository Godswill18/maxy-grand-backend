import express from 'express';
import {
    createShift,
    getAllShifts,
    getMySchedule,
    getShiftById,
    updateShift,
    deleteShift,
    checkActiveShift,
    getShiftStats,
    emergencyActivateShift,
    deactivateEmergencyShift,
} from '../controllers/shiftController.js';
import { protectedRoute } from '../middleware/protectedRoutes.js';
import { adminAndSuperAdminMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public routes (protected by authentication only)
router.get('/my-schedule', protectedRoute, getMySchedule); // Staff view their own schedule
router.get('/check-active/:userId', protectedRoute, checkActiveShift); // Check if user has active shift

// Admin & SuperAdmin routes
router.post('/', protectedRoute, adminAndSuperAdminMiddleware, createShift); // Create shift
router.get('/', protectedRoute, adminAndSuperAdminMiddleware, getAllShifts); // Get all shifts (filtered by role)
router.get('/stats/:hotelId', protectedRoute, adminAndSuperAdminMiddleware, getShiftStats); // Get statistics
router.get('/:id', protectedRoute, getShiftById); // Get single shift (checks permissions inside)
router.put('/:id', protectedRoute, adminAndSuperAdminMiddleware, updateShift); // Update shift
router.delete('/:id', protectedRoute, adminAndSuperAdminMiddleware, deleteShift); // Delete shift

// ✅ NEW: Emergency activation routes
router.put('/:id/activate', protectedRoute, adminAndSuperAdminMiddleware, emergencyActivateShift); // Emergency activate
router.put('/:id/deactivate', protectedRoute, adminAndSuperAdminMiddleware, deactivateEmergencyShift); // Deactivate emergency

export default router;