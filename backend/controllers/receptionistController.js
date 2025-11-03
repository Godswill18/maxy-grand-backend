import Room from '../models/roomModel.js';
import User from '../models/userModel.js';
// import nodemailer from 'nodemailer';

// // Configure mail transporter
// const transporter = nodemailer.createTransport({
//   service: 'gmail',
//   auth: {
//     user: process.env.SMTP_EMAIL,
//     pass: process.env.SMTP_PASSWORD,
//   },
// });

// 🧾 Get all rooms and their statuses
export const getAllRooms = async (req, res) => {
  try {
    const rooms = await Room.find()
      .populate('hotelId')
      .populate('roomTypeId')
      .populate('currentBookingId');

    return res.status(200).json({
      success: true,
      data: rooms,
    });
  } catch (error) {
    console.error('Error fetching rooms:', error.message);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// 🏨 Get only available rooms
export const getAvailableRooms = async (req, res) => {
  try {
    const rooms = await Room.find({ status: 'available' })
      .populate('roomTypeId');
    res.status(200).json({ success: true, data: rooms });
  } catch (error) {
    console.error('Error fetching available rooms:', error.message);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// 🕓 Check for rooms whose checkout time has arrived
export const notifyCheckouts = async (req, res) => {
  try {
    const now = new Date();
    const roomsDue = await Room.find({
      checkOutDate: { $lte: now },
      status: 'occupied',
    }).populate('bookedBy');

    for (const room of roomsDue) {
      if (room.bookedBy?.email) {
        await transporter.sendMail({
          from: process.env.SMTP_EMAIL,
          to: room.bookedBy.email,
          subject: `Checkout Notice for Room ${room.roomNumber}`,
          html: `
            <p>Hello ${room.bookedBy.fullName || 'Guest'},</p>
            <p>Your checkout time for Room <b>${room.roomNumber}</b> has arrived.</p>
            <p>Would you like to checkout now or extend your stay?</p>
          `,
        });
      }
    }

    res.status(200).json({
      success: true,
      message: `${roomsDue.length} checkout notifications sent`,
    });
  } catch (error) {
    console.error('Error notifying checkouts:', error.message);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// 🧹 Request cleaning
export const requestCleaning = async (req, res) => {
  try {
    const { roomId } = req.params;
    const room = await Room.findByIdAndUpdate(
      roomId,
      { status: 'cleaning' },
      { new: true }
    );

    if (!room) return res.status(404).json({ success: false, error: 'Room not found' });

    return res.status(200).json({
      success: true,
      message: `Cleaning requested for room ${room.roomNumber}`,
      data: room,
    });
  } catch (error) {
    console.error('Error requesting cleaning:', error.message);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// 🔄 Update room status (available, occupied, etc.)
export const updateRoomStatus = async (req, res) => {
  try {
    const { roomId } = req.params;
    const {status} = req.body;

    const room = await Room.findByIdAndUpdate(roomId, { status }, { new: true });

    if (!room) return res.status(404).json({ success: false, error: 'Room not found' });

    return res.status(200).json({
      success: true,
      message: `Room ${room.roomNumber} status updated to ${status}`,
      data: room,
    });
  } catch (error) {
    console.error('Error updating room status:', error.message);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
