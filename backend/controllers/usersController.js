import { generateTokenAndSetCookie } from "../lib/utils/generateToken.js";
import { checkShiftBeforeLogin } from "../middleware/shiftCheckMiddleware.js";
import User from "../models/userModel.js";
import bcrypt from "bcryptjs";



export const signUp = async (req, res) => {
  try {
    const { firstName, lastName, email, phoneNumber, password, role, hotelId } = req.body;

    if (!firstName || !lastName || !email || !phoneNumber || !password) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: "Invalid email format" });
    }

    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ success: false, message: "Email already exists" });
    }

    const existingPhone = await User.findOne({ phoneNumber });
    if (existingPhone) {
      return res.status(400).json({ success: false, message: "Phone number already exists" });
    }

    if (password.length < 4) {
      return res.status(400).json({ success: false, message: "Password must be at least 4 characters long" });
    }

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      firstName,
      lastName,
      email,
      phoneNumber,
      password: hashedPassword,
      role,
      hotelId
    });

    await newUser.save();
    const token = generateTokenAndSetCookie(newUser._id);

    // Emit socket event for new user creation (if socket is available on the request)
    try {
      if (req && req.io && typeof req.io.emit === 'function') {
        const payload = {
          _id: newUser._id,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          email: newUser.email,
          role: newUser.role,
          hotelId: newUser.hotelId,
        };
        // Emit a general event and a role-specific event
        req.io.emit('user:created', payload);
        req.io.emit(`user:created:role:${newUser.role}`, payload);
        if (newUser.hotelId) req.io.emit(`hotel:${newUser.hotelId}:user:created`, payload);
      }
    } catch (emitErr) {
      console.error('Socket emit error in signUp:', emitErr.message || emitErr);
    }

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: {
        _id: newUser._id,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        email: newUser.email,
        phoneNumber: newUser.phoneNumber,
        role: newUser.role,
        hotelId: newUser.hotelId,
        // profileImg: newUser.profileImg,
        token,
      },
    });
  } catch (error) {
    console.error("Signup error:", error.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: "Please provide both email and password" 
      });
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid email or password" 
      });
    }

    // Check password
    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    if (!isPasswordCorrect) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid email or password" 
      });
    }

    // 🔒 Check if user account is active (existing check)
    if (!user.isActive) {
      return res.status(403).json({ 
        success: false, 
        message: "Your account has been deactivated. Please contact the administrator for assistance.",
        code: "ACCOUNT_INACTIVE"
      });
    }

    if(user.role === 'guest'){
      return res.status(403).json({
        success: false,
        message: "Only staff are allowed to access this dashboard.",
        code: "GUEST_LOGIN_NOT_ALLOWED"
      });
    }

    // 🔒 NEW: Check if user has an active shift (for staff roles)
    const shiftCheck = await checkShiftBeforeLogin(user);
    
    if (!shiftCheck.allowed) {
      return res.status(403).json({
        success: false,
        message: shiftCheck.message,
        code: shiftCheck.code || "NO_ACTIVE_SHIFT"
      });
    }

    // Generate token and set cookie (only if all checks pass)
    const token = generateTokenAndSetCookie(user._id, res);

    // Return user data without sensitive information
    const userData = {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      hotelId: user.hotelId,
      isActive: user.isActive,
    };

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: userData,
      token,
    });
  } catch (error) {
    console.error("Error in login controller:", error.message);
    res.status(500).json({ 
      success: false, 
      message: "Internal server error" 
    });
  }
};

// export const login = async (req, res) => {
//   try {
//     const { email, password } = req.body;

//     // Validate input
//     if (!email || !password) {
//       return res.status(400).json({ 
//         success: false, 
//         message: "Please provide both email and password" 
//       });
//     }

//     // Find user by email
//     const user = await User.findOne({ email });
//     if (!user) {
//       return res.status(400).json({ 
//         success: false, 
//         message: "Invalid email or password" 
//       });
//     }

//     // Check password
//     const isPasswordCorrect = await bcrypt.compare(password, user.password);
//     if (!isPasswordCorrect) {
//       return res.status(400).json({ 
//         success: false, 
//         message: "Invalid email or password" 
//       });
//     }

