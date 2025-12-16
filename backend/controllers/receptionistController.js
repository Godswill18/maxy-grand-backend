import Room from '../models/roomModel.js';
import User from '../models/userModel.js';
import Booking from '../models/bookingModel.js';
import { Types } from 'mongoose';
import RoomType from '../models/roomTypeModel.js';
// import nodemailer from 'nodemailer';

// // Configure mail transporter
// const transporter = nodemailer.createTransport({
//   service: 'gmail',
//   auth: {
//     user: process.env.SMTP_EMAIL,
//     pass: process.env.SMTP_PASSWORD,
//   },
// });

/**
 * Helper function to find a booking by its ID and populate all
 * related fields needed by the frontend.
 */

/**
 * Helper function to find available cleaners
 */
const findAvailableCleaner = async (hotelId) => {
  try {
    // Find cleaners who don't have any active cleaning tasks
    const activeTasks = await CleaningRequest.find({
      hotelId,
      status: { $in: ['pending', 'in-progress'] }
    }).distinct('assignedCleaner');

    const availableCleaner = await User.findOne({
      hotelId,
      role: 'cleaner',
      isActive: true,
      _id: { $nin: activeTasks } // Not in active tasks list
    });

    return availableCleaner;
  } catch (error) {
    console.error('Error finding available cleaner:', error);
    return null;
  }
};

/**
 * IMPROVED: Check-out with automatic cleaning request
 */
export const checkOutGuest = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const io = req.io;

    // 1. Find the booking
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    // 2. Find the associated room
    const room = await Room.findById(booking.roomId);
    
    // 3. Check for errors
    if (booking.bookingStatus !== 'checked-in') {
      return res.status(400).json({ 
        success: false, 
        error: 'Guest is not currently checked in.' 
      });
    }

    // 4. Update booking status
    booking.bookingStatus = 'checked-out';
    
    // 5. Update room status and unlink booking
    if (room) {
      room.status = 'cleaning';
      room.currentBookingId = null;
      room.currentGuest = null;
      await room.save();

      // 6. ⭐ AUTOMATICALLY CREATE CLEANING REQUEST ⭐
      try {
        // Find an available cleaner
        const availableCleaner = await findAvailableCleaner(req.user.hotelId);
        
        if (availableCleaner) {
          // Create cleaning request with assigned cleaner
          const cleaningRequest = new CleaningRequest({
            hotelId: req.user.hotelId,
            roomId: room._id,
            assignedCleaner: availableCleaner._id,
            requestedBy: req.user.id,
            notes: `Automatic cleaning request after guest checkout from booking ${bookingId}`,
            priority: 'High',
            status: 'pending',
            estimatedDuration: '30 min',
          });

          await cleaningRequest.save();

          // Emit socket event for housekeeping dashboard
          if (io) {
            io.emit('cleaning:new', {
              message: `New cleaning request for Room ${room.roomNumber}`,
              cleaningRequest,
              roomNumber: room.roomNumber,
            });
          }

          console.log(`✅ Cleaning request created for Room ${room.roomNumber}, assigned to ${availableCleaner.firstName} ${availableCleaner.lastName}`);
        } else {
          // No cleaner available - create unassigned request
          const cleaningRequest = new CleaningRequest({
            hotelId: req.user.hotelId,
            roomId: room._id,
            assignedCleaner: null, // Will be assigned later
            requestedBy: req.user.id,
            notes: `Automatic cleaning request after guest checkout from booking ${bookingId} - No cleaner available`,
            priority: 'High',
            status: 'pending',
            estimatedDuration: '30 min',
          });

          await cleaningRequest.save();

          console.log(`⚠️ Cleaning request created for Room ${room.roomNumber} - awaiting cleaner assignment`);
        }
      } catch (cleaningError) {
        console.error('Error creating cleaning request:', cleaningError);
        // Don't fail the checkout if cleaning request fails
      }
    }
    
    // 7. Save the booking
    await booking.save();

    // 8. Get populated booking and emit update
    const populatedBooking = await Booking.findById(booking._id)
      .populate({
        path: 'roomId',
        populate: { path: 'roomTypeId' }
      })
      .populate('guestId');

    if (io) {
      io.emit('bookingUpdated', populatedBooking);
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Guest checked out successfully and cleaning request created',
      data: populatedBooking 
    });

  } catch (error) {
    console.error("Check-out error:", error);
    return res.status(500).json({ success: false, error: 'Server error during check-out' });
  }
};

/**
 * IMPROVED: Get dashboard bookings with better filtering
 */
