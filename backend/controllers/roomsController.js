import RoomType from "../models/roomTypeModel.js";
import Room from "../models/roomModel.js"; 
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
        return res.status(400).json({ message: "All fields are is required" });

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

export const getRoomsByHotel = async (req, res) => {
  try {
    const { hotelId } = req.params;

    const rooms = await RoomType.find({ hotelId })

    res.json({ success: true, rooms });
  } catch (error) {
    console.error("Error fetching rooms by hotel:", error);
    res.status(500).json({
      success: false,
      error: "Server error fetching rooms",
    });
  }
};

export const getRoomTypesByHotel = async (req, res) => {
  try {
    const { hotelId } = req.params;
    const roomTypes = await Room.find({ hotelId })
      .populate('roomTypeId' , 'name description amenities price capacity images isAvailable')
      .populate({
        path: 'currentBookingId',
        select: 'guestName checkOutDate' // Assume Booking has these fields
      })
      .sort({ createdAt: -1 }); // Optional: sort by creation date
    
    // Map to add guestName and checkOut directly
    const mappedRooms = roomTypes.map(room => ({
      ...room.toObject(),
      guestName: room.currentBookingId?.guestName || null,
      checkOut: room.currentBookingId?.checkOutDate || null
    }));

    res.json({
      success: true,
      data: mappedRooms
    });
    // console.log("Fetched room types:", roomTypes);
  } catch (error) {
    console.error("Error fetching room types by hotel:", error);
    res.status(500).json({
      success: false,
      error: "Server error fetching room types",
    });
  }
};


// export const updateRoom = async (req, res) => {
//   try {
//     const roomId = req.params.id;

//     const { hotelId, name, roomNumber, description, amenities, price, capacity, isAvailable } = req.body;

//     // Parse the retained images (from frontend)
//     // e.g. frontend sends `existingImages` as JSON string array
//     let existingImages = [];
//     if (req.body.existingImages) {
//       try {
//         existingImages = JSON.parse(req.body.existingImages);
//       } catch (err) {
//         console.error("Invalid JSON in existingImages:", err.message);
//         existingImages = [];
//       }
//     }

//     const room = await RoomType.findById(roomId);
//     if (!room) {
//       return res.status(404).json({ success: false, error: "Room not found" });
//     }

//     // ✅ Validate mandatory fields
//     if (!hotelId || !name || !roomNumber || !description || !amenities || !price || !capacity) {
//       // delete uploaded files if validation fails
//       if (req.files && req.files.length > 0) {
//         req.files.forEach(file => {
//           if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
//         });
//       }
//       return res.status(400).json({ message: "All fields are required" });
//     }

//     // ✅ Handle images update
//     const oldImages = room.images || [];
//     const newUploads = req.files ? req.files.map(file => file.path) : [];

//     // Determine which images were removed
//     const removedImages = oldImages.filter(img => !existingImages.includes(img));

//     // Delete removed images from disk
//     removedImages.forEach(imgPath => {
//       try {
//         const fullPath = path.resolve(imgPath);
//         if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
//       } catch (err) {
//         console.error(`Error deleting file ${imgPath}:`, err.message);
//       }
//     });

//     // Combine retained images + new uploads
//     const finalImages = [...existingImages, ...newUploads];

//     // ✅ Update room fields
//     room.hotelId = hotelId;
//     room.name = name;
//     room.roomNumber = roomNumber;
//     room.description = description;
//     room.amenities = amenities;
//     room.price = price;
//     room.capacity = capacity;
//     room.isAvailable = isAvailable;
//     room.images = finalImages;

//     const updatedRoom = await room.save();

//     // ✅ Sync room number to Room model
//     try {
//       await Room.findOneAndUpdate(
//         { roomTypeId: updatedRoom._id },
//         { roomNumber: updatedRoom.roomNumber }
//       );
//     } catch (syncError) {
//       console.error("Error syncing room number:", syncError.message);
//     }

//     return res.status(200).json({
//       success: true,
//       message: "Room updated successfully",
//       data: updatedRoom,
//     });

//   } catch (error) {
//     console.error("Error in updateRoom:", error.message);
//     if (req.files && req.files.length > 0) {
//       req.files.forEach(file => {
//         if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
//       });
//     }
//     return res.status(500).json({ success: false, error: "Internal server error" });
//   }
// };


// 🔄 UPDATE Room (Text-Only)
export const updateRoom = async (req, res) => {
  try {
    const roomId = req.params.id;
    
    // 'updates' will only contain text fields from req.body
    // We no longer check for req.files here.
    const updates = req.body;

    // We can use findByIdAndUpdate for a cleaner text-only update
    const updatedRoom = await RoomType.findByIdAndUpdate(roomId, updates, {
      new: true, // Returns the modified document
      runValidators: true, // Ensures schema validation runs
    });

    if (!updatedRoom) {
      return res.status(404).json({ success: false, error: "Room not found" });
    }

    // --- Logic to SYNC ROOM NUMBER ---
    // This logic is important and should stay.
    if (updates.roomNumber) {
      try {
        await Room.findOneAndUpdate(
          { roomTypeId: updatedRoom._id },
          { roomNumber: updatedRoom.roomNumber }
        );
      } catch (syncError) {
        console.error("Error syncing room number to Room model:", syncError.message);
        // This is not a fatal error, so we just log it
      }
    }
    // --- END SYNC LOGIC ---

    return res.status(200).json({
      success: true,
      message: "Room details updated successfully",
      data: updatedRoom,
    });
  } catch (error) {
    console.error("Error in updateRoom:", error.message);
    // No need to delete files on error, as none were uploaded.
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ➕ ADD New Images to a Room
export const addRoomImages = async (req, res) => {
  try {
    const roomId = req.params.id;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: "No image files were uploaded" });
    }

    const room = await RoomType.findById(roomId);
    if (!room) {
      return res.status(404).json({ success: false, error: "Room not found" });
    }

    // Get the paths of the new files
    const newImagePaths = req.files.map(file => file.path);

    // Add the new image paths to the existing array
    room.images.push(...newImagePaths);
    
    const updatedRoom = await room.save();

    return res.status(200).json({
      success: true,
      message: "Images added successfully",
      data: updatedRoom,
    });
  } catch (error) {
    console.error("Error in addRoomImages:", error.message);
    
    // If saving fails, delete the files that just got uploaded
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        try {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (fileError) {
          console.error("Error deleting orphaned file:", fileError);
        }
      });
    }
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ➖ DELETE a Single Image from a Room
export const deleteRoomImage = async (req, res) => {
  try {
    const roomId = req.params.id;
    // Get the path of the image to delete from the request body
    const { imagePath } = req.body;

    if (!imagePath) {
      return res.status(400).json({ success: false, error: "Image path is required" });
    }

    const room = await RoomType.findById(roomId);
    if (!room) {
      return res.status(404).json({ success: false, error: "Room not found" });
}
    // Check if the image exists in the array
    if (!room.images.includes(imagePath)) {
      return res.status(404).json({ success: false, error: "Image not found in this room" });
    }

    // 1. Delete the physical file from the server
    try {
      const fullPath = path.resolve(imagePath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    } catch (fileError) {
      console.error("Error deleting file:", fileError.message);
      // We can still proceed to remove it from the DB
    }

    // 2. Remove the image path from the database array
    room.images = room.images.filter(img => img !== imagePath);
    
    const updatedRoom = await room.save();

    return res.status(200).json({
      success: true,
      message: "Image deleted successfully",
      data: updatedRoom,
    });
  } catch (error) {
    console.error("Error in deleteRoomImage:", error.message);
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