//     // 🔒 NEW: Check if user account is active
//     if (!user.isActive) {
//       return res.status(403).json({ 
//         success: false, 
//         message: "Your account has been deactivated. Please contact the administrator for assistance.",
//         code: "ACCOUNT_INACTIVE"
//       });
//     }

//     // Generate token and set cookie (only if user is active)
//     const token = generateTokenAndSetCookie(user._id, res);

//     // Return user data without sensitive information
//     const userData = {
//       _id: user._id,
//       firstName: user.firstName,
//       lastName: user.lastName,
//       email: user.email,
//       role: user.role,
//       hotelId: user.hotelId,
//       isActive: user.isActive, // Include isActive in response
//     };

//     res.status(200).json({
//       success: true,
//       message: "Login successful",
//       data: userData,
//       token,
//     });
//   } catch (error) {
//     console.error("Error in login controller:", error.message);
//     res.status(500).json({ 
//       success: false, 
//       message: "Internal server error" 
//     });
//   }
// };

export const loginGuest = async (req, res) => {
     try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Please provide both email and password" });
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ success: false, message: "Invalid email or password" });
    }

    // Check password
    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    if (!isPasswordCorrect) {
      return res.status(400).json({ success: false, message: "Invalid email or password" });
    }

    // Generate token and set cookie
    const token = generateTokenAndSetCookie(user._id, res);

    // Return user data without sensitive information
    const userData = {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      hotelId: user.hotelId,
      // phoneNumber: user.phoneNumber,
    };

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: userData,
      token,
    });
  } catch (error) {
    console.error("Error in login controller:", error.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }

}