export const getDashboardBookings = async (req, res) => {
  try {
    const { user } = req;

    if (!user || !user.hotelId) {
      return res.status(403).json({
        success: false,
        error: "Forbidden: User is not associated with any hotel.",
      });
    }

    const { hotelId } = user;
    const { status, dateFilter } = req.query;

    // Build query
    let query = { hotelId };

    // Filter by status if provided
    if (status && status !== 'all') {
      query.bookingStatus = status;
    }

    // Date filtering
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (dateFilter === 'today') {
      query.$or = [
        // Check-ins today
        {
          checkInDate: { $gte: today, $lt: tomorrow },
          bookingStatus: { $in: ['confirmed', 'checked-in'] }
        },
        // Check-outs today
        {
          checkOutDate: { $gte: today, $lt: tomorrow },
          bookingStatus: 'checked-in'
        }
      ];
    } else if (dateFilter === 'upcoming') {
      query.checkInDate = { $gte: tomorrow };
      query.bookingStatus = 'confirmed';
    } else if (dateFilter === 'active') {
      query.bookingStatus = 'checked-in';
    }

    const bookings = await Booking.find(query)
      .populate({
        path: 'roomId',
        populate: { path: 'roomTypeId' }
      })
      .populate('guestId')
      .sort({ checkInDate: 1 });

    return res.status(200).json({
      success: true,
      count: bookings.length,
      data: bookings,
    });

  } catch (error) {
    console.error("Error fetching dashboard bookings:", error);
    return res.status(500).json({
      success: false,
      error: "Server error fetching bookings",
    });
  }
};

export const getPopulatedBooking = async (bookingId) => {
  try {
    const booking = await Booking.findById(bookingId)
      .populate({
        path: 'roomId',       // 1. Populate the Room
        model: 'Room',
        populate: {
          path: 'roomTypeId', // 2. Nested populate for the RoomType (from the Room)
          model: 'RoomType'
        }
      })
      .populate('guestId');   // 3. Populate the User (if they're a system user)

    return booking;

  } catch (error) {
    console.error("Error populating booking:", error);
    return null; // Handle errors gracefully
  }
};

// 🧾 Get all rooms and their statuses
export const getAllRooms = async (req, res) => {
  try {
    const { user } = req;

    if (!user || !user.hotelId) {
      return res.status(403).json({
        success: false,
        error: "Forbidden: User is not associated with any hotel.",
      });
    }

    const rooms = await Room.find({ hotelId: user.hotelId })
      .populate("hotelId")
      .populate("roomTypeId")
      .populate({
        path: "currentBookingId",
        model: "Booking",
        populate: {
          path: "guestId",
          model: "User",
        },
      });

    // 🔥 FIX: Restructure data so frontend gets exactly what it needs
    const formattedRooms = rooms.map((room) => {
      const booking = room.currentBookingId;
      const guest = booking?.guestId;

      return {
        _id: room._id,
        roomNumber: room.roomNumber,
        status: room.status,
        hotelId: room.hotelId,
        roomTypeId: room.roomTypeId,

        // ---- new fields for frontend mapping ----
        bookedBy: guest
          ? {
              firstName: guest.firstName,
              lastName: guest.lastName,
              email: guest.email,
              phoneNumber: guest.phoneNumber,
            }
          : null,

        currentBookingId: booking
          ? {
              _id: booking._id,
              guests: booking.guests,
              specialRequests: booking.specialRequests,

              // ADD THESE
              guestName: booking.guestName,
              guestEmail: booking.guestEmail,
              guestPhone: booking.guestPhone,

              // ADD populated user details
              guestId: booking.guestId
                ? {
                    firstName: booking.guestId.firstName,
                    lastName: booking.guestId.lastName,
                    email: booking.guestId.email,
                    phoneNumber: booking.guestId.phoneNumber,
                  }
                : null,
            }
          : null,


        checkInDate: booking?.checkInDate || null,
        checkOutDate: booking?.checkOutDate || null,
      };
    });

    return res.status(200).json({
      success: true,
      data: formattedRooms,
    });

  } catch (error) {
    console.error("Error fetching receptionist rooms:", error);
    return res.status(500).json({
      success: false,
      error: "Server error fetching rooms",
    });
  }
};


