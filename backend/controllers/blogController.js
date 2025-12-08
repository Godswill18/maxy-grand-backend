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
 * Helper function to delete file from disk
 */
const deleteFileFromDisk = (filePath) => {
  try {
    // Handle both absolute paths and relative paths
    let fullPath;
    if (path.isAbsolute(filePath)) {
      fullPath = filePath;
    } else {
      fullPath = path.join(process.cwd(), filePath);
    }
    
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      console.log('Deleted file:', fullPath);
      return true;
    }
  } catch (error) {
    console.error('Error deleting file:', error);
  }
  return false;
};

// ======================== PUBLIC ENDPOINTS ========================

/**
 * GET /api/blogs/live
 * Get all published blog posts (for guests)
 */
export const getBlogPostsForGuests = async (req, res) => {
  try {
    const posts = await Blog.find({ isLive: true })
      .sort({ createdAt: -1 })
      .select('-content')
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

// ======================== PROTECTED ENDPOINTS (Admin) ========================

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

    // Validate category
    const validCategories = ['News', 'Events', 'Tips & Guides', 'Promotions', 'Room Updates', 'Other'];
    if (!validCategories.includes(category)) {
      // Delete uploaded file if category is invalid
      deleteFileFromDisk(path.join(process.cwd(), req.file.path));
      return res.status(400).json({
        success: false,
        error: `Invalid category. Must be one of: ${validCategories.join(', ')}`,
      });
    }

    const slug = generateSlug(title);
    const date = formatDate(new Date());

    // Check if slug already exists
    const existingBlog = await Blog.findOne({ slug });
    if (existingBlog) {
      // Delete uploaded file if slug exists
      deleteFileFromDisk(path.join(process.cwd(), req.file.path));
      return res.status(400).json({
        success: false,
        error: 'A blog with this title already exists',
      });
    }

    // Convert isLive to boolean properly
    const isLiveBoolean = isLive === 'true' || isLive === true;

    const newBlog = new Blog({
      title: title.trim(),
      slug,
      excerpt: excerpt.trim(),
      content,
      category,
      author: author.trim(),
      date,
      readTime: readTime || '5 min read',
      image: `${req.file.path}`, // Store relative path with leading slash
      images: [],
      isLive: isLiveBoolean, // ✅ Use boolean value
      views: 0,
    });

    const savedBlog = await newBlog.save();

    return res.status(201).json({
      success: true,
      post: savedBlog,
      message: 'Blog created successfully',
    });
  } catch (error) {
    // Delete uploaded file on error
    if (req.file) {
      deleteFileFromDisk(path.join(process.cwd(), req.file.path));
    }
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
      if (req.file) {
        deleteFileFromDisk(path.join(process.cwd(), req.file.path));
      }
      return res.status(404).json({ success: false, error: 'Blog not found' });
    }

    const updateData = {
      title: title ? title.trim() : existingBlog.title,
      excerpt: excerpt ? excerpt.trim() : existingBlog.excerpt,
      content: content || existingBlog.content,
      category: category || existingBlog.category,
      author: author ? author.trim() : existingBlog.author,
      readTime: readTime || existingBlog.readTime,
      isLive: isLive !== undefined ? (isLive === 'true' || isLive === true) : existingBlog.isLive,
      updatedAt: new Date(),
    };

    // Validate category if provided
    if (category) {
      const validCategories = ['News', 'Events', 'Tips & Guides', 'Promotions', 'Room Updates', 'Other'];
      if (!validCategories.includes(category)) {
        if (req.file) {
          deleteFileFromDisk(path.join(process.cwd(), req.file.path));
        }
        return res.status(400).json({
          success: false,
          error: `Invalid category. Must be one of: ${validCategories.join(', ')}`,
        });
      }
    }

    // Update slug if title changed
    if (title && title.trim() !== existingBlog.title) {
      const newSlug = generateSlug(title);
      const slugExists = await Blog.findOne({ slug: newSlug, _id: { $ne: id } });
      if (slugExists) {
        if (req.file) {
          deleteFileFromDisk(path.join(process.cwd(), req.file.path));
        }
        return res.status(400).json({
          success: false,
          error: 'Another blog with this title already exists',
        });
      }
      updateData.slug = newSlug;
    }

    // Update image if new one provided
    if (req.file) {
      // Delete old image if it exists
      deleteFileFromDisk(path.join(process.cwd(), existingBlog.image));
      updateData.image = `${req.file.path}`;
    }

    const updatedBlog = await Blog.findByIdAndUpdate(id, updateData, { new: true }).lean();

    return res.status(200).json({
      success: true,
      post: updatedBlog,
      message: 'Blog updated successfully',
    });
  } catch (error) {
    if (req.file) {
      deleteFileFromDisk(path.join(process.cwd(), req.file.path));
    }
    const message = error instanceof Error ? error.message : 'Failed to update blog';
    return res.status(500).json({ success: false, error: message });
  }
};

