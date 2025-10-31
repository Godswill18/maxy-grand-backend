import express from 'express';
import { protectedRoute } from '../middleware/protectedRoutes.js';
import { getAllRooms, getRoomById, createRoom, updateRoom, deleteRoom } from '../controllers/roomsController.js';
import roomsImages from '../config/roomsMulter.js';

const router = express.Router();

router.get('/get-all-rooms', getAllRooms);
router.get('/get-room/:id', getRoomById);


router.post('/create-room', protectedRoute, roomsImages.array("images", 10) , createRoom);
router.put('/update-room/:id', protectedRoute, roomsImages.array("images", 10) ,  updateRoom);
router.delete('/delete-room/:id', protectedRoute, deleteRoom);

export default router;
