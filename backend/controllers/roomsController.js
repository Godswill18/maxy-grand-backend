import RoomType from "../models/roomTypeModel.js";
import Room from "../models/roomModel.js"; // <-- 1. IMPORT THE ROOM MODEL
import fs from "fs";
import path from "path";

export const createRoom = async (req, res) => {
  try {
    const user = req.user;
    if (!user || (user.role !== "superadmin" && user.role !== "admin")) {
      return res.status(403).json({
        success: false,
        error: "Forbidden — Super Admin or Admin access required",
      });
    }

    // --- MODIFICATION: Added 'roomNumber' ---
    const { hotelId, name, roomNumber, description, amenities, price, capacity, isAvailable } = req.body;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "At least one image is required" });
    }
    
    // --- ADDED CHECK ---
    if ( !hotelId || !name || !roomNumber || !description || !amenities || !price || !capacity ) {
        if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        try {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (fileError) {
          console.error("Error deleting uploaded file:", fileError);
        }
      });
    }
        return res.status(400).json({ message: "Room number is required" });

    }

    const images = req.files.map(file => file.path);


    const newRoomType = new RoomType({
      hotelId,
      name,
      roomNumber, // <-- Added 'roomNumber' here
      description,
      amenities,
      price,
      capacity,
      images,
      isAvailable,
    });

    const savedRoomType = await newRoomType.save();

    // --- 2. START: NEW LOGIC TO CREATE CORRESPONDING ROOM ---
    try {
      const newRoom = new Room({
        hotelId: savedRoomType.hotelId,
        roomTypeId: savedRoomType._id, // Link to the RoomType
        roomNumber: savedRoomType.roomNumber,
        status: 'available', // Default status
      });
      await newRoom.save();
    } catch (roomError) {
      // If creating the 'Room' fails, roll back the 'RoomType'
      console.error("Error creating associated Room:", roomError.message);
      await RoomType.findByIdAndDelete(savedRoomType._id);
      
      // Delete the uploaded images
      images.forEach((imgPath) => {
         try {
           const fullPath = path.resolve(imgPath);
           if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
         } catch (err) {
           console.error(`Failed to delete orphan image: ${imgPath}`, err.message);
         }
      });
      
      return res.status(500).json({ success: false, error: "Failed to create room status. Room creation rolled back." });
    }
    // --- END: NEW LOGIC ---

    return res.status(201).json({
      success: true,
      message: "Room type and corresponding room status created successfully", // <-- Updated message
      data: savedRoomType,
    });

  } catch (error) {
    console.error("Error in createRoomType:", error.message);
    
    // --- MODIFICATION: Correctly delete multiple files on error ---
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        try {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (fileError) {
          console.error("Error deleting uploaded file:", fileError);
        }
      });
    }
    
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};


