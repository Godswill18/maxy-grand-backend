import Blog from '../models/blogModel.js';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import slugify from 'slugify';

/**
 * Helper function to generate slug from title
 */
const generateSlug = (title) => {
  return slugify(title, {
    lower: true,
    strict: true,
    replacement: '-',
  });
};

/**
 * Helper function to format date
 */
const formatDate = (date) => {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

/**
 * GET /api/blogs/live
 * Get all published blog posts (for guests)
 */
export const getBlogPostsForGuests = async (req, res) => {
  try {
    const posts = await Blog.find({ isLive: true })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      posts,
      message: 'Published blogs fetched successfully',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch blogs';
    return res.status(500).json({ success: false, error: message });
  }
};

/**
 * GET /api/blogs/slug/:slug
 * Get single blog by slug (for guests)
 */
export const getBlogBySlug = async (req, res) => {
  try {
    const { slug } = req.params;

    const post = await Blog.findOne({ slug, isLive: true }).lean();
    
    if (!post) {
      return res.status(404).json({ success: false, error: 'Blog not found' });
    }

    return res.status(200).json({
      success: true,
      post,
      message: 'Blog fetched successfully',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch blog';
    return res.status(500).json({ success: false, error: message });
  }
};

/**
 * PUT /api/blogs/:id/views
 * Increment blog view count (for guests)
 */
export const incrementBlogViews = async (req, res) => {
  try {
    const { id } = req.params;

    const post = await Blog.findByIdAndUpdate(
      id,
      { $inc: { views: 1 } },
      { new: true }
    ).lean();

    if (!post) {
      return res.status(404).json({ success: false, error: 'Blog not found' });
    }

    return res.status(200).json({
      success: true,
      post,
      message: 'View count incremented',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to increment views';
    return res.status(500).json({ success: false, error: message });
  }
};

/**
 * GET /api/blogs/admin
 * Get all blogs including drafts (for superadmin)
 */
export const getAllBlogsForAdmin = async (req, res) => {
  try {
    const posts = await Blog.find()
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      posts,
      message: 'All blogs fetched successfully',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch blogs';
    return res.status(500).json({ success: false, error: message });
  }
};

/**
 * POST /api/blogs
 * Create new blog post (for superadmin)
 */
export const createBlog = async (req, res) => {
  try {
    const { title, excerpt, content, category, author, readTime, isLive } = req.body;

    // Validate required fields
    if (!title || !excerpt || !content || !category || !author || !req.file) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields. Please provide title, excerpt, content, category, author, and an image.',
      });
    }

    const slug = generateSlug(title);
    const date = formatDate(new Date());

    const newBlog = new Blog({
      title,
      slug,
      excerpt,
      content,
      category,
      author,
      date,
      readTime: readTime || '5 min read',
      image: `/uploads/blogs/${req.file.filename}`,
      images: [],
      isLive: isLive === 'true' || isLive === true || false,
      views: 0,
    });

    const savedBlog = await newBlog.save();

    return res.status(201).json({
      success: true,
      post: savedBlog,
      message: 'Blog created successfully',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create blog';
    return res.status(500).json({ success: false, error: message });
  }
};

/**
 * PUT /api/blogs/:id
 * Update blog post (for superadmin)
 */
export const updateBlog = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, excerpt, content, category, author, readTime, isLive } = req.body;

    // Find the blog first to check if it exists
    const existingBlog = await Blog.findById(id);
    if (!existingBlog) {
      return res.status(404).json({ success: false, error: 'Blog not found' });
    }

    const updateData = {
      title: title || existingBlog.title,
      excerpt: excerpt || existingBlog.excerpt,
      content: content || existingBlog.content,
      category: category || existingBlog.category,
      author: author || existingBlog.author,
      readTime: readTime || existingBlog.readTime,
      isLive: isLive !== undefined ? (isLive === 'true' || isLive === true) : existingBlog.isLive,
      updatedAt: new Date(),
    };

    // Update slug if title changed
    if (title && title !== existingBlog.title) {
      updateData.slug = generateSlug(title);
    }

    // Update image if new one provided
    if (req.file) {
      // Delete old image if it exists
      const oldImagePath = path.join(process.cwd(), 'public', existingBlog.image);
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }
      updateData.image = `/uploads/blogs/${req.file.filename}`;
    }

    const updatedBlog = await Blog.findByIdAndUpdate(id, updateData, { new: true }).lean();

    return res.status(200).json({
      success: true,
      post: updatedBlog,
      message: 'Blog updated successfully',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update blog';
    return res.status(500).json({ success: false, error: message });
  }
};

/**
 * DELETE /api/blogs/:id
 * Delete blog post (for superadmin)
 */
export const deleteBlog = async (req, res) => {
  try {
    const { id } = req.params;

    const blog = await Blog.findByIdAndDelete(id);
    
    if (!blog) {
      return res.status(404).json({ success: false, error: 'Blog not found' });
    }

    // Delete featured image
    if (blog.image) {
      const imagePath = path.join(process.cwd(), 'public', blog.image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    // Delete associated images
    if (blog.images && blog.images.length > 0) {
      blog.images.forEach((img) => {
        const filePath = path.join(process.cwd(), 'public', img.url);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Blog deleted successfully',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete blog';
    return res.status(500).json({ success: false, error: message });
  }
};

/**
 * PUT /api/blogs/:id/toggle-live
 * Toggle blog live/draft status (for superadmin)
 */
export const toggleBlogLive = async (req, res) => {
  try {
    const { id } = req.params;
    const { isLive } = req.body;

    const blog = await Blog.findById(id);
    if (!blog) {
      return res.status(404).json({ success: false, error: 'Blog not found' });
    }

    const updatedBlog = await Blog.findByIdAndUpdate(
      id,
      { isLive: !isLive, updatedAt: new Date() },
      { new: true }
    ).lean();

    return res.status(200).json({
      success: true,
      post: updatedBlog,
      message: `Blog ${!isLive ? 'published' : 'unpublished'} successfully`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to toggle blog status';
    return res.status(500).json({ success: false, error: message });
  }
};

/**
 * PUT /api/blogs/:id/set-live
 * Set blog to live or draft (for superadmin)
 */
export const setBlogLive = async (req, res) => {
  try {
    const { id } = req.params;
    const { isLive } = req.body;

    const blog = await Blog.findById(id);
    if (!blog) {
      return res.status(404).json({ success: false, error: 'Blog not found' });
    }

    const updatedBlog = await Blog.findByIdAndUpdate(
      id,
      { isLive: isLive === 'true' || isLive === true, updatedAt: new Date() },
      { new: true }
    ).lean();

    return res.status(200).json({
      success: true,
      post: updatedBlog,
      message: `Blog ${isLive ? 'published' : 'moved to draft'} successfully`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to set blog status';
    return res.status(500).json({ success: false, error: message });
  }
};

/**
 * POST /api/blogs/:id/images
 * Upload additional image to blog (for superadmin)
 */
export const uploadBlogImage = async (req, res) => {
  try {
    const { id } = req.params;
    const { alt, caption } = req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No image provided',
      });
    }

    const blog = await Blog.findById(id);
    if (!blog) {
      return res.status(404).json({ success: false, error: 'Blog not found' });
    }

    const imageData = {
      id: uuidv4(),
      url: `/uploads/blogs/${req.file.filename}`,
      alt: alt || 'Blog image',
      caption: caption || '',
    };

    blog.images.push(imageData);
    blog.updatedAt = new Date();
    const updatedBlog = await blog.save();

    return res.status(200).json({
      success: true,
      image: imageData,
      images: updatedBlog.images,
      message: 'Image uploaded successfully',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to upload image';
    return res.status(500).json({ success: false, error: message });
  }
};

/**
 * DELETE /api/blogs/:id/images/:imageId
 * Delete image from blog (for superadmin)
 */
export const deleteBlogImage = async (req, res) => {
  try {
    const { id, imageId } = req.params;

    const blog = await Blog.findById(id);
    if (!blog) {
      return res.status(404).json({ success: false, error: 'Blog not found' });
    }

    const image = blog.images.find((img) => img.id === imageId);

    if (image) {
      // Delete image file from disk
      const filePath = path.join(process.cwd(), 'public', image.url);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      // Remove image from database
      blog.images = blog.images.filter((img) => img.id !== imageId);
      blog.updatedAt = new Date();
    }

    const updatedBlog = await blog.save();

    return res.status(200).json({
      success: true,
      images: updatedBlog.images,
      message: 'Image deleted successfully',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete image';
    return res.status(500).json({ success: false, error: message });
  }
};