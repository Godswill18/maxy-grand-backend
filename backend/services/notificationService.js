// services/notificationService.js
import Notification from '../models/notificationModel.js';
import User from '../models/userModel.js';
import { createAndEmitNotification, createAndEmitBulkNotifications } from '../controllers/notificationController.js';

/**
 * Notification Service - Role-based notification helpers
 */

// ✅ RECEPTIONIST NOTIFICATIONS
export const notifyReceptionists = async (io, hotelId, notificationData) => {
  try {
    const receptionists = await User.find({
      role: 'receptionist',
      hotelId,
      isActive: true,
    }).select('_id');
    
    const recipientIds = receptionists.map(r => r._id);
    
    if (recipientIds.length > 0) {
      await createAndEmitBulkNotifications(io, recipientIds, 'receptionist', notificationData);
    }
  } catch (error) {
    console.error('Error notifying receptionists:', error);
  }
};

// New booking created
export const notifyNewBooking = async (io, booking) => {
  await notifyReceptionists(io, booking.hotelId, {
    type: 'booking',
    title: 'New Booking Received',
    message: `New booking for ${booking.guestName} - Room ${booking.roomNumber || 'TBD'}`,
    priority: 'high',
    relatedEntityType: 'booking',
    relatedEntityId: booking._id,
    metadata: {
      bookingId: booking._id,
      guestName: booking.guestName,
      checkInDate: booking.checkInDate,
    },
  });
};

// Check-in completed
export const notifyCheckIn = async (io, booking) => {
  await notifyReceptionists(io, booking.hotelId, {
    type: 'checkin',
    title: 'Guest Checked In',
    message: `${booking.guestName} checked into Room ${booking.roomNumber}`,
    priority: 'medium',
    relatedEntityType: 'booking',
    relatedEntityId: booking._id,
    metadata: {
      bookingId: booking._id,
      roomNumber: booking.roomNumber,
    },
  });
};

// Check-out completed
export const notifyCheckOut = async (io, booking) => {
  await notifyReceptionists(io, booking.hotelId, {
    type: 'checkout',
    title: 'Guest Checked Out',
    message: `${booking.guestName} checked out from Room ${booking.roomNumber}`,
    priority: 'medium',
    relatedEntityType: 'booking',
    relatedEntityId: booking._id,
    metadata: {
      bookingId: booking._id,
      roomNumber: booking.roomNumber,
    },
  });
};

// ✅ CLEANER NOTIFICATIONS
export const notifyCleaners = async (io, hotelId, notificationData) => {
  try {
    const cleaners = await User.find({
      role: 'cleaner',
      hotelId,
      isActive: true,
    }).select('_id');
    
    const recipientIds = cleaners.map(c => c._id);
    
    if (recipientIds.length > 0) {
      await createAndEmitBulkNotifications(io, recipientIds, 'cleaner', notificationData);
    }
  } catch (error) {
    console.error('Error notifying cleaners:', error);
  }
};

// Specific cleaner notification
export const notifySpecificCleaner = async (io, cleanerId, notificationData) => {
  try {
    const cleaner = await User.findById(cleanerId);
    if (cleaner) {
      await createAndEmitNotification(io, {
        recipientId: cleanerId,
        recipientRole: 'cleaner',
        ...notificationData,
      });
    }
  } catch (error) {
    console.error('Error notifying specific cleaner:', error);
  }
};

// New cleaning task assigned
export const notifyCleaningTaskAssigned = async (io, cleaningTask) => {
  await notifySpecificCleaner(io, cleaningTask.assignedTo, {
    type: 'cleaning_task',
    title: 'New Cleaning Task',
    message: `You've been assigned to clean Room ${cleaningTask.roomNumber}`,
    priority: 'high',
    relatedEntityType: 'cleaning',
    relatedEntityId: cleaningTask._id,
    metadata: {
      taskId: cleaningTask._id,
      roomNumber: cleaningTask.roomNumber,
      taskType: cleaningTask.taskType,
    },
  });
};

// Cleaning task completed - notify receptionists
export const notifyCleaningCompleted = async (io, cleaningTask) => {
  await notifyReceptionists(io, cleaningTask.hotelId, {
    type: 'cleaning_completed',
    title: 'Room Cleaning Completed',
    message: `Room ${cleaningTask.roomNumber} has been cleaned`,
    priority: 'medium',
    relatedEntityType: 'cleaning',
    relatedEntityId: cleaningTask._id,
    metadata: {
      roomNumber: cleaningTask.roomNumber,
      cleanedBy: cleaningTask.assignedTo,
    },
  });
};

