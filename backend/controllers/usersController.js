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
