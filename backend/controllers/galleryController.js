import Gallery from '../models/galleryModel.js';
import mongoose from 'mongoose';
import fs from 'fs'; // Import File System module
import path from 'path'; // Often useful for constructing paths

// Helper function to delete an array of files, ignoring errors if file not found
const deleteFiles = (files) => {
    if (!files || files.length === 0) return;

    files.forEach(filePath => {
        try {
            // Check if file exists before trying to delete
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`Deleted file: ${filePath}`);
            }
        } catch (err) {
            // Log error but don't stop the process
            console.error(`Error deleting file ${filePath}:`, err.message);
        }
    });
};

/**
 * @desc    Add new image(s) to the gallery
 * @route   POST /api/gallery
 * @access  Private (Admin / Superadmin)
 */
export const addGalleryImage = async (req, res) => {
  try {
    const { title, category } = req.body;
    const hotelId = req.user.hotelId;
    const uploadedBy = req.user.id;

    // 1. Check for file uploads
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "At least one image is required" });
    }

    // Get file paths
    const imagePaths = req.files.map(file => file.path);

    // 2. Check for other fields
    if (!title || !category) {
      // If validation fails, delete the files that were just uploaded
      deleteFiles(imagePaths);
      return res.status(400).json({ message: 'Title and category are required' });
    }

    // 3. Create and save the gallery entry
    const image = new Gallery({
      hotelId,
      uploadedBy,
      imageUrl: imagePaths, 
      title,
      category,
    });

    const createdImage = await image.save();
    res.status(201).json(createdImage);

  } catch (error) {
    // If database save fails, try to clean up uploaded files
    if (req.files && req.files.length > 0) {
        const paths = req.files.map(file => file.path);
        deleteFiles(paths);
    }
    res.status(500).json({ message: 'Server error adding image', error: error.message });
  }
};

/**
 * @desc    Get all gallery images for a hotel
 * @route   GET /api/gallery/hotel/:hotelId
 * @access  Public
 */
export const getGalleryImages = async (req, res) => {
  try {
    const { hotelId } = req.params;
    const { category } = req.query;
    
    let query = { hotelId: hotelId };
    if (category) {
        query.category = category;
    }

    if (!mongoose.Types.ObjectId.isValid(hotelId)) {
        return res.status(400).json({ message: 'Invalid hotel ID' });
    }

    const images = await Gallery.find(query).sort({ createdAt: -1 });
    res.status(200).json(images);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching gallery', error: error.message });
  }
};

/**
 * @desc    Delete a gallery image entry (and its files)
 * @route   DELETE /api/gallery/:id
 * @access  Private (Admin / Superadmin)
 */
export const deleteGalleryImage = async (req, res) => {
  try {
    const { id: imageId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(imageId)) {
        return res.status(400).json({ message: 'Invalid image ID' });
    }

    const image = await Gallery.findById(imageId);
    if (!image) {
      return res.status(404).json({ message: 'Image not found' });
    }

    // Security Check
    // if (req.user.role !== 'superadmin' && image.hotelId.toString() !== req.user.hotelId) {
    //   return res.status(403).json({ message: 'Not authorized to delete this image' });
    // }

    // **Delete files from server**
    // The 'image.imageUrl' is an array of paths
    deleteFiles(image.imageUrl);

    // Delete the database record
    await image.deleteOne();
    res.status(200).json({ message: 'Gallery entry and images deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error deleting image', error: error.message });
  }
};

export const getGalleryCategories = async (req, res) => {
    try {
        const { hotelId } = req.params;
        const categories = await Gallery.distinct('category', { hotelId: hotelId });
        res.status(200).json(categories);
    } catch (error) {
        if (req.files && req.files.length > 0) {
        const paths = req.files.map(file => file.path);
        deleteFiles(paths);
    }
        res.status(500).json({ message: 'Server error fetching categories', error: error.message });
    }
};