// 🏨 Get only available rooms
export const getAvailableRooms = async (req, res) => {
  try {
    // 1. Get the logged-in user's hotelId.
    // We assume the auth middleware adds a `user` object to `req`.
    const { user } = req;

    // 2. Check if the user is authenticated and has a hotelId
    if (!user || !user.hotelId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: User is not associated with any hotel.',
      });
    }

    // 3. Find rooms that are 'available' AND belong to the user's hotel.
    const rooms = await Room.find({
      status: 'available',
      hotelId: user.hotelId,
    }).populate('roomTypeId');

    res.status(200).json({ success: true, data: rooms });
  } catch (error) {
    console.error('Error fetching available rooms:', error.message);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// 🕓 Check for rooms whose checkout time has arrived
export const notifyCheckouts = async (req, res) => {
  try {
    // 1. Get the logged-in user's hotelId
    const { user } = req;

    // 2. Check if the user is authenticated and has a hotelId
    if (!user || !user.hotelId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: User is not associated with any hotel.',
      });
    }

    const now = new Date();

    // 3. Find rooms due for checkout *only* at the user's hotel
    const roomsDue = await Room.find({
      checkOutDate: { $lte: now },
      status: 'occupied',
      hotelId: user.hotelId, // Filter by the receptionist's hotel
    }).populate('bookedBy');

    let notificationsSent = 0;
    for (const room of roomsDue) {
      if (room.bookedBy?.email) {
        try {
          await transporter.sendMail({
            from: process.env.SMTP_EMAIL,
            to: room.bookedBy.email,
            subject: `Checkout Notice for Room ${room.roomNumber}`,
            html: `
              <p>Hello ${room.bookedBy.fullName || 'Guest'},</p>
              <p>Your checkout time for Room <b>${room.roomNumber}</b> has arrived.</p>
              <p>Please proceed to the front desk. If you'd like to extend your stay, please let us know.</p>
            `,
          });
          notificationsSent++;
        } catch (emailError) {
          console.error(`Failed to send email for room ${room.roomNumber}:`, emailError.message);
          // Continue to the next room even if one email fails
        }
      }
    }

    // 4. Send a response
    return res.status(200).json({
      success: true,
      message: `Checkout notification process complete. ${notificationsSent} notifications sent.`,
      data: {
        roomsChecked: roomsDue.length,
        notificationsSent,
      }
    });

  } catch (error) {
    console.error('Error processing checkouts:', error.message);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// export const getDashboardBookings = async (req, res) => {
//   try {
//     const { user } = req;

//     if (!user || !user.hotelId) {
//       return res.status(403).json({
//         success: false,
//         error: "Forbidden: User is not associated with any hotel.",
//       });
//     }

//     const { hotelId } = user;

//     // Get the start of today (00:00:00)
//     const todayStart = new Date();
//     todayStart.setHours(0, 0, 0, 0);

//     // Get the end of today (technically 00:00:00 tomorrow)
//     const todayEnd = new Date(todayStart);
//     todayEnd.setDate(todayEnd.getDate() + 1);

//     // 1. Define the query
//     const query = {
//       hotelId: hotelId,
//       // $or: [
//       //   // 1. Anyone currently checked in
//       //   { bookingStatus: 'checked-in' },
        
//       //   // 2. Anyone confirmed to check in today or in the future
//       //   { 
//       //     bookingStatus: 'confirmed',
//       //     checkInDate: { $gte: todayStart } 
//       //   },
        
//       //   // 3. Anyone who checked out today
//       //   {
//       //     bookingStatus: 'checked-out',
//       //     checkOutDate: { $gte: todayStart, $lt: todayEnd }
//       //   }
//       // ]
//     };

//     // 2. Execute the query and populate all necessary details
//     const bookings = await Booking.find(query)
//       .populate({
//         path: 'roomId',
//         model: 'Room',
//         // Also populate the room's type to get capacity, etc.
//         populate: {
//           path: 'roomTypeId',
//           model: 'RoomType'
//         }
//       })
//       .populate('guestId') // Populates the User model (if it's an online booking)
//       .sort({ checkInDate: 1 }); // Sort by check-in date

//     // 3. Send the raw, populated bookings to the frontend
//     // The frontend store (Zustand) will be responsible for mapping this
//     return res.status(200).json({
//       success: true,
//       data: bookings,
//     });

//   } catch (error) {
//     console.error("Error fetching dashboard bookings:", error);
//     return res.status(500).json({
//       success: false,
//       error: "Server error fetching bookings",
//     });
//   }
// };

// 🧹 Request cleaning
export const requestCleaning = async (req, res) => {
  try {
    const { roomId } = req.params;
    
    // 1. Get the logged-in user's hotelId
    const { user } = req;

    // 2. Check if the user is authenticated and has a hotelId
    if (!user || !user.hotelId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: User is not associated with any hotel.',
      });
    }

    // 3. Find a room that matches BOTH the roomId and the user's hotelId,
    //    then update its status.
    const room = await Room.findOneAndUpdate(
      { _id: roomId, hotelId: user.hotelId }, // Query: Must match ID AND hotelId
      { status: 'cleaning' },                  // Update
      { new: true }                             // Options: Return the updated doc
    );

    // If `room` is null, it means no room was found with that ID
    // *at the user's hotel*.
    if (!room) {
      return res.status(404).json({ 
        success: false, 
        error: 'Room not found at this hotel.' 
      });
    }

    return res.status(200).json({
      success: true,
      message: `Cleaning requested for room ${room.roomNumber}`,
      data: room,
    });
  } catch (error) {
    console.error('Error requesting cleaning:', error.message);
    // Handle potential CastErrors if the roomId is not a valid ObjectId format
    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, error: 'Invalid Room ID format' });
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const updateBookingStatusCheckIn = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { confirmationCode, userId, guestDetails, preferences } = req.body;

    console.log('=== CHECK-IN DEBUG ===');
    console.log('Booking ID:', bookingId);
    console.log('Confirmation Code:', confirmationCode);
    console.log('UserId:', userId);

    // 1️⃣ Find the booking and populate roomTypeId
    const booking = await Booking.findById(bookingId).populate('roomTypeId');
    if (!booking) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    console.log('Booking found:', {
      id: booking._id,
      roomTypeId: booking.roomTypeId,
      bookingType: booking.bookingType,
      bookingStatus: booking.bookingStatus,
      checkInDate: booking.checkInDate
    });

    // 2️⃣ Check if already checked in
    if (booking.bookingStatus === 'checked-in') {
      return res.status(400).json({ success: false, error: 'Guest is already checked in' });
    }

    // 3️⃣ ✅ VALIDATE CHECK-IN DATE - Guest cannot check in before scheduled date
    const checkInDate = new Date(booking.checkInDate);
    const today = new Date();
    checkInDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);

    if (today < checkInDate) {
      const formattedCheckInDate = checkInDate.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: '2-digit',
        year: 'numeric'
      });
      console.log('❌ Check-in date validation failed:', {
        today: today.toISOString(),
        checkInDate: checkInDate.toISOString()
      });
      return res.status(400).json({ 
        success: false, 
        error: `Guest cannot check in before the scheduled check-in date (${formattedCheckInDate})` 
      });
    }

    // 4️⃣ ✅ ONLY verify confirmation code for ONLINE bookings
    if (booking.bookingType === 'online') {
      console.log('🔐 Online booking - verifying confirmation code');
      
      if (!confirmationCode || confirmationCode.trim() === '') {
        return res.status(400).json({ 
          success: false, 
          error: 'Confirmation code is required for online bookings' 
        });
      }

      if (booking.confirmationCode !== confirmationCode) {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid confirmation code. Please check your booking email.' 
        });
      }
      
      console.log('✅ Confirmation code verified');
    } else if (booking.bookingType === 'walk-in') {
      console.log('🚶 Walk-in booking - no confirmation code needed');
    }

    // 5️⃣ 🔥 Find an available room of the booked type
    let room;
    
    if (booking.roomId) {
      room = await Room.findById(booking.roomId);
      console.log('📍 Using pre-assigned room:', room?.roomNumber);
    }
    
    if (!room) {
      console.log('🔍 Finding available room for roomTypeId:', booking.roomTypeId._id);
      
      room = await Room.findOne({
        hotelId: booking.hotelId,
        roomTypeId: booking.roomTypeId._id,
        status: { $in: ['available', 'cleaning'] }
      }).populate('roomTypeId');

      if (!room) {
        return res.status(400).json({ 
          success: false, 
          error: `No available rooms of type "${booking.roomTypeId.name}" found. Please contact management.` 
        });
      }

      console.log('✅ Found available room:', room.roomNumber);
      booking.roomId = room._id;
    }

    // 6️⃣ Check if room is already occupied
    if (room.status === 'occupied' && room.currentBookingId?.toString() !== booking._id.toString()) {
      return res.status(400).json({ 
        success: false, 
        error: `Room ${room.roomNumber} is already occupied by another guest` 
        });
    }

    // 7️⃣ Update booking details
    booking.bookingStatus = 'checked-in';
    booking.guestDetails = guestDetails || {};
    booking.preferences = preferences || {};
    
    if (userId) {
      booking.guestId = userId;
    }

    // 8️⃣ Update room status
    room.status = 'occupied';
    room.currentBookingId = booking._id;
    room.currentGuest = userId || null;

    // 9️⃣ Save both to database
    await booking.save();
    await room.save();

    console.log('✅ Check-in successful. Room:', room.roomNumber, 'Status:', room.status);

    // 🔟 Get fully populated booking for response
    const populatedBooking = await Booking.findById(booking._id)
      .populate({
        path: 'roomId',
        populate: { path: 'roomTypeId' }
      })
      .populate({
        path: 'roomTypeId',
        select: 'name price roomNumber'
      })
      .populate('guestId');

    // 1️⃣1️⃣ Emit socket event
    if (req.io) {
      req.io.emit('bookingUpdated', populatedBooking);
    }

    return res.status(200).json({ 
      success: true, 
      message: `Guest checked into Room ${room.roomNumber} successfully`,
      data: populatedBooking 
    });

  } catch (error) {
    console.error("❌ Check-in error:", error);
    console.error("Stack:", error.stack);
    return res.status(500).json({ 
      success: false, 
      error: 'Server error during check-in',
      details: error.message 
    });
  }
};

