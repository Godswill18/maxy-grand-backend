import Hotel from "../models/hotelModel.js";
import RoomType from "../models/roomTypeModel.js"; // ✅ Add this
import User from '../models/userModel.js';
import fs from "fs";
import path from "path";

export const createHotelBranch = async (req, res) => {
  try {
    const user = req.user;

    // ✅ Check role
    if (!user || user.role !== "superadmin") {
      return res
        .status(403)
        .json({ success: false, error: "Forbidden — Super Admin access required" });
    }

    const { name, city, address, phoneNumber, manager, roomCount, staffCount, isActive } = req.body;

    // ✅ Validate required fields
    if (!name || !city || !address || !phoneNumber) {
      return res
        .status(400)
        .json({ success: false, message: "Name, city, address, and phone number are required" });
    }

    // ✅ Check for duplicate address
    const existingBranch = await Hotel.findOne({ address });
    if (existingBranch) {
      return res
        .status(400)
        .json({ success: false, message: "A hotel branch with this address already exists" });
    }

      // --- FIX: Handle empty string for manager ---
    // An empty string ("") cannot be cast to an ObjectId, but null can be.
    // This treats an empty string as "no manager assigned".
    const managerId = manager === "" ? null : manager;
    // --- END FIX ---

    // ✅ Create new branch
    const newHotelBranch = new Hotel({
      name,
      city,
      address,
      phoneNumber,
      manager: managerId, // <-- Use the cleaned variable here
      roomCount,
      staffCount,
      isActive,
    });

    await newHotelBranch.save();

    return res.status(201).json({
      success: true,
      message: "Hotel branch created successfully",
      data: newHotelBranch,
    });
  } catch (error) {
    console.error("Error in createHotelBranch:", error.message);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};



export const updateBranch = async (req, res) => {
  try {
    const branchId = req.params.id;
    const { name, city, address, phoneNumber, manager, roomCount, staffCount, isActive } = req.body;

    // Build update object only with provided values
    const updateData = {};
    if (typeof name !== 'undefined') updateData.name = name;
    if (typeof city !== 'undefined') updateData.city = city;
    if (typeof address !== 'undefined') updateData.address = address;
    if (typeof phoneNumber !== 'undefined') updateData.phoneNumber = phoneNumber;

    // Handle manager assignment
    let managerChanged = false;
    let newManagerId = null;

    if (typeof manager !== 'undefined') {
      managerChanged = true;
      // Treat empty string as explicit unset
      if (manager === '' || manager === null) {
        updateData.manager = null;
        newManagerId = null;
      } else {
        updateData.manager = manager;
        newManagerId = manager;
      }
    }

    if (typeof roomCount !== 'undefined') {
      const rc = Number(roomCount);
      if (!Number.isNaN(rc)) updateData.roomCount = rc;
    }
    
    if (typeof staffCount !== 'undefined') {
      const sc = Number(staffCount);
      if (!Number.isNaN(sc)) updateData.staffCount = sc;
    }

    if (typeof isActive !== 'undefined') updateData.isActive = isActive;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No valid fields provided for update' 
      });
    }

    // First, update the branch
    const updatedBranch = await Hotel.findByIdAndUpdate(branchId, updateData, { new: true });
    
    if (!updatedBranch) {
      return res.status(404).json({ 
        success: false, 
        error: "Hotel branch not found" 
      });
    }

    // ✅ NEW: If manager was assigned/changed, update the user's hotelId
    if (managerChanged && newManagerId) {
      try {
        const updatedUser = await User.findByIdAndUpdate(
          newManagerId,
          { hotelId: branchId },
          { new: true, runValidators: true }
        ).select('-password');

        if (!updatedUser) {
          console.warn(`Manager user ${newManagerId} not found`);
          // Don't fail the branch update if user not found
        } else {
          console.log(`✅ Updated user ${updatedUser._id} with hotelId: ${branchId}`);
        }
      } catch (userUpdateError) {
        console.error('Error updating user hotelId:', userUpdateError.message);
        // Don't fail the branch update if user update fails
        // But log the error for debugging
      }
    }

    // ✅ NEW: If manager was removed (set to null), we could optionally unset the user's hotelId
    // This is optional - you might want to keep their hotelId for history
    if (managerChanged && newManagerId === null) {
      // Optional: Find the previous manager and unset their hotelId
      // For now, we'll skip this to preserve history
      console.log('Manager was removed from branch');
    }

    return res.status(200).json({
      success: true,
      message: "Hotel branch updated successfully",
      data: updatedBranch
    });

  } catch (error) {
    console.error("Error in updateBranch:", error.message);
    return res.status(500).json({ 
      success: false, 
      error: "Internal server error" 
    });
  }
};

export const getActiveHotelBranch = async (req, res) => {

    try{
        const hotelBranches = await Hotel.find({ isActive: true });
        return res.status(200).json({
            success: true,
            data: hotelBranches
        });
    }catch(error){
        console.error("Error in getHotelBranch:", error.message);
        return res.status(500).json({ success: false, error: "Internal server error" });
    }

}

