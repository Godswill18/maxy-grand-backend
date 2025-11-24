import express from 'express';
import { protectedRoute } from '../middleware/protectedRoutes.js';
import { signUp, login, logout, getAdmins, getUser, getAllStaff, updateStaffStatus, getAllGuests, getUserById, updateStaffRole, findUserByEmail, createGuestAccount, getAllStaffInHotel} from '../controllers/usersController.js';
import { adminAndSuperAdminMiddleware, superAdminMiddleware, isStaffOrAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/get-user', protectedRoute, getUser);

router.post('/create-user', signUp);

router.post('/login-user', login);

router.get('/admins', protectedRoute, superAdminMiddleware, getAdmins);

router.get('/get-all-staff', protectedRoute, superAdminMiddleware, getAllStaff);

router.get('/get-hotel-staffs', protectedRoute, adminAndSuperAdminMiddleware, getAllStaffInHotel);

router.put('/update-staff-status/:id', protectedRoute, adminAndSuperAdminMiddleware, updateStaffStatus);

router.get('/get-all-guests', protectedRoute, isStaffOrAdmin, getAllGuests);

router.get('/get-user/:id', protectedRoute, adminAndSuperAdminMiddleware, getUserById);

router.put("/update-staff-role/:id", protectedRoute, adminAndSuperAdminMiddleware, updateStaffRole);

router.post('/logout-user', logout);

// New: Check if a user exists by email (for the check-in form verification)
router.get('/find-by-email', protectedRoute, findUserByEmail);

// New: Create a guest account from the reception desk
router.post('/create-guest-account', protectedRoute, createGuestAccount);

export default router;