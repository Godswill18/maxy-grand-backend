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
import { setupSocketIO } from '../config/socketConfig.js';
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
import reportRoutes from '../routes/reportRoutes.js';
import reviewsRoutes from '../routes/reviewRoutes.js';
import dashboardRoutes from '../routes/dashboardRoutes.js';
import analyticsRoutes from '../routes/analyticsRoutes.js';
import performanceRoutes from '../routes/performanceRoutes.js';
import waiterDashRoutes from '../routes/waiterDashRoutes.js';
import paymentRoutes from '../routes/paymentRoutes.js';
import shiftRoutes from '../routes/shiftRoutes.js';
import blogsRoutes from '../routes/blogRoutes.js';
import notificationRoutes from '../routes/notificationRoutes.js';
import roomCategoryRoutes from '../routes/roomCategoryRoutes.js';
import announcementRoutes from '../routes/announcementRoutes.js';
import { setupShiftCronJobs } from '../cron/shiftCronJobs.js';
import {
    abuseShield,
    loginLimiter,
    signupLimiter,
    forgotPasswordLimiter,
    availabilityLimiter,
    adminLimiter,
    generalLimiter,
    reviewSubmitLimiter,
} from '../middleware/rateLimiter.js';


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

   // ✅ Add connection options
  pingTimeout: 60000,
  pingInterval: 25000,
});

// ✅ Setup Socket.IO with enhanced configuration
setupSocketIO(io);

// ------------ CORS configuration -----------
app.use(cors(corsOptions));

// ── LAYER 1: Abuse Shield — runs BEFORE body parsing ──────────────────────────
// Must be first so large/rapid POST bodies cannot exhaust memory before this
// check fires. Blocks any IP sending >60 requests in 10 seconds.
// Progressive lockout: 1 min → 5 min → 30 min → 1 hr.
// Only the offending IP is blocked; every other user is completely unaffected.
app.use(abuseShield);
// ──────────────────────────────────────────────────────────────────────────────

// ── Body parsing (after the abuse shield) ─────────────────────────────────────
// 5 MB cap prevents memory exhaustion from oversized request bodies.
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// ------ Middleware --------
app.use(cookieParser());

// Logger middleware
app.use(logger);

// Make io accessible to our routers
app.use((req, res, next) => {
  req.io = io;
  next();
});

app.get('/', (req, res) => {
    res.send('API is running...');
});

// ── LAYER 2: Endpoint Rate Limiters ───────────────────────────────────────────
// Public auth endpoints — IP-based, strict limits
app.use('/api/users/login-user',              loginLimiter);
app.use('/api/users/login-guest',             loginLimiter);
app.use('/api/users/create-user',             signupLimiter);
app.use('/api/users/request-password-reset',  forgotPasswordLimiter);
app.use('/api/users/forgot-password',         forgotPasswordLimiter);

// Review submission — public endpoint, rate-limited per IP
app.use('/api/reviews/submit', reviewSubmitLimiter);
app.use('/api/reviews/validate-token', reviewSubmitLimiter);

// Public room availability — IP-based, generous but scraping-resistant
app.use('/api/rooms/get-all-rooms',    availabilityLimiter);
app.use('/api/rooms/available',        availabilityLimiter);
app.use('/api/rooms/available_rooms',  availabilityLimiter);

// Admin/staff dashboards — user-based, high limits
app.use('/api/analytics',   adminLimiter);
app.use('/api/dashboard',   adminLimiter);
app.use('/api/performance', adminLimiter);
app.use('/api/reports',     adminLimiter);

// Global catch-all — 100 req/min per IP (authenticated staff are bypassed)
app.use('/api', generalLimiter);
// ──────────────────────────────────────────────────────────────────────────────

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
app.use('/api/reports', reportRoutes); // reports routes
app.use('/api/reviews', reviewsRoutes); // reviews routes
app.use('/api/dashboard', dashboardRoutes); // dashboard routes
app.use('/api/analytics', analyticsRoutes); // analytics routes
app.use('/api/performance', performanceRoutes); // performance routes
app.use('/api/waiter-dashboard', waiterDashRoutes); // waiter dashboard routes
app.use('/api/payments', paymentRoutes); // payment routes
app.use('/api/shifts', shiftRoutes); // shift routes
app.use('/api/blogs', blogsRoutes); // blog routes
app.use('/api/notifications', notificationRoutes);
app.use('/api/room-categories', roomCategoryRoutes); // room category routes
app.use('/api/announcements', announcementRoutes); // announcement/promotion routes

// Serve uploaded files statically
app.use("/uploads", express.static("uploads"));


// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Initialize cron jobs
setupShiftCronJobs(io); // NEW

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