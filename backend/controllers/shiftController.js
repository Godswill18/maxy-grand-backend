import Shift from '../models/shiftModel.js';
import User from '../models/userModel.js';

/**
 * @desc Create a new shift for a staff member (uses Nigerian time)
 * @route POST /api/shifts
 * @access Private (Admin, SuperAdmin)
 */
export const createShift = async (req, res) => {
    try {
        const { userId, hotelId, startDate, startTime, endDate, endTime, shiftType, notes } = req.body;
        const createdBy = req.user._id;

        // Validate required fields
        if (!userId || !hotelId || !startDate || !startTime || !endDate || !endTime) {
            return res.status(400).json({
                success: false,
                error: 'Please provide userId, hotelId, startDate, startTime, endDate, and endTime',
            });
        }

        // Check if user is admin and verify hotelId matches
        if (req.user.role === 'admin' && req.user.hotelId.toString() !== hotelId) {
            return res.status(403).json({
                success: false,
                error: 'You can only create shifts for staff in your hotel',
            });
        }

        // Verify the staff member exists and belongs to the hotel
        const staffMember = await User.findById(userId);
        if (!staffMember) {
            return res.status(404).json({
                success: false,
                error: 'Staff member not found',
            });
        }

        // For staff roles, verify they belong to the hotel
        if (staffMember.role !== 'superadmin' && staffMember.role !== 'guest') {
            if (staffMember.hotelId && staffMember.hotelId.toString() !== hotelId) {
                return res.status(400).json({
                    success: false,
                    error: 'Staff member does not belong to this hotel',
                });
            }
        }

        // Validate dates
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        if (end < start) {
            return res.status(400).json({
                success: false,
                error: 'End date cannot be before start date',
            });
        }

        // Check for overlapping shifts for this user
        const overlappingShift = await Shift.findOne({
            userId,
            status: { $ne: 'cancelled' },
            $or: [
                // New shift starts during existing shift
                {
                    startDate: { $lte: start },
                    endDate: { $gte: start }
                },
                // New shift ends during existing shift
                {
                    startDate: { $lte: end },
                    endDate: { $gte: end }
                },
                // New shift completely contains existing shift
                {
                    startDate: { $gte: start },
                    endDate: { $lte: end }
                }
            ]
        });

        if (overlappingShift) {
            return res.status(400).json({
                success: false,
                error: 'This user already has an overlapping shift during this period',
            });
        }

        // Create the shift
        const shift = await Shift.create({
            userId,
            hotelId,
            startDate: new Date(startDate),
            startTime,
            endDate: new Date(endDate),
            endTime,
            shiftType: shiftType || 'custom',
            notes: notes || '',
            createdBy,
        });

        // Populate user and hotel details
        await shift.populate('userId', 'firstName lastName email role');
        await shift.populate('hotelId', 'name');
        await shift.populate('createdBy', 'firstName lastName');

        // Emit socket event
        if (req.io) {
            req.io.emit('shift:created', shift);
            req.io.emit(`hotel:${hotelId}:shift:created`, shift);
            req.io.emit(`user:${userId}:shift:created`, shift);
        }

        res.status(201).json({
            success: true,
            data: shift,
        });
    } catch (error) {
        console.error('Error in createShift:', error);
        res.status(500).json({
            success: false,
            error: 'Server error while creating shift',
        });
    }
};

/**
 * @desc Emergency activate a shift (allows staff to login immediately)
 * @route PUT /api/shifts/:id/activate
 * @access Private (Admin, SuperAdmin)
 */