// export const checkOutGuest = async (req, res) => {
//   try {
//     const { bookingId } = req.params;

//     // 1. Find the booking
//     const booking = await Booking.findById(bookingId);
//     if (!booking) {
//       return res.status(404).json({ success: false, error: 'Booking not found' });
//     }

//     // 2. Find the associated room
//     const room = await Room.findById(booking.roomId);
    
//     // 3. Check for errors
//     if (booking.bookingStatus !== 'checked-in') {
//       return res.status(400).json({ 
//         success: false, 
//         error: 'Guest is not currently checked in.' 
//       });
//     }

//     // 4. --- THIS IS THE CORRECT CHECK-OUT LOGIC ---
//     // Update booking
//     booking.bookingStatus = 'checked-out';
    
//     // Update room (if found)
//     if (room) {
//       room.status = 'cleaning'; // Set room to cleaning
//       room.currentBookingId = null; // <-- Unlink the room from this booking
//       await room.save();
//     }
    
//     // 5. Save the booking
//     await booking.save();

//     // 6. Send the updated, populated booking back to the frontend
//     const populatedBooking = await getPopulatedBooking(booking._id); // (Assumes you have this helper)

//     // Emit socket event
//     req.io.emit('bookingUpdated', populatedBooking);

//     return res.status(200).json({ 
//       success: true, 
//       message: 'Guest checked out successfully',
//       data: populatedBooking 
//     });

