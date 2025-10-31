import express from 'express';
import { protectedRoute} from '../middleware/protectedRoutes.js';
import { getActiveHotelBranch, getHotelBranch_admin , createHotelBranch, updateBranch, deleteBranch} from '../controllers/hotelsController.js';

const router = express.Router();

router.get('/getActive-branch', getActiveHotelBranch);

router.get('/getHotel-branch-admin', protectedRoute ,getHotelBranch_admin);

router.post('/createHotel-branch', protectedRoute, createHotelBranch);

router.put('/update-branch/:id', protectedRoute, updateBranch);

router.delete('/delete-branch/:id', protectedRoute, deleteBranch);

export default router;