export const getAdmins = async (req, res) => {
  try {
    // Find users with the role 'admin'
    const admins = await User.find({ role: 'admin' }).select('-password');
    
    res.status(200).json({ 
      success: true, 
      data: admins 
    });

  } catch (error) {
    console.error("Error in getAdmins:", error.message);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export const logout = async (req, res) => {
    try{
        res.cookie("jwt", "", {maxAge: 0});
        res.status(200).json({ message: "Logged out successfully" });
        
    }catch(error){
        console.log("Error in logout controller:", error.message);
        res.status(500).json({ error: "Internal server error" });
    }
}

export const getUser = async (req, res) => {
    try{
    const user = await User.findById(req.user._id).select("-password"); // The user is already attached to the request object by the protectRoute middleware
    res.status(200).json(user)

  }catch(error){
    console.log("Error in getMe controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
}

export const getAllStaff = async (req, res) => {
    try{
        // Find users with roles other than 'guest' and 'superadmin'
        const staffRoles = ['receptionist', 'cleaner', 'waiter', 'admin'];
        const staffMembers = await User.find({ role: { $in: staffRoles } }).select('-password').populate('hotelId', 'name location');
        res.status(200).json({ success: true, data: staffMembers });
    }catch(error){
        console.error("Error in getAllStaff:", error.message);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
}

export const getAllStaffInHotel = async (req, res) => {
    try {
        // 1. Get hotelId from the logged-in user (req.user)
        // This assumes your middleware (like 'protectRoute') attaches the user object to the request.
        const loggedInUserHotelId = req.user.hotelId;

        // Check if the logged-in user has an associated hotelId
        if (!loggedInUserHotelId) {
            // Depending on your application logic, you might return all staff or an error.
            // For staff-specific endpoints, an error or empty list is usually appropriate.
            return res.status(400).json({ 
                success: false, 
                message: "Logged-in user is not associated with a specific hotel." 
            });
        }

        // Define staff roles to include
        const staffRoles = ['receptionist', 'cleaner', 'waiter', 'admin'];

        // 2. Query the database using the logged-in user's hotelId
        const staffMembers = await User.find({ 
            role: { $in: staffRoles }, 
            hotelId: loggedInUserHotelId // Use the hotelId from req.user
        }).select('-password');

        res.status(200).json({ success: true, data: staffMembers });

    } catch (error) {
        console.error("Error in getAllStaffInHotel:", error.message);
        // Be specific with the error message. The original console.error was misleading.
        res.status(500).json({ success: false, error: "Internal server error" });
    }
};

export const getAllGuests = async (req, res) => {
  try {
      // Find users with the role 'guest'
      const guests = await User.find({ role: 'guest' }).select('-password');
      res.status(200).json({ 
        success: true, 
        data: guests 
      });
  } catch (error) {
    console.error("Error in getAllGuests:", error.message);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export const getUserById = async (req, res) => {
    try{
        const userId = req.params.id;
        const user = await User.findById(userId).select('-password');
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        res.status(200).json({ success: true, data: user });
    } catch (error) {
        console.error("Error in getUserById:", error.message);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
};

export const updateStaffStatus = async (req, res) => {
    try{
    const staffId = req.params.id;
    const { isActive, userIds, role, hotelId } = req.body;

    // Validate isActive boolean
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ success: false, message: "Invalid input: isActive must be boolean" });
    }

    // 1) If an array of userIds is provided -> update those users
    if (Array.isArray(userIds) && userIds.length > 0) {
      const updateResult = await User.updateMany({ _id: { $in: userIds } }, { isActive });
      const updatedUsers = await User.find({ _id: { $in: userIds } }).select('-password');
      return res.status(200).json({ success: true, modifiedCount: updateResult.modifiedCount, data: updatedUsers });
    }

    // 2) If role (and optional hotelId) provided -> bulk update by filter
    if (typeof role === 'string' && role.length > 0) {
      const filter = { role };
      if (hotelId) filter.hotelId = hotelId;
      const updateResult = await User.updateMany(filter, { isActive });
      const updatedUsers = await User.find(filter).select('-password');
      return res.status(200).json({ success: true, modifiedCount: updateResult.modifiedCount, data: updatedUsers });
    }

    // 3) If params.id provided -> update single user
    if (staffId) {
      const staffMember = await User.findByIdAndUpdate(staffId, { isActive }, { new: true }).select('-password');
      if (!staffMember) {
        return res.status(404).json({ success: false, message: "Staff member not found" });
      }
      return res.status(200).json({ success: true, data: staffMember });
    }
    
    // After successfully updating, emit the event so all clients are notified
    if (req.io) {
        req.io.emit('staffUpdated', {
            action: 'update',
            user: staffMember 
        });
      }

    // If none of the above, nothing to do
    return res.status(400).json({ success: false, message: 'No target specified: provide params.id, userIds array, or role' });
    }catch(error){
        console.error("Error in updateStaffStatus:", error.message);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
}

export const updateStaffRole = async (req, res) => {
    try {
        const { id } = req.params; // staff ID
        const { newRole } = req.body;

        if (!newRole) {
            return res.status(400).json({ success: false, message: "Role is required" });
        }

        // Validate allowed roles
        const validRoles = ['admin', 'receptionist', 'cleaner', 'waiter', 'headWaiter', 'superadmin'];
        if (!validRoles.includes(newRole)) {
            return res.status(400).json({ success: false, message: "Invalid role provided" });
        }

        // 1. Check for Superadmin before update (must still fetch the user)
        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ success: false, message: "Staff not found" });
        }
        if (user.role === 'superadmin') {
            return res.status(403).json({ success: false, message: "Cannot modify superadmin role" });
        }

        // 2. FIX: Use findByIdAndUpdate to update ONLY the role field.
        // The { new: true } option returns the updated document.
        // This avoids re-validating the problematic 'hotelId' field.
        const updatedUser = await User.findByIdAndUpdate(
            id,
            { role: newRole }, // Only update the role
            { new: true, runValidators: true } // Return new doc, run validators ONLY on updated fields
        ).select('-password'); // Exclude password from the returned object

        if (!updatedUser) {
             return res.status(404).json({ success: false, message: "Staff not found after update" });
        }

        // Emit update event to all connected clients
        if (req.io) {
            req.io.emit("staffUpdated", { action: "update", user: updatedUser });
        }

        res.status(200).json({ success: true, message: "Staff role updated successfully", data: updatedUser });
    } catch (error) {
        console.error("Error in updateStaffRole:", error.message);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};


// Emit user created event for a specific user (useful for manual triggers)
export const emitUserCreated = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ success: false, message: 'userId param required' });

    const user = await User.findById(userId).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (req && req.io && typeof req.io.emit === 'function') {
      req.io.emit('user:created', user);
      req.io.emit(`user:created:role:${user.role}`, user);
      if (user.hotelId) req.io.emit(`hotel:${user.hotelId}:user:created`, user);
    }

    return res.status(200).json({ success: true, message: 'Event emitted', data: user });
  } catch (error) {
    console.error('Error in emitUserCreated:', error.message);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};


// Emit staff status update event for a user (or multiple users) without changing DB
export const emitStaffStatusEvent = async (req, res) => {
  try {
    const { userId } = req.params;
    const { isActive, userIds } = req.body;

    if (typeof isActive !== 'boolean') return res.status(400).json({ success: false, message: 'isActive must be boolean' });

    // Single user
    if (userId) {
      const user = await User.findById(userId).select('-password');
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });
      if (req && req.io && typeof req.io.emit === 'function') {
        req.io.emit('staff:statusUpdated', { userId: user._id, isActive });
      }
      return res.status(200).json({ success: true, data: { userId: user._id, isActive } });
    }

    // Multiple users
    if (Array.isArray(userIds) && userIds.length > 0) {
      if (req && req.io && typeof req.io.emit === 'function') {
        userIds.forEach((id) => req.io.emit('staff:statusUpdated', { userId: id, isActive }));
      }
      return res.status(200).json({ success: true, modifiedCount: userIds.length });
    }

    return res.status(400).json({ success: false, message: 'Provide userId or userIds array' });
  } catch (error) {
    console.error('Error in emitStaffStatusEvent:', error.message);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * @desc Find a user by email address
 * @route GET /api/users/find-by-email?email=...
 * @access Private (Protected Route)
 */
export const findUserByEmail = async (req, res) => {
    try {
        const { email } = req.query;

        if (!email) {
            return res.status(400).json({ success: false, error: "Email query parameter is required." });
        }

        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({ success: false, error: "User not found." });
        }

        // Return only necessary public fields (excluding password, roles, etc.)
        return res.status(200).json({
            success: true,
            data: {
                _id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                phoneNumber: user.phoneNumber || null,
            },
        });

    } catch (error) {
        console.error("Error finding user by email:", error);
        return res.status(500).json({ success: false, error: "Server error during user lookup." });
    }
};

