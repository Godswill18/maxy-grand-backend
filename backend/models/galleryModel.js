import mongoose from 'mongoose';

const gallerySchema = new mongoose.Schema({
    hotelId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hotel',
        required: true,
    },
  imageUrl: {
        type: [String],
        required: true,
    },
    title: {
        type: String,
        required: true,
    },
    category: {
        type: String,
        required: true,
        trim: true,
        // Example categories
        enum: ['Rooms', 'Restaurant', 'Pool', 'Events', 'Exterior', 'Other'],
        default: 'Other'
    },
    // User who uploaded it
    uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
}, { timestamps: true });

const Gallery = mongoose.model('Gallery', gallerySchema);

export default Gallery;