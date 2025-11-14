import express from 'express';
import { protectedRoute } from '../middleware/protectedRoutes.js';
import { signUp, login, logout, getAdmins, getUser, getAllStaff, updateStaffStatus, getAllGuests, getUserById, updateStaffRole} from '../controllers/usersController.js';
import { adminAndSuperAdminMiddleware, superAdminMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/get-user', protectedRoute, getUser);

router.post('/create-user', signUp);

router.post('/login-user', login);

router.get('/admins', protectedRoute, superAdminMiddleware, getAdmins);

router.get('/get-all-staff', protectedRoute, superAdminMiddleware, getAllStaff);

router.put('/update-staff-status/:id', protectedRoute, superAdminMiddleware, updateStaffStatus);

router.get('/get-all-guests', protectedRoute, adminAndSuperAdminMiddleware, getAllGuests);

router.get('/get-user/:id', protectedRoute, adminAndSuperAdminMiddleware, getUserById);

router.put("/update-staff-role/:id", protectedRoute, superAdminMiddleware, updateStaffRole);

router.post('/logout-user', logout);

export default router;