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
    title: {
      type: String,
      default: null,
      maxlength: 150,
    },
    serviceRating: {
      type: Number,
      default: null,
      min: 1,
      max: 5,
    },
    cleanlinessRating: {
      type: Number,
      default: null,
      min: 1,
      max: 5,
    },
    wouldRecommend: {
      type: Boolean,
      default: null,
    },
  },
  { timestamps: true } // 'createdAt' will be our review date
);

// Indexes for fast dashboard queries
reviewSchema.index({ hotelId: 1, createdAt: -1 });
reviewSchema.index({ bookingId: 1 });
reviewSchema.index({ createdAt: -1 });

const Review = mongoose.model('Review', reviewSchema);
export default Review;