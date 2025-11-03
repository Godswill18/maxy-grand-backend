import Booking from '../models/bookingModel.js';
import Room from '../models/roomModel.js';

/**
 * @desc Create a new booking (online or in-person)
 * @route POST /api/bookings/create
 */
export const createBooking = async (req, res) => {
  try {
    const user = req.user; // Authenticated user (if online booking)
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

    // 1️⃣ Validate room
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }
    if (room.status !== 'available') {
      return res.status(400).json({ success: false, error: 'Room is not available' });
    }

    // 2️⃣ Determine guest type
    const guestId = bookingType === 'online' ? user._id : null;

    // 3️⃣ Determine payment status
    let paymentStatus = 'pending';
    if (amountPaid >= totalAmount) paymentStatus = 'paid';
    else if (amountPaid > 0) paymentStatus = 'partial';

    // 4️⃣ Create booking record
    const booking = new Booking({
      hotelId,
      roomId,
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
    });

    const savedBooking = await booking.save();

    // 5️⃣ Update room status
    room.status = 'occupied';
    room.bookedBy = guestId;
    room.checkInDate = checkInDate;
    room.checkOutDate = checkOutDate;
    room.isOnlineBooking = bookingType === 'online';
    room.currentBookingId = savedBooking._id; // 🔗 link current booking
    await room.save();

    return res.status(201).json({
      success: true,
      message: 'Booking created successfully',
      data: savedBooking,
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
    const user = req.user;
    if (!user || (user.role !== 'admin' && user.role !== 'receptionist' && user.role !== 'superadmin')) {
      return res.status(403).json({ success: false, error: 'Forbidden — Authorized personnel only' });
    }

    const bookings = await Booking.find()
      .populate('hotelId', 'name')
      .populate('roomId', 'roomNumber')
      .populate('guestId', 'fullName email');

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
    const booking = await Booking.findById(req.params.id)
      .populate('hotelId', 'name')
      .populate('roomId', 'roomNumber')
      .populate('guestId', 'fullName email');

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

    // Update room status if necessary
    const room = await Room.findById(booking.roomId);
    if (bookingStatus === 'checked-out') room.status = 'available';
    if (bookingStatus === 'checked-in') room.status = 'occupied';
    if (bookingStatus === 'cancelled') room.status = 'available';
    await room.save();

    const updatedBooking = await booking.save();

    return res.status(200).json({
      success: true,
      message: 'Booking status updated successfully',
      data: updatedBooking,
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

    // Free up the room
    const room = await Room.findById(booking.roomId);
    if (room) {
      room.status = 'available';
      room.bookedBy = null;
      room.checkInDate = null;
      room.checkOutDate = null;
      await room.save();
    }

    await booking.deleteOne();

    return res.status(200).json({ success: true, message: 'Booking deleted successfully' });
  } catch (error) {
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
      .populate('roomId', 'roomNumber');

    return res.status(200).json({ success: true, data: bookings });
  } catch (error) {
    console.error('Error fetching user bookings:', error.message);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const checkoutRoom = async (req, res) => {
  try {
    const { roomId } = req.params;

    // 1️⃣ Find room
    const room = await Room.findById(roomId).populate('currentBookingId');
    if (!room) return res.status(404).json({ success: false, error: 'Room not found' });
    if (!room.currentBookingId)
      return res.status(400).json({ success: false, error: 'No active booking for this room' });

    // 2️⃣ Update booking status
    const booking = await Booking.findById(room.currentBookingId);
    booking.bookingStatus = 'checked-out';
    await booking.save();

    // 3️⃣ Reset room
    room.status = 'cleaning'; // or 'available', depending on your process
    room.currentBookingId = null;
    await room.save();

    // 4️⃣ Optionally trigger email notification here
    // sendCheckoutEmail(booking.guestEmail);

    return res.status(200).json({
      success: true,
      message: 'Room checked out successfully',
      data: {
        roomId: room._id,
        bookingId: booking._id,
        status: room.status,
      },
    });
  } catch (error) {
    console.error('Error checking out room:', error.message);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
