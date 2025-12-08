import mongoose from 'mongoose';
import imageSchema from './imageModel.js';

const blogSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Blog title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    slug: {
      type: String,
      required: [true, 'Blog slug is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    excerpt: {
      type: String,
      required: [true, 'Blog excerpt is required'],
      maxlength: [500, 'Excerpt cannot exceed 500 characters'],
      trim: true,
    },
    content: {
      type: String,
      required: [true, 'Blog content is required'],
    },
    category: {
      type: String,
      required: [true, 'Blog category is required'],
      enum: ['News', 'Events', 'Tips & Guides', 'Promotions', 'Room Updates', 'Other'],
      trim: true,
    },
    author: {
      type: String,
      required: [true, 'Blog author is required'],
      trim: true,
      maxlength: [100, 'Author name cannot exceed 100 characters'],
    },
    date: {
      type: String,
      required: [true, 'Blog date is required'],
    },
    readTime: {
      type: String,
      default: '5 min read',
      trim: true,
    },
    image: {
      type: String,
      required: [true, 'Featured image is required'],
    },
    images: {
      type: [imageSchema],
      default: [],
    },
    isLive: {
      type: Boolean,
      default: false,
      index: true, // Index for faster queries
    },
    views: {
      type: Number,
      default: 0,
      min: [0, 'Views cannot be negative'],
    },
  },
  {
    timestamps: true, // Automatically manages createdAt and updatedAt
  }
);

// Indexes for better query performance
blogSchema.index({ createdAt: -1 });
blogSchema.index({ category: 1 });

// Pre-save middleware (optional - for validation)
blogSchema.pre('save', function (next) {
  // Trim string fields
  if (this.title) this.title = this.title.trim();
  if (this.excerpt) this.excerpt = this.excerpt.trim();
  if (this.author) this.author = this.author.trim();
  next();
});

const Blog = mongoose.model('Blog', blogSchema);

export default Blog;