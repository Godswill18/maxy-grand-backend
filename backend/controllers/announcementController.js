import Announcement from '../models/announcementModel.js';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';

// Helper function to delete a single file
const deleteFile = (filePath) => {
    if (!filePath) return;
    try {
        const fullPath = path.resolve(filePath);
        if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            console.log(`Deleted file: ${fullPath}`);
        }
    } catch (err) {
        console.error(`Error deleting file ${filePath}:`, err.message);
    }
};

/**
 * @desc    Create a new announcement
 * @route   POST /api/announcements
 * @access  Private (Admin / Superadmin)
 */
export const createAnnouncement = async (req, res) => {
    try {
        const { title, content, status } = req.body;
        const user = req.user;

        if (!req.file) {
            return res.status(400).json({ success: false, error: 'Image is required' });
        }
        
        const imagePath = req.file.path;

        if (!title || !content) {
            deleteFile(imagePath); // Delete uploaded image if validation fails
            return res.status(400).json({ success: false, error: 'Title and content are required' });
        }

        const announcement = new Announcement({
            hotelId: user.hotelId, // Assumes admin is tied to a hotel
            title,
            content,
            status: status || 'draft',
            imageUrl: imagePath,
            createdBy: user.id,
        });

        const createdAnnouncement = await announcement.save();
        return res.status(201).json({ success: true, data: createdAnnouncement });

    } catch (error) {
        console.error("Error in createAnnouncement:", error.message);
        // Clean up uploaded file if DB save fails
        if (req.file) {
            deleteFile(req.file.path);
        }
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
};

/**
 * @desc    Update an announcement
 * @route   PATCH /api/announcements/:id
 * @access  Private (Admin / Superadmin)
 */
export const updateAnnouncement = async (req, res) => {
    try {
        const { title, content, status } = req.body;
        const { id: announcementId } = req.params;

        const announcement = await Announcement.findById(announcementId);
        if (!announcement) {
            // If new file was uploaded, delete it
            if (req.file) deleteFile(req.file.path);
            return res.status(404).json({ success: false, error: 'Announcement not found' });
        }

        // Security check
        if (req.user.role !== 'superadmin' && announcement.hotelId.toString() !== req.user.hotelId) {
             if (req.file) deleteFile(req.file.path);
            return res.status(403).json({ success: false, error: 'Not authorized to update this announcement' });
        }

        // Handle new image upload
        if (req.file) {
            // Delete the old image
            if (announcement.imageUrl) {
                deleteFile(announcement.imageUrl);
            }
            // Set the new image path
            announcement.imageUrl = req.file.path;
        }

        announcement.title = title || announcement.title;
        announcement.content = content || announcement.content;
        announcement.status = status || announcement.status;

        const updatedAnnouncement = await announcement.save();
        return res.status(200).json({ success: true, data: updatedAnnouncement });

    } catch (error) {
        console.error("Error in updateAnnouncement:", error.message);
        // Clean up newly uploaded file if update fails
        if (req.file) {
            deleteFile(req.file.path);
        }
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
};

/**
 * @desc    Delete an announcement
 * @route   DELETE /api/announcements/:id
 * @access  Private (Admin / Superadmin)
 */
export const deleteAnnouncement = async (req, res) => {
    try {
        const { id: announcementId } = req.params;

        const announcement = await Announcement.findById(announcementId);
        if (!announcement) {
            return res.status(404).json({ success: false, error: 'Announcement not found' });
        }

        // Security check
        if (req.user.role !== 'superadmin' && announcement.hotelId.toString() !== req.user.hotelId) {
            return res.status(403).json({ success: false, error: 'Not authorized to delete this announcement' });
        }

        // Delete the image file
        if (announcement.imageUrl) {
            deleteFile(announcement.imageUrl);
        }

        await announcement.deleteOne();

        return res.status(200).json({ success: true, message: 'Announcement deleted successfully' });

    } catch (error) {
        console.error("Error in deleteAnnouncement:", error.message);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
};

/**
 * @desc    Get all announcements for admin
 * @route   GET /api/announcements/admin
 * @access  Private (Admin / Superadmin)
 */
export const getAdminAnnouncements = async (req, res) => {
    try {
        let query = {};
        if (req.user.role === 'admin') {
            query.hotelId = req.user.hotelId;
        }

        const announcements = await Announcement.find(query).sort({ createdAt: -1 });
        return res.status(200).json({ success: true, data: announcements });

    } catch (error) {
        console.error("Error in getAdminAnnouncements:", error.message);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
};

/**
 * @desc    Get the single latest ACTIVE announcement for the homepage popup
 * @route   GET /api/announcements/public/:hotelId
 * @access  Public
 */
export const getActiveAnnouncement = async (req, res) => {
    try {
        const { hotelId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(hotelId)) {
             return res.status(400).json({ success: false, error: 'Invalid hotel ID' });
        }

        // Find ONE announcement that is 'active' and for the specified hotel
        // Sort by createdAt descending to get the newest one
        const announcement = await Announcement.findOne({
            hotelId: hotelId,
            status: 'active'
        }).sort({ createdAt: -1 });

        if (!announcement) {
            // This is not an error, it just means there are no active announcements
            return res.status(200).json({ success: true, data: null });
        }

        return res.status(200).json({ success: true, data: announcement });

    } catch (error) {
        console.error("Error in getActiveAnnouncement:", error.message);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
};