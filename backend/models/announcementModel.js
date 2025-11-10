import mongoose from 'mongoose';

const announcementSchema = new mongoose.Schema({
    hotelId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hotel',
        required: true,
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
        type: String, // File path to the image
        required: [true, 'Image is required'],
    },
    status: {
        type: String,
        enum: ['active', 'draft'],
        default: 'draft',
        required: true,
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
}, { timestamps: true });

const Announcement = mongoose.model('Announcement', announcementSchema);

export default Announcement;