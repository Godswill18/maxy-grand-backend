import mongoose from 'mongoose';

const gallerySchema = new mongoose.Schema({
  images: {
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
    enum: ['Rooms', 'Restaurant', 'Pool', 'Events', 'Exterior', 'Other'],
    default: 'Other'
  },
  isLive: {
    type: Boolean,
    default: false,  // Images are draft by default
  },
  // User who uploaded it
//   uploadedBy: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'User',
//     required: true,
//   },
}, { timestamps: true });

const Gallery = mongoose.model('Gallery', gallerySchema);

export default Gallery;