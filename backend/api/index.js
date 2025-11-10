import express from 'express';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import http from 'http'; // 1. Import http
import { Server } from 'socket.io'; // 2. Import socket.io
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import connectDB from '../DB/connectMongoDB.js';
import logger from '../middleware/logEvents.js';
import corsOptions from '../config/corsOptions.js';
import hotelBranchRoutes from '../routes/hotelRoutes.js';
import usersRoutes from '../routes/usersRoutes.js';
import roomsRoutes from '../routes/roomsRoutes.js';
import receptionistRoute from '../routes/receptionistRoute.js';
import bookingRoutes from '../routes/bookingRoutes.js';
import menuItemRoutes from '../routes/menuItemRoutes.js';
import orderRoutes from '../routes/orderRoutes.js';
import requestsRoutes from '../routes/requestRoutes.js';
import cleaningRoutes from '../routes/cleaningRoutes.js';
import galleryRoutes from '../routes/galleryRoutes.js';
import postRoutes from '../routes/postRoutes.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI environment variable is required');
}

connectDB(); // Connect to MongoDB using the connectDB function

const app = express();

// Create HTTP server and integrate Socket.io
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [corsOptions.origin], // Your frontend URL
    credentials: true,
  },
});

// ✅ This parses incoming JSON requests
app.use(express.json());

// (Optional) For form submissions
app.use(express.urlencoded({ extended: true }));

// ------------ CORS configuration -----------
app.use(cors(corsOptions));

app.get('/', (req, res) => {
    res.send('API is running...');
});


app.use(express.json({ limit: "5mb" })); // Middleware to parse JSON requests || to parse incoming JSON data  [ Limit shouldn't be too high, as it can lead to performance issues or security vulnerabilities DOS ]
app.use(express.urlencoded({ extended: false })); // Middleware to parse URL-encoded data || to parse form data(urlencoded)

// ------ Middleware --------
// pass cookies through here 
app.use(cookieParser());
// app.use(errorHandler); // Error handling middleware

// Logger middleware
app.use(logger);

// Make io accessible to our routers
app.use((req, res, next) => {
  req.io = io;
  next();
});



// Routes
app.use('/api/users', usersRoutes); // to handle user related routes
app.use('/api/hotels', hotelBranchRoutes); // to get hotel branches
app.use('/api/rooms', roomsRoutes); // to get hotel branches
app.use('/api/receptionist', receptionistRoute); // receptionist routes
app.use('/api/bookings', bookingRoutes); // booking routes
app.use('/api/menu', menuItemRoutes); // menu item routes
app.use('/api/orders', orderRoutes); // menu item routes
app.use('/api/requests', requestsRoutes); // maintenance/request routes
app.use('/api/cleaning', cleaningRoutes); // cleaning staff routes
app.use('/api/gallery', galleryRoutes); // gallery routes
app.use('/api/posts', postRoutes); // blog/news post routes

// Serve uploaded files statically
app.use("/uploads", express.static("uploads"));


// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;

mongoose.connection.once('open', () => {
  console.log('✅ MongoDB Connected Successfully');
  console.log(`🚀 Server Environment: ${process.env.NODE_ENV || 'development'}`);

  server.listen(PORT, () => {
    console.log(`🎉 Server running successfully on port ${PORT}`);
    console.log(`📍 Server URL: http://localhost:${PORT}`);
    console.log(`🔗 Health check: GET /`);
    console.log('─'.repeat(50));
  });
});

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️ MongoDB disconnected');
});

export default app;