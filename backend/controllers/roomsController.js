import RoomType from "../models/roomTypeModel.js";
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

    const { hotelId, name, description, amenities, price, capacity, isAvailable } = req.body;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "At least one image is required" });
    }

    const images = req.files.map(file => file.path);

    const newRoomType = new RoomType({
      hotelId,
      name,
      description,
      amenities,
      price,
      capacity,
      images,
      isAvailable,
    });

    const savedRoomType = await newRoomType.save();

    return res.status(201).json({
      success: true,
      message: "Room type created successfully",
      data: savedRoomType,
    });
  } catch (error) {
    console.error("Error in createRoomType:", error.message);
           if (req.file?.path) {
              try {
                if (fs.existsSync(req.file.path)) {
                  fs.unlinkSync(req.file.path);
                }
              } catch (fileError) {
                console.error("Error deleting uploaded file:", fileError);
              }
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
    const { hotelId, name, description, amenities, price, capacity, isAvailable } = req.body;

    const room = await RoomType.findById(roomId);
    if (!room) {
      return res.status(404).json({ success: false, error: "Room not found" });
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
    room.description = description;
    room.amenities = amenities;
    room.price = price;
    room.capacity = capacity;
    room.isAvailable = isAvailable;

    const updatedRoom = await room.save();

    return res.status(200).json({
      success: true,
      message: "Room updated successfully",
      data: updatedRoom,
    });
  } catch (error) {
    console.error("Error in updateRoomType:", error.message);
           if (req.file?.path) {
              try {
                if (fs.existsSync(req.file.path)) {
                  fs.unlinkSync(req.file.path);
                }
              } catch (fileError) {
                console.error("Error deleting uploaded file:", fileError);
              }
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

    const roomId = req.params.id;
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

    await RoomType.findByIdAndDelete(roomId);

    return res.status(200).json({
      success: true,
      message: "Room and associated images deleted successfully",
    });
  } catch (error) {
    console.error("Error in deleteRoomType:", error.message);
     if (req.file?.path) {
              try {
                if (fs.existsSync(req.file.path)) {
                  fs.unlinkSync(req.file.path);
                }
              } catch (fileError) {
                console.error("Error deleting uploaded file:", fileError);
              }
            }
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