export const emergencyActivateShift = async (req, res) => {
    try {
        const shift = await Shift.findById(req.params.id)
            .populate('userId', 'firstName lastName email role')
            .populate('hotelId', 'name');

        if (!shift) {
            return res.status(404).json({
                success: false,
                error: 'Shift not found',
            });
        }

        // Check permissions
        if (req.user.role === 'admin' && shift.hotelId._id.toString() !== req.user.hotelId.toString()) {
            return res.status(403).json({
                success: false,
                error: 'You can only activate shifts in your hotel',
            });
        }

        // Cannot activate cancelled shifts
        if (shift.status === 'cancelled') {
            return res.status(400).json({
                success: false,
                error: 'Cannot activate a cancelled shift',
            });
        }

        // Activate the shift
        await shift.activateEmergency(req.user._id);
        
        // Activate the user
        const user = await User.findById(shift.userId._id);
        if (user) {
            user.isActive = true;
            await user.save();
        }

        // Populate after save
        await shift.populate('emergencyActivatedBy', 'firstName lastName');

        // Emit socket events
        if (req.io) {
            req.io.emit('shift:activated', shift);
            req.io.emit(`hotel:${shift.hotelId._id}:shift:activated`, shift);
            req.io.emit(`user:${shift.userId._id}:shift:activated`, shift);
            req.io.emit(`user:${shift.userId._id}:status:changed`, {
                userId: shift.userId._id,
                isActive: true,
            });
        }

        res.status(200).json({
            success: true,
            data: shift,
            message: 'Shift activated successfully. Staff can now login.',
        });
    } catch (error) {
        console.error('Error in emergencyActivateShift:', error);
        res.status(500).json({
            success: false,
            error: 'Server error while activating shift',
        });
    }
};

/**
 * @desc Deactivate emergency activation
 * @route PUT /api/shifts/:id/deactivate
 * @access Private (Admin, SuperAdmin)
 */
export const deactivateEmergencyShift = async (req, res) => {
    try {
        const shift = await Shift.findById(req.params.id)
            .populate('userId', 'firstName lastName email role')
            .populate('hotelId', 'name');

        if (!shift) {
            return res.status(404).json({
                success: false,
                error: 'Shift not found',
            });
        }

        // Check permissions
        if (req.user.role === 'admin' && shift.hotelId._id.toString() !== req.user.hotelId.toString()) {
            return res.status(403).json({
                success: false,
                error: 'You can only deactivate shifts in your hotel',
            });
        }

        if (!shift.emergencyActivated) {
            return res.status(400).json({
                success: false,
                error: 'Shift is not emergency activated',
            });
        }

        // Deactivate
        await shift.deactivateEmergency();

        // Check if user should be deactivated
        if (!shift.isCurrentlyActive()) {
            const user = await User.findById(shift.userId._id);
            if (user) {
                user.isActive = false;
                await user.save();
            }
        }

        // Emit socket events
        if (req.io) {
            req.io.emit('shift:deactivated', shift);
            req.io.emit(`hotel:${shift.hotelId._id}:shift:deactivated`, shift);
            req.io.emit(`user:${shift.userId._id}:shift:deactivated`, shift);
        }

        res.status(200).json({
            success: true,
            data: shift,
            message: 'Emergency activation removed.',
        });
    } catch (error) {
        console.error('Error in deactivateEmergencyShift:', error);
        res.status(500).json({
            success: false,
            error: 'Server error while deactivating shift',
        });
    }
};

/**
 * @desc Get all shifts (filtered by role and hotel) - uses Nigerian time
 * @route GET /api/shifts
 * @access Private (Admin, SuperAdmin)
 */
export const getAllShifts = async (req, res) => {
    try {
        const { startDate, endDate, userId, hotelId, status } = req.query;
        
        let query = {};

        // Role-based filtering
        if (req.user.role === 'admin') {
            query.hotelId = req.user.hotelId;
        } else if (hotelId) {
            query.hotelId = hotelId;
        }

        // Additional filters
        if (userId) query.userId = userId;
        if (status) query.status = status;

        // Date range filter
        if (startDate || endDate) {
            query.$or = [];
            
            if (startDate && endDate) {
                // Get shifts that overlap with the date range
                const start = new Date(startDate);
                const end = new Date(endDate);
                
                query.$or = [
                    // Shift starts within range
                    { startDate: { $gte: start, $lte: end } },
                    // Shift ends within range
                    { endDate: { $gte: start, $lte: end } },
                    // Shift contains the entire range
                    { startDate: { $lte: start }, endDate: { $gte: end } }
                ];
            } else if (startDate) {
                query.endDate = { $gte: new Date(startDate) };
            } else if (endDate) {
                query.startDate = { $lte: new Date(endDate) };
            }
        }

        const shifts = await Shift.find(query)
            .populate('userId', 'firstName lastName email role phoneNumber')
            .populate('hotelId', 'name')
            .populate('createdBy', 'firstName lastName')
            .populate('emergencyActivatedBy', 'firstName lastName')
            .sort({ startDate: 1, startTime: 1 });

        res.status(200).json({
            success: true,
            count: shifts.length,
            data: shifts,
        });
    } catch (error) {
        console.error('Error in getAllShifts:', error);
        res.status(500).json({
            success: false,
            error: 'Server error while fetching shifts',
        });
    }
};