//   } catch (error) {
//     console.error("Check-out error:", error);
//     return res.status(500).json({ success: false, error: 'Server error during check-out' });
//   }
// };

// 🛎 Book a guest into a room
export const bookGuest = async (req, res) => {
  try {
    const { roomId, guestDetails, checkInDate, checkOutDate } = req.body;
    // Create or find guest user
    let guest = await User.findOne({ email: guestDetails.email });
    if (!guest) {
      guest = new User({
        firstName: guestDetails.firstName,
        lastName: guestDetails.lastName,
        email: guestDetails.email,
        phoneNumber: guestDetails.phoneNumber,
        role: 'guest',
        isActive: true,
      });
      await guest.save();
    }
    // Update room booking details
    const room = await Room.findByIdAndUpdate(
      roomId,
      {
        status: 'reserved',
        bookedBy: guest._id,
        checkInDate,
        checkOutDate,
      },
      { new: true }
    );

    if (!room) return res.status(404).json({ success: false, error: 'Room not found' });

    return res.status(200).json({
      success: true,
      message: `Guest ${guest.firstName} ${guest.lastName} booked into room ${room.roomNumber}`,
      data: room,
    });
  } catch (error) {
    console.error('Error booking guest:', error.message);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};



export const findAvailableRoomsForRange = async (req, res) => {
  try {
    const { checkInDate, checkOutDate } = req.body;
    const { user } = req;

    console.log('🔍 Finding available rooms for range:', {
      hotelId: user.hotelId,
      checkInDate: checkInDate,
      checkOutDate: checkOutDate,
    });

    // ✅ Validation
    if (!user || !user.hotelId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    if (!checkInDate || !checkOutDate || new Date(checkOutDate) <= new Date(checkInDate)) {
      return res.status(400).json({ success: false, error: 'Invalid date range provided.' });
    }

    // 1️⃣ Find all bookings that CONFLICT with the requested date range
    const conflictingBookings = await Booking.find({
      hotelId: user.hotelId,
      bookingStatus: { $in: ['confirmed', 'checked-in'] },
      $and: [
        { checkInDate: { $lt: new Date(checkOutDate) } },
        { checkOutDate: { $gt: new Date(checkInDate) } },
      ]
    }).select('roomTypeId guestName checkInDate checkOutDate guestEmail guestPhone');

    console.log('📊 Conflicting bookings found:', conflictingBookings.length);

    // 2️⃣ Get booked room type IDs (✅ roomTypeId, not roomId)
    const bookedRoomTypeIds = conflictingBookings
      .map(booking => booking.roomTypeId?.toString())
      .filter(Boolean);

    console.log('🚫 Booked room type IDs:', bookedRoomTypeIds);

    // 3️⃣ Find ALL room types for the hotel that are available
    const allRoomTypes = await RoomType.find({
      hotelId: user.hotelId,
      isAvailable: true, // ✅ Use isAvailable field from model
    }).select('_id hotelId name roomNumber price capacity amenities images');

    console.log('📚 Total room types in hotel:', allRoomTypes.length);

    // 4️⃣ Separate into available and booked
    const availableRoomTypes = allRoomTypes.filter(
      room => !bookedRoomTypeIds.includes(room._id.toString())
    );

    const bookedRoomTypeIds_set = new Set(bookedRoomTypeIds);
    const bookedRoomTypes = allRoomTypes.filter(
      room => bookedRoomTypeIds_set.has(room._id.toString())
    );

    console.log('✅ Available rooms:', availableRoomTypes.length);
    console.log('❌ Booked rooms:', bookedRoomTypes.length);

    // 5️⃣ Format available rooms
    const formattedAvailable = availableRoomTypes.map(room => ({
      _id: room._id,
      roomNumber: room.roomNumber,
      roomTypeId: {
        _id: room._id,
        name: room.name,
        price: room.price,
        capacity: room.capacity,
        amenities: room.amenities,
        images: room.images,
      },
      status: 'AVAILABLE', // ✅ Clear status
      bookingConflict: null
    }));

    // 6️⃣ Format booked rooms with their booking conflict details
    const formattedBooked = bookedRoomTypes.map(room => {
      const booking = conflictingBookings.find(
        b => b.roomTypeId?.toString() === room._id.toString()
      );
      return {
        _id: room._id,
        roomNumber: room.roomNumber,
        roomTypeId: {
          _id: room._id,
          name: room.name,
          price: room.price,
          capacity: room.capacity,
          amenities: room.amenities,
          images: room.images,
        },
        status: 'BOOKED', // ✅ Clear status
        bookingConflict: booking ? {
          guestName: booking.guestName,
          guestEmail: booking.guestEmail,
          guestPhone: booking.guestPhone,
          checkInDate: booking.checkInDate,
          checkOutDate: booking.checkOutDate
        } : null
      };
    });

    // 7️⃣ Combine both arrays
    const allRooms = [...formattedAvailable, ...formattedBooked];

    console.log('✅ Response data:', {
      total: allRooms.length,
      available: formattedAvailable.length,
      booked: formattedBooked.length,
    });

    return res.status(200).json({
      success: true,
      count: allRooms.length,
      availableCount: formattedAvailable.length,
      bookedCount: formattedBooked.length,
      data: allRooms, // ✅ All rooms with clear status
    });

  } catch (error) {
    console.error('❌ Error checking availability:', error.message);
    console.error('Stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      details: error.message 
    });
  }
};

export const extendGuestStay = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { days, additionalAmount } = req.body;
    const io = req.io;

    if (!days || days <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid number of days for extension'
      });
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    if (booking.bookingStatus !== 'checked-in') {
      return res.status(400).json({
        success: false,
        error: 'Can only extend stay for checked-in guests'
      });
    }

    // Extend check-out date
    const newCheckOutDate = new Date(booking.checkOutDate);
    newCheckOutDate.setDate(newCheckOutDate.getDate() + parseInt(days));
    
    booking.checkOutDate = newCheckOutDate;
    
    // Update total amount if provided
    if (additionalAmount) {
      booking.totalAmount += additionalAmount;
    }

    await booking.save();

    // Update room check-out date
    const room = await Room.findById(booking.roomId);
    if (room) {
      room.checkOutDate = newCheckOutDate;
      await room.save();
    }

    const populatedBooking = await Booking.findById(booking._id)
      .populate({
        path: 'roomId',
        populate: { path: 'roomTypeId' }
      })
      .populate('guestId');

    if (io) {
      io.emit('bookingUpdated', populatedBooking);
    }

    return res.status(200).json({
      success: true,
      message: `Stay extended by ${days} day(s)`,
      data: populatedBooking
    });

  } catch (error) {
    console.error('Error extending stay:', error);
    return res.status(500).json({
      success: false,
      error: 'Server error extending stay'
    });
  }
};

