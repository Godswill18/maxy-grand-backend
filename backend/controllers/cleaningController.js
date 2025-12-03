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
    io.to(hotelId.toString()).emit('cleaning:update', requests); // Emit to hotel-specific room if using rooms
  } catch (error) {
    console.error('Error emitting task update:', error);
  }
};

export const createCleaningRequest = async (req, res) => {
  try {
    const { roomId, assignedCleanerId, notes, priority = 'Medium', estimatedDuration = '30 min' } = req.body;
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
    const request = new CleaningRequest({
      hotelId,
      roomId,
      assignedCleaner: assignedCleanerId,
      requestedBy: requestedById,
      notes,
      priority,
      estimatedDuration,
      status: 'pending',
    });
    const createdRequest = await request.save();
    await Room.findByIdAndUpdate(roomId, { status: 'cleaning' });
    await emitUpdatedTasks(io, hotelId);
    res.status(201).json(createdRequest);
  } catch (error) {
    res.status(500).json({ message: 'Server error creating request', error: error.message });
  }
};

export const getMyTasks = async (req, res) => {
  try {
    const cleanerId = req.user.id;
    const hotelId = req.user.hotelId; // Add hotelId filter
    const tasks = await CleaningRequest.find({
      assignedCleaner: cleanerId,
      hotelId, // Ensure tasks match user's hotel
    })
      .populate({
        path: 'roomId',
        select: 'roomNumber status',
        populate: {
          path: 'roomTypeId',
          select: 'name',
        },
      })
      .populate('requestedBy', 'firstName lastName')
      .sort({ createdAt: -1 });
    res.status(200).json(tasks);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching tasks', error: error.message });
  }
};

export const startCleaningTask = async (req, res) => {
  try {
    const { id: requestId } = req.params;
    const cleanerId = req.user.id;
    const hotelId = req.user.hotelId;
    const io = req.io;
    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({ message: 'Invalid request ID' });
    }
    const request = await CleaningRequest.findOne({ _id: requestId, hotelId }); // Add hotelId check
    if (!request) {
      return res.status(404).json({ message: 'Cleaning request not found' });
    }
    if (request.assignedCleaner.toString() !== cleanerId) {
      return res.status(403).json({ message: 'Not authorized to start this task' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'Task cannot be started. It is already in progress or completed.' });
    }
    request.status = 'in-progress';
    request.startTime = new Date();
    const updatedRequest = await request.save();
    await emitUpdatedTasks(io, hotelId);
    res.status(200).json({ message: 'Task started', request: updatedRequest });
  } catch (error) {
    res.status(500).json({ message: 'Server error starting task', error: error.message });
  }
};

export const completeCleaningTask = async (req, res) => {
  try {
    const { id: requestId } = req.params;
    const cleanerId = req.user.id;
    const hotelId = req.user.hotelId;
    const io = req.io;
    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({ message: 'Invalid request ID' });
    }
    const request = await CleaningRequest.findOne({ _id: requestId, hotelId }); // Add hotelId check
    if (!request) {
      return res.status(404).json({ message: 'Cleaning request not found' });
    }
    if (request.assignedCleaner.toString() !== cleanerId) {
      return res.status(403).json({ message: 'Not authorized to complete this task' });
    }
    if (request.status !== 'in-progress') {
      return res.status(400).json({ message: 'Task must be in progress to complete' });
    }
    request.status = 'completed';
    request.finishTime = new Date();
    if (request.startTime) {
      const durationMinutes = Math.round((request.finishTime.getTime() - request.startTime.getTime()) / 60000);
      request.actualDuration = durationMinutes;
    }
    const updatedRequest = await request.save();
    await Room.findByIdAndUpdate(request.roomId, { status: 'available' });
    await emitUpdatedTasks(io, hotelId);
    res.status(200).json({ message: 'Task marked as complete', request: updatedRequest });
  } catch (error) {
    res.status(500).json({ message: 'Server error completing task', error: error.message });
  }
};

