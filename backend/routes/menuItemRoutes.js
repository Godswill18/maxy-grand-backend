import express from 'express';
import { protectedRoute } from '../middleware/protectedRoutes.js';
import { isStaffOrAdmin } from '../middleware/authMiddleware.js'; // We'll assume you create this
import {
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  getAvailableMenu,
  getAllMenuItems,
  getMenuItemById,
  addMenuItemImages,
  deleteMenuItemImage
} from '../controllers/menuItemController.js';
import menuImages from '../config/menuMulter.js'; 

const router = express.Router();

// --- Public Routes (For Guests) ---
// GET /api/menu/               -> Get all AVAILABLE food/drinks
router.get('/', getAvailableMenu);
// GET /api/menu/:id            -> Get a single menu item by ID
router.get('/:id/user', getMenuItemById);


// --- Staff/Admin Routes (Protected) ---
// POST /api/menu/              -> Create a new menu item
router.post(
  '/', 
  protectedRoute, 
  isStaffOrAdmin, 
  menuImages.array("images", 5), 
  createMenuItem
);

// Update a menu item's TEXT data (name, price, etc.)
router.put(
  '/:id', 
  protectedRoute, 
  isStaffOrAdmin, 
  // NO MULTER HERE! This route doesn't handle files.
  updateMenuItem 
);

// ADD new images to an existing item
router.post(
  '/:id/add-images', // New route
  protectedRoute, 
  isStaffOrAdmin, 
  menuImages.array("images", 5), // Multer is here
  addMenuItemImages 
);

// DELETE a specific image from an existing item
router.patch(
  '/:id/delete-image', // New route
  protectedRoute, 
  isStaffOrAdmin,
  // NO MULTER HERE! This route just needs req.body
  deleteMenuItemImage
);

// DELETE /api/menu/:id         -> Delete a menu item
router.delete('/:id', protectedRoute, isStaffOrAdmin, deleteMenuItem);

// GET /api/menu/all            -> Get ALL items (including out-of-stock)
router.get('/all-items', protectedRoute, isStaffOrAdmin, getAllMenuItems);


export default router;