/**
 * DELETE /api/blogs/:id
 * Delete blog post (for superadmin)
 * ✅ Also deletes all associated images
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
      console.log('Deleting featured image:', blog.image);
      deleteFileFromDisk(path.join(process.cwd(), blog.image));
    }

    // ✅ Delete all associated images in the images array
    if (blog.images && Array.isArray(blog.images) && blog.images.length > 0) {
      blog.images.forEach((img) => {
        if (img.url) {
          console.log('Deleting blog image:', img.url);
          deleteFileFromDisk(path.join(process.cwd(), img.url));
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
 * ✅ Fixed: Now properly toggles the status
 */
export const toggleBlogLive = async (req, res) => {
  try {
    const { id } = req.params;
    const { isLive } = req.body;

       // ✅ Handle string boolean values from form data
    if (typeof isLive === 'string') {
      isLive = isLive === 'true' || isLive === '1';
    }

    const blog = await Blog.findById(id);
    if (!blog) {
      return res.status(404).json({ success: false, error: 'Blog not found' });
    }
    

    console.log('Current isLive:', blog.isLive);
    console.log('Received isLive:', isLive);

    // Toggle the status: if isLive is true, set to false, and vice versa
    const newIsLiveStatus = !isLive;

     console.log('New isLive status:', newIsLiveStatus);

    const updatedBlog = await Blog.findByIdAndUpdate(
      id,
      { 
        isLive: newIsLiveStatus, 
        updatedAt: new Date() 
      },
      { new: true }
    ).lean();

    return res.status(200).json({
      success: true,
      post: updatedBlog,
      message: `Blog ${newIsLiveStatus ? 'published' : 'unpublished'} successfully`,
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

    if (isLive === undefined) {
      return res.status(400).json({
        success: false,
        error: 'isLive status is required',
      });
    }

    const blog = await Blog.findById(id);
    if (!blog) {
      return res.status(404).json({ success: false, error: 'Blog not found' });
    }

    const updatedBlog = await Blog.findByIdAndUpdate(
      id,
      { 
        isLive: isLive === 'true' || isLive === true, 
        updatedAt: new Date() 
      },
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
 * ✅ Fixed: Deletes image on error
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
      deleteFileFromDisk(path.join(process.cwd(), req.file.path));
      return res.status(404).json({ success: false, error: 'Blog not found' });
    }

    const imageData = {
      id: uuidv4(),
      url: `${req.file.path}`,
      alt: (alt || 'Blog image').trim(),
      caption: (caption || '').trim(),
    };

    // Add image to images array
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
    if (req.file) {
      deleteFileFromDisk(path.join(process.cwd(), req.file.path));
    }
    const message = error instanceof Error ? error.message : 'Failed to upload image';
    return res.status(500).json({ success: false, error: message });
  }
};

/**
 * DELETE /api/blogs/:id/images/:imageId
 * Delete image from blog (for superadmin)
 * ✅ Fixed: Properly handles image deletion
 */
export const deleteBlogImage = async (req, res) => {
  try {
    const { id, imageId } = req.params;

    const blog = await Blog.findById(id);
    if (!blog) {
      return res.status(404).json({ success: false, error: 'Blog not found' });
    }

    const image = blog.images.find((img) => img.id === imageId);

    if (!image) {
      return res.status(404).json({ success: false, error: 'Image not found' });
    }

    // Delete image file from disk
    console.log('Deleting image:', image.url);
    deleteFileFromDisk(path.join(process.cwd(), image.url));

    // Remove image from database
    blog.images = blog.images.filter((img) => img.id !== imageId);
    blog.updatedAt = new Date();
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