/**
 * @desc Get shifts for a specific user (staff member viewing their own schedule)
 * @route GET /api/shifts/my-schedule
 * @access Private (All authenticated users)
 */
export const getMySchedule = async (req, res) => {
    try {
        const userId = req.user._id;
        const { startDate, endDate, status } = req.query;

        let query = { userId };

        // Status filter
        if (status) query.status = status;

        // Date range filter (default to current month if not provided)
        if (startDate || endDate) {
            query.$or = [];
            
            if (startDate && endDate) {
                const start = new Date(startDate);
                const end = new Date(endDate);
                
                query.$or = [
                    { startDate: { $gte: start, $lte: end } },
                    { endDate: { $gte: start, $lte: end } },
                    { startDate: { $lte: start }, endDate: { $gte: end } }
                ];
            }
        } else {
            // Default to current month
            const now = Shift.getNigerianTime();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            
            query.$or = [
                { startDate: { $gte: startOfMonth, $lte: endOfMonth } },
                { endDate: { $gte: startOfMonth, $lte: endOfMonth } },
                { startDate: { $lte: startOfMonth }, endDate: { $gte: endOfMonth } }
            ];
        }

        const shifts = await Shift.find(query)
            .populate('hotelId', 'name')
            .populate('createdBy', 'firstName lastName')
            .populate('emergencyActivatedBy', 'firstName lastName')
            .sort({ startDate: 1, startTime: 1 });

        res.status(200).json({
            success: true,
            count: shifts.length,
            data: shifts,
        });
    } catch (error) {
        console.error('Error in getMySchedule:', error);
        res.status(500).json({
            success: false,
            error: 'Server error while fetching schedule',
        });
    }
};

/**
 * @desc Get a single shift by ID
 * @route GET /api/shifts/:id
 * @access Private
 */
export const getShiftById = async (req, res) => {
    try {
        const shift = await Shift.findById(req.params.id)
            .populate('userId', 'firstName lastName email role phoneNumber')
            .populate('hotelId', 'name')
            .populate('createdBy', 'firstName lastName')
            .populate('emergencyActivatedBy', 'firstName lastName');

        if (!shift) {
            return res.status(404).json({
                success: false,
                error: 'Shift not found',
            });
        }

        // Check access permissions
        if (
            req.user.role !== 'superadmin' &&
            req.user.role !== 'admin' &&
            shift.userId._id.toString() !== req.user._id.toString()
        ) {
            return res.status(403).json({
                success: false,
                error: 'Not authorized to view this shift',
            });
        }

        res.status(200).json({
            success: true,
            data: shift,
        });
    } catch (error) {
        console.error('Error in getShiftById:', error);
        res.status(500).json({
            success: false,
            error: 'Server error while fetching shift',
        });
    }
};

/**
 * @desc Update a shift
 * @route PUT /api/shifts/:id
 * @access Private (Admin, SuperAdmin)
 */
export const updateShift = async (req, res) => {
    try {
        const { startDate, startTime, endDate, endTime, shiftType, notes, status } = req.body;

        let shift = await Shift.findById(req.params.id);

        if (!shift) {
            return res.status(404).json({
                success: false,
                error: 'Shift not found',
            });
        }

        // Check if admin is updating shift in their hotel
        if (req.user.role === 'admin' && shift.hotelId.toString() !== req.user.hotelId.toString()) {
            return res.status(403).json({
                success: false,
                error: 'You can only update shifts in your hotel',
            });
        }

        // Update fields
        if (startDate) shift.startDate = new Date(startDate);
        if (startTime) shift.startTime = startTime;
        if (endDate) shift.endDate = new Date(endDate);
        if (endTime) shift.endTime = endTime;
        if (shiftType) shift.shiftType = shiftType;
        if (notes !== undefined) shift.notes = notes;
        if (status) shift.status = status;

        await shift.save();

        // Populate for response
        await shift.populate('userId', 'firstName lastName email role');
        await shift.populate('hotelId', 'name');
        await shift.populate('createdBy', 'firstName lastName');
        await shift.populate('emergencyActivatedBy', 'firstName lastName');

        // Emit socket event
        if (req.io) {
            req.io.emit('shift:updated', shift);
            req.io.emit(`hotel:${shift.hotelId._id}:shift:updated`, shift);
            req.io.emit(`user:${shift.userId._id}:shift:updated`, shift);
        }

        res.status(200).json({
            success: true,
            data: shift,
        });
    } catch (error) {
        console.error('Error in updateShift:', error);
        res.status(500).json({
            success: false,
            error: 'Server error while updating shift',
        });
    }
};

