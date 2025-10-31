import express from 'express';
import { protectedRoute } from '../middleware/protectedRoutes.js';
import { signUp, login, logout, getUser} from '../controllers/usersController.js';

const router = express.Router();

router.get('/get-user', protectedRoute, getUser);

router.post('/create-user', signUp);

router.post('/login-user', login);

router.post('/logout-user', logout);

export default router;