export const getHotelBranch_admin = async (req, res) => {
    try{
        // Ensure user is authenticated and attached to req.user
        // const user = req.user;
        // if (!user || user.role !== "superadmin") {
        //   return res
        //     .status(403)
        //     .json({ success: false, error: "Forbidden — Super Admin access required" });
        // }
        const hotelBranches = await Hotel.find();
        return res.status(200).json({
            success: true,
            data: hotelBranches
        });
    }catch(error){
        console.error("Error in getHotelBranch_admin:", error.message);
        return res.status(500).json({ success: false, error: "Internal server error" });
    }

}

export const getSingleBranch = async (req, res) => {
    try{
        const branchId = req.params.id;
        const hotelBranch = await Hotel.findById(branchId);
        if(!hotelBranch){
            return res.status(404).json({ success: false, error: "Hotel branch not found" });
        }
        return res.status(200).json({
            success: true,
            data: hotelBranch
        });
    }catch(error){
        console.error("Error in getSingleBranch:", error.message);
        return res.status(500).json({ success: false, error: "Internal server error" });
    }
}

export const getSingleBranchUser = async (req, res) => {
    try{
        const branchId = req.params.id;
        const hotelBranch = await Hotel.findById(branchId);
        if(!hotelBranch){
            return res.status(404).json({ success: false, error: "Hotel branch not found" });
        }
        return res.status(200).json({
            success: true,
            data: hotelBranch
        });
    }catch(error){
        console.error("Error in getSingleBranch:", error.message);
        return res.status(500).json({ success: false, error: "Internal server error" });
    }
}

export const getMyBranch = async (req, res) => {
    try{
        // Require authentication
        const user = req.user;
        if (!user) {
            return res.status(401).json({ success: false, error: "Authentication required" });
        }

        // Only allow branch admin for this hotel (or superadmin)
        // user.hotelId is expected to reference the Hotel _id (see models/userModel.js)
        const branchId = req.params.id;

        if (user.role !== 'admin' && user.role !== 'superadmin') {
            return res.status(403).json({ success: false, error: "Forbidden — Admin access required" });
        }

        // If the user is an admin, ensure they belong to the requested branch
        if (user.role === 'admin') {
            if (!user.hotelId || user.hotelId.toString() !== branchId) {
                return res.status(403).json({ success: false, error: "Forbidden — You are not the admin of this branch" });
            }
        }

        const hotelBranch = await Hotel.findById(branchId);
        if(!hotelBranch){
            return res.status(404).json({ success: false, error: "Hotel branch not found" });
        }

        return res.status(200).json({
            success: true,
            data: hotelBranch
        });
    }catch(error){
        console.error("Error in getMyBranch:", error.message);
        return res.status(500).json({ success: false, error: "Internal server error" });
    }
}

export const getHotelList = async (req, res) => {
  try {
    // Select only the 'name' field, _id is included by default
    const hotels = await Hotel.find({}).select('name');
    res.status(200).json(hotels);
  } catch (error)
 {
    res
      .status(500)
      .json({ message: 'Server error fetching hotel list', error: error.message });
  }
};


export const deleteBranch = async (req, res) => {
  try {
    // ✅ Ensure only Super Admin can delete
    const user = req.user;
    if (!user || user.role !== "superadmin") {
      return res
        .status(403)
        .json({ success: false, error: "Forbidden — Super Admin access required" });
    }

    const branchId = req.params.id;

    // ✅ Find the branch first
    const branch = await Hotel.findById(branchId);
    if (!branch) {
      return res.status(404).json({ success: false, error: "Hotel branch not found" });
    }

    // --- NEW LOGIC: Find RoomTypes and delete their images ---
    
    // 1. Find all room types associated with this branch
    const roomTypesToDelete = await RoomType.find({ hotelId: branchId });

    let deletedImageCount = 0;

    // 2. Loop through them and delete their physical image files
    if (roomTypesToDelete && roomTypesToDelete.length > 0) {
      for (const roomType of roomTypesToDelete) {
        if (roomType.images && roomType.images.length > 0) {
          roomType.images.forEach((imgPath) => {
            try {
              // Resolve the full path to the image
              const fullPath = path.resolve(imgPath);
              if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath); // Delete the file
                deletedImageCount++;
              }
            } catch (err) {
              // Log error for a specific image but don't stop the whole process
              console.error(`Failed to delete image ${imgPath}:`, err.message);
            }
          });
        }
      }
    }
    // --- END NEW LOGIC ---

    // 3. Now, delete all related room types from the database
    const deletedRoomTypes = await RoomType.deleteMany({ hotelId: branchId });

    // 4. Finally, delete the branch itself
    await Hotel.findByIdAndDelete(branchId);

    return res.status(200).json({
      success: true,
      message: `Hotel branch, ${deletedRoomTypes.deletedCount} room types, and ${deletedImageCount} associated images deleted successfully.`,
    });
  } catch (error) {
    console.error("Error in deleteBranch:", error.message);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