/**
 * @desc Delete a shift
 * @route DELETE /api/shifts/:id
 * @access Private (Admin, SuperAdmin)
 */
export const deleteShift = async (req, res) => {
    try {
        const shift = await Shift.findById(req.params.id);

        if (!shift) {
            return res.status(404).json({
                success: false,
                error: 'Shift not found',
            });
        }

        // Check if admin is deleting shift in their hotel
        if (req.user.role === 'admin' && shift.hotelId.toString() !== req.user.hotelId.toString()) {
            return res.status(403).json({
                success: false,
                error: 'You can only delete shifts in your hotel',
            });
        }

        await shift.deleteOne();

        // Emit socket event
        if (req.io) {
            req.io.emit('shift:deleted', { _id: shift._id });
            req.io.emit(`hotel:${shift.hotelId}:shift:deleted`, { _id: shift._id });
            req.io.emit(`user:${shift.userId}:shift:deleted`, { _id: shift._id });
        }

        res.status(200).json({
            success: true,
            message: 'Shift deleted successfully',
        });
    } catch (error) {
        console.error('Error in deleteShift:', error);
        res.status(500).json({
            success: false,
            error: 'Server error while deleting shift',
        });
    }
};

/**
 * @desc Check if user has an active shift right now (uses Nigerian time)
 * @route GET /api/shifts/check-active/:userId
 * @access Private
 */
export const checkActiveShift = async (req, res) => {
    try {
        const userId = req.params.userId;
        const now = Shift.getNigerianTime();

        // Find shifts that are currently active
        const activeShifts = await Shift.find({
            userId,
            startDate: { $lte: now },
            endDate: { $gte: now },
            status: { $in: ['scheduled', 'in-progress'] },
        });

        // Check if any shift is currently active
        let activeShift = null;
        for (const shift of activeShifts) {
            if (shift.isCurrentlyActive()) {
                activeShift = shift;
                break;
            }
        }

        res.status(200).json({
            success: true,
            hasActiveShift: !!activeShift,
            shift: activeShift,
        });
    } catch (error) {
        console.error('Error in checkActiveShift:', error);
        res.status(500).json({
            success: false,
            error: 'Server error while checking active shift',
        });
    }
};

/**
 * @desc Get shift statistics for a hotel (uses Nigerian time)
 * @route GET /api/shifts/stats/:hotelId
 * @access Private (Admin, SuperAdmin)
 */
export const getShiftStats = async (req, res) => {
    try {
        const hotelId = req.params.hotelId;

        // Check permissions
        if (req.user.role === 'admin' && req.user.hotelId.toString() !== hotelId) {
            return res.status(403).json({
                success: false,
                error: 'Not authorized to view these statistics',
            });
        }

        const now = Shift.getNigerianTime();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekStart = new Date(todayStart);
        weekStart.setDate(weekStart.getDate() - 7);

        const [totalShifts, todayShifts, weekShifts, activeShifts] = await Promise.all([
            Shift.countDocuments({ hotelId }),
            Shift.countDocuments({ 
                hotelId, 
                startDate: { $lte: now },
                endDate: { $gte: todayStart }
            }),
            Shift.countDocuments({ 
                hotelId, 
                startDate: { $gte: weekStart }
            }),
            Shift.countDocuments({ hotelId, isActive: true }),
        ]);

        res.status(200).json({
            success: true,
            data: {
                totalShifts,
                todayShifts,
                weekShifts,
                activeShifts,
            },
        });
    } catch (error) {
        console.error('Error in getShiftStats:', error);
        res.status(500).json({
            success: false,
            error: 'Server error while fetching statistics',
        });
    }
};