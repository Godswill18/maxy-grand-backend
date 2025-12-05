// backend/controllers/bookingController.js
import Booking from '../models/bookingModel.js';
import Room from '../models/roomModel.js';
import { generateConfirmationCode } from '../lib/utils/codeGenerator.js';
import https from 'https';
import RoomType from '../models/roomTypeModel.js';
import mongoose from 'mongoose';
import Payment from '../models/paymentModel.js';

// Helper function to get a fully populated booking
const getPopulatedBooking = async (id) => {
  return await Booking.findById(id)
    .populate('hotelId', 'name')
    .populate({
        path: 'roomTypeId',
        select: 'roomNumber price name amenities description', // Just get the room number
    
    })
    .populate('guestId', 'firstName lastName email');
};


/**
 * @desc Check room availability for booking
 * @route POST /api/bookings/check-availability
 */
export const checkRoomAvailability = async (req, res) => {
  try {
    const { roomTypeId, checkInDate, checkOutDate, numberOfRooms } = req.body;

    // Validate inputs
    if (!roomTypeId || !checkInDate || !checkOutDate) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        available: false
      });
    }

    // Validate dates
    if (new Date(checkOutDate) <= new Date(checkInDate)) {
      return res.status(400).json({
        success: false,
        error: 'Check-out date must be after check-in date',
        available: false
      });
    }

    // Check for conflicting bookings
    const conflictingBookings = await Booking.countDocuments({
      roomTypeId: roomTypeId,
      bookingStatus: { $in: ['confirmed', 'checked-in'] },
      $and: [
        { checkInDate: { $lt: new Date(checkOutDate) } },
        { checkOutDate: { $gt: new Date(checkInDate) } },
      ]
    });

    const requestedRooms = numberOfRooms || 1;
    const available = conflictingBookings < requestedRooms;

    return res.status(200).json({
      success: true,
      available,
      conflictingBookings,
      requestedRooms,
      message: available 
        ? 'Room is available for selected dates'
        : `Only ${requestedRooms - conflictingBookings} room(s) available for selected dates`
    });

  } catch (error) {
    console.error('Error checking room availability:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      available: false
    });
  }
};

/**
 * @desc Create booking(s) after successful payment
 * @route POST /api/bookings/create-with-payment
 */