/**
 * NEW: Get checkout alerts (rooms due for checkout soon)
 */
export const getCheckoutAlerts = async (req, res) => {
  try {
    const { user } = req;
    
    if (!user || !user.hotelId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: User is not associated with any hotel.'
      });
    }

    const now = new Date();
    const twoHoursLater = new Date(now.getTime() + (2 * 60 * 60 * 1000));

    // Find bookings checking out in the next 2 hours
    const urgentCheckouts = await Booking.find({
      hotelId: user.hotelId,
      bookingStatus: 'checked-in',
      checkOutDate: {
        $gte: now,
        $lte: twoHoursLater
      }
    })
    .populate({
      path: 'roomId',
      populate: { path: 'roomTypeId' }
    })
    .populate('guestId')
    .sort({ checkOutDate: 1 });

    // Find overdue checkouts
    const overdueCheckouts = await Booking.find({
      hotelId: user.hotelId,
      bookingStatus: 'checked-in',
      checkOutDate: { $lt: now }
    })
    .populate({
      path: 'roomId',
      populate: { path: 'roomTypeId' }
    })
    .populate('guestId')
    .sort({ checkOutDate: 1 });

    return res.status(200).json({
      success: true,
      data: {
        urgent: urgentCheckouts,
        overdue: overdueCheckouts
      }
    });

  } catch (error) {
    console.error('Error fetching checkout alerts:', error);
    return res.status(500).json({
      success: false,
      error: 'Server error fetching alerts'
    });
  }
};

