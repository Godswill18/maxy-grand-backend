import Gallery from "../models/galleryModel.js";
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';

// Helper function to delete an array of files
const deleteFiles = (files) => {
    if (!files || files.length === 0) return;

    files.forEach(filePath => {
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
 * @desc    Get all gallery images (PUBLIC - only live images)
 * @route   GET /api/gallery
 * @access  Public
 */
export const getGalleryImages = async (req, res) => {
  try {
    const { category } = req.query;
    
    let query = { isLive: true };  // Only show live images to public
    if (category && category !== 'All') {
        query.category = category;
    }

    const images = await Gallery.find(query).sort({ createdAt: -1 });
    res.status(200).json({
        success: true,
        data: images,
        count: images.length
    });
  } catch (error) {
    res.status(500).json({ 
        success: false, 
        message: 'Server error fetching gallery', 
        error: error.message 
    });
  }
};

/**
 * @desc    Get all gallery images (ADMIN - all images including drafts)
 * @route   GET /api/gallery/admin/all
 * @access  Private (Superadmin)
 */
export const getAllGalleryImagesAdmin = async (req, res) => {
  try {
    const { category } = req.query;
    
    let query = {};  // Get all images (live and draft)
    if (category && category !== 'All') {
        query.category = category;
    }

    const images = await Gallery.find(query).sort({ createdAt: -1 });
    res.status(200).json({
        success: true,
        data: images,
        count: images.length
    });
  } catch (error) {
    res.status(500).json({ 
        success: false, 
        message: 'Server error fetching gallery', 
        error: error.message 
    });
  }
};

/**
 * @desc    Add new image(s) to the gallery
 * @route   POST /api/gallery
 * @access  Private (Superadmin)
 */
export const addGalleryImage = async (req, res) => {
  try {
    const { title, category } = req.body;
    // const uploadedBy = req.user.id;

    // Check for file uploads
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ 
        success: false,
        message: "At least one image is required" 
      });
    }

    // Get file paths
    const imagePaths = req.files.map(file => file.path);

    // Check for other fields
    if (!title || !category) {
      deleteFiles(imagePaths);
      return res.status(400).json({ 
        success: false,
        message: 'Title and category are required' 
      });
    }

    // Create and save the gallery entry
    const image = new Gallery({
      // uploadedBy,
      images: imagePaths, 
      title,
      category,
      isLive: false,  // New images are draft by default
    });

    const createdImage = await image.save();
    res.status(201).json({
        success: true,
        data: createdImage,
        message: 'Image added successfully (draft mode)'
    });

  } catch (error) {
    if (req.files && req.files.length > 0) {
        const paths = req.files.map(file => file.path);
        deleteFiles(paths);
    }
    res.status(500).json({ 
        success: false,
        message: 'Server error adding image', 
        error: error.message 
    });
  }
};

/**
 * @desc    Update gallery image (toggle isLive or update other fields)
 * @route   PATCH /api/gallery/:id
 * @access  Private (Superadmin)
 */
export const updateGalleryImage = async (req, res) => {
  try {
    const { id: imageId } = req.params;
    const { isLive, title, category } = req.body;

    if (!mongoose.Types.ObjectId.isValid(imageId)) {
        return res.status(400).json({ 
            success: false,
            message: 'Invalid image ID' 
        });
    }

    const image = await Gallery.findById(imageId);
    if (!image) {
      return res.status(404).json({ 
        success: false, 
        message: 'Image not found' 
      });
    }

    // Update fields if provided
    if (isLive !== undefined) {
      image.isLive = isLive;
    }
    if (title) {
      image.title = title;
    }
    if (category) {
      image.category = category;
    }

    const updatedImage = await image.save();
    
    res.status(200).json({
        success: true,
        data: updatedImage,
        message: isLive !== undefined ? `Image ${isLive ? 'published' : 'unpublished'}` : 'Image updated'
    });
  } catch (error) {
    res.status(500).json({ 
        success: false,
        message: 'Server error updating image', 
        error: error.message 
    });
  }
};

/**
 * @desc    Toggle image live status
 * @route   PATCH /api/gallery/:id/toggle-live
 * @access  Private (Superadmin)
 */
export const toggleImageLive = async (req, res) => {
  try {
    const { id: imageId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(imageId)) {
        return res.status(400).json({ 
            success: false,
            message: 'Invalid image ID' 
        });
    }

    const image = await Gallery.findById(imageId);
    if (!image) {
      return res.status(404).json({ 
        success: false, 
        message: 'Image not found' 
      });
    }

    // Toggle the live status
    image.isLive = !image.isLive;
    const updatedImage = await image.save();

    res.status(200).json({
        success: true,
        data: updatedImage,
        message: `Image ${updatedImage.isLive ? 'is now live' : 'is now draft'}`
    });
  } catch (error) {
    res.status(500).json({ 
        success: false,
        message: 'Server error toggling image live status', 
        error: error.message 
    });
  }
};

/**
 * @desc    Delete a gallery image entry (and its files)
 * @route   DELETE /api/gallery/:id
 * @access  Private (Superadmin)
 */
export const deleteGalleryImage = async (req, res) => {
  try {
    const { id: imageId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(imageId)) {
        return res.status(400).json({ 
            success: false,
            message: 'Invalid image ID' 
        });
    }

    const image = await Gallery.findById(imageId);
    if (!image) {
      return res.status(404).json({ 
        success: false,
        message: 'Image not found' 
      });
    }

    // Delete files from server
    deleteFiles(image.images);

    // Delete the database record
    await image.deleteOne();
    
    res.status(200).json({ 
        success: true,
        message: 'Gallery image deleted successfully' 
    });
  } catch (error) {
    res.status(500).json({ 
        success: false,
        message: 'Server error deleting image', 
        error: error.message 
    });
  }
};

/**
 * @desc    Get all categories
 * @route   GET /api/gallery/categories
 * @access  Public
 */
export const getGalleryCategories = async (req, res) => {
    try {
        const categories = await Gallery.distinct('category');
        res.status(200).json({
            success: true,
            data: categories
        });
    } catch (error) {
        res.status(500).json({ 
            success: false,
            message: 'Server error fetching categories', 
            error: error.message 
        });
    }
};

/**
 * @desc    Get all categories (admin - includes draft and live)
 * @route   GET /api/gallery/admin/categories
 * @access  Private (Superadmin)
 */
export const getGalleryCategoriesAdmin = async (req, res) => {
    try {
        const categories = await Gallery.distinct('category');
        res.status(200).json({
            success: true,
            data: categories
        });
    } catch (error) {
        res.status(500).json({ 
            success: false,
            message: 'Server error fetching categories', 
            error: error.message 
        });
    }
};