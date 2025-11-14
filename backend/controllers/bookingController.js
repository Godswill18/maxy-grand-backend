// backend/controllers/bookingController.js
import Booking from '../models/bookingModel.js';
import Room from '../models/roomModel.js';
import { generateConfirmationCode } from '../lib/utils/codeGenerator.js';
import RoomType from '../models/roomTypeModel.js';

// Helper function to get a fully populated booking
const getPopulatedBooking = async (id) => {
  return await Booking.findById(id)
    .populate('hotelId', 'name')
    .populate({
        path: 'roomId',
        select: 'roomNumber', // Just get the room number
        populate: {
            path: 'roomTypeId', // Get room type info
            select: 'name price'
        }
    })
    .populate('guestId', 'firstName lastName email');
};



/**
 * @desc Create a new booking (online or in-person)
 * @route POST /api/bookings/create
 */
export const createBooking = async (req, res) => {
  try {
    const user = req.user;
    const {
      hotelId,
      roomId, 
      guestName,
      guestEmail,
      guestPhone,
      checkInDate,
      checkOutDate,
      bookingType,
      totalAmount,
      amountPaid,
    } = req.body;

    // 1️⃣ Validate input dates
    if (new Date(checkOutDate) <= new Date(checkInDate)) {
      return res.status(400).json({ success: false, error: 'Check-out date must be after check-in date' });
    }

    // 2️⃣ Find the specific room
    // console.log('BookingController: Looking for room with ID:', roomId);
    const room = await Room.findById(roomId);
    // console.log('BookingController: Found room:', room);
    if (!room) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }

    // 3️⃣ ⭐️ --- NEW AVAILABILITY LOGIC --- ⭐️
    // Check for any bookings for this room that conflict with the requested dates.
    // An overlap exists if:
    // (Existing Check-in < New Check-out) AND (Existing Check-out > New Check-in)
    const conflictingBooking = await Booking.findOne({
      roomId: roomId,
      bookingStatus: { $in: ['confirmed', 'checked-in'] }, // Only check active bookings
      $and: [
        { checkInDate: { $lt: new Date(checkOutDate) } },
        { checkOutDate: { $gt: new Date(checkInDate) } },
      ]
    });

    if (conflictingBooking) {
      return res.status(400).json({
        success: false,
        error: `Room ${room.roomNumber} is already booked from ${new Date(conflictingBooking.checkInDate).toLocaleDateString()} to ${new Date(conflictingBooking.checkOutDate).toLocaleDateString()}`,
      });
    }
    // ⭐️ --- END NEW LOGIC --- ⭐️

    // 4️⃣ Determine guest type
    const guestId = bookingType === 'online' ? user._id : null;

    // 5️⃣ Determine payment status
    let paymentStatus = 'pending';
    if (amountPaid >= totalAmount) paymentStatus = 'paid';
    else if (amountPaid > 0) paymentStatus = 'partial';

    let confirmationCode = '';
    let isCodeUnique = false;
    while (!isCodeUnique) {
      confirmationCode = generateConfirmationCode(6); // Generate a 6-char code
      const existingBooking = await Booking.findOne({ confirmationCode });
      if (!existingBooking) {
        isCodeUnique = true;
      }
    }

    // 6️⃣ Create booking record (using 'roomId')
    const booking = new Booking({
      hotelId,
      roomId, // <-- FIX: Save 'roomId'
      guestId,
      guestName,
      guestEmail,
      guestPhone,
      checkInDate,
      checkOutDate,
      bookingType,
      totalAmount,
      amountPaid,
      paymentStatus,
      bookingStatus: 'confirmed',
      confirmationCode: confirmationCode
    });

    const savedBooking = await booking.save();

    // 7️⃣ Update room status ONLY if it's currently 'available'
    // This booking is for the future, but we mark it as 'reserved'
    // so a walk-in can't take it right now.
    // Your check-in logic will handle changing it to 'occupied'.
    if (room.status === 'available') {
        room.status = 'reserved';
        await room.save();
    }
    // NOTE: We DO NOT set room.currentBookingId here.
    // That should only be set when the guest *actually checks in*.
    // The `updateBookingStatus` function handles this.

    // --- Socket.io Emit ---
    const populatedBooking = await getPopulatedBooking(savedBooking._id);
    req.io.emit('bookingCreated', populatedBooking);
    
    // ✅ Notify all connected clients that reports should refresh
    // io.emit('report:update'); // 'io' is not defined here, use req.io

    return res.status(201).json({
      success: true,
      message: 'Booking created successfully',
      data: populatedBooking,
    });
  } catch (error) {
    console.error('Error creating booking:', error.message);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * @desc Get all bookings (Admin/Receptionist)
 * @route GET /api/bookings/all
 */
export const getAllBookings = async (req, res) => {
  try {
    // const user = req.user;
    // if (!user || (user.role !== 'admin' && user.role !== 'receptionist' && user.role !== 'superadmin')) {
    //   return res.status(403).json({ success: false, error: 'Forbidden — Authorized personnel only' });
    // }

    const bookings = await Booking.find()
      .populate('hotelId', 'name')
      .populate('roomTypeId', 'roomNumber')
      .populate('guestId', 'fullName email')
      .sort({ createdAt: -1 }); // Sort by newest first

    return res.status(200).json({ success: true, data: bookings });
  } catch (error) {
    console.error('Error fetching bookings:', error.message);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * @desc Get single booking by ID
 * @route GET /api/bookings/:id
 */
export const getBookingById = async (req, res) => {
  try {
    const booking = await getPopulatedBooking(req.params.id);
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' });

    return res.status(200).json({ success: true, data: booking });
  } catch (error) {
    console.error('Error fetching booking:', error.message);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * @desc Update booking status (Admin/Receptionist)
 * @route PATCH /api/bookings/:id/status
 */
export const updateBookingStatus = async (req, res) => {
  try {
    const { bookingStatus, paymentStatus, amountPaid } = req.body;
    const booking = await Booking.findById(req.params.id);

    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' });

    // Update values
    if (bookingStatus) booking.bookingStatus = bookingStatus;
    if (paymentStatus) booking.paymentStatus = paymentStatus;
    if (amountPaid !== undefined) booking.amountPaid = amountPaid;

    // Update room status
    const room = await Room.findById(booking.roomId); // <-- FIX: use roomId
    if (room) {
      if (bookingStatus === 'checked-out' || bookingStatus === 'cancelled') {
        room.status = 'cleaning'; // <-- Better than 'available'
        room.currentBookingId = null;
      }
      if (bookingStatus === 'checked-in') {
        room.status = 'occupied';
        room.currentBookingId = booking._id; // <-- SET current booking
      }
      if (bookingStatus === 'confirmed') {
        room.status = 'reserved'; // <-- FIX: 'confirmed' is 'reserved', not 'occupied'
      }
      await room.save();
    }

    const updatedBooking = await booking.save();
    const populatedBooking = await getPopulatedBooking(updatedBooking._id);
    req.io.emit('bookingUpdated', populatedBooking);

    return res.status(200).json({
      success: true,
      message: 'Booking status updated successfully',
      data: populatedBooking,
    });
  } catch (error) {
    console.error('Error updating booking:', error.message);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * @desc Delete booking (Admin/Receptionist)
 * @route DELETE /api/bookings/:id
 */
export const deleteBooking = async (req, res) => {
  try {
    const user = req.user;
    if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
      return res.status(403).json({ success: false, error: 'Forbidden — Admin only' });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' });

    const bookingId = booking._id; // Save ID for emit

    // Free up the room
    const room = await Room.findById(booking.roomTypeId);
    if (room && room.currentBookingId?.toString() === bookingId.toString()) {
      room.status = 'available';
      room.bookedBy = null;
      room.checkInDate = null;
      room.checkOutDate = null;
      room.currentBookingId = null;
      await room.save();
    }

    await booking.deleteOne();

    // --- Socket.io Emit ---
    req.io.emit('bookingDeleted', bookingId);
    // --- End Emit ---

    return res.status(200).json({ success: true, message: 'Booking deleted successfully' });
  } catch (error)
 {
    console.error('Error deleting booking:', error.message);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * @desc Get all bookings for a specific user
 * @route GET /api/bookings/user/:userId
 */
export const getUserBookings = async (req, res) => {
  try {
    const userId = req.params.userId;
    const bookings = await Booking.find({ guestId: userId })
      .populate('hotelId', 'name')
      .populate('roomTypeId', 'roomNumber');

    return res.status(200).json({ success: true, data: bookings });
  } catch (error) {
    console.error('Error fetching user bookings:', error.message);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * @desc Checkout a room (alternative to updateBookingStatus)
 * @route PUT /api/bookings/checkout/:roomTypeId
 */
export const checkoutRoom = async (req, res) => {
  try {
    const { roomTypeId } = req.params;

    // 1️⃣ Find room
    const room = await Room.findById(roomTypeId);
    if (!room) return res.status(404).json({ success: false, error: 'Room not found' });
    if (!room.currentBookingId)
      return res.status(400).json({ success: false, error: 'No active booking for this room' });

    // 2️⃣ Update booking status
    const booking = await Booking.findById(room.currentBookingId);
    if (booking) {
      booking.bookingStatus = 'checked-out';
      await booking.save();
      
      // --- Socket.io Emit ---
      const populatedBooking = await getPopulatedBooking(booking._id);
      req.io.emit('bookingUpdated', populatedBooking);
      // --- End Emit ---
    }

    // 3️⃣ Reset room
    room.status = 'cleaning'; // or 'available', depending on your process
    room.currentBookingId = null;
    room.bookedBy = null;
    room.checkInDate = null;
    room.checkOutDate = null;
    await room.save();

    return res.status(200).json({
      success: true,
      message: 'Room checked out successfully',
      data: {
        roomTypeId: room._id,
        bookingId: booking ? booking._id : null,
        status: room.status,
      },
    });
  } catch (error) {
    console.error('Error checking out room:', error.message);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};