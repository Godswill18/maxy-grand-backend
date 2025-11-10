import express from 'express';
import { protectedRoute } from '../middleware/protectedRoutes.js';
import { signUp, login, logout, getAdmins, getUser, getAllStaff, updateStaffStatus} from '../controllers/usersController.js';
import { superAdminMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/get-user', protectedRoute, getUser);

router.post('/create-user', signUp);

router.post('/login-user', login);

router.get('/admins', protectedRoute, superAdminMiddleware, getAdmins);

router.get('/get-all-staff', protectedRoute, superAdminMiddleware, getAllStaff);

router.put('/update-staff-status/:id', protectedRoute, superAdminMiddleware, updateStaffStatus);

router.post('/logout-user', logout);

export default router;