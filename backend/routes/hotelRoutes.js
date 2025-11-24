import express from 'express';
import { protectedRoute} from '../middleware/protectedRoutes.js';
import { getActiveHotelBranch, getHotelBranch_admin , createHotelBranch, updateBranch, getSingleBranch, getSingleBranchUser, getHotelList, getMyBranch, deleteBranch} from '../controllers/hotelsController.js';
import { adminAndSuperAdminMiddleware, adminMiddleware, superAdminMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/getActive-branch', getActiveHotelBranch);

router.get('/getHotel-branch-admin', protectedRoute, adminAndSuperAdminMiddleware ,getHotelBranch_admin);

router.post('/createHotel-branch', protectedRoute, superAdminMiddleware, createHotelBranch);

router.put('/update-branch/:id', protectedRoute, superAdminMiddleware, updateBranch);

router.get('/get-single-branch/:id', protectedRoute, superAdminMiddleware, getSingleBranch);

router.get('/get-single-branch-public/:id', getSingleBranchUser);

router.get('/get-admin-branch/:id', protectedRoute, adminMiddleware, getMyBranch);

router.get('/list', protectedRoute, superAdminMiddleware, getHotelList);

router.delete('/delete-branch/:id', protectedRoute, superAdminMiddleware, deleteBranch);

export default router;