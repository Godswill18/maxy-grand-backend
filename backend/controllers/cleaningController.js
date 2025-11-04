import CleaningRequest from '../models/cleaningRequestModel.js';
import Room from '../models/roomModel.js'; // <-- Importing your exact Room model
import mongoose from 'mongoose';

/**
 * @desc    Create a new cleaning request (for Admins)
 * @route   POST /api/cleaning
 * @access  Private (Admin)
 */
export const createCleaningRequest = async (req, res) => {
  try {
    const { roomId, assignedCleanerId, notes } = req.body;
    const requestedById = req.user.id;
    const hotelId = req.user.hotelId; // Assumes admin is logged in and tied to a hotel

    // Validate input
    if (!roomId || !assignedCleanerId) {
      return res.status(400).json({ message: 'Room ID and Cleaner ID are required' });
    }

    // Find the room to be cleaned
    const room = await Room.findById(roomId);
    if (!room) {
        return res.status(404).json({ message: 'Room not found' });
    }

    // **CRITICAL CHECK:** Check if room is already being cleaned
    if (room.status === 'cleaning') {
        return res.status(400).json({ 
            message: 'Room is already being cleaned. A new request cannot be created.' 
        });
    }

    // 1. Create the cleaning request task
    const request = new CleaningRequest({
      hotelId,
      roomId,
      assignedCleaner: assignedCleanerId,
      requestedBy: requestedById,
      notes,
      status: 'pending',
    });
    const createdRequest = await request.save();

    // 2. **Update the Room's status** to 'cleaning'
    room.status = 'cleaning';
    await room.save();

    res.status(201).json(createdRequest);
  } catch (error) {
    res.status(500).json({ message: 'Server error creating request', error: error.message });
  }
};

/**
 * @desc    Get all pending requests assigned to the logged-in cleaner
 * @route   GET /api/cleaning/my-tasks
 * @access  Private (Cleaner)
 */
export const getMyPendingTasks = async (req, res) => {
  try {
    const cleanerId = req.user.id;

    const tasks = await CleaningRequest.find({
      assignedCleaner: cleanerId,
      status: 'pending',
    })
      // Populate room details, including the RoomType info
      .populate({
          path: 'roomId',
          select: 'roomNumber status',
          populate: {
              path: 'roomTypeId',
              select: 'name'
          }
      })
      .populate('requestedBy', 'name') // Show who requested it
      .sort({ createdAt: 1 }); // Oldest first

    res.status(200).json(tasks);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching tasks', error: error.message });
  }
};

/**
 * @desc    Mark a cleaning request as completed (for Cleaners)
 * @route   PATCH /api/cleaning/:id/complete
 * @access  Private (Cleaner)
 */
export const completeCleaningTask = async (req, res) => {
  try {
    const { id: requestId } = req.params;
    const cleanerId = req.user.id; // Get ID from auth middleware

    // Validate ID
    if (!mongoose.Types.ObjectId.isValid(requestId)) {
        return res.status(400).json({ message: 'Invalid request ID' });
    }

    // Find the request
    const request = await CleaningRequest.findById(requestId);

    if (!request) {
      return res.status(404).json({ message: 'Cleaning request not found' });
    }

    // **Security Check:** Ensure the cleaner completing the task is the one assigned
    if (request.assignedCleaner.toString() !== cleanerId) {
      return res.status(403).json({ message: 'Not authorized to complete this task' });
    }

    // Check if already completed
    if (request.status === 'completed') {
      return res.status(400).json({ message: 'Task is already marked as completed' });
    }

    // 1. Update the request status to 'completed'
    request.status = 'completed';
    const updatedRequest = await request.save();

    // 2. **Update the Room's status** back to 'available'
    // We trust the request's roomId is correct
    await Room.findByIdAndUpdate(request.roomId, { status: 'available' });

    res.status(200).json({ message: 'Task marked as complete', request: updatedRequest });
  } catch (error) {
    res.status(500).json({ message: 'Server error completing task', error: error.message });
  }
};

/**
 * @desc    Get all cleaning requests for the admin's hotel
 * @route   GET /api/cleaning/hotel
 * @access  Private (Admin)
 */
export const getHotelCleaningRequests = async (req, res) => {
    try {
      const hotelId = req.user.hotelId;
  
      const requests = await CleaningRequest.find({ hotelId })
        .populate('roomId', 'roomNumber status')
        .populate('assignedCleaner', 'name email')
        .populate('requestedBy', 'name')
        .sort({ createdAt: -1 });
  
      res.status(200).json(requests);
    } catch (error) {
      res.status(500).json({ message: 'Server error fetching requests', error: error.message });
    }
  };