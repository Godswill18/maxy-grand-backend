import express from 'express';
import { protectedRoute } from '../middleware/protectedRoutes.js';
import { 
  signUp, 
  login, 
  logout, 
  getAdmins, 
  getUser, 
  getAllStaff, 
  updateStaffStatus, 
  getAllGuests, 
  getUserById, 
  updateStaffRole, 
  findUserByEmail, 
  createGuestAccount, 
  getAllStaffInHotel, 
  loginGuest,
  updateUserProfile,
  requestPasswordReset,
  verifyResetOTP,
  resetPassword
} from '../controllers/usersController.js';
import { adminAndSuperAdminMiddleware, superAdminMiddleware, isStaffOrAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

// ✅ Auth Routes
router.get('/get-user', protectedRoute, getUser);
router.post('/create-user', signUp);
router.post('/login-user', login);
router.post('/login-guest', loginGuest);
router.post('/logout-user', logout);

// ✅ Admin Routes
router.get('/admins', protectedRoute, superAdminMiddleware, getAdmins);
router.get('/get-all-staff', protectedRoute, adminAndSuperAdminMiddleware, getAllStaff);
router.get('/get-hotel-staffs', protectedRoute, adminAndSuperAdminMiddleware, getAllStaffInHotel);
router.put('/update-staff-status/:id', protectedRoute, adminAndSuperAdminMiddleware, updateStaffStatus);
router.get('/get-all-guests', protectedRoute, isStaffOrAdmin, getAllGuests);
router.get('/get-user/:id', protectedRoute, adminAndSuperAdminMiddleware, getUserById);
router.put("/update-staff-role/:id", protectedRoute, adminAndSuperAdminMiddleware, updateStaffRole);

// ✅ User/Guest Routes
router.get('/find-by-email', protectedRoute, findUserByEmail);
router.post('/create-guest-account', protectedRoute, createGuestAccount);

// ✅ NEW: Profile Routes (Protected - for logged-in users)
router.put('/update-profile', protectedRoute, updateUserProfile);

// ✅ NEW: Password Reset Routes (Protected)
router.post('/request-password-reset', protectedRoute, requestPasswordReset);
router.post('/verify-reset-otp', protectedRoute, verifyResetOTP);
router.post('/reset-password', protectedRoute, resetPassword);

export default router;