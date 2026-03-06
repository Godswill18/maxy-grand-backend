import User from "../models/userModel.js";
import jwt from "jsonwebtoken";


// src/middleware/protectedRoutes.js
// ✅ FIXED VERSION - Fetches full user from DB

export const protectedRoute = async (req, res, next) => {
  try {
    // 1. Get token from cookies or Authorization header
    let token = req.cookies?.jwt;
    
    if (!token && req.headers.authorization) {
      // Extract from "Bearer <token>"
      const parts = req.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        token = parts[1];
      }
    }

    // 2. Check if token exists
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided. Authorization denied.',
        code: 'NO_TOKEN'
      });
    }

    // 3. Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    } catch (tokenError) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
        code: 'INVALID_TOKEN'
      });
    }

    // 4. ✅ CRITICAL: Fetch FULL user from database
    // This ensures all fields including hotelId are available
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // 5. ✅ Shift-based access guard for staff roles
    // Superadmin/admin/guest are excluded — their isActive is always true.
    // For staff, the cron job sets isActive=false when their shift ends.
    // Checking it here ensures stale JWTs cannot be used after shift end.
    const STAFF_ROLES = ['receptionist', 'cleaner', 'waiter', 'headWaiter'];
    if (STAFF_ROLES.includes(user.role) && !user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your shift has ended. Please log in again.',
        code: 'SHIFT_ENDED',
      });
    }

    // 6. ✅ ATTACH FULL USER OBJECT to request
    // This includes: _id, firstName, lastName, email, hotelId, role, etc.
    req.user = user;

    // 7. Proceed to next middleware/controller
    next();

  } catch (error) {
    console.error('Protected route error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Optional: Async version if you're using async middleware
export const protectedRouteAsync = async (req, res, next) => {
  try {
    let token = req.cookies?.jwt;
    
    if (!token && req.headers.authorization) {
      const parts = req.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        token = parts[1];
      }
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    
    // ✅ Fetch full user from DB
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // ✅ Attach to request
    req.user = user;
    next();

  } catch (error) {
    console.error('Protected route error:', error.message);
    return res.status(401).json({
      success: false,
      message: 'Not authorized'
    });
  }
};

// export const protectedRoute = async (req, res, next) => {

//     try{
//         const token = req.cookies.jwt;
//         if(!token) {
//             return res.status(401).json({error: "Unauthorized, no token provided"});
//         }

//         const decoded = jwt.verify(token, process.env.JWT_SECRET);

//         if(!decoded) {
//             return res.status(401).json({error: "Unauthorized, invalid token"});
//         }

//         const user = await User.findById(decoded.userId).select("-password");

//         if(!user) {
//             return res.status(401).json({error: "Unauthorized, User not found"});
//         }

//         req.user = user; // Attach the user to the request object for use in the next middleware or route handler
//         next(); // Call the next middleware or route handler

//     }catch(error){
//         console.log("Error in protectRoute middleware:", error.message);
//         return res.status(500).json({ error: "Internal server error" });
//     }

// }