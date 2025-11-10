import Hotel from "../models/hotelModel.js";


export const createHotelBranch = async (req, res) => {
  try {
    // Ensure user is authenticated and attached to req.user
    const user = req.user;

    if (!user || user.role !== "superadmin") {
      return res
        .status(403)
        .json({ success: false, error: "Forbidden — Super Admin access required" });
    }

    const { name, city, address, phoneNumber, manager, roomCount, staffCount, isActive } = req.body;

    if (!name || !city || !address || !phoneNumber) {
      return res
        .status(400)
        .json({ success: false, message: "Name, city, address, and phone number are required" });
    }

    const newHotelBranch = new Hotel({
      name,
      city,
      address,
      phoneNumber,
        manager,
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

    try{
     // Ensure user is authenticated and attached to req.user
    // const user = req.user;

    // if (!user || user.role !== "superadmin") {
    //   return res
    //     .status(403)
    //     .json({ success: false, error: "Forbidden — Super Admin access required" });
    // }

    const branchId = req.params.id;
    const { name, city, address, phoneNumber, manager, roomCount, staffCount, isActive } = req.body;

    // Build update object only with provided values to avoid overwriting fields with undefined
    const updateData = {};
    if (typeof name !== 'undefined') updateData.name = name;
    if (typeof city !== 'undefined') updateData.city = city;
    if (typeof address !== 'undefined') updateData.address = address;
    if (typeof phoneNumber !== 'undefined') updateData.phoneNumber = phoneNumber;

    // Manager can be an ObjectId, null (to unset), or omitted.
    if (typeof manager !== 'undefined') {
        // Treat empty string as explicit unset
        if (manager === '' || manager === null) {
            updateData.manager = null;
        } else {
            updateData.manager = manager;
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
        return res.status(400).json({ success: false, message: 'No valid fields provided for update' });
    }

    const updatedBranch = await Hotel.findByIdAndUpdate(branchId, updateData, { new: true });
    if(!updatedBranch){
        return res.status(404).json({ success: false, error: "Hotel branch not found" });
    }

    return res.status(200).json({
        success: true,
        message: "Hotel branch updated successfully",
        data: updatedBranch
    });

    }catch(error){
        console.error("Error in updateBranch:", error.message);
        return res.status(500).json({ success: false, error: "Internal server error" });
    }
}

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
        const user = req.user;
        if (!user || user.role !== "superadmin") {
          return res
            .status(403)
            .json({ success: false, error: "Forbidden — Super Admin access required" });
        }
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


export const deleteBranch = async (req, res) => {
    try{
        // Ensure user is authenticated and attached to req.user
        const user = req.user;
        if (!user || user.role !== "superadmin") {
          return res
            .status(403)
            .json({ success: false, error: "Forbidden — Super Admin access required" });
        }
        const branchId = req.params.id;
        const deletedBranch = await Hotel.findByIdAndDelete(branchId);
        if(!deletedBranch){
            return res.status(404).json({ success: false, error: "Hotel branch not found" });
        }
        return res.status(200).json({
            success: true,
            message: "Hotel branch deleted successfully"
        });
    }catch(error){
        console.error("Error in deleteBranch:", error.message);
        return res.status(500).json({ success: false, error: "Internal server error" });
    }
}

