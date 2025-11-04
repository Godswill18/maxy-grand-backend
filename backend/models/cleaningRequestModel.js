import mongoose from 'mongoose';

const cleaningRequestSchema = new mongoose.Schema({
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
    // The cleaner (User) assigned to this task
    assignedCleaner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    // The admin/receptionist who created the request
    requestedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    status: {
        type: String,
        enum: ['pending', 'completed'],
        default: 'pending',
        required: true,
    },
    notes: {
        type: String,
    },
}, { timestamps: true });

const CleaningRequest = mongoose.model('CleaningRequest', cleaningRequestSchema);

export default CleaningRequest;