// ✅ WAITER NOTIFICATIONS
export const notifyWaiters = async (io, hotelId, notificationData) => {
  try {
    const waiters = await User.find({
      role: 'waiter',
      hotelId,
      isActive: true,
    }).select('_id');
    
    const recipientIds = waiters.map(w => w._id);
    
    if (recipientIds.length > 0) {
      await createAndEmitBulkNotifications(io, recipientIds, 'waiter', notificationData);
    }
  } catch (error) {
    console.error('Error notifying waiters:', error);
  }
};

// New order received
export const notifyNewOrder = async (io, order) => {
  await notifyWaiters(io, order.hotelId, {
    type: 'order',
    title: 'New Order Received',
    message: `New ${order.type} order from ${order.source === 'room' ? `Room ${order.roomNumber}` : 'walk-in'}`,
    priority: 'high',
    relatedEntityType: 'order',
    relatedEntityId: order._id,
    metadata: {
      orderId: order._id,
      orderType: order.type,
      roomNumber: order.roomNumber,
      totalAmount: order.totalAmount,
    },
  });
};

// Order ready for serving
export const notifyOrderReady = async (io, order) => {
  if (order.assignedWaiter) {
    await createAndEmitNotification(io, {
      recipientId: order.assignedWaiter,
      recipientRole: 'waiter',
      type: 'order_ready',
      title: 'Order Ready',
      message: `Order for ${order.source === 'room' ? `Room ${order.roomNumber}` : 'walk-in'} is ready`,
      priority: 'urgent',
      relatedEntityType: 'order',
      relatedEntityId: order._id,
      metadata: {
        orderId: order._id,
        roomNumber: order.roomNumber,
      },
    });
  }
};

// ✅ PAYMENT NOTIFICATIONS
export const notifyPaymentReceived = async (io, payment, booking) => {
  await notifyReceptionists(io, booking.hotelId, {
    type: 'payment',
    title: 'Payment Received',
    message: `Payment of ₦${payment.amount.toLocaleString()} received for ${booking.guestName}`,
    priority: 'medium',
    relatedEntityType: 'payment',
    relatedEntityId: payment._id,
    metadata: {
      amount: payment.amount,
      bookingId: booking._id,
      guestName: booking.guestName,
    },
  });
};

// ✅ MAINTENANCE REQUEST NOTIFICATIONS
export const notifyMaintenanceRequest = async (io, request) => {
  // Notify managers/admins about maintenance requests
  try {
    const managers = await User.find({
      role: { $in: ['manager', 'admin'] },
      hotelId: request.hotelId,
      isActive: true,
    }).select('_id role');
    
    for (const manager of managers) {
      await createAndEmitNotification(io, {
        recipientId: manager._id,
        recipientRole: manager.role,
        type: 'request',
        title: 'New Maintenance Request',
        message: `${request.requestType} - Room ${request.roomNumber}`,
        priority: request.priority || 'medium',
        relatedEntityType: 'request',
        relatedEntityId: request._id,
        metadata: {
          requestId: request._id,
          roomNumber: request.roomNumber,
          requestType: request.requestType,
        },
      });
    }
  } catch (error) {
    console.error('Error notifying about maintenance request:', error);
  }
};

// ✅ SHIFT NOTIFICATIONS
export const notifyShiftStart = async (io, shift, userId) => {
  await createAndEmitNotification(io, {
    recipientId: userId,
    recipientRole: shift.role,
    type: 'shift',
    title: 'Shift Starting Soon',
    message: `Your ${shift.shiftType} shift starts in 30 minutes`,
    priority: 'high',
    relatedEntityType: 'shift',
    relatedEntityId: shift._id,
    metadata: {
      shiftId: shift._id,
      shiftType: shift.shiftType,
      startTime: shift.startTime,
    },
  });
};

// ✅ GENERAL NOTIFICATION
export const notifyUser = async (io, userId, userRole, notificationData) => {
  await createAndEmitNotification(io, {
    recipientId: userId,
    recipientRole: userRole,
    ...notificationData,
  });
};

export default {
  notifyReceptionists,
  notifyNewBooking,
  notifyCheckIn,
  notifyCheckOut,
  notifyCleaners,
  notifySpecificCleaner,
  notifyCleaningTaskAssigned,
  notifyCleaningCompleted,
  notifyWaiters,
  notifyNewOrder,
  notifyOrderReady,
  notifyPaymentReceived,
  notifyMaintenanceRequest,
  notifyShiftStart,
  notifyUser,
};