export const createBookingWithPayment = async (req, res) => {
  try {
    const user = req.user;
    const {
      roomTypeId,
      hotelId,
      guestName,
      guestEmail,
      guestPhone,
      checkInDate,
      checkOutDate,
      numberOfGuests,
      specialRequests,
      totalAmount,
      numberOfRooms,
      paymentReference,
      paymentAmount,
    } = req.body;

    // 1️⃣ Verify payment with Paystack first
    const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

    const verifyPaymentPromise = new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.paystack.co',
        port: 443,
        path: `/transaction/verify/${paymentReference}`,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`
        }
      };

      const paystackRequest = https.request(options, (paystackRes) => {
        let data = '';

        paystackRes.on('data', (chunk) => {
          data += chunk;
        });

        paystackRes.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (response.status && response.data.status === 'success') {
              resolve(response.data);
            } else {
              reject(new Error('Payment verification failed'));
            }
          } catch (error) {
            reject(error);
          }
        });
      });

      paystackRequest.on('error', (error) => {
        reject(error);
      });

      paystackRequest.end();
    });

    let paymentData;
    try {
      paymentData = await verifyPaymentPromise;
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: 'Payment verification failed. No booking created.',
      });
    }

    // 2️⃣ Payment verified - now validate booking data
    if (new Date(checkOutDate) <= new Date(checkInDate)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Check-out date must be after check-in date' 
      });
    }

    // 3️⃣ Find the room
    const room = await RoomType.findById(roomTypeId);
    if (!room) {
      return res.status(404).json({ 
        success: false, 
        error: 'Room not found' 
      });
    }

    // 4️⃣ Check availability for ALL rooms
    const conflictingBooking = await Booking.findOne({
      roomTypeId: roomTypeId,
      bookingStatus: { $in: ['confirmed', 'checked-in'] },
      $and: [
        { checkInDate: { $lt: new Date(checkOutDate) } },
        { checkOutDate: { $gt: new Date(checkInDate) } },
      ]
    });

    if (conflictingBooking) {
      // Payment was made but room is not available - should refund
      return res.status(400).json({
        success: false,
        error: `Room ${room.roomNumber} is no longer available for these dates. Please contact support for a refund.`,
      });
    }

    // 5️⃣ Create bookings (one for each room)
    const bookingsToCreate = [];
    const amountPerRoom = totalAmount / numberOfRooms;
    const paidAmountPerRoom = paymentAmount / numberOfRooms;

    for (let i = 0; i < numberOfRooms; i++) {
      let confirmationCode = '';
      let isCodeUnique = false;
      while (!isCodeUnique) {
        confirmationCode = generateConfirmationCode(6);
        const existingBooking = await Booking.findOne({ confirmationCode });
        if (!existingBooking) {
          isCodeUnique = true;
        }
      }

      const booking = new Booking({
        hotelId: hotelId || user.hotelId,
        roomTypeId,
        guestId: req.user._id,
        guestName,
        guestEmail,
        guestPhone,
        checkInDate,
        checkOutDate,
        bookingType: 'online',
        totalAmount: amountPerRoom,
        amountPaid: paidAmountPerRoom,
        paymentStatus: 'paid',
        bookingStatus: 'confirmed',
        confirmationCode,
        numberOfGuests,
        specialRequests,
      });

      bookingsToCreate.push(booking.save());
    }

    // 6️⃣ Save all bookings
    const savedBookings = await Promise.all(bookingsToCreate);

    // 7️⃣ Create payment records for each booking
    const paymentRecords = savedBookings.map(booking => {
      return new Payment({
        bookingId: booking._id,
        amount: booking.amountPaid,
        status: 'completed',
        gatewayRef: paymentReference,
      }).save();
    });

    await Promise.all(paymentRecords);

    // 8️⃣ Emit socket events
    for (const booking of savedBookings) {
      const populatedBooking = await getPopulatedBooking(booking._id);
      req.io.emit('bookingCreated', populatedBooking);
    }

    return res.status(201).json({
      success: true,
      message: `${numberOfRooms} booking(s) created successfully`,
      data: savedBookings,
    });

  } catch (error) {
    console.error('Error creating booking with payment:', error.message);
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
};



/**
 * @desc Create a new booking (online or in-person)
 * @route POST /api/bookings/create
 */
export const createBooking = async (req, res) => {
  try {
    const user = req.user;
    const {
      roomTypeId, 
      guestName,
      guestEmail,
      guestPhone,
      checkInDate,
      checkOutDate,
      bookingType,
      totalAmount,
      amountPaid,
      guestDetails,
      preferences,
      numberOfGuests,
      specialRequests,
      // signature
    } = req.body;

// const guestId = req.body.guestId || (bookingType === 'online' ? user._id : null);



    // 1️⃣ Validate input dates
    if (new Date(checkOutDate) <= new Date(checkInDate)) {
      return res.status(400).json({ success: false, error: 'Check-out date must be after check-in date' });
    }

    // 2️⃣ Find the specific room
    // console.log('BookingController: Looking for room with ID:', roomTypeId);
    const room = await RoomType.findById(roomTypeId);
    // console.log('BookingController: Found room:', room);
    if (!room) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }

    // 3️⃣ ⭐️ --- NEW AVAILABILITY LOGIC --- ⭐️
    // Check for any bookings for this room that conflict with the requested dates.
    // An overlap exists if:
    // (Existing Check-in < New Check-out) AND (Existing Check-out > New Check-in)
    const conflictingBooking = await Booking.findOne({
      roomTypeId: roomTypeId,
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

    // 6️⃣ Create booking record (using 'roomTypeId')
    const booking = new Booking({
      hotelId: req.body.hotelId || user.hotelId,
      roomTypeId, // <-- FIX: Save 'roomId'
      guestId: guestId,
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
      confirmationCode: confirmationCode,
      guestDetails,
      preferences,
      numberOfGuests: numberOfGuests,
      specialRequests,
      // signature
    });

    const savedBooking = await booking.save();

    // 7️⃣ Update room status ONLY if it's currently 'available'
    // This booking is for the future, but we mark it as 'reserved'
    // so a walk-in can't take it right now.
    // Your check-in logic will handle changing it to 'occupied'.
    // if (room.status === 'available') {
    //     room.status = 'reserved';
    //     await room.save();
    // }
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

// *
//  * @desc Update booking details (Admin/Receptionist)
//  * @route PUT /api/bookings/:id
//  */
export const updateBooking = async (req, res) => {
  try {
    const bookingId = req.params.id;
    const {
      guestName,
      guestEmail,
      guestPhone,
      checkInDate,
      checkOutDate,
      roomId,
      numberOfGuests,
      // guests,
      totalAmount,
      amountPaid,
      paymentStatus,
      specialRequests,
      guestDetails,
      preferences,
    } = req.body;

    // 1️⃣ Find the existing booking
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    // 2️⃣ Validate dates if they're being updated
    if (checkInDate && checkOutDate) {
      if (new Date(checkOutDate) <= new Date(checkInDate)) {
        return res.status(400).json({ 
          success: false, 
          error: 'Check-out date must be after check-in date' 
        });
      }
    }

    // 3️⃣ Check for room availability conflicts (if room or dates are changing)
    const isRoomChanging = roomId && roomId !== booking.roomId.toString();
    const areDatesChanging = (checkInDate && checkInDate !== booking.checkInDate.toISOString().split('T')[0]) || 
                             (checkOutDate && checkOutDate !== booking.checkOutDate.toISOString().split('T')[0]);

    if (isRoomChanging || areDatesChanging) {
      const targetRoomId = roomId || booking.roomId;
      const targetCheckIn = checkInDate || booking.checkInDate;
      const targetCheckOut = checkOutDate || booking.checkOutDate;

      const conflictingBooking = await Booking.findOne({
        _id: { $ne: bookingId }, // Exclude current booking
        roomId: targetRoomId,
        bookingStatus: { $in: ['confirmed', 'checked-in'] },
        $and: [
          { checkInDate: { $lt: new Date(targetCheckOut) } },
          { checkOutDate: { $gt: new Date(targetCheckIn) } },
        ]
      });

      if (conflictingBooking) {
        const room = await Room.findById(targetRoomId);
        return res.status(400).json({
          success: false,
          error: `Room ${room?.roomNumber || targetRoomId} is already booked for the selected dates`,
        });
      }
    }

    // 4️⃣ Update booking fields
    if (guestName) booking.guestName = guestName;
    if (guestEmail) booking.guestEmail = guestEmail;
    if (guestPhone) booking.guestPhone = guestPhone;
    if (checkInDate) booking.checkInDate = new Date(checkInDate);
    if (checkOutDate) booking.checkOutDate = new Date(checkOutDate);
    if (roomId) booking.roomId = roomId;
    
    // Handle numberOfGuests (new field) or guests (old field)
    if (numberOfGuests !== undefined) {
      booking.numberOfGuests = numberOfGuests;
    } 
    
    if (totalAmount !== undefined) booking.totalAmount = totalAmount;
    if (amountPaid !== undefined) booking.amountPaid = amountPaid;
    if (paymentStatus) booking.paymentStatus = paymentStatus;
    if (specialRequests !== undefined) booking.specialRequests = specialRequests;
    
    // Handle guestDetails object
    if (guestDetails) {
      booking.guestDetails = {
        address: guestDetails.address || booking.guestDetails?.address || '',
        city: guestDetails.city || booking.guestDetails?.city || '',
        state: guestDetails.state || booking.guestDetails?.state || '',
        arrivingFrom: guestDetails.arrivingFrom || booking.guestDetails?.arrivingFrom || '',
        nextOfKinName: guestDetails.nextOfKinName || booking.guestDetails?.nextOfKinName || '',
        nextOfKinPhone: guestDetails.nextOfKinPhone || booking.guestDetails?.nextOfKinPhone || '',
      };
    }
    
    // Handle preferences object
    if (preferences) {
      booking.preferences = {
        extraBedding: preferences.extraBedding !== undefined ? preferences.extraBedding : booking.preferences?.extraBedding || false,
        specialRequests: preferences.specialRequests || booking.preferences?.specialRequests || '',
      };
    }

    // 5️⃣ Save updated booking
    const updatedBooking = await booking.save();
    
    // 6️⃣ Populate the booking with related data
    const populatedBooking = await Booking.findById(updatedBooking._id)
      .populate('hotelId', 'name')
      .populate({
        path: 'roomTypeId',
        select: 'roomNumber status',
        populate: {
          path: 'roomTypeId',
          select: 'name pricePerNight description capacity'
        }
      })
      .populate('guestId', 'firstName lastName email');

    // 7️⃣ Emit socket event
    req.io.emit('bookingUpdated', populatedBooking);

    return res.status(200).json({
      success: true,
      message: 'Booking updated successfully',
      data: populatedBooking,
    });
  } catch (error) {
    console.error('Error updating booking:', error.message);
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      details: error.message 
    });
  }
};

/**
 * @desc Cancel a booking
 * @route PATCH /api/bookings/:id/cancel
 */
export const cancelBooking = async (req, res) => {
  try {
    const bookingId = req.params.id;

    // 1️⃣ Find the booking
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    // 2️⃣ Check if booking can be cancelled
    if (booking.bookingStatus === 'cancelled') {
      return res.status(400).json({ 
        success: false, 
        error: 'Booking is already cancelled' 
      });
    }

    if (booking.bookingStatus === 'checked-out') {
      return res.status(400).json({ 
        success: false, 
        error: 'Cannot cancel a completed booking' 
      });
    }

    // 3️⃣ Update booking status to cancelled
    booking.bookingStatus = 'cancelled';
    const updatedBooking = await booking.save();

    // 4️⃣ Free up the room if it was reserved or occupied
    const room = await Room.findById(booking.roomTypeId);
    if (room) {
      // If this booking had the room occupied or reserved, free it up
      if (room.currentBookingId?.toString() === bookingId) {
        room.status = 'available';
        room.currentBookingId = null;
        await room.save();
      } else if (room.status === 'reserved') {
        // Check if there are other bookings for this room
        const otherBookings = await Booking.find({
          roomTypeId: room._id,
          _id: { $ne: bookingId },
          bookingStatus: { $in: ['confirmed', 'checked-in'] }
        });
        
        // If no other bookings, make it available
        if (otherBookings.length === 0) {
          room.status = 'available';
          await room.save();
        }
      }
    }

    // 5️⃣ Get populated booking and emit socket event
    const populatedBooking = await getPopulatedBooking(updatedBooking._id);
    req.io.emit('bookingUpdated', populatedBooking);

    return res.status(200).json({
      success: true,
      message: 'Booking cancelled successfully',
      data: populatedBooking,
    });
  } catch (error) {
    console.error('Error cancelling booking:', error.message);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * @desc Update booking status (Admin/Receptionist)
 * @route PATCH /api/bookings/:id/status
 */
export const updateBookingStatus = async (req, res) => {
    try {
        const { bookingStatus, paymentStatus, amountPaid, userId, guestDetails, preferences, confirmationCode } = req.body;
        const booking = await Booking.findById(req.params.id);

        if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' });

        // --- 1. Security Check (Required for Check-In) ---
        if (bookingStatus === 'checked-in' && booking.confirmationCode !== confirmationCode) {
            return res.status(400).json({ success: false, error: 'Invalid confirmation code.' });
        }

        // --- 2. Update Booking Status and Financials ---
        if (bookingStatus) booking.bookingStatus = bookingStatus;
        if (paymentStatus) booking.paymentStatus = paymentStatus;
        if (amountPaid !== undefined) booking.amountPaid = amountPaid;
        
        // --- 3. Save Detailed Guest Data on Check-In ---
        if (bookingStatus === 'checked-in') {
            booking.guestDetails = guestDetails; 
            booking.preferences = preferences;
            booking.guestId = userId; // Link to the confirmed or new User account
        }

        // --- 4. Update Room Status (as before) ---
        const room = await Room.findById(booking.roomTypeId); 
        if (room) {
            if (bookingStatus === 'checked-out' || bookingStatus === 'cancelled') {
                room.status = 'cleaning';
                room.currentBookingId = null;
            }
            if (bookingStatus === 'checked-in') {
                room.status = 'occupied';
                room.currentBookingId = booking._id; 
            }
            if (bookingStatus === 'confirmed') {
                room.status = 'reserved';
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

export const getHotelBookingSummary = async (req, res) => {
  try {
    const hotelId = req.user.hotelId;
    const totalBookings = await Booking.countDocuments({ hotelId });
    const confirmedBookings = await Booking.countDocuments({ hotelId, bookingStatus: 'confirmed' });
    const checkedInBookings = await Booking.countDocuments({ hotelId, bookingStatus: 'checked-in' });
    const checkedOutBookings = await Booking.countDocuments({ hotelId, bookingStatus: 'checked-out' });
    return res.status(200).json({
      success: true,
      data: {
        totalBookings,
        confirmedBookings,
        checkedInBookings,
        checkedOutBookings,
      },
    });
  } catch (error) {
    console.error('Error fetching booking summary:', error.message);
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
      room.currentBookingId = null;
      await room.save();
    }

    await booking.deleteOne();

    // --- Socket.io Emit ---
    req.io.emit('bookingDeleted', bookingId);
    // --- End Emit ---

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
    
    console.log('Fetching bookings for user:', userId); // Debug log

    
const objectId = new mongoose.Types.ObjectId(userId);
    
    const bookings = await Booking.find({ guestId: objectId })
      .populate('hotelId', 'name address')
      .populate({
        path: 'roomTypeId',
        select: 'name price images amenities roomNumber', // RoomType fields
      })
      .sort({ createdAt: -1 }); // Newest first

    console.log('Found bookings:', bookings.length); // Debug log

    return res.status(200).json({ 
      success: true, 
      data: bookings,
      count: bookings.length 
    });
  } catch (error) {
    console.error('Error fetching user bookings:', error.message);
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      details: error.message 
    });
  }
};

export const verifyBookingConfirmationCode = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { confirmationCode } = req.body;

    if (!confirmationCode) {
      return res.status(400).json({
        success: false,
        error: 'Confirmation code is required'
      });
    }

    // Find the booking
    const booking = await Booking.findById(bookingId).select('confirmationCode bookingType bookingStatus');

    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }

    // Check if booking requires confirmation code (online bookings only)
    if (booking.bookingType === 'walk-in') {
      return res.status(400).json({
        success: false,
        error: 'Walk-in bookings do not require confirmation codes'
      });
    }

    // Verify the code (case-insensitive comparison)
    const isValid = booking.confirmationCode.toLowerCase() === confirmationCode.toLowerCase();

    if (!isValid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid confirmation code',
        verified: false
      });
    }

    // Code is valid
    return res.status(200).json({
      success: true,
      message: 'Confirmation code verified successfully',
      verified: true,
      data: {
        bookingId: booking._id,
        bookingType: booking.bookingType,
        bookingStatus: booking.bookingStatus
      }
    });

  } catch (error) {
    console.error('Error verifying confirmation code:', error);
    return res.status(500).json({
      success: false,
      error: 'Server error during verification',
      verified: false
    });
  }
};

export const getAllBookingsInHotel = async (req, res) => {
    try {
        const loggedInUserHotelId = req.user.hotelId;

        if (!loggedInUserHotelId) {
            return res.status(400).json({ 
                success: false, 
                message: "Logged-in user is not associated with a specific hotel." 
            });
        }

        console.log("Fetching bookings for hotel ID:", loggedInUserHotelId);

        const bookings = await Booking.find({ 
            hotelId: loggedInUserHotelId 
        })
        .populate('roomTypeId', 'roomNumber status')
        .populate('guestId', 'firstName lastName email phoneNumber')
        .sort({ createdAt: -1 });

        res.status(200).json({ success: true, data: bookings });

    } catch (error) {
        console.error("Error in getAllBookingsInHotel:", error.message);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
};


/**
 * @desc Get available rooms for a date range
 * @route GET /api/rooms/available?checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD
 * @access Public (or Protected based on your needs)
 */
export const getAvailableRooms = async (req, res) => {
  try {
    const { checkIn, checkOut } = req.query;
    const hotelId = req.user?.hotelId; // Get from authenticated user

    // Validate inputs
    if (!checkIn || !checkOut) {
      return res.status(400).json({ 
        success: false, 
        error: 'Check-in and check-out dates are required' 
      });
    }

    if (!hotelId) {
      return res.status(400).json({ 
        success: false, 
        error: 'User is not associated with a hotel' 
      });
    }

    // Validate dates
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    
    if (checkOutDate <= checkInDate) {
      return res.status(400).json({ 
        success: false, 
        error: 'Check-out date must be after check-in date' 
      });
    }

    // 1. Find all rooms in this hotel
    const allRooms = await Room.find({ 
      hotelId: hotelId,
      status: { $in: ['available', 'reserved'] } // Include reserved rooms (they might be available for these dates)
    })
    .populate('roomTypeId', 'name pricePerNight description capacity')
    .sort({ roomNumber: 1 });

    if (allRooms.length === 0) {
      return res.status(200).json({ 
        success: true, 
        data: [],
        message: 'No rooms found in this hotel'
      });
    }

    // 2. Find all conflicting bookings for these dates
    const conflictingBookings = await Booking.find({
      hotelId: hotelId,
      bookingStatus: { $in: ['confirmed', 'checked-in'] }, // Only check active bookings
      $and: [
        { checkInDate: { $lt: checkOutDate } },
        { checkOutDate: { $gt: checkInDate } }
      ]
    }).select('roomId');

    // 3. Get array of room IDs that are booked
    const bookedRoomIds = conflictingBookings.map(booking => booking.roomId.toString());

    // 4. Filter out booked rooms
    const availableRooms = allRooms.filter(room => 
      !bookedRoomIds.includes(room._id.toString())
    );

    // 5. Format response
    const formattedRooms = availableRooms.map(room => ({
      _id: room._id,
      roomNumber: room.roomNumber,
      status: room.status,
      floor: room.floor,
      roomTypeId: {
        _id: room.roomTypeId._id,
        name: room.roomTypeId.name,
        pricePerNight: room.roomTypeId.pricePerNight,
        description: room.roomTypeId.description,
        capacity: room.roomTypeId.capacity
      }
    }));

    return res.status(200).json({ 
      success: true, 
      data: formattedRooms,
      message: `${formattedRooms.length} room(s) available for selected dates`
    });

  } catch (error) {
    console.error('Error fetching available rooms:', error.message);
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      details: error.message 
    });
  }
};