export const reassignRoom = async (req, res) => {
  try {
    const { currentRoomId, newRoomId } = req.body;
    
    // Find both rooms
    const currentRoom = await Room.findById(currentRoomId);
    const newRoom = await Room.findById(newRoomId);
    
    if (!currentRoom || !newRoom) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }
    
    if (newRoom.status !== 'available') {
      return res.status(400).json({ success: false, error: 'New room is not available' });
    }
    
    // Transfer booking
    const booking = currentRoom.currentBookingId;
    
    newRoom.status = 'occupied';
    newRoom.currentBookingId = booking;
    newRoom.currentGuest = currentRoom.currentGuest;
    
    currentRoom.status = 'available';
    currentRoom.currentBookingId = null;
    currentRoom.currentGuest = null;
    
    await Promise.all([currentRoom.save(), newRoom.save()]);
    
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getDashboardStats = async (req, res) => {
    try {
        const hotelId = req.user.hotelId;

        if (!hotelId) {
            return res.status(400).json({ 
                success: false, 
                message: "User is not associated with a hotel." 
            });
        }

        const hotelObjectId = new Types.ObjectId(hotelId);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        // --- Today's Check-ins ---
        const todayCheckInsTotal = await Booking.countDocuments({
            hotelId: hotelObjectId,
            checkInDate: { $gte: today, $lt: tomorrow }
        });

        const todayCheckInsCompleted = await Booking.countDocuments({
            hotelId: hotelObjectId,
            checkInDate: { $gte: today, $lt: tomorrow },
            bookingStatus: 'checked-in'
        });

        const todayCheckInsPending = todayCheckInsTotal - todayCheckInsCompleted;

        // --- Today's Check-outs ---
        const todayCheckOutsTotal = await Booking.countDocuments({
            hotelId: hotelObjectId,
            checkOutDate: { $gte: today, $lt: tomorrow }
        });

        const todayCheckOutsCompleted = await Booking.countDocuments({
            hotelId: hotelObjectId,
            checkOutDate: { $gte: today, $lt: tomorrow },
            bookingStatus: 'checked-out'
        });

        const todayCheckOutsPending = todayCheckOutsTotal - todayCheckOutsCompleted;

        // --- Occupied Rooms ---
        const totalRooms = await Room.countDocuments({ hotelId: hotelObjectId });
        const occupiedRooms = await Room.countDocuments({ 
            hotelId: hotelObjectId, 
            status: 'occupied' 
        });
        const occupancyRate = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;

        // --- Today's Revenue ---
        const todayRevenueResult = await Booking.aggregate([
            {
                $match: {
                    hotelId: hotelObjectId,
                    createdAt: { $gte: today, $lt: tomorrow },
                    bookingStatus: { $in: ['confirmed', 'checked-in', 'checked-out'] }
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: "$totalAmount" }
                }
            }
        ]);

        const yesterdayRevenueResult = await Booking.aggregate([
            {
                $match: {
                    hotelId: hotelObjectId,
                    createdAt: { $gte: yesterday, $lt: today },
                    bookingStatus: { $in: ['confirmed', 'checked-in', 'checked-out'] }
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: "$totalAmount" }
                }
            }
        ]);

        const todayRevenue = todayRevenueResult[0]?.total || 0;
        const yesterdayRevenue = yesterdayRevenueResult[0]?.total || 1;
        const revenueChange = yesterdayRevenue > 0 
            ? ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100 
            : 0;

        res.status(200).json({
            success: true,
            data: {
                todayCheckIns: {
                    total: todayCheckInsTotal,
                    completed: todayCheckInsCompleted,
                    pending: todayCheckInsPending
                },
                todayCheckOuts: {
                    total: todayCheckOutsTotal,
                    completed: todayCheckOutsCompleted,
                    pending: todayCheckOutsPending
                },
                occupiedRooms: {
                    occupied: occupiedRooms,
                    total: totalRooms,
                    occupancyRate: occupancyRate
                },
                todayRevenue: {
                    amount: todayRevenue,
                    percentageChange: Math.round(revenueChange)
                }
            }
        });

    } catch (error) {
        console.error("Error in getDashboardStats:", error.message);
        res.status(500).json({ 
            success: false, 
            message: "Internal server error",
            error: error.message 
        });
    }
};

/**
 * @desc Get hourly check-in/check-out activity for today
 * @route GET /api/receptionist/checkin-activity
 * @access Private
 */
export const getCheckInActivity = async (req, res) => {
    try {
        const hotelId = req.user.hotelId;

        if (!hotelId) {
            return res.status(400).json({ 
                success: false, 
                message: "User is not associated with a hotel." 
            });
        }

        const hotelObjectId = new Types.ObjectId(hotelId);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Time slots for the day
        const timeSlots = [
            { time: "8 AM", start: 8, end: 10 },
            { time: "10 AM", start: 10, end: 12 },
            { time: "12 PM", start: 12, end: 14 },
            { time: "2 PM", start: 14, end: 16 },
            { time: "4 PM", start: 16, end: 18 },
            { time: "6 PM", start: 18, end: 20 },
        ];

        const activityData = await Promise.all(
            timeSlots.map(async (slot) => {
                const slotStart = new Date(today);
                slotStart.setHours(slot.start, 0, 0, 0);
                const slotEnd = new Date(today);
                slotEnd.setHours(slot.end, 0, 0, 0);

                // Count check-ins in this time slot
                const checkins = await Booking.countDocuments({
                    hotelId: hotelObjectId,
                    checkInDate: { $gte: slotStart, $lt: slotEnd },
                    bookingStatus: 'checked-in'
                });

                // Count check-outs in this time slot
                const checkouts = await Booking.countDocuments({
                    hotelId: hotelObjectId,
                    checkOutDate: { $gte: slotStart, $lt: slotEnd },
                    bookingStatus: 'checked-out'
                });

                return {
                    time: slot.time,
                    checkins,
                    checkouts
                };
            })
        );

        res.status(200).json({
            success: true,
            data: activityData
        });

    } catch (error) {
        console.error("Error in getCheckInActivity:", error.message);
        res.status(500).json({ 
            success: false, 
            message: "Internal server error",
            error: error.message 
        });
    }
};

/**
 * @desc Get weekly revenue data
 * @route GET /api/receptionist/weekly-revenue
 * @access Private
 */
export const getWeeklyRevenue = async (req, res) => {
    try {
        const hotelId = req.user.hotelId;

        if (!hotelId) {
            return res.status(400).json({ 
                success: false, 
                message: "User is not associated with a hotel." 
            });
        }

        const hotelObjectId = new Types.ObjectId(hotelId);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Get last 7 days
        const weekData = [];
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        for (let i = 6; i >= 0; i--) {
            const day = new Date(today);
            day.setDate(day.getDate() - i);
            const nextDay = new Date(day);
            nextDay.setDate(nextDay.getDate() + 1);

            const revenueResult = await Booking.aggregate([
                {
                    $match: {
                        hotelId: hotelObjectId,
                        createdAt: { $gte: day, $lt: nextDay },
                        bookingStatus: { $in: ['confirmed', 'checked-in', 'checked-out'] }
                    }
                },
                {
                    $group: {
                        _id: null,
                        total: { $sum: "$totalAmount" }
                    }
                }
            ]);

            weekData.push({
                day: dayNames[day.getDay()],
                revenue: revenueResult[0]?.total || 0
            });
        }

        res.status(200).json({
            success: true,
            data: weekData
        });

    } catch (error) {
        console.error("Error in getWeeklyRevenue:", error.message);
        res.status(500).json({ 
            success: false, 
            message: "Internal server error",
            error: error.message 
        });
    }
};