export const updateRoom = async (req, res) => {
   try {
    const user = req.user;
    if (!user || (user.role !== "superadmin" && user.role !== "admin")) {
      return res.status(403).json({
        success: false,
        error: "Forbidden — Super Admin or Admin access required",
      });
    }

    const roomId = req.params.id;
    
    // --- MODIFICATION: Added 'roomNumber' ---
    const { hotelId, name, roomNumber, description, amenities, price, capacity, isAvailable } = req.body;

    const room = await RoomType.findById(roomId);
    if (!room) {
      return res.status(404).json({ success: false, error: "Room not found" });
    }

    if( !hotelId || !name || !roomNumber || !description || !amenities || !price || !capacity ) {

        if (req.files && req.files.length > 0) {
            req.files.forEach(file => {
            try {
            if (fs.existsSync(file.path)) {
                fs.unlinkSync(file.path);
            }
            } catch (fileError) {
            console.error("Error deleting uploaded file:", fileError);
            }
        });
        }

        return res.status(400).json({ message: "All fields are required" });
    }

    // If new images are uploaded, delete the old ones first
    if (req.files && req.files.length > 0) {
      if (room.images && room.images.length > 0) {
        room.images.forEach((imgPath) => {
          try {
            const fullPath = path.resolve(imgPath);
            if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
          } catch (err) {
            console.error(`Failed to delete old image: ${imgPath}`, err.message);
          }
        });
      }
      // Replace with new images
      room.images = req.files.map(file => file.path);
    }

    // Update the rest of the fields
    room.hotelId = hotelId;
    room.name = name;
    room.roomNumber = roomNumber; // <-- Added 'roomNumber' here
    room.description = description;
    room.amenities = amenities;
    room.price = price;
    room.capacity = capacity;
    room.isAvailable = isAvailable;

    const updatedRoom = await room.save();

    // --- 3. START: NEW LOGIC TO SYNC ROOM NUMBER ---
    try {
        await Room.findOneAndUpdate(
            { roomTypeId: updatedRoom._id }, 
            { roomNumber: updatedRoom.roomNumber }
        );
    } catch (syncError) {
        console.error("Error syncing room number to Room model:", syncError.message);
        // This is not a fatal error, so we just log it
    }
    // --- END: NEW LOGIC ---

    return res.status(200).json({
      success: true,
      message: "Room updated successfully",
      data: updatedRoom,
    });
   } catch (error) {
     console.error("Error in updateRoomType:", error.message);
        // --- MODIFICATION: Correctly delete multiple files on error ---
        if (req.files && req.files.length > 0) {
          req.files.forEach(file => {
            try {
              if (fs.existsSync(file.path)) {
                fs.unlinkSync(file.path);
              }
            } catch (fileError) {
              console.error("Error deleting uploaded file:", fileError);
            }
          });
        }
     return res.status(500).json({ success: false, error: "Internal server error" });
   }
};



export const deleteRoom = async (req, res) => {
   try {
    const user = req.user;
    if (!user || (user.role !== "superadmin" && user.role !== "admin")) {
      return res.status(403).json({
        success: false,
        error: "Forbidden — Super Admin or Admin access required",
      });
    }

    const roomId = req.params.id; // This is the RoomType ID
    const room = await RoomType.findById(roomId);
    if (!room) {
      return res.status(404).json({ success: false, error: "Room not found" });
    }

    // Delete all images associated with this room
    if (room.images && room.images.length > 0) {
      room.images.forEach((imgPath) => {
        try {
          const fullPath = path.resolve(imgPath);
          if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
        } catch (err) {
          console.error(`Error deleting image ${imgPath}:`, err.message);
        }
      });
    }
    
    // --- 4. START: NEW LOGIC TO DELETE ASSOCIATED ROOM ---
    try {
        await Room.findOneAndDelete({ roomTypeId: roomId });
    } catch (deleteError) {
        console.error("Error deleting associated Room:", deleteError.message);
        // Log the error but proceed with deleting the RoomType
    }
    // --- END: NEW LOGIC ---

    await RoomType.findByIdAndDelete(roomId);

    return res.status(200).json({
      success: true,
      message: "Room type, associated status, and images deleted successfully",
    });
   } catch (error) {
     console.error("Error in deleteRoomType:", error.message);
       // This error handling for req.file seems wrong for 'delete'
       // It should be fine to just return the 500 error
     return res.status(500).json({ success: false, error: "Internal server error" });
   }
};


export const getAllRooms = async (req, res) => {
    try{
        const rooms = await RoomType.find();
        return res.status(200).json({
            success: true,
            data: rooms
        });
    }catch(error){
        console.error("Error in getAllRooms:", error.message);
        return res.status(500).json({ success: false, error: "Internal server error" });
    }
}

export const getRoomById = async (req, res) => {
    try{
        const roomId = req.params.id;
        const room = await RoomType.findById(roomId);
        if(!room){
            return res.status(404).json({ success: false, error: "Room type not found" });
        }
        return res.status(200).json({
            success: true,
            data: room
        });
    }catch(error){
        console.error("Error in getRoomById:", error.message);
        return res.status(500).json({ success: false, error: "Internal server error" });
    }
}