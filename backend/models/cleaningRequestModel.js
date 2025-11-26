import mongoose from 'mongoose';

const cleaningRequestSchema = new mongoose.Schema(
  {
    hotelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hotel',
      required: true,
    },
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
    },
    assignedCleaner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'in-progress', 'completed'], // Updated enums
      default: 'pending',
      required: true,
    },
    // --- New Fields for Tracking ---
    startTime: {
      type: Date,
    },
    finishTime: {
      type: Date,
    },
    actualDuration: {
      type: Number, // In minutes
    },
    priority: {
      type: String,
      enum: ['High', 'Medium', 'Low'],
      default: 'Medium',
    },
    estimatedDuration: {
      type: String, // e.g., '30 min'
      default: '30 min',
    },
    notes: {
      type: String,
    },
  },
  { timestamps: true }
);

const CleaningRequest = mongoose.model('CleaningRequest', cleaningRequestSchema);
export default CleaningRequest;