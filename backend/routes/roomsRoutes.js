// roomsRoutes.js

import express from 'express';
import { protectedRoute } from '../middleware/protectedRoutes.js';
import {
  getAllRooms,
  getRoomById,
  createRoom,
  updateRoom, // This will be text-only
  deleteRoom,
  addRoomImages, // New
  deleteRoomImage, // New
  getRoomsByHotel,
  getRoomTypesByHotel,
   getMyHotelRooms, // NEW
  updateRoomStatus, // NEW
  getRoomStatusByHotel
} from '../controllers/roomsController.js';
import roomsImages from '../config/roomsMulter.js';
import { adminAndSuperAdminMiddleware, isStaffOrAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

// --- Public Routes ---
router.get('/get-all-rooms', getAllRooms);
router.get('/get-room/:id', getRoomById);

// --- Protected Admin Routes ---

// Create a new room (handles initial images)
router.post(
  '/create-room',
  protectedRoute,
  adminAndSuperAdminMiddleware,
  roomsImages.array("images", 10),
  createRoom
);

// DELETE a room
router.delete(
  '/delete-room/:id',
  protectedRoute,
  adminAndSuperAdminMiddleware,
  deleteRoom
);

// 🔄 UPDATE a room's TEXT-ONLY details
router.put(
  '/update-room/:id',
  protectedRoute,
  adminAndSuperAdminMiddleware,
  // NO MULTER HERE! This route is for text only.
  updateRoom
);

// ➕ ADD new images to an existing room
router.post(
  '/add-images/:id', // New, specific route
  protectedRoute,
  adminAndSuperAdminMiddleware,
  roomsImages.array("images", 10), // Multer is here
  addRoomImages
);

// ➖ DELETE a single image from a room
router.patch(
  '/delete-image/:id', // New, specific route
  protectedRoute,
  adminAndSuperAdminMiddleware,
  // NO MULTER HERE! This route just needs req.body
  deleteRoomImage
);

// router.get('/by-hotel/:hotelId', protectedRoute, isStaffOrAdmin, getRoomsByHotel);

router.get('/types/by-hotel/:hotelId', protectedRoute, isStaffOrAdmin, getRoomTypesByHotel);

router.get('/by-hotel/:hotelId', protectedRoute, isStaffOrAdmin, getRoomsByHotel);

router.get('/room-status/by-hotel/:hotelId', protectedRoute, isStaffOrAdmin, getRoomStatusByHotel);

// Get rooms for logged-in user's hotel (recommended)
router.get('/my-hotel', protectedRoute, isStaffOrAdmin, getMyHotelRooms);

// Update room status
router.patch('/:id/status', protectedRoute, isStaffOrAdmin, updateRoomStatus);

// Alternative route (if you prefer RESTful pattern)
router.patch('/:id', protectedRoute, isStaffOrAdmin, updateRoomStatus);


export default router;