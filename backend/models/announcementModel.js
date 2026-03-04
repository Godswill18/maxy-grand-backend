import mongoose from 'mongoose';

const announcementSchema = new mongoose.Schema({
    hotelId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hotel',
        required: false, // null = global (superadmin-level)
        default: null,
    },
    title: {
        type: String,
        required: [true, 'Title is required'],
        trim: true,
    },
    content: {
        type: String,
        required: [true, 'Content is required'],
    },
    imageUrl: {
        type: String,
        default: null,
    },
    status: {
        type: String,
        enum: ['active', 'draft'],
        default: 'draft',
        required: true,
    },
    targetAudience: {
        type: String,
        enum: ['guest', 'staff', 'both'],
        default: 'guest',
    },
    startDate: {
        type: Date,
        default: null,
    },
    endDate: {
        type: Date,
        default: null,
    },
    createdByRole: {
        type: String,
        enum: ['superadmin', 'admin'],
        required: true,
    },
    ctaButtonText: {
        type: String,
        default: null,
        trim: true,
    },
    ctaButtonUrl: {
        type: String,
        default: null,
        trim: true,
    },
    priority: {
        type: Number,
        default: 0,
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
}, { timestamps: true });

// Compound indexes for efficient queries
announcementSchema.index({ hotelId: 1, status: 1, targetAudience: 1 });
announcementSchema.index({ status: 1, targetAudience: 1 });
announcementSchema.index({ startDate: 1, endDate: 1 });
announcementSchema.index({ priority: -1, createdAt: -1 });

const Announcement = mongoose.model('Announcement', announcementSchema);

export default Announcement;
