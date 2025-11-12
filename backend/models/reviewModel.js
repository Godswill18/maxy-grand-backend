import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema(
  {
    hotelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hotel',
      required: true,
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      unique: true, // A booking should only have one review
    },
    // This is the registered guest user, if they were logged in
    guestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // This is the name displayed (could be from guestId or entered manually)
    guestName: {
      type: String,
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      required: true,
    },
  },
  { timestamps: true } // 'createdAt' will be our review date
);

const Review = mongoose.model('Review', reviewSchema);
export default Review;