export const createGuestCleaningRequest = async (req, res) => {
  try {
    const { roomId, notes, priority = 'Medium' } = req.body;
    const requestedById = req.user.id;
    const hotelId = req.user.hotelId;
    const io = req.io;

    if (!roomId) {
      return res.status(400).json({ message: 'Room ID is required' });
    }

    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    // Check for existing pending request
    const existingRequest = await CleaningRequest.findOne({
      roomId,
      status: { $in: ['pending', 'in-progress'] },
      hotelId
    });
    
    if (existingRequest) {
      return res.status(400).json({
        message: 'A cleaning request already exists for this room.'
      });
    }

    // Create request WITHOUT assigning cleaner
    const request = new CleaningRequest({
      hotelId,
      roomId,
      requestedBy: requestedById,
      notes,
      priority,
      estimatedDuration: '30 min',
      status: 'pending',
      // assignedCleaner will be null until a cleaner accepts
    });

    const createdRequest = await request.save();
    await Room.findByIdAndUpdate(roomId, { status: 'cleaning' });
    await emitUpdatedTasks(io, hotelId);
    
    res.status(201).json(createdRequest);
  } catch (error) {
    res.status(500).json({ message: 'Server error creating request', error: error.message });
  }
};

// Get all unassigned cleaning requests (for cleaners to see available tasks)
export const getUnassignedRequests = async (req, res) => {
  try {
    const hotelId = req.user.hotelId;

    const requests = await CleaningRequest.find({
      hotelId,
      status: 'pending',
      assignedCleaner: null, // Only unassigned requests
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
      .sort({ priority: -1, createdAt: 1 }); // High priority first, then oldest first

    res.status(200).json(requests);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching unassigned requests', error: error.message });
  }
};

// Cleaner accepts (self-assigns) a cleaning request
export const acceptCleaningRequest = async (req, res) => {
  try {
    const { id: requestId } = req.params;
    const cleanerId = req.user.id;
    const hotelId = req.user.hotelId;
    const io = req.io;

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({ message: 'Invalid request ID' });
    }

    const request = await CleaningRequest.findOne({ 
      _id: requestId, 
      hotelId 
    });

    if (!request) {
      return res.status(404).json({ message: 'Cleaning request not found' });
    }

    if (request.assignedCleaner) {
      return res.status(400).json({ message: 'This request has already been assigned to another cleaner' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'This request is no longer available' });
    }

    // Assign the cleaner and start the task
    request.assignedCleaner = cleanerId;
    request.status = 'in-progress';
    request.startTime = new Date();

    const updatedRequest = await request.save();
    await emitUpdatedTasks(io, hotelId);

    // Populate the response
    const populatedRequest = await CleaningRequest.findById(updatedRequest._id)
      .populate({
        path: 'roomId',
        select: 'roomNumber status',
        populate: {
          path: 'roomTypeId',
          select: 'name'
        }
      })
      .populate('assignedCleaner', 'firstName lastName email')
      .populate('requestedBy', 'firstName lastName');

    res.status(200).json({ 
      message: 'Request accepted and started', 
      request: populatedRequest 
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error accepting request', error: error.message });
  }
};
// export const getMyTasks = async (req, res) => { // Renamed and updated query
//   try {
//     const cleanerId = req.user.id;
//     const tasks = await CleaningRequest.find({
//       assignedCleaner: cleanerId,
//       // Removed status filter to get all (pending, in-progress, completed)
//     })
//       .populate({
//         path: 'roomId',
//         select: 'roomNumber status',
//         populate: {
//           path: 'roomTypeId',
//           select: 'name',
//         },
//       })
//       .populate('requestedBy', 'firstName lastName')
//       .sort({ createdAt: 1 });
//     res.status(200).json(tasks);
//   } catch (error) {
//     res.status(500).json({ message: 'Server error fetching tasks', error: error.message });
//   }
// };

// export const startCleaningTask = async (req, res) => { // New
//   try {
//     const { id: requestId } = req.params;
//     const cleanerId = req.user.id;
//     const io = req.io;
//     if (!mongoose.Types.ObjectId.isValid(requestId)) {
//       return res.status(400).json({ message: 'Invalid request ID' });
//     }
//     const request = await CleaningRequest.findById(requestId);
//     if (!request) {
//       return res.status(404).json({ message: 'Cleaning request not found' });
//     }
//     if (request.assignedCleaner.toString() !== cleanerId) {
//       return res.status(403).json({ message: 'Not authorized to start this task' });
//     }
//     if (request.status !== 'pending') {
//       return res.status(400).json({ message: 'Task cannot be started. It is already in progress or completed.' });
//     }
//     request.status = 'in-progress';
//     const updatedRequest = await request.save();
//     await emitUpdatedTasks(io, request.hotelId);
//     res.status(200).json({ message: 'Task started', request: updatedRequest });
//   } catch (error) {
//     res.status(500).json({ message: 'Server error starting task', error: error.message });
//   }
// };

// export const completeCleaningTask = async (req, res) => {
//   try {
//     const { id: requestId } = req.params;
//     const cleanerId = req.user.id;
//     const io = req.io;
//     if (!mongoose.Types.ObjectId.isValid(requestId)) {
//       return res.status(400).json({ message: 'Invalid request ID' });
//     }
//     const request = await CleaningRequest.findById(requestId);
//     if (!request) {
//       return res.status(404).json({ message: 'Cleaning request not found' });
//     }
//     if (request.assignedCleaner.toString() !== cleanerId) {
//       return res.status(403).json({ message: 'Not authorized to complete this task' });
//     }
//     if (request.status !== 'in-progress') {
//       return res.status(400).json({ message: 'Task must be in progress to complete' });
//     }
//     request.status = 'completed';
//     const updatedRequest = await request.save();
//     await Room.findByIdAndUpdate(request.roomId, { status: 'available' });
//     await emitUpdatedTasks(io, request.hotelId);
//     res.status(200).json({ message: 'Task marked as complete', request: updatedRequest });
//   } catch (error) {
//     res.status(500).json({ message: 'Server error completing task', error: error.message });
//   }
// };

// export const createCleaningRequest = async (req, res) => {
//   try {
//     const { roomId, assignedCleanerId, notes } = req.body;
//     const requestedById = req.user.id;
//     const hotelId = req.user.hotelId;
//     const io = req.io;

//     if (!roomId || !assignedCleanerId) {
//       return res.status(400).json({ message: 'Room ID and Cleaner ID are required' });
//     }

//     const room = await Room.findById(roomId);
//     if (!room) {
//       return res.status(404).json({ message: 'Room not found' });
//     }

//     // Check for existing pending request instead of status
//     const existingRequest = await CleaningRequest.findOne({ 
//       roomId, 
//       status: 'pending', 
//       hotelId 
//     });
//     if (existingRequest) {
//       return res.status(400).json({ 
//         message: 'A pending cleaning request already exists for this room.' 
//       });
//     }

//     // Optional: Validate room is in cleaning status
//     // if (room.status !== 'cleaning') {
//     //   return res.status(400).json({ message: 'Room must be in cleaning status to assign a cleaner.' });
//     // }

//     const request = new CleaningRequest({
//       hotelId,
//       roomId,
//       assignedCleaner: assignedCleanerId,
//       requestedBy: requestedById,
//       notes,
//       status: 'pending',
//     });
//     const createdRequest = await request.save();
//     // Set or confirm room status to cleaning (idempotent)
//     await Room.findByIdAndUpdate(roomId, { status: 'cleaning' });
//     await emitUpdatedTasks(io, hotelId);
//     res.status(201).json(createdRequest);
//   } catch (error) {
//     res.status(500).json({ message: 'Server error creating request', error: error.message });
//   }
// };

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

// export const completeCleaningTask = async (req, res) => {
//   try {
//     const { id: requestId } = req.params;
//     const cleanerId = req.user.id;
//     const io = req.io;

//     if (!mongoose.Types.ObjectId.isValid(requestId)) {
//       return res.status(400).json({ message: 'Invalid request ID' });
//     }

//     const request = await CleaningRequest.findById(requestId);
//     if (!request) {
//       return res.status(404).json({ message: 'Cleaning request not found' });
//     }

//     if (request.assignedCleaner.toString() !== cleanerId) {
//       return res.status(403).json({ message: 'Not authorized to complete this task' });
//     }

//     if (request.status === 'completed') {
//       return res.status(400).json({ message: 'Task is already marked as completed' });
//     }

//     request.status = 'completed';
//     const updatedRequest = await request.save();
//     await Room.findByIdAndUpdate(request.roomId, { status: 'available' });
//     await emitUpdatedTasks(io, request.hotelId);
//     res.status(200).json({ message: 'Task marked as complete', request: updatedRequest });
//   } catch (error) {
//     res.status(500).json({ message: 'Server error completing task', error: error.message });
//   }
// };

// export const getHotelCleaningRequests = async (req, res) => {
//   try {
//     const hotelId = req.user.hotelId;

//     const requests = await CleaningRequest.find({ hotelId })
//       .populate({
//         path: 'roomId',
//         select: 'roomNumber status',
//         populate: {
//           path: 'roomTypeId',
//           select: 'name'
//         }
//       })
//       .populate('assignedCleaner', 'firstName lastName email')
//       .populate('requestedBy', 'firstName lastName email')
//       .sort({ createdAt: -1 });

//     res.status(200).json(requests);
//   } catch (error) {
//     res.status(500).json({ message: 'Server error fetching requests', error: error.message });
//   }
// };

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

export const getCleanerPerformanceMetrics = async (req, res) => {
  try {
    const cleanerId = req.user.id;
    const hotelId = req.user.hotelId;

    // Get all completed tasks for this cleaner
    const completedTasks = await CleaningRequest.find({
      assignedCleaner: cleanerId,
      hotelId,
      status: 'completed',
    })
      .populate({
        path: 'roomId',
        select: 'roomNumber status',
        populate: {
          path: 'roomTypeId',
          select: 'name',
        },
      })
      .populate('requestedBy', 'firstName lastName')
      .sort({ finishTime: -1 });

    // Get current date info
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Calculate tasks this month
    const tasksThisMonth = completedTasks.filter(task => {
      const taskDate = new Date(task.finishTime);
      return taskDate.getMonth() === currentMonth && taskDate.getFullYear() === currentYear;
    }).length;

    // Calculate tasks last month
    const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    const tasksLastMonth = completedTasks.filter(task => {
      const taskDate = new Date(task.finishTime);
      return taskDate.getMonth() === lastMonth && taskDate.getFullYear() === lastMonthYear;
    }).length;

    // Calculate average rating
    const tasksWithRatings = completedTasks.filter(task => task.rating && task.rating > 0);
    const averageRating = tasksWithRatings.length > 0
      ? Number((tasksWithRatings.reduce((sum, task) => sum + (task.rating || 0), 0) / tasksWithRatings.length).toFixed(1))
      : 0;

    // Calculate average time per task (this month)
    const thisMonthTasks = completedTasks.filter(task => {
      const taskDate = new Date(task.finishTime);
      return taskDate.getMonth() === currentMonth && taskDate.getFullYear() === currentYear;
    });
    const avgTimePerTask = thisMonthTasks.length > 0
      ? Math.round(thisMonthTasks.reduce((sum, task) => sum + (task.actualDuration || 0), 0) / thisMonthTasks.length)
      : 0;

    // Calculate previous month's average time
    const lastMonthTasks = completedTasks.filter(task => {
      const taskDate = new Date(task.finishTime);
      return taskDate.getMonth() === lastMonth && taskDate.getFullYear() === lastMonthYear;
    });
    const previousAvgTime = lastMonthTasks.length > 0
      ? Math.round(lastMonthTasks.reduce((sum, task) => sum + (task.actualDuration || 0), 0) / lastMonthTasks.length)
      : 0;

    // Calculate efficiency score (based on speed and rating)
    const efficiencyScore = averageRating > 0 && avgTimePerTask > 0
      ? Math.min(100, Math.round(((averageRating / 5) * 50) + ((100 - (avgTimePerTask / 60) * 100) * 0.5)))
      : 0;

    // Get all cleaners for percentile calculation
    const allCleaners = await User.find({ hotelId, role: 'cleaner' }).select('_id');
    const cleanerIds = allCleaners.map(c => c._id);
    
    // Calculate percentile (simplified - based on tasks completed this month)
    const cleanerTaskCounts = await Promise.all(
      cleanerIds.map(async (id) => {
        const count = await CleaningRequest.countDocuments({
          assignedCleaner: id,
          hotelId,
          status: 'completed',
          finishTime: {
            $gte: new Date(currentYear, currentMonth, 1),
            $lt: new Date(currentYear, currentMonth + 1, 1)
          }
        });
        return count;
      })
    );
    const betterThan = cleanerTaskCounts.filter(count => count < tasksThisMonth).length;
    const percentile = cleanerIds.length > 1 
      ? Math.round((betterThan / (cleanerIds.length - 1)) * 100)
      : 100;

    // Monthly data for last 6 months
    const monthlyData = [];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    for (let i = 5; i >= 0; i--) {
      const monthDate = new Date(currentYear, currentMonth - i, 1);
      const month = monthDate.getMonth();
      const year = monthDate.getFullYear();
      
      const monthTasks = completedTasks.filter(task => {
        const taskDate = new Date(task.finishTime);
        return taskDate.getMonth() === month && taskDate.getFullYear() === year;
      });
      
      const monthRating = monthTasks.filter(t => t.rating).length > 0
        ? Number((monthTasks.filter(t => t.rating).reduce((sum, t) => sum + (t.rating || 0), 0) / monthTasks.filter(t => t.rating).length).toFixed(1))
        : 0;
      
      monthlyData.push({
        month: monthNames[month],
        completed: monthTasks.length,
        rating: monthRating,
      });
    }

    // Task type distribution
    const taskTypeCounts = {};
    completedTasks.forEach(task => {
      const typeName = task.roomId?.roomTypeId?.name || 'Standard';
      taskTypeCounts[typeName] = (taskTypeCounts[typeName] || 0) + 1;
    });

    const colorMap = {
      'Standard': 'hsl(var(--info))',
      'Deluxe': 'hsl(var(--primary))',
      'Suite': 'hsl(var(--success))',
      'Presidential': 'hsl(var(--warning))',
    };

    const taskTypeData = Object.entries(taskTypeCounts).map(([name, value]) => ({
      name,
      value,
      color: colorMap[name] || 'hsl(var(--secondary))',
    }));

    // Performance metrics (calculated based on various factors)
    const speedScore = avgTimePerTask > 0 ? Math.max(0, Math.min(100, 100 - (avgTimePerTask - 20))) : 0;
    const qualityScore = Math.round((averageRating / 5) * 100);
    const consistencyScore = tasksThisMonth > 0 && tasksLastMonth > 0
      ? Math.min(100, Math.round((Math.min(tasksThisMonth, tasksLastMonth) / Math.max(tasksThisMonth, tasksLastMonth)) * 100))
      : tasksThisMonth > 0 ? 80 : 0;
    const attentionScore = tasksWithRatings.filter(t => t.rating >= 4).length > 0
      ? Math.round((tasksWithRatings.filter(t => t.rating >= 4).length / tasksWithRatings.length) * 100)
      : 0;

    const performanceMetrics = [
      { metric: 'Speed', score: speedScore },
      { metric: 'Quality', score: qualityScore },
      { metric: 'Consistency', score: consistencyScore },
      { metric: 'Attention to Detail', score: attentionScore },
    ];

    // Weekly productivity (last 7 days)
    const weeklyProductivity = [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dayStart = new Date(date.setHours(0, 0, 0, 0));
      const dayEnd = new Date(date.setHours(23, 59, 59, 999));
      
      const dayTasks = completedTasks.filter(task => {
        const taskDate = new Date(task.finishTime);
        return taskDate >= dayStart && taskDate <= dayEnd;
      });
      
      const avgTime = dayTasks.length > 0
        ? Math.round(dayTasks.reduce((sum, t) => sum + (t.actualDuration || 0), 0) / dayTasks.length)
        : 0;
      
      weeklyProductivity.push({
        day: dayNames[date.getDay()],
        tasks: dayTasks.length,
        avgTime,
      });
    }

    // Achievements
    const achievements = [
      {
        title: 'Speed Demon',
        description: 'Complete 100 tasks in record time',
        icon: 'Clock',
        achieved: completedTasks.length >= 100 && avgTimePerTask <= 30,
        progress: completedTasks.length,
        target: 100,
      },
      {
        title: 'Perfectionist',
        description: 'Maintain 5-star rating for 30 days',
        icon: 'Star',
        achieved: averageRating >= 4.8 && thisMonthTasks.length >= 20,
        progress: Math.round(averageRating * 20),
        target: 100,
      },
      {
        title: 'Team Player',
        description: 'Help colleagues with 50 tasks',
        icon: 'Award',
        achieved: false, // This would need additional tracking
        progress: 0,
        target: 50,
      },
      {
        title: 'Early Bird',
        description: 'Start 50 tasks before scheduled time',
        icon: 'TrendingUp',
        achieved: false, // This would need additional tracking
        progress: 0,
        target: 50,
      },
      {
        title: 'Consistency King',
        description: 'Work 30 consecutive days',
        icon: 'Target',
        achieved: false, // Would need day-by-day tracking
        progress: weeklyProductivity.filter(d => d.tasks > 0).length,
        target: 30,
      },
      {
        title: 'Master Cleaner',
        description: 'Complete 500 tasks',
        icon: 'CheckCircle',
        achieved: completedTasks.length >= 500,
        progress: completedTasks.length,
        target: 500,
      },
    ];

    // Compile response
    const performanceData = {
      keyMetrics: {
        tasksThisMonth,
        tasksLastMonth,
        averageRating,
        avgTimePerTask,
        previousAvgTime,
        efficiencyScore,
        percentile,
      },
      monthlyData,
      taskTypeData,
      performanceMetrics,
      weeklyProductivity,
      achievements,
    };

    res.status(200).json(performanceData);
  } catch (error) {
    console.error('Error fetching performance metrics:', error);
    res.status(500).json({ 
      message: 'Server error fetching performance metrics', 
      error: error.message 
    });
  }
};

export const getCleanerDashboardOverview = async (req, res) => {
  try {
    const cleanerId = req.user.id;
    const hotelId = req.user.hotelId;

    // Get current date boundaries
    const now = new Date();
    const todayStart = new Date(now.setHours(0, 0, 0, 0));
    const todayEnd = new Date(now.setHours(23, 59, 59, 999));
    
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const yesterdayEnd = new Date(todayEnd);
    yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);

    // Get current month boundaries
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const currentMonthStart = new Date(currentYear, currentMonth, 1);
    const currentMonthEnd = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999);

    // Get last month boundaries
    const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    const lastMonthStart = new Date(lastMonthYear, lastMonth, 1);
    const lastMonthEnd = new Date(lastMonthYear, lastMonth + 1, 0, 23, 59, 59, 999);

    // Fetch all tasks for the cleaner
    const allTasks = await CleaningRequest.find({
      assignedCleaner: cleanerId,
      hotelId,
    })
      .populate({
        path: 'roomId',
        select: 'roomNumber status',
        populate: {
          path: 'roomTypeId',
          select: 'name',
        },
      })
      .populate('requestedBy', 'firstName lastName')
      .sort({ createdAt: -1 });

    // ============ TODAY'S STATS ============
    
    // Tasks today (any status)
    const tasksToday = allTasks.filter(task => {
      const taskDate = new Date(task.createdAt);
      return taskDate >= todayStart && taskDate <= todayEnd;
    });

    const completedToday = tasksToday.filter(task => 
      task.status === 'completed' && 
      task.finishTime && 
      new Date(task.finishTime) >= todayStart && 
      new Date(task.finishTime) <= todayEnd
    ).length;

    const pendingToday = tasksToday.filter(task => task.status === 'pending').length;
    const inProgressToday = tasksToday.filter(task => task.status === 'in-progress').length;

    // Completed yesterday for comparison
    const completedYesterday = allTasks.filter(task => 
      task.status === 'completed' && 
      task.finishTime && 
      new Date(task.finishTime) >= yesterdayStart && 
      new Date(task.finishTime) <= yesterdayEnd
    ).length;

    // Priority breakdown for pending tasks
    const pendingTasks = allTasks.filter(task => task.status === 'pending');
    const urgentCount = pendingTasks.filter(task => task.priority === 'High').length;
    const standardCount = pendingTasks.filter(task => task.priority !== 'High').length;

    // ============ PERFORMANCE SCORE ============
    
    // Current month completed tasks
    const currentMonthTasks = allTasks.filter(task => {
      const finishDate = task.finishTime ? new Date(task.finishTime) : null;
      return task.status === 'completed' && 
             finishDate && 
             finishDate >= currentMonthStart && 
             finishDate <= currentMonthEnd;
    });

    // Last month completed tasks
    const lastMonthTasks = allTasks.filter(task => {
      const finishDate = task.finishTime ? new Date(task.finishTime) : null;
      return task.status === 'completed' && 
             finishDate && 
             finishDate >= lastMonthStart && 
             finishDate <= lastMonthEnd;
    });

    // Calculate current month performance score
    const currentMonthRatings = currentMonthTasks.filter(task => task.rating).map(task => task.rating);
    const currentAvgRating = currentMonthRatings.length > 0
      ? currentMonthRatings.reduce((sum, rating) => sum + rating, 0) / currentMonthRatings.length
      : 0;

    const currentAvgTime = currentMonthTasks.length > 0
      ? currentMonthTasks.reduce((sum, task) => sum + (task.actualDuration || 0), 0) / currentMonthTasks.length
      : 0;

    // Performance score (0-100): 60% quality + 40% speed
    const qualityScore = currentAvgRating > 0 ? (currentAvgRating / 5) * 60 : 0;
    const speedScore = currentAvgTime > 0 ? Math.max(0, (60 - currentAvgTime) / 60 * 40) : 0;
    const performanceScore = Math.round(qualityScore + speedScore);

    // Calculate last month performance score for comparison
    const lastMonthRatings = lastMonthTasks.filter(task => task.rating).map(task => task.rating);
    const lastAvgRating = lastMonthRatings.length > 0
      ? lastMonthRatings.reduce((sum, rating) => sum + rating, 0) / lastMonthRatings.length
      : 0;

    const lastAvgTime = lastMonthTasks.length > 0
      ? lastMonthTasks.reduce((sum, task) => sum + (task.actualDuration || 0), 0) / lastMonthTasks.length
      : 0;

    const lastQualityScore = lastAvgRating > 0 ? (lastAvgRating / 5) * 60 : 0;
    const lastSpeedScore = lastAvgTime > 0 ? Math.max(0, (60 - lastAvgTime) / 60 * 40) : 0;
    const previousMonthScore = Math.round(lastQualityScore + lastSpeedScore);

    // ============ WEEKLY DATA ============
    
    const weeklyData = [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dayStart = new Date(date.setHours(0, 0, 0, 0));
      const dayEnd = new Date(date.setHours(23, 59, 59, 999));
      
      const dayTasks = allTasks.filter(task => {
        const taskDate = new Date(task.createdAt);
        return taskDate >= dayStart && taskDate <= dayEnd;
      });
      
      const completed = dayTasks.filter(task => 
        task.status === 'completed' && 
        task.finishTime && 
        new Date(task.finishTime) >= dayStart && 
        new Date(task.finishTime) <= dayEnd
      ).length;
      
      const pending = dayTasks.filter(task => task.status === 'pending').length;
      const inProgress = dayTasks.filter(task => task.status === 'in-progress').length;
      
      weeklyData.push({
        day: dayNames[date.getDay()],
        completed,
        pending,
        inProgress,
      });
    }

    // ============ PERFORMANCE TREND (Last 6 months) ============
    
    const performanceData = [];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    for (let i = 5; i >= 0; i--) {
      const monthDate = new Date(currentYear, currentMonth - i, 1);
      const month = monthDate.getMonth();
      const year = monthDate.getFullYear();
      
      const monthStart = new Date(year, month, 1);
      const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
      
      const monthTasks = allTasks.filter(task => {
        const finishDate = task.finishTime ? new Date(task.finishTime) : null;
        return task.status === 'completed' && 
               finishDate && 
               finishDate >= monthStart && 
               finishDate <= monthEnd;
      });
      
      const monthRatings = monthTasks.filter(task => task.rating).map(task => task.rating);
      const avgRating = monthRatings.length > 0
        ? monthRatings.reduce((sum, rating) => sum + rating, 0) / monthRatings.length
        : 0;

      const avgTime = monthTasks.length > 0
        ? monthTasks.reduce((sum, task) => sum + (task.actualDuration || 0), 0) / monthTasks.length
        : 0;

      const monthQualityScore = avgRating > 0 ? (avgRating / 5) * 60 : 0;
      const monthSpeedScore = avgTime > 0 ? Math.max(0, (60 - avgTime) / 60 * 40) : 0;
      const score = Math.round(monthQualityScore + monthSpeedScore);
      
      performanceData.push({
        month: monthNames[month],
        score: score || 0,
      });
    }

    // ============ URGENT TASKS ============
    
    const urgentTasks = pendingTasks
      .filter(task => task.priority === 'High')
      .slice(0, 5) // Get top 5 urgent tasks
      .map(task => ({
        _id: task._id,
        room: `Room ${task.roomId?.roomNumber || 'Unknown'}`,
        roomNumber: task.roomId?.roomNumber || 'Unknown',
        type: task.roomId?.roomTypeId?.name || 'Standard Clean',
        priority: task.priority,
        estimatedStartTime: task.estimatedStartTime || null,
        createdAt: task.createdAt,
        notes: task.notes,
      }));

    // ============ COMPILE RESPONSE ============
    
    const dashboardData = {
      stats: {
        tasksToday: tasksToday.length,
        completedToday,
        pendingToday,
        inProgressToday,
        completedYesterday,
        performanceScore,
        previousMonthScore,
        urgentCount,
        standardCount,
      },
      weeklyData,
      performanceData,
      urgentTasks,
    };

    res.status(200).json(dashboardData);
  } catch (error) {
    console.error('Error fetching dashboard overview:', error);
    res.status(500).json({ 
      message: 'Server error fetching dashboard overview', 
      error: error.message 
    });
  }
};

export const getAllCleaningRequestsInHotel = async (req, res) => {
    try {
        const loggedInUserHotelId = req.user.hotelId;

        if (!loggedInUserHotelId) {
            return res.status(400).json({ 
                success: false, 
                message: "Logged-in user is not associated with a specific hotel." 
            });
        }

        const cleaningRequests = await CleaningRequest.find({ 
            hotelId: loggedInUserHotelId 
        })
        .populate('roomId', 'roomNumber floor')
        .populate('assignedCleaner', 'firstName lastName')
        .populate('requestedBy', 'firstName lastName role')
        .sort({ createdAt: -1 });

        res.status(200).json({ success: true, data: cleaningRequests });

    } catch (error) {
        console.error("Error in getAllCleaningRequestsInHotel:", error.message);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
};

export const getHotelCleaningRequests = async (req, res) => {
  try {
    const userRole = req.user.role;
    const userHotelId = req.user.hotelId;
    
    // Query parameters from frontend
    const { hotelId, all } = req.query;
    
    let filter = {};

    // Logic for SuperAdmin vs Admin/Staff
    if (userRole === 'superadmin') {
      if (all === 'true') {
        // No filter on hotelId -> Get ALL requests
        filter = {};
      } else if (hotelId) {
        // Filter by specific hotel requested by frontend
        filter = { hotelId };
      } else {
        // Default fallback (optional): Maybe return all or nothing? 
        // Let's default to all for superadmin if nothing specified
        filter = {};
      }
    } else {
      // Regular Admin/Staff: STRICTLY force their own hotelId
      filter = { hotelId: userHotelId };
    }

    const requests = await CleaningRequest.find(filter)
      .populate({
        path: 'roomId',
        select: 'roomNumber status',
        populate: {
          path: 'roomTypeId',
          select: 'name'
        }
      })
      // Populate Hotel info so we can display it in the UI
      .populate('hotelId', 'name') 
      .populate('assignedCleaner', 'firstName lastName email')
      .populate('requestedBy', 'firstName lastName email')
      .sort({ createdAt: -1 });

    res.status(200).json(requests);
  } catch (error) {
    console.error("Error fetching requests:", error);
    res.status(500).json({ message: 'Server error fetching requests', error: error.message });
  }
};

