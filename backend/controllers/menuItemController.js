import MenuItem from '../models/menuItemModel.js';
import fs from 'fs';
import path from 'path';

// Middleware placeholder (you would create this)
// This checks if a user is 'staff', 'admin', or 'superadmin'
/*
export const isStaffOrAdmin = (req, res, next) => {
  if (!req.user || (req.user.role !== 'staff' && req.user.role !== 'admin' && req.user.role !== 'superadmin')) {
    return res.status(403).json({ success: false, error: 'Forbidden: Staff or Admin access required' });
  }
  next();
};
*/

// 🍔 CREATE Menu Item
export const createMenuItem = async (req, res) => {
  try {
    const { hotelId, name, description, price, category, isAvailable, estimatedPrepTime, tags } = req.body;

    if (!req.files || req.files.length === 0) {
      // Images might be optional for menu items, adjust as needed
      // return res.status(400).json({ message: "At least one image is required" });
    }

    const images = req.files ? req.files.map(file => file.path) : [];

    const newMenuItem = new MenuItem({
      hotelId,
      name,
      description,
      price,
      category,
      isAvailable,
      estimatedPrepTime,
      tags,
      images,
      isAvailable,
    });

    const savedMenuItem = await newMenuItem.save();
    return res.status(201).json({
      success: true,
      message: "Menu item created successfully",
      data: savedMenuItem,
    });
  } catch (error) {
    console.error("Error in createMenuItem:", error.message);
    // ... (add file cleanup logic on error like in your roomsController)
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

// 🔄 UPDATE Menu Item (Text-Only)
export const updateMenuItem = async (req, res) => {
  try {
    const { id } = req.params;
    
    // 'updates' will only contain text fields like name, price, etc.
    // 'images' or 'files' are NOT handled here.
    const updates = req.body; 

    // We can safely remove the old image logic
    const updatedItem = await MenuItem.findByIdAndUpdate(id, updates, { new: true });

    if (!updatedItem) {
      return res.status(404).json({ success: false, error: "Menu item not found" });
    }
    
    return res.status(200).json({
      success: true,
      message: "Menu item updated successfully",
      data: updatedItem,
    });
  } catch (error) {
    console.error("Error in updateMenuItem:", error.message);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ➕ ADD New Images to a Menu Item
export const addMenuItemImages = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: "No image files were uploaded" });
    }

    const item = await MenuItem.findById(id);
    if (!item) {
      return res.status(404).json({ success: false, error: "Menu item not found" });
    }

    // Get the paths of the new files
    const newImagePaths = req.files.map(file => file.path);

    // Add the new image paths to the existing array
    item.images.push(...newImagePaths);
    
    const updatedItem = await item.save();

    return res.status(200).json({
      success: true,
      message: "Images added successfully",
      data: updatedItem,
    });

  } catch (error) {
    console.error("Error in addMenuItemImages:", error.message);
    
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


// 🗑️ DELETE a Specific Image from a Menu Item
export const deleteMenuItemImage = async (req, res) => {
  try {
    const { id } = req.params;
    
    // The frontend must send the path of the image to delete
    const { imagePath } = req.body;

    if (!imagePath) {
      return res.status(400).json({ success: false, error: "Image path is required in the body" });
    }

    const item = await MenuItem.findById(id);
    if (!item) {
      return res.status(404).json({ success: false, error: "Menu item not found" });
    }

    // Check if the image path actually exists in the item's array
    if (!item.images.includes(imagePath)) {
        return res.status(404).json({ success: false, error: "Image not found for this item" });
    }

    // Filter the array to remove the specified image path
    item.images = item.images.filter(img => img !== imagePath);

    const updatedItem = await item.save();

    // After successfully saving to DB, delete the file from the server
    try {
      const fullPath = path.resolve(imagePath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    } catch (err) {
      console.error(`Failed to delete old image: ${imagePath}`, err.message);
      // Don't fail the whole request, just log the error
    }

    return res.status(200).json({
      success: true,
      message: "Image deleted successfully",
      data: updatedItem,
    });

  } catch (error) {
    console.error("Error in deleteMenuItemImage:", error.message);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};



// ❌ DELETE Menu Item
export const deleteMenuItem = async (req, res) => {
  try {
    const { id } = req.params;
    const item = await MenuItem.findById(id);
    if (!item) {
      return res.status(404).json({ success: false, error: "Menu item not found" });
    }

    // Delete images
    if (item.images && item.images.length > 0) {
      item.images.forEach((imgPath) => {
        try {
          const fullPath = path.resolve(imgPath);
          if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
        } catch (err) {
          console.error(`Error deleting image ${imgPath}:`, err.message);
        }
      });
    }

    await MenuItem.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: "Menu item deleted successfully",
    });
  } catch (error) {
    console.error("Error in deleteMenuItem:", error.message);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// --- Guest-Facing Controllers ---

// 📖 GET Available Menu
export const getAvailableMenu = async (req, res) => {
  try {
    const { category, location } = req.query; // ✅ Accept location query param
    
    const filter = { isAvailable: true };
    
    // Filter by category if provided
    if (category) {
      filter.category = category;
    }
    
    // ✅ Fetch items and populate hotel data
    let items = await MenuItem.find(filter)
      .populate('hotelId', 'name location') // ✅ Populate hotel with name and location
      .sort({ name: 1 });
    
    // ✅ Filter by location if provided (after population)
    if (location && location !== 'all') {
      items = items.filter(item => 
        item.hotelId && item.hotelId.location === location
      );
    }
    
    return res.status(200).json({ success: true, data: items });
  } catch (error) {
    console.error("Error in getAvailableMenu:", error.message);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// 🧑‍💼 GET All Menu Items (for Staff)
export const getAllMenuItems = async (req, res) => {
  try {
    const items = await MenuItem.find()
      .populate('hotelId', 'name location') // ✅ Populate hotel data
      .sort({ category: 1, name: 1 });
    
    return res.status(200).json({ success: true, data: items });
  } catch (error) {
    console.error("Error in getAllMenuItems:", error.message);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// 🔎 GET Single Menu Item
export const getMenuItemById = async (req, res) => {
  try {
    const item = await MenuItem.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, error: "Menu item not found" });
    }
    return res.status(200).json({ success: true, data: item });
  } catch (error) {
    console.error("Error in getMenuItemById:", error.message);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};