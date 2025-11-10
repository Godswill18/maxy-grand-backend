import Post from '../models/postModel.js';
import mongoose from 'mongoose';
import fs from 'fs'; // Import File System module
import path from 'path'; // Often useful for constructing paths


// Helper function to delete a single file
// Helper function to delete a single file OR an array of files
const deleteFiles = (files) => {
    let filesToDelete = [];

    // Check if 'files' is a single string and wrap it in an array
    if (typeof files === 'string') {
        filesToDelete = [files];
    } 
    // Check if it's already an array
    else if (Array.isArray(files)) {
        filesToDelete = files;
    }

    if (filesToDelete.length === 0) return;

    filesToDelete.forEach(filePath => {
        if (typeof filePath !== 'string') return; // Skip if not a string path
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`Deleted file: ${filePath}`);
            }
        } catch (err) {
            console.error(`Error deleting file ${filePath}:`, err.message);
        }
    });
};


/**
 * @desc    Create a new post (blog or news)
 * @route   POST /api/posts
 * @access  Private (Admin / Superadmin)
 */
export const createPost = async (req, res) => {
  try {
    const { title, content, status, postType } = req.body;
    const author = req.user.id;
    const hotelId = req.user.hotelId;

    // ✅ Handle multiple uploads
    let featuredImage = [];
    if (req.files && req.files.length > 0) {
      featuredImage = req.files.map(file => file.path); // store all paths in array
    }

    // Validation
    if (!title || !content || !postType) {
      if (featuredImage.length > 0) deleteFiles(featuredImage);
      return res.status(400).json({ message: 'Title, content, and postType are required' });
    }

    const post = new Post({
      hotelId,
      author,
      title,
      content,
      featuredImage, // now stores multiple images
      status: status || 'draft',
      postType,
    });

    const createdPost = await post.save();
    res.status(201).json(createdPost);
  } catch (error) {
    // Cleanup on failure
    if (req.files && req.files.length > 0) {
      const paths = req.files.map(f => f.path);
      deleteFiles(paths);
    }
    res.status(500).json({ message: 'Server error creating post', error: error.message });
  }
};


/**
 * @desc    Get all public posts (filtered by type)
 * @route   GET /api/posts/public?type=blog
 * @route   GET /api/posts/public?type=news
 * @access  Public
 */
export const getPublicPosts = async (req, res) => {
  try {
    // const { type } = req.query; // 'blog' or 'news'

    // if (!type) {
    //     return res.status(400).json({ message: 'A "type" query parameter (blog or news) is required' });
    // }

    const posts = await Post.find({
    //   postType: type,
      status: 'published',
    })
      .populate('author', 'name')
      .sort({ createdAt: -1 });

    res.status(200).json(posts);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching posts', error: error.message });
  }
};

/**
 * @desc    Get a single public post by its slug
 * @route   GET /api/posts/public/:slug
 * @access  Public
 */
// export const getPublicPostBySlug = async (req, res) => {
//   try {
//     const post = await Post.findOne({
//       slug: req.params.slug,
//       status: 'published',
//     }).populate('author', 'name email');

//     if (post) {
//       res.status(200).json(post);
//     } else {
//       res.status(404).json({ message: 'Post not found or not published' });
//     }
//   } catch (error) {
//     res.status(500).json({ message: 'Server error fetching post', error: error.message });
//   }
// };

/**
 * @desc    Get all posts for the logged-in admin (drafts + published)
 * @route   GET /api/posts/admin
 * @access  Private (Admin / Superadmin)
 */
export const getAdminPosts = async (req, res) => {
    try {
      let query = {};
      // Superadmin sees all, Admin sees only their hotel's posts
      if (req.user.role === 'admin') {
        query.hotelId = req.user.hotelId;
      }
  
      const posts = await Post.find(query)
        .populate('author', 'name')
        .sort({ createdAt: -1 });
  
      res.status(200).json(posts);
    } catch (error) {
      res.status(500).json({ message: 'Server error fetching admin posts', error: error.message });
    }
  };

/**
 * @desc    Update a post
 * @route   PATCH /api/posts/:id
 * @access  Private (Admin / Superadmin)
 */
export const updatePost = async (req, res) => {
  try {
    const { title, content, status } = req.body;
    const { id: postId } = req.params;

    const post = await Post.findById(postId);
    if (!post) {
      if (req.files && req.files.length > 0) req.files.forEach(f => deleteFiles(f.path));
      return res.status(404).json({ message: 'Post not found' });
    }

    // Security check
    if (req.user.role !== 'superadmin' && post.author.toString() !== req.user.id) {
      if (req.files && req.files.length > 0) req.files.forEach(f => deleteFiles(f.path));
      return res.status(403).json({ message: 'Not authorized to update this post' });
    }

    // ✅ Handle new upload
    if (req.files && req.files.length > 0) {
      // Delete old image
      if (post.featuredImage) deleteFiles(post.featuredImage);
      post.featuredImage = req.files[0].path;
    }

    post.title = title || post.title;
    post.content = content || post.content;
    post.status = status || post.status;

    const updatedPost = await post.save();
    res.status(200).json(updatedPost);
  } catch (error) {
    if (req.files && req.files.length > 0) req.files.forEach(f => deleteFiles(f.path));
    res.status(500).json({ message: 'Server error updating post', error: error.message });
  }
};

/**
 * @desc    Delete a post and all related images
 * @route   DELETE /api/posts/:id
 * @access  Private (Admin / Superadmin)
 */
export const deletePost = async (req, res) => {
  try {
    // 1. Authorization
    const user = req.user;
    if (!user || (user.role !== "superadmin" && user.role !== "admin")) {
      return res.status(403).json({
        success: false,
        error: "Forbidden — Super Admin or Admin access required",
      });
    }

    // 2. Validate post ID
    const postId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ success: false, error: "Invalid post ID" });
    }

    // 3. Fetch post
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ success: false, error: "Post not found" });
    }

    // 4. Delete all associated images
    if (Array.isArray(post.featuredImage) && post.featuredImage.length > 0) {
      post.featuredImage.forEach((imgPath) => {
        try {
          // Normalize image path (resolve relative paths safely)
          const fullPath = path.isAbsolute(imgPath)
            ? imgPath
            : path.join(process.cwd(), imgPath);

          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            // console.log(`✅ Deleted image: ${fullPath}`);
          } else {
            console.warn(`⚠️ Image not found: ${fullPath}`);
          }
        } catch (err) {
          console.error(`❌ Error deleting image ${imgPath}:`, err.message);
        }
      });
    }

    // 5. Delete the post itself
    await Post.findByIdAndDelete(postId);

    return res.status(200).json({
      success: true,
      message: "Post and all related images deleted successfully",
    });
  } catch (error) {
    console.error("Error in deletePost:", error.message);
    return res
      .status(500)
      .json({ success: false, error: "Internal server error" });
  }
};