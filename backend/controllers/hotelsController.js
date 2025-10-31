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

    const { name, city, address, phoneNumber, isActive } = req.body;

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
    const user = req.user;

    if (!user || user.role !== "superadmin") {
      return res
        .status(403)
        .json({ success: false, error: "Forbidden — Super Admin access required" });
    }

    const branchId = req.params.id;
    const { name, city, address, phoneNumber, isActive } = req.body;

    const updatedBranch = await Hotel.findByIdAndUpdate(
        branchId,
        { name, city, address, phoneNumber, isActive },
        { new: true }
    );
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

