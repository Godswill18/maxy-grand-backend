import express from 'express';
import { protectedRoute } from '../middleware/protectedRoutes.js';
import { isStaffOrAdmin } from '../middleware/authMiddleware.js'; // We'll assume you create this
import {
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  getAvailableMenu,
  getAllMenuItems,
  getMenuItemById
} from '../controllers/menuItemController.js';
import menuImages from '../config/menuMulter.js'; 

const router = express.Router();

// --- Public Routes (For Guests) ---
// GET /api/menu/               -> Get all AVAILABLE food/drinks
router.get('/', getAvailableMenu);
// GET /api/menu/:id            -> Get a single menu item by ID
router.get('/:id', getMenuItemById);


// --- Staff/Admin Routes (Protected) ---
// POST /api/menu/              -> Create a new menu item
router.post(
  '/', 
  protectedRoute, 
  isStaffOrAdmin, 
  menuImages.array("images", 5), 
  createMenuItem
);

// PUT /api/menu/:id            -> Update a menu item
router.put(
  '/:id', 
  protectedRoute, 
  isStaffOrAdmin, 
  menuImages.array("images", 5), 
  updateMenuItem
);

// DELETE /api/menu/:id         -> Delete a menu item
router.delete('/:id', protectedRoute, isStaffOrAdmin, deleteMenuItem);

// GET /api/menu/all            -> Get ALL items (including out-of-stock)
router.get('/all', protectedRoute, isStaffOrAdmin, getAllMenuItems);


export default router;