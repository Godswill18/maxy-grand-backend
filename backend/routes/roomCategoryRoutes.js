import express from 'express';
import {
    getAllCategories,
    getAllCategoriesAdmin,
    createCategory,
    updateCategory,
    deleteCategory,
} from '../controllers/roomCategoryController.js';
import { protectedRoute } from '../middleware/protectedRoutes.js';
import { adminAndSuperAdminMiddleware, superAdminMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public — active categories only (used by guest frontend for filtering)
router.get('/', getAllCategories);

// Admin/SuperAdmin — all categories with room counts
router.get('/admin', protectedRoute, adminAndSuperAdminMiddleware, getAllCategoriesAdmin);

// Create — admin or superadmin
router.post('/', protectedRoute, adminAndSuperAdminMiddleware, createCategory);

// Update — admin or superadmin
router.put('/:id', protectedRoute, adminAndSuperAdminMiddleware, updateCategory);

// Delete — superadmin only (destructive operation)
router.delete('/:id', protectedRoute, superAdminMiddleware, deleteCategory);

export default router;
