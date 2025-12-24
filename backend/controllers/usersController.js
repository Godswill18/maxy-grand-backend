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

    // ✅ FIX: Convert email to lowercase for consistency
    const lowerEmail = email.toLowerCase();

    const existingEmail = await User.findOne({ email: lowerEmail });
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

    // ✅ FIX: DON'T hash password here! Let pre-save hook do it.
    // This prevents double-hashing which breaks bcrypt.compare()
    const newUser = new User({
      firstName,
      lastName,
      email: lowerEmail,
      phoneNumber,
      password: password,  // ✅ Plain text - pre-save hook will hash it
      role,
      hotelId
    });

    await newUser.save();  // ← Pre-save hook automatically hashes password
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
      return res.status(400).json({ 
        success: false, 
        message: "Please provide both email and password" 
      });
    }

    // Convert email to lowercase
    const lowerEmail = email.toLowerCase();
    console.log(`🔍 Login attempt for email: ${lowerEmail}`);

    // Find user by email
    const user = await User.findOne({ email: lowerEmail });
    if (!user) {
      console.log(`❌ User not found: ${lowerEmail}`);
      return res.status(400).json({ 
        success: false, 
        message: "Invalid email or password" 
      });
    }

    console.log(`✅ User found: ${lowerEmail}`);
    console.log(`   Stored password hash: ${user.password.substring(0, 50)}...`);
    console.log(`   Password hash length: ${user.password.length}`);
    console.log(`   Entered password: ${password}`);
    console.log(`   Entered password length: ${password.length}`);

    // Validate password field exists
    if (!user.password) {
      console.error(`❌ No password stored for user ${lowerEmail}`);
      return res.status(400).json({ 
        success: false, 
        message: "Invalid email or password" 
      });
    }

    // Validate password is hashed
    if (!user.password.startsWith('$2')) {
      console.error(`❌ Password not hashed for user ${lowerEmail}. Password: ${user.password.substring(0, 30)}`);
      return res.status(400).json({ 
        success: false, 
        message: "Account authentication issue. Please contact support." 
      });
    }

    // Compare password with proper error handling
    let isPasswordCorrect = false;
    try {
      isPasswordCorrect = await bcrypt.compare(password, user.password);
      console.log(`🔐 Bcrypt.compare result: ${isPasswordCorrect}`);
    } catch (bcryptError) {
      console.error(`❌ Bcrypt compare error for user ${lowerEmail}:`, bcryptError.message);
      return res.status(400).json({ 
        success: false, 
        message: "Invalid email or password" 
      });
    }

    // Check password result
    if (!isPasswordCorrect) {
      console.log(`❌ Password mismatch for user ${lowerEmail}`);
      console.log(`   This means the password entered doesn't match the stored hash`);
      console.log(`   Stored hash starts with: ${user.password.substring(0, 20)}`);
      return res.status(400).json({ 
        success: false, 
        message: "Invalid email or password" 
      });
    }

    console.log(`✅ Password correct for user ${lowerEmail}`);

    // Check if user is a guest
    // if (user.role !== 'guest') {
    //   console.log(`❌ User ${lowerEmail} is not a guest. Role: ${user.role}`);
    //   return res.status(403).json({ 
    //     success: false, 
    //     message: "Only guests can login here. Please use the staff login page." 
    //   });
    // }

    console.log(`✅ User is a guest. Generating token...`);

    // Generate token and set cookie
    const token = generateTokenAndSetCookie(user._id, res);

    // Return user data
    const userData = {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      role: user.role,
    };

    console.log(`✅ Login successful for ${lowerEmail}`);

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: userData,
      token,
    });
  } catch (error) {
    console.error("❌ Error in loginGuest controller:", error.message);
    res.status(500).json({ 
      success: false, 
      message: "Internal server error" 
    });
  }
};

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
        const staffRoles = ['receptionist', 'cleaner', 'waiter', 'headWaiter','admin'];
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
        const staffRoles = ['receptionist', 'cleaner', 'waiter', 'headWaiter', 'admin'];

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
            return res.status(400).json({ 
              success: false, 
              error: "Email query parameter is required." 
            });
        }

        // ✅ FIX: Convert email to lowercase for consistency
        const lowerEmail = email.toLowerCase();
        
        const user = await User.findOne({ email: lowerEmail });

        if (!user) {
            return res.status(404).json({ 
              success: false, 
              error: "User not found." 
            });
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
        return res.status(500).json({ 
          success: false, 
          error: "Server error during user lookup." 
        });
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
    // const hotelId = req.user?.hotelId; // Get from authenticated receptionist

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

    // ✅ FIXED: Use the top-level bcrypt import (already imported at the top of the file)
    // Hash password - same way as signUp does it
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new guest user
    const newUser = new User({
      firstName,
      lastName,
      email: email.toLowerCase(),
      phoneNumber,
      password: hashedPassword,
      role: 'guest',
      // hotelId: hotelId || null, // Link to hotel if available
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

// ✅ NEW: Update user profile (account number, bank name)
export const updateUserProfile = async (req, res) => {
  try {
    const userId = req.user._id; // From protected route middleware
    const { firstName, lastName, accountNumber, bankName } = req.body;

    // Validation
    if (!firstName || !lastName) {
      return res.status(400).json({
        success: false,
        message: "First name and last name are required"
      });
    }

    if (!accountNumber || !bankName) {
      return res.status(400).json({
        success: false,
        message: "Account number and bank name are required"
      });
    }

    // Validate account number length
    if (accountNumber.trim().length < 8) {
      return res.status(400).json({
        success: false,
        message: "Account number must be at least 8 characters"
      });
    }

    // Update user profile
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        accountNumber: accountNumber.trim(),
        bankName: bankName.trim()
      },
      { new: true, runValidators: true }
    ).select('-password');

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: updatedUser
    });

  } catch (error) {
    console.error("Error in updateUserProfile:", error.message);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

// ✅ NEW: Request password reset (generates OTP and sends email)
export const requestPasswordReset = async (req, res) => {
  try {
    const userId = req.user._id;
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required"
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Email must match user's registered email
    if (user.email !== email) {
      return res.status(400).json({
        success: false,
        message: "Email does not match your registered email"
      });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Save OTP to user
    user.passwordResetToken = otp;
    user.passwordResetTokenExpiry = otpExpiry;
    user.passwordResetVerified = false;
    await user.save();

    // ✅ Send OTP via email
    try {
      await sendOTPEmail(user.email, user.firstName, otp);
    } catch (emailError) {
      console.error("Error sending OTP email:", emailError);
      return res.status(500).json({
        success: false,
        message: "Failed to send OTP. Please try again."
      });
    }

    res.status(200).json({
      success: true,
      message: "OTP sent to your email. Valid for 10 minutes.",
      data: {
        email: user.email,
        expiresIn: "10 minutes"
      }
    });

  } catch (error) {
    console.error("Error in requestPasswordReset:", error.message);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

// ✅ NEW: Verify OTP
export const verifyResetOTP = async (req, res) => {
  try {
    const userId = req.user._id;
    const { otp } = req.body;

    if (!otp) {
      return res.status(400).json({
        success: false,
        message: "OTP is required"
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Check if OTP exists and hasn't expired
    if (!user.passwordResetToken) {
      return res.status(400).json({
        success: false,
        message: "No password reset request found. Please request a new OTP."
      });
    }

    if (new Date() > user.passwordResetTokenExpiry) {
      user.passwordResetToken = null;
      user.passwordResetTokenExpiry = null;
      await user.save();
      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please request a new one."
      });
    }

    // Verify OTP
    if (user.passwordResetToken !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP"
      });
    }

    // Mark OTP as verified
    user.passwordResetVerified = true;
    await user.save();

    res.status(200).json({
      success: true,
      message: "OTP verified successfully. You can now reset your password."
    });

  } catch (error) {
    console.error("Error in verifyResetOTP:", error.message);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

// ✅ NEW: Reset password with verified OTP
export const resetPassword = async (req, res) => {
  try {
    const userId = req.user._id;
    const { newPassword, confirmPassword } = req.body;

    if (!newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "New password and confirmation are required"
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match"
      });
    }

    if (newPassword.length < 4) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 4 characters long"
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Check if OTP was verified
    if (!user.passwordResetVerified) {
      return res.status(400).json({
        success: false,
        message: "Please verify your OTP first"
      });
    }

    // Update password
    user.password = newPassword;
    user.passwordResetToken = null;
    user.passwordResetTokenExpiry = null;
    user.passwordResetVerified = false;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Password reset successfully"
    });

  } catch (error) {
    console.error("Error in resetPassword:", error.message);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

// ✅ Helper function: Send OTP email
async function sendOTPEmail(email, firstName, otp) {
  const nodemailer = await import('nodemailer');
  
  // Configure your email service
  const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
      user: process.env.EMAIL_USER || 'gokhamera@gmail.com',
      pass: process.env.EMAIL_PASSWORD || 'wzhy yaqj ntzl qkyh',
    },
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Password Reset OTP - Hotel Management System",
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h2 style="color: #333;">Password Reset Request</h2>
        </div>
        
        <p>Hi ${firstName},</p>
        
        <p>You requested to reset your password. Here is your One-Time Password (OTP):</p>
        
        <div style="background-color: #f0f0f0; padding: 15px; border-radius: 5px; text-align: center; margin: 20px 0;">
          <h3 style="color: #007bff; margin: 0; font-size: 32px; letter-spacing: 5px;">${otp}</h3>
        </div>
        
        <p style="color: #666;">
          <strong>Important:</strong> This OTP is valid for <strong>10 minutes</strong> only.
        </p>
        
        <p style="color: #666;">
          If you did not request this password reset, please ignore this email. Your account is secure.
        </p>
        
        <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
        
        <p style="color: #999; font-size: 12px;">
          This is an automated email. Please do not reply to this message.
        </p>
      </div>
    `
  };

  return transporter.sendMail(mailOptions);
}