/**
 * @desc Create a new guest user account from the reception desk
 * @route POST /api/users/create-guest-account
 * @access Private (Protected Route)
 */
export const createGuestAccount = async (req, res) => {
  try {
    const { firstName, lastName, email, phoneNumber, password } = req.body;
    const hotelId = req.user?.hotelId; // Get from authenticated receptionist

    // Validate required fields
    if (!firstName || !lastName || !email || !phoneNumber || !password) {
      return res.status(400).json({
        success: false,
        error: 'All fields are required: firstName, lastName, email, phoneNumber, password'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [
        { email: { $regex: new RegExp(`^${email}$`, 'i') } },
        { phoneNumber }
      ]
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'User with this email or phone number already exists',
        userId: existingUser._id // Return existing user ID
      });
    }

    // Hash password (assuming you have bcrypt installed)
    const bcrypt = await import('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new guest user
    const newUser = new User({
      firstName,
      lastName,
      email: email.toLowerCase(),
      phoneNumber,
      password: hashedPassword,
      role: 'guest',
      hotelId: hotelId || null, // Link to hotel if available
      isActive: true // Guests are automatically active
    });

    await newUser.save();

    return res.status(201).json({
      success: true,
      message: 'Guest account created successfully',
      userId: newUser._id,
      data: {
        _id: newUser._id,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        email: newUser.email,
        phoneNumber: newUser.phoneNumber,
        role: newUser.role
      }
    });

  } catch (error) {
    console.error('Error creating guest account:', error);
    return res.status(500).json({
      success: false,
      error: 'Server error while creating guest account',
      message: error.message
    });
  }
};