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
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// 🔄 UPDATE Menu Item
export const updateMenuItem = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const item = await MenuItem.findById(id);
    if (!item) {
      return res.status(404).json({ success: false, error: "Menu item not found" });
    }

    // Handle image updates (same as your updateRoom)
    if (req.files && req.files.length > 0) {
      // Delete old images
      if (item.images && item.images.length > 0) {
        item.images.forEach((imgPath) => {
          try {
            const fullPath = path.resolve(imgPath);
            if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
          } catch (err) {
            console.error(`Failed to delete old image: ${imgPath}`, err.message);
          }
        });
      }
      // Add new images
      updates.images = req.files.map(file => file.path);
    }
    
    const updatedItem = await MenuItem.findByIdAndUpdate(id, updates, { new: true });
    
    return res.status(200).json({
      success: true,
      message: "Menu item updated successfully",
      data: updatedItem,
    });
  } catch (error) {
    console.error("Error in updateMenuItem:", error.message);
    // ... (add file cleanup logic on error)
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
    const { category } = req.query; // e.g., /api/menu?category=bar
    const filter = { isAvailable: true };
    if (category) {
      filter.category = category;
    }
    
    const items = await MenuItem.find(filter).sort({ name: 1 });
    return res.status(200).json({ success: true, data: items });
  } catch (error) {
    console.error("Error in getAvailableMenu:", error.message);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// 🧑‍💼 GET All Menu Items (for Staff)
export const getAllMenuItems = async (req, res) => {
  try {
    const items = await MenuItem.find().sort({ category: 1, name: 1 });
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