/**
 * @desc Get pending check-ins for today
 * @route GET /api/receptionist/pending-checkins
 * @access Private
 */
export const getPendingCheckIns = async (req, res) => {
    try {
        const hotelId = req.user.hotelId;

        if (!hotelId) {
            return res.status(400).json({ 
                success: false, 
                message: "User is not associated with a hotel." 
            });
        }

        const hotelObjectId = new Types.ObjectId(hotelId);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const pendingCheckIns = await Booking.find({
            hotelId: hotelObjectId,
            checkInDate: { $gte: today, $lt: tomorrow },
            bookingStatus: { $in: ['pending', 'confirmed'] }
        })
        .populate('roomId', 'roomNumber')
        .sort({ checkInDate: 1 })
        .limit(10)
        .lean();

        const formattedData = pendingCheckIns.map(booking => ({
            _id: booking._id,
            guestName: booking.guestName,
            roomNumber: booking.roomId?.roomNumber || 'N/A',
            checkInDate: booking.checkInDate,
            confirmationCode: booking.confirmationCode,
            guestPhone: booking.guestPhone,
            guestEmail: booking.guestEmail
        }));

        res.status(200).json({
            success: true,
            data: formattedData
        });

    } catch (error) {
        console.error("Error in getPendingCheckIns:", error.message);
        res.status(500).json({ 
            success: false, 
            message: "Internal server error",
            error: error.message 
        });
    }
};

/**
 * @desc Get expected check-outs for today
 * @route GET /api/receptionist/expected-checkouts
 * @access Private
 */
export const getExpectedCheckOuts = async (req, res) => {
    try {
        const hotelId = req.user.hotelId;

        if (!hotelId) {
            return res.status(400).json({ 
                success: false, 
                message: "User is not associated with a hotel." 
            });
        }

        const hotelObjectId = new Types.ObjectId(hotelId);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const expectedCheckOuts = await Booking.find({
            hotelId: hotelObjectId,
            checkOutDate: { $gte: today, $lt: tomorrow },
            bookingStatus: { $in: ['confirmed', 'checked-in'] }
        })
        .populate('roomId', 'roomNumber')
        .sort({ checkOutDate: 1 })
        .limit(10)
        .lean();

        const formattedData = expectedCheckOuts.map(booking => ({
            _id: booking._id,
            guestName: booking.guestName,
            roomNumber: booking.roomId?.roomNumber || 'N/A',
            checkOutDate: booking.checkOutDate,
            bookingStatus: booking.bookingStatus,
            amountPaid: booking.amountPaid,
            totalAmount: booking.totalAmount
        }));

        res.status(200).json({
            success: true,
            data: formattedData
        });

    } catch (error) {
        console.error("Error in getExpectedCheckOuts:", error.message);
        res.status(500).json({ 
            success: false, 
            message: "Internal server error",
            error: error.message 
        });
    }
};

export const updateRoomStatus = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { status } = req.body;
    const { user } = req;

    // Validate user
    if (!user || !user.hotelId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: User is not associated with any hotel.',
      });
    }

    // Validate status
    const validStatuses = ['available', 'occupied', 'cleaning', 'maintenance', 'reserved'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      });
    }

    // Find the room
    const room = await Room.findOne({ 
      _id: roomId, 
      hotelId: user.hotelId 
    });

    if (!room) {
      return res.status(404).json({
        success: false,
        error: 'Room not found at this hotel.',
      });
    }

    // Validation: Can't set to occupied without a booking
    if (status === 'occupied' && !room.currentBookingId) {
      return res.status(400).json({
        success: false,
        error: 'Cannot set room to occupied without an active booking.',
      });
    }

    // Validation: Can't set occupied room to available if guest is still checked in
    if (room.status === 'occupied' && status === 'available' && room.currentBookingId) {
      const booking = await Booking.findById(room.currentBookingId);
      if (booking && booking.bookingStatus === 'checked-in') {
        return res.status(400).json({
          success: false,
          error: 'Cannot set room to available while guest is checked in. Please check out guest first.',
        });
      }
    }

    // Update room status
    room.status = status;
    await room.save();

    // Get populated room data
    const populatedRoom = await Room.findById(room._id)
      .populate('roomTypeId')
      .populate({
        path: 'currentBookingId',
        populate: { path: 'guestId' }
      });

    // Emit socket event if available
    if (req.io) {
      req.io.emit('roomStatusUpdated', populatedRoom);
    }

    return res.status(200).json({
      success: true,
      message: `Room ${room.roomNumber} status updated to ${status}`,
      data: populatedRoom,
    });

  } catch (error) {
    console.error('Error updating room status:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message,
    });
  }
};