// models/bookingModel.js
import mongoose from 'mongoose';

const bookingSchema = new mongoose.Schema({
  hotelId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hotel',
    required: true,
  },
  // Links to the specific room (e.g., "Room 101")
  roomTypeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RoomType',
    required: true,
  },
  // Links to the User who booked online
  guestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null, // Null if it's a walk-in
  },
  roomId:{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    // required: true,
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
  numberOfGuests: {
    type: Number,
    default: 0,
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
    enum: ['online', 'walk-in'],
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
  confirmationCode: {
    type: String,
    required: true,
    unique: true,
  },
  guestDetails: {
    address: { type: String },
    city: { type: String },
    state: { type: String },
    arrivingFrom: { type: String }, // Where they traveled from
    nextOfKinName: { type: String },
    nextOfKinPhone: { type: String },
  },
  preferences: {
    extraBedding: { type: Boolean, default: false },
    specialRequests: { type: String } // You might already have this
  },
  // signature: { type: String }, // This will store a Base64 Image string
}, { timestamps: true });

const Booking = mongoose.model('Booking', bookingSchema);
export default Booking;