// ===== SERVER.JS INTEGRATION FOR SHIFT SCHEDULER =====

// 1. Import required modules at the top of server.js
import shiftRoutes from '../../routes/shiftRoutes.js';
import { setupShiftCronJobs } from '../../cron/shiftCronJobs.js';

// 2. Register shift routes (add with other routes)
app.use('/api/shifts', shiftRoutes);

// 3. Setup cron jobs after Socket.IO initialization
// Add this after your io setup, before server.listen()

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    // ... your existing socket handlers ...
    
    // Listen for shift-related events
    socket.on('shift:subscribe', (data) => {
        if (data.hotelId) {
            socket.join(`hotel:${data.hotelId}`);
        }
        if (data.userId) {
            socket.join(`user:${data.userId}`);
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// 4. Initialize shift cron jobs
setupShiftCronJobs(io);

// ===== COMPLETE SERVER.JS EXAMPLE =====

/*
import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { Server } from 'socket.io';
import connectDB from './db/connectDB.js';

// Import routes
import userRoutes from './routes/userRoutes.js';
import shiftRoutes from './routes/shiftRoutes.js'; // NEW
// ... other routes

// Import cron jobs
import { setupShiftCronJobs } from './cron/shiftCronJobs.js'; // NEW

dotenv.config();

const app = express();
const httpServer = createServer(app);

// Socket.IO setup
const io = new Server(httpServer, {
    cors: {
        origin: process.env.CLIENT_URL || 'http://localhost:5173',
        credentials: true,
    },
});

// Make io accessible to routes
app.use((req, res, next) => {
    req.io = io;
    next();
});

// Middleware
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Routes
app.use('/api/users', userRoutes);
app.use('/api/shifts', shiftRoutes); // NEW
// ... other routes

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    // Shift-related socket handlers
    socket.on('shift:subscribe', (data) => {
        if (data.hotelId) {
            socket.join(`hotel:${data.hotelId}`);
            console.log(`Socket ${socket.id} joined hotel:${data.hotelId}`);
        }
        if (data.userId) {
            socket.join(`user:${data.userId}`);
            console.log(`Socket ${socket.id} joined user:${data.userId}`);
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// Initialize cron jobs
setupShiftCronJobs(io); // NEW

// Connect to database and start server
const PORT = process.env.PORT || 5000;

connectDB().then(() => {
    httpServer.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log('Shift scheduler system initialized');
    });
}).catch((error) => {
    console.error('Failed to connect to database:', error);
    process.exit(1);
});
*/

// ===== PACKAGE.JSON DEPENDENCIES =====

/*
Add these to your package.json dependencies:

{
  "dependencies": {
    "node-cron": "^3.0.3",
    // ... your other dependencies
  }
}

Then run: npm install node-cron
*/