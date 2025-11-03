// models/bookingModel.js
import mongoose from 'mongoose';

const bookingSchema = new mongoose.Schema({
  hotelId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hotel',
    required: true,
  },
  // Links to the specific room (e.g., "Room 101")
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true,
  },
  // Links to the User who booked online
  guestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null, // Null if it's a walk-in
  },
  
  // --- For Walk-in Guests (Receptionist Entry) ---
  guestName: {
    type: String,
    required: true,
  },
  guestEmail: {
    type: String,
  },
  guestPhone: {
    type: String,
  },

  // --- Booking & Payment Details ---
  checkInDate: {
    type: Date,
    required: true,
  },
  checkOutDate: {
    type: Date,
    required: true,
  },
  bookingType: {
    type: String,
    enum: ['online', 'in-person'],
    required: true,
  },
  totalAmount: {
    type: Number, // The total cost of the stay
    required: true,
  },
  amountPaid: {
    type: Number,
    required: true,
    default: 0,
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'partial'],
    default: 'pending',
  },
  bookingStatus: {
    type: String,
    enum: ['pending', 'confirmed', 'checked-in', 'checked-out', 'cancelled'],
    default: 'pending',
  },
}, { timestamps: true });

const Booking = mongoose.model('Booking', bookingSchema);
export default Booking;