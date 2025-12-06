import mongoose from 'mongoose';

const blogSchema = new mongoose.Schema({
  title: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  excerpt: { type: String, required: true },
  content: { type: String, required: true },
  category: { type: String, required: true },
  author: { type: String, required: true },
  date: { type: String, required: true },
  readTime: { type: String, required: true },
  image: { type: String, required: true },
  images: [{
    id: String,
    url: String,
    alt: String,
    caption: String
  }],
  isLive: { type: Boolean, default: false },
  views: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Blog = mongoose.model('Blog', blogSchema);

export default Blog;