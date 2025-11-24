import CleaningRequest from '../models/cleaningRequestModel.js';
import Room from '../models/roomModel.js';
import User from '../models/userModel.js'; // Assume this exists
import mongoose from 'mongoose';

const emitUpdatedTasks = async (io, hotelId) => {
  try {
    const requests = await CleaningRequest.find({ hotelId })
      .populate('roomId', 'roomNumber status')
      .populate('assignedCleaner', 'name email')
      .populate('requestedBy', 'name')
      .sort({ createdAt: -1 });
    io.emit('cleaning:update', requests);
  } catch (error) {
    console.error('Error emitting task update:', error);
  }
};

export const createCleaningRequest = async (req, res) => {
  try {
    const { roomId, assignedCleanerId, notes } = req.body;
    const requestedById = req.user.id;
    const hotelId = req.user.hotelId;
    const io = req.io;

    if (!roomId || !assignedCleanerId) {
      return res.status(400).json({ message: 'Room ID and Cleaner ID are required' });
    }

    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    // Check for existing pending request instead of status
    const existingRequest = await CleaningRequest.findOne({ 
      roomId, 
      status: 'pending', 
      hotelId 
    });
    if (existingRequest) {
      return res.status(400).json({ 
        message: 'A pending cleaning request already exists for this room.' 
      });
    }

    // Optional: Validate room is in cleaning status
    // if (room.status !== 'cleaning') {
    //   return res.status(400).json({ message: 'Room must be in cleaning status to assign a cleaner.' });
    // }

    const request = new CleaningRequest({
      hotelId,
      roomId,
      assignedCleaner: assignedCleanerId,
      requestedBy: requestedById,
      notes,
      status: 'pending',
    });
    const createdRequest = await request.save();
    // Set or confirm room status to cleaning (idempotent)
    await Room.findByIdAndUpdate(roomId, { status: 'cleaning' });
    await emitUpdatedTasks(io, hotelId);
    res.status(201).json(createdRequest);
  } catch (error) {
    res.status(500).json({ message: 'Server error creating request', error: error.message });
  }
};

export const getMyPendingTasks = async (req, res) => {
  try {
    const cleanerId = req.user.id;
    const tasks = await CleaningRequest.find({
      assignedCleaner: cleanerId,
      status: 'pending',
    })
      .populate({
        path: 'roomId',
        select: 'roomNumber status',
        populate: {
          path: 'roomTypeId',
          select: 'name'
        }
      })
      .populate('requestedBy', 'firstName lastName')
      .sort({ createdAt: 1 });
    res.status(200).json(tasks);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching tasks', error: error.message });
  }
};

export const completeCleaningTask = async (req, res) => {
  try {
    const { id: requestId } = req.params;
    const cleanerId = req.user.id;
    const io = req.io;

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({ message: 'Invalid request ID' });
    }

    const request = await CleaningRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ message: 'Cleaning request not found' });
    }

    if (request.assignedCleaner.toString() !== cleanerId) {
      return res.status(403).json({ message: 'Not authorized to complete this task' });
    }

    if (request.status === 'completed') {
      return res.status(400).json({ message: 'Task is already marked as completed' });
    }

    request.status = 'completed';
    const updatedRequest = await request.save();
    await Room.findByIdAndUpdate(request.roomId, { status: 'available' });
    await emitUpdatedTasks(io, request.hotelId);
    res.status(200).json({ message: 'Task marked as complete', request: updatedRequest });
  } catch (error) {
    res.status(500).json({ message: 'Server error completing task', error: error.message });
  }
};

export const getHotelCleaningRequests = async (req, res) => {
  try {
    const hotelId = req.user.hotelId;

    const requests = await CleaningRequest.find({ hotelId })
      .populate({
        path: 'roomId',
        select: 'roomNumber status',
        populate: {
          path: 'roomTypeId',
          select: 'name'
        }
      })
      .populate('assignedCleaner', 'firstName lastName email')
      .populate('requestedBy', 'firstName lastName email')
      .sort({ createdAt: -1 });

    res.status(200).json(requests);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching requests', error: error.message });
  }
};

export const getCleaningRooms = async (req, res) => {
  try {
    const hotelId = req.user.hotelId;
    const rooms = await Room.find({ hotelId, status: 'cleaning' })
      .populate('roomTypeId', 'name')
      .sort({ roomNumber: 1 });
    res.status(200).json(rooms);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching cleaning rooms', error: error.message });
  }
};

export const getHotelCleaners = async (req, res) => {
  try {
    const hotelId = req.user.hotelId;
    const cleaners = await User.find({ hotelId, role: 'cleaner' })
      .select('firstName lastName email')
      .sort({ firstName: 1 , lastName: 1 });
    res.status(200).json(cleaners);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching cleaners', error: error.message });
  }
};

export const getCleaningHistory = async (req, res) => {
  try {
    const history = await CleaningRequest.find()
      .populate({
        path: 'roomId',
        select: 'roomNumber status',
        populate: {
          path: 'roomTypeId',
          select: 'name'
        }
      })
      .populate('assignedCleaner', 'firstName lastName email')
      .populate('requestedBy', 'firstName lastName email')
      .sort({ createdAt: -1 });
    res.status(200).json(history);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching history', error: error.message });
  }
};