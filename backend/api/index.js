import express from 'express';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
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


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI environment variable is required');
}

connectDB(); // Connect to MongoDB using the connectDB function

const app = express();

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


// Routes
app.use('/api/users', usersRoutes); // to handle user related routes
app.use('/api/hotels', hotelBranchRoutes); // to get hotel branches
app.use('/api/rooms', roomsRoutes); // to get hotel branches

// Serve uploaded files statically
app.use("/uploads", express.static("uploads"));


const PORT = process.env.PORT || 8000;

mongoose.connection.once('open', () => {
  console.log('✅ MongoDB Connected Successfully');
  console.log(`🚀 Server Environment: ${process.env.NODE_ENV || 'development'}`);

  app.listen(PORT, () => {
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