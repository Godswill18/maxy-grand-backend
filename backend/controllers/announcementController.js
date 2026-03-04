import Announcement from '../models/announcementModel.js';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';

// Helper to delete a file from disk
const deleteFile = (filePath) => {
    if (!filePath) return;
    try {
        const fullPath = path.resolve(filePath);
        if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
        }
    } catch (err) {
        console.error(`Error deleting file ${filePath}:`, err.message);
    }
};

// Build date-range query fragment
const buildDateQuery = (now) => ({
    $and: [
        { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
        { $or: [{ endDate: null }, { endDate: { $gte: now } }] },
    ],
});

/**
 * @desc    Create a new announcement
 * @route   POST /api/announcements
 * @access  Private (Admin / Superadmin)
 */
export const createAnnouncement = async (req, res) => {
    try {
        const { title, content, status, targetAudience, startDate, endDate, ctaButtonText, ctaButtonUrl, priority, hotelId: bodyHotelId } = req.body;
        const user = req.user;

        if (!title || !content) {
            if (req.file) deleteFile(req.file.path);
            return res.status(400).json({ success: false, error: 'Title and content are required' });
        }

        // Superadmin picks a branch (or null for global), admin uses their own hotelId
        let resolvedHotelId = null;
        if (user.role === 'superadmin') {
            resolvedHotelId = bodyHotelId || null;
        } else {
            resolvedHotelId = user.hotelId;
        }

        const imagePath = req.file ? req.file.path : null;

        const announcement = new Announcement({
            hotelId: resolvedHotelId,
            title,
            content,
            status: status || 'draft',
            imageUrl: imagePath,
            targetAudience: targetAudience || 'guest',
            startDate: startDate || null,
            endDate: endDate || null,
            ctaButtonText: ctaButtonText || null,
            ctaButtonUrl: ctaButtonUrl || null,
            priority: priority ? Number(priority) : 0,
            createdBy: user._id,
            createdByRole: user.role,
        });

        const created = await announcement.save();
        return res.status(201).json({ success: true, data: created });

    } catch (error) {
        console.error('Error in createAnnouncement:', error.message);
        if (req.file) deleteFile(req.file.path);
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
        const { title, content, status, targetAudience, startDate, endDate, ctaButtonText, ctaButtonUrl, priority } = req.body;
        const { id: announcementId } = req.params;

        const announcement = await Announcement.findById(announcementId);
        if (!announcement) {
            if (req.file) deleteFile(req.file.path);
            return res.status(404).json({ success: false, error: 'Announcement not found' });
        }

        // Admin can only update their own hotel's announcements
        if (req.user.role !== 'superadmin') {
            if (!announcement.hotelId || announcement.hotelId.toString() !== req.user.hotelId?.toString()) {
                if (req.file) deleteFile(req.file.path);
                return res.status(403).json({ success: false, error: 'Not authorized to update this announcement' });
            }
        }

        if (req.file) {
            if (announcement.imageUrl) deleteFile(announcement.imageUrl);
            announcement.imageUrl = req.file.path;
        }

        if (title !== undefined) announcement.title = title;
        if (content !== undefined) announcement.content = content;
        if (status !== undefined) announcement.status = status;
        if (targetAudience !== undefined) announcement.targetAudience = targetAudience;
        if (startDate !== undefined) announcement.startDate = startDate || null;
        if (endDate !== undefined) announcement.endDate = endDate || null;
        if (ctaButtonText !== undefined) announcement.ctaButtonText = ctaButtonText || null;
        if (ctaButtonUrl !== undefined) announcement.ctaButtonUrl = ctaButtonUrl || null;
        if (priority !== undefined) announcement.priority = Number(priority);

        const updated = await announcement.save();
        return res.status(200).json({ success: true, data: updated });

    } catch (error) {
        console.error('Error in updateAnnouncement:', error.message);
        if (req.file) deleteFile(req.file.path);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
};

/**
 * @desc    Toggle announcement visibility (active <-> draft)
 * @route   PATCH /api/announcements/:id/toggle-visibility
 * @access  Private (Admin / Superadmin)
 */
export const toggleVisibility = async (req, res) => {
    try {
        const { id: announcementId } = req.params;

        const announcement = await Announcement.findById(announcementId);
        if (!announcement) {
            return res.status(404).json({ success: false, error: 'Announcement not found' });
        }

        // Admin can only toggle their own hotel's announcements
        if (req.user.role !== 'superadmin') {
            if (!announcement.hotelId || announcement.hotelId.toString() !== req.user.hotelId?.toString()) {
                return res.status(403).json({ success: false, error: 'Not authorized to modify this announcement' });
            }
        }

        announcement.status = announcement.status === 'active' ? 'draft' : 'active';
        const updated = await announcement.save();

        return res.status(200).json({ success: true, data: updated });

    } catch (error) {
        console.error('Error in toggleVisibility:', error.message);
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

        if (req.user.role !== 'superadmin') {
            if (!announcement.hotelId || announcement.hotelId.toString() !== req.user.hotelId?.toString()) {
                return res.status(403).json({ success: false, error: 'Not authorized to delete this announcement' });
            }
        }

        if (announcement.imageUrl) deleteFile(announcement.imageUrl);
        await announcement.deleteOne();

        return res.status(200).json({ success: true, message: 'Announcement deleted successfully' });

    } catch (error) {
        console.error('Error in deleteAnnouncement:', error.message);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
};

/**
 * @desc    Get all announcements for admin dashboard
 * @route   GET /api/announcements/admin
 * @access  Private (Admin / Superadmin)
 */
export const getAdminAnnouncements = async (req, res) => {
    try {
        let query = {};

        if (req.user.role === 'admin') {
            // Admin sees only their hotel's announcements
            query.hotelId = req.user.hotelId;
        } else if (req.query.hotelId) {
            // Superadmin can optionally filter by branch
            query.hotelId = req.query.hotelId;
        }

        const announcements = await Announcement.find(query)
            .populate('createdBy', 'firstName lastName role')
            .populate('hotelId', 'name')
            .sort({ priority: -1, createdAt: -1 });

        return res.status(200).json({ success: true, data: announcements });

    } catch (error) {
        console.error('Error in getAdminAnnouncements:', error.message);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
};

/**
 * @desc    Get latest active guest announcement (global, no auth)
 * @route   GET /api/announcements/public
 * @access  Public
 */
export const getActiveAnnouncement = async (req, res) => {
    try {
        const now = new Date();

        const announcement = await Announcement.findOne({
            status: 'active',
            targetAudience: { $in: ['guest', 'both'] },
            ...buildDateQuery(now),
        }).sort({ priority: -1, createdAt: -1 });

        return res.status(200).json({ success: true, data: announcement || null });

    } catch (error) {
        console.error('Error in getActiveAnnouncement:', error.message);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
};

/**
 * @desc    Get latest active staff announcement for the authenticated user's branch
 * @route   GET /api/announcements/staff
 * @access  Private (Staff / Admin / Superadmin)
 */
export const getStaffAnnouncement = async (req, res) => {
    try {
        const now = new Date();
        const hotelId = req.user.hotelId;

        const announcement = await Announcement.findOne({
            hotelId,
            status: 'active',
            targetAudience: { $in: ['staff', 'both'] },
            ...buildDateQuery(now),
        }).sort({ priority: -1, createdAt: -1 });

        return res.status(200).json({ success: true, data: announcement || null });

    } catch (error) {
        console.error('Error in getStaffAnnouncement:', error.message);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
};
