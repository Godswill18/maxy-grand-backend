import { generateTokenAndSetCookie } from "../lib/utils/generateToken.js";
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
      role: user.role
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
        const staffMembers = await User.find({ role: { $in: staffRoles } }).select('-password');
        res.status(200).json({ success: true, data: staffMembers });
    }catch(error){
        console.error("Error in getAllStaff:", error.message);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
}

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
    const validRoles = ['admin', 'receptionist', 'cleaner', 'waiter'];
    if (!validRoles.includes(newRole)) {
      return res.status(400).json({ success: false, message: "Invalid role provided" });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: "Staff not found" });
    }

    // Prevent superadmin modification
    if (user.role === 'superadmin') {
      return res.status(403).json({ success: false, message: "Cannot modify superadmin role" });
    }

    user.role = newRole;
    await user.save();

    // Emit update event to all connected clients
    if (req.io) {
      req.io.emit("staffUpdated", { action: "update", user });
    }

    res.status(200).json({ success: true, message: "Staff role updated successfully", data: user });
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
