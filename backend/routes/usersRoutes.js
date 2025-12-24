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

// ✅ Import new guest profile controllers
import {
  updateGuestPhoneNumber,
  requestGuestEmailChange,
  verifyGuestEmailChangeOTP,
  confirmGuestEmailChange
} from '../controllers/guestProfileController.js';

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

// ✅ Staff Profile Routes (Protected)
router.put('/update-profile', protectedRoute, updateUserProfile);

// ✅ Password Reset Routes (Protected - for both staff and guests)
router.post('/request-password-reset', protectedRoute, requestPasswordReset);
router.post('/verify-reset-otp', protectedRoute, verifyResetOTP);
router.post('/reset-password', protectedRoute, resetPassword);

// ✅ NEW: Guest Profile Management Routes (Protected)
router.put('/guest/update-phone', protectedRoute, updateGuestPhoneNumber);
router.post('/guest/request-email-change', protectedRoute, requestGuestEmailChange);
router.post('/guest/verify-email-change-otp', protectedRoute, verifyGuestEmailChangeOTP);
router.post('/guest/confirm-email-change', protectedRoute, confirmGuestEmailChange);

export default router;