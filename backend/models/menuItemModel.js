// models/menuItemModel.js
import mongoose from 'mongoose';

const menuItemSchema = new mongoose.Schema({
  hotelId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hotel',
    required: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    required: false,
  },
  price: {
    type: Number,
    required: true,
  },
  // 'category' defines which menu it appears on (e.g., "Bar" or "Restaurant")
  category: {
    type: String,
    enum: ['bar', 'restaurant', 'room-service'],
    required: true,
  },
  images: {
    type: [String],
    default: [],
  },
  // This is what staff toggle to make an item "Sold Out"
  isAvailable: {
    type: Boolean,
    default: true,
  },
  // Optional: helps the guest know what to expect
  estimatedPrepTime: {
    type: Number, // in minutes
  },
  isAvailable:{
    type: Boolean,
    default: true,
  },
  tags: {
    type: [String], // e.g., "vegetarian", "spicy", "popular"
  }
}, { timestamps: true });

const MenuItem = mongoose.model('MenuItem', menuItemSchema);
export default MenuItem;

// // models/menuItemModel.js
// import mongoose from 'mongoose';

// const menuItemSchema = new mongoose.Schema({
//   hotelId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Hotel',
//     required: true,
//   },
//   name: {
//     type: String,
//     required: true,
//     trim: true,
//   },
//   description: {
//     type: String,
//     required: false,
//   },
//   price: {
//     type: Number,
//     required: true,
//   },
//   // 'category' defines which menu it appears on (e.g., "Bar" or "Restaurant")
//   category: {
//     type: String,
//     enum: ['bar', 'restaurant', 'room-service'],
//     required: true,
//   },
//   images: {
//     type: [String],
//     default: [],
//   },
//   // This is what staff toggle to make an item "Sold Out"
//   isAvailable: {
//     type: Boolean,
//     default: true,
//   },
//   // Optional: helps the guest know what to expect
//   estimatedPrepTime: {
//     type: Number, // in minutes
//   },
//   tags: {
//     type: [String], // e.g., "vegetarian", "spicy", "popular"
//   }
// }, { timestamps: true });

// const MenuItem = mongoose.model('MenuItem', menuItemSchema);
// export default MenuItem;