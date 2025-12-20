// config/socketConfig.js
/**
 * Socket.IO Configuration
 * Handles real-time connections and user room management
 */

export const setupSocketIO = (io) => {
  // Store connected users
  const connectedUsers = new Map(); // userId -> socketId

  io.on('connection', (socket) => {
    console.log('🔌 User connected:', socket.id);

    // User authentication and room joining
    socket.on('authenticate', (userId) => {
      if (userId) {
        // Join user-specific room
        socket.join(`user_${userId}`);
        connectedUsers.set(userId, socket.id);
        
        console.log(`✅ User ${userId} authenticated and joined room user_${userId}`);
        
        // Emit success
        socket.emit('authenticated', { userId, socketId: socket.id });
      }
    });

    // Join hotel-specific room (for hotel-wide broadcasts)
    socket.on('join_hotel', (hotelId) => {
      if (hotelId) {
        socket.join(`hotel_${hotelId}`);
        console.log(`🏨 Socket ${socket.id} joined hotel room: hotel_${hotelId}`);
      }
    });

    // Join role-specific room (for role-wide broadcasts)
    socket.on('join_role', (role) => {
      if (role) {
        socket.join(`role_${role}`);
        console.log(`👥 Socket ${socket.id} joined role room: role_${role}`);
      }
    });

    // Leave rooms on disconnect
    socket.on('disconnect', () => {
      console.log('🔴 User disconnected:', socket.id);
      
      // Remove from connected users
      for (const [userId, socketId] of connectedUsers.entries()) {
        if (socketId === socket.id) {
          connectedUsers.delete(userId);
          console.log(`❌ User ${userId} removed from connected users`);
          break;
        }
      }
    });

    // Ping-pong for connection health check
    socket.on('ping', () => {
      socket.emit('pong');
    });
  });

  // Helper function to emit to specific user
  io.emitToUser = (userId, event, data) => {
    io.to(`user_${userId}`).emit(event, data);
  };

  // Helper function to emit to hotel
  io.emitToHotel = (hotelId, event, data) => {
    io.to(`hotel_${hotelId}`).emit(event, data);
  };

  // Helper function to emit to role
  io.emitToRole = (role, event, data) => {
    io.to(`role_${role}`).emit(event, data);
  };

  return io;
};