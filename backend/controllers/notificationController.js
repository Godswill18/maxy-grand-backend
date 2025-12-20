// controllers/notificationController.js
import Notification from '../models/notificationModel.js';

// Get notifications for logged-in user
export const getMyNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 50, unreadOnly = false } = req.query;
    
    const query = { recipientId: req.user._id };
    if (unreadOnly === 'true') {
      query.read = false;
    }
    
    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();
    
    const total = await Notification.countDocuments(query);
    const unreadCount = await Notification.countDocuments({
      recipientId: req.user._id,
      read: false,
    });
    
    return res.status(200).json({
      success: true,
      data: {
        notifications,
        unreadCount,
        total,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error in getMyNotifications:', error.message);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// Mark notification as read
export const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    
    const notification = await Notification.findOne({
      _id: id,
      recipientId: req.user._id,
    });
    
    if (!notification) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }
    
    await notification.markAsRead();
    
    return res.status(200).json({
      success: true,
      message: 'Notification marked as read',
    });
  } catch (error) {
    console.error('Error in markAsRead:', error.message);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// Mark all notifications as read
export const markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { recipientId: req.user._id, read: false },
      { read: true }
    );
    
    return res.status(200).json({
      success: true,
      message: 'All notifications marked as read',
    });
  } catch (error) {
    console.error('Error in markAllAsRead:', error.message);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// Delete notification
export const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    
    const notification = await Notification.findOneAndDelete({
      _id: id,
      recipientId: req.user._id,
    });
    
    if (!notification) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }
    
    return res.status(200).json({
      success: true,
      message: 'Notification deleted',
    });
  } catch (error) {
    console.error('Error in deleteNotification:', error.message);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// Clear all notifications
export const clearAll = async (req, res) => {
  try {
    await Notification.deleteMany({ recipientId: req.user._id });
    
    return res.status(200).json({
      success: true,
      message: 'All notifications cleared',
    });
  } catch (error) {
    console.error('Error in clearAll:', error.message);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ✅ Helper function to create and emit notification
export const createAndEmitNotification = async (io, notificationData) => {
  try {
    const notification = await Notification.create(notificationData);
    
    // Emit to specific user
    io.to(`user_${notificationData.recipientId}`).emit('new_notification', {
      ...notification.toObject(),
      createdAt: notification.createdAt,
    });
    
    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
};

// ✅ Helper function to create notifications for multiple users
export const createAndEmitBulkNotifications = async (io, recipientIds, recipientRole, notificationData) => {
  try {
    const notifications = recipientIds.map(recipientId => ({
      recipientId,
      recipientRole,
      ...notificationData,
    }));
    
    const created = await Notification.insertMany(notifications);
    
    // Emit to each user
    created.forEach(notification => {
      io.to(`user_${notification.recipientId}`).emit('new_notification', {
        ...notification.toObject(),
        createdAt: notification.createdAt,
      });
    });
    
    return created;
  } catch (error) {
    console.error('Error creating bulk notifications:', error);
    throw error;
  }
};