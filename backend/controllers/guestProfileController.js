// ✅ NEW GUEST PROFILE CONTROLLERS

import User from '../models/userModel.js';
import bcrypt from 'bcryptjs';
import { sendOTPEmail } from '../services/emailService.js';

// ✅ Update phone number (simple, no verification needed)
export const updateGuestPhoneNumber = async (req, res) => {
  try {
    const userId = req.user._id;
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required"
      });
    }

    // Check if phone number already exists for another user
    const existingPhone = await User.findOne({ 
      phoneNumber, 
      _id: { $ne: userId } 
    });

    if (existingPhone) {
      return res.status(400).json({
        success: false,
        message: "This phone number is already in use"
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { phoneNumber: phoneNumber.trim() },
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
      message: "Phone number updated successfully",
      data: updatedUser
    });

  } catch (error) {
    console.error("Error updating phone number:", error.message);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

// ✅ Step 1: Request email change (send OTP to NEW email)
export const requestGuestEmailChange = async (req, res) => {
  try {
    const userId = req.user._id;
    const { newEmail } = req.body;

    if (!newEmail) {
      return res.status(400).json({
        success: false,
        message: "New email is required"
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format"
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Check if new email already exists
    const existingEmail = await User.findOne({ 
      email: newEmail.toLowerCase(),
      _id: { $ne: userId }
    });

    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: "This email is already in use"
      });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Save OTP and new email to user document
    user.emailChangeToken = otp;
    user.emailChangeTokenExpiry = otpExpiry;
    user.emailChangeNewEmail = newEmail.toLowerCase();
    user.emailChangeVerified = false;
    await user.save();

    // Send OTP to NEW email
    try {
      await sendOTPEmail(newEmail, user.firstName, otp, 'email-change');
    } catch (emailError) {
      console.error("Error sending email change OTP:", emailError);
      return res.status(500).json({
        success: false,
        message: "Failed to send verification code. Please try again."
      });
    }

    res.status(200).json({
      success: true,
      message: "Verification code sent to your new email address",
      data: {
        newEmail: newEmail,
        expiresIn: "10 minutes"
      }
    });

  } catch (error) {
    console.error("Error in requestGuestEmailChange:", error.message);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

// ✅ Step 2: Verify email change OTP
export const verifyGuestEmailChangeOTP = async (req, res) => {
  try {
    const userId = req.user._id;
    const { otp } = req.body;

    if (!otp) {
      return res.status(400).json({
        success: false,
        message: "Verification code is required"
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
    if (!user.emailChangeToken) {
      return res.status(400).json({
        success: false,
        message: "No email change request found. Please start over."
      });
    }

    if (new Date() > user.emailChangeTokenExpiry) {
      user.emailChangeToken = null;
      user.emailChangeTokenExpiry = null;
      user.emailChangeNewEmail = null;
      await user.save();
      return res.status(400).json({
        success: false,
        message: "Verification code has expired. Please request a new one."
      });
    }

    // Verify OTP
    if (user.emailChangeToken !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid verification code"
      });
    }

    // Mark OTP as verified
    user.emailChangeVerified = true;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Verification code verified successfully"
    });

  } catch (error) {
    console.error("Error in verifyGuestEmailChangeOTP:", error.message);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

// ✅ Step 3: Confirm email change
export const confirmGuestEmailChange = async (req, res) => {
  try {
    const userId = req.user._id;
    const { newEmail } = req.body;

    if (!newEmail) {
      return res.status(400).json({
        success: false,
        message: "New email is required"
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
    if (!user.emailChangeVerified) {
      return res.status(400).json({
        success: false,
        message: "Please verify your code first"
      });
    }

    // Check if the email matches the one in the token
    if (user.emailChangeNewEmail !== newEmail.toLowerCase()) {
      return res.status(400).json({
        success: false,
        message: "Email mismatch. Please start over."
      });
    }

    // Update email
    user.email = newEmail.toLowerCase();
    user.emailChangeToken = null;
    user.emailChangeTokenExpiry = null;
    user.emailChangeNewEmail = null;
    user.emailChangeVerified = false;
    await user.save();

    const updatedUser = await User.findById(userId).select('-password');

    res.status(200).json({
      success: true,
      message: "Email updated successfully",
      data: updatedUser
    });

  } catch (error) {
    console.error("Error in confirmGuestEmailChange:", error.message);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

export default {
  updateGuestPhoneNumber,
  requestGuestEmailChange,
  verifyGuestEmailChangeOTP,
  confirmGuestEmailChange
};