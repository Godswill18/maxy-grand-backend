// models/notificationModel.js
import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  recipientRole: {
    type: String,
    enum: ['receptionist', 'cleaner', 'waiter', 'manager', 'admin', 'superadmin', 'staff'],
    required: true,
    index: true,
  },
  type: {
    type: String,
    enum: [
      'booking',
      'checkin',
      'checkout',
      'cleaning_task',
      'cleaning_completed',
      'payment',
      'order',
      'order_ready',
      'request',
      'request_completed',
      'shift',
      'general',
    ],
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  read: {
    type: Boolean,
    default: false,
    index: true,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  // For linking to specific entities
  relatedEntityType: {
    type: String,
    enum: ['booking', 'room', 'order', 'cleaning', 'request', 'payment', 'shift'],
  },
  relatedEntityId: {
    type: mongoose.Schema.Types.ObjectId,
  },
  // Priority for sorting
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium',
  },
  expiresAt: {
    type: Date,
    index: true,
  },
}, {
  timestamps: true,
});

// Indexes for efficient queries
notificationSchema.index({ recipientId: 1, read: 1, createdAt: -1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 }); // Auto-delete after 30 days

// Static method to create notification for specific user
notificationSchema.statics.createForUser = async function(userId, userRole, notificationData) {
  return this.create({
    recipientId: userId,
    recipientRole: userRole,
    ...notificationData,
  });
};

// Static method to create notification for all users with specific role
notificationSchema.statics.createForRole = async function(role, notificationData, userIds = null) {
  const User = mongoose.model('User');
  
  // Get all users with this role
  let users;
  if (userIds) {
    users = await User.find({ _id: { $in: userIds }, role }).select('_id');
  } else {
    users = await User.find({ role, isActive: true }).select('_id');
  }
  
  // Create notifications for all users
  const notifications = users.map(user => ({
    recipientId: user._id,
    recipientRole: role,
    ...notificationData,
  }));
  
  return this.insertMany(notifications);
};

// Instance method to mark as read
notificationSchema.methods.markAsRead = async function() {
  this.read = true;
  return this.save();
};

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;