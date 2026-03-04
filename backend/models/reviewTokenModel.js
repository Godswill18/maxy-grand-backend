import mongoose from 'mongoose';

const reviewTokenSchema = new mongoose.Schema({
    bookingId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking',
        required: true,
        unique: true, // One token per booking
    },
    guestId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
    },
    hotelId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hotel',
        required: true,
    },
    tokenHash: {
        type: String,
        required: true,
    },
    expiresAt: {
        type: Date,
        required: true,
    },
    used: {
        type: Boolean,
        default: false,
    },
}, { timestamps: true });

// Fast lookup by token hash
reviewTokenSchema.index({ tokenHash: 1 });

// TTL index — MongoDB auto-deletes expired documents
reviewTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const ReviewToken = mongoose.model('ReviewToken', reviewTokenSchema);
export default ReviewToken;
