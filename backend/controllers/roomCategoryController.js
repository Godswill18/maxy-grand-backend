import RoomCategory from '../models/roomCategoryModel.js';
import RoomType from '../models/roomTypeModel.js';

const generateSlug = (name) =>
    name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

// @desc  Get all active categories (public)
// @route GET /api/room-categories
export const getAllCategories = async (req, res) => {
    try {
        const categories = await RoomCategory.find({ isActive: true }).sort({ name: 1 });
        return res.status(200).json({ success: true, data: categories });
    } catch (error) {
        console.error('Error in getAllCategories:', error.message);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
};

// @desc  Get all categories with room counts (admin)
// @route GET /api/room-categories/admin
export const getAllCategoriesAdmin = async (req, res) => {
    try {
        const categories = await RoomCategory.find().sort({ name: 1 });

        const categoriesWithCount = await Promise.all(
            categories.map(async (cat) => {
                const roomCount = await RoomType.countDocuments({ categoryId: cat._id });
                return { ...cat.toObject(), roomCount };
            })
        );

        return res.status(200).json({ success: true, data: categoriesWithCount });
    } catch (error) {
        console.error('Error in getAllCategoriesAdmin:', error.message);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
};

// @desc  Create a new category
// @route POST /api/room-categories
export const createCategory = async (req, res) => {
    try {
        const { name, description } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, error: 'Category name is required' });
        }

        const slug = generateSlug(name);

        const exists = await RoomCategory.findOne({ $or: [{ name: name.trim() }, { slug }] });
        if (exists) {
            return res.status(409).json({ success: false, error: 'A category with this name already exists' });
        }

        const category = new RoomCategory({ name: name.trim(), slug, description: description || '' });
        await category.save();

        return res.status(201).json({ success: true, message: 'Category created successfully', data: category });
    } catch (error) {
        console.error('Error in createCategory:', error.message);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
};

// @desc  Update a category
// @route PUT /api/room-categories/:id
export const updateCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, isActive } = req.body;

        const category = await RoomCategory.findById(id);
        if (!category) {
            return res.status(404).json({ success: false, error: 'Category not found' });
        }

        if (name && name.trim() !== category.name) {
            const slug = generateSlug(name);
            const exists = await RoomCategory.findOne({
                $or: [{ name: name.trim() }, { slug }],
                _id: { $ne: id },
            });
            if (exists) {
                return res.status(409).json({ success: false, error: 'A category with this name already exists' });
            }
            category.name = name.trim();
            category.slug = slug;
        }

        if (description !== undefined) category.description = description;
        if (typeof isActive === 'boolean') category.isActive = isActive;

        await category.save();
        return res.status(200).json({ success: true, message: 'Category updated successfully', data: category });
    } catch (error) {
        console.error('Error in updateCategory:', error.message);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
};

// @desc  Delete a category (superadmin only)
//        Optionally reassign rooms to another category via req.body.reassignTo
// @route DELETE /api/room-categories/:id
export const deleteCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { reassignTo } = req.body;

        const category = await RoomCategory.findById(id);
        if (!category) {
            return res.status(404).json({ success: false, error: 'Category not found' });
        }

        const roomCount = await RoomType.countDocuments({ categoryId: id });

        if (roomCount > 0 && reassignTo) {
            const target = await RoomCategory.findById(reassignTo);
            if (!target) {
                return res.status(404).json({ success: false, error: 'Target category for reassignment not found' });
            }
            await RoomType.updateMany({ categoryId: id }, { categoryId: reassignTo });
        } else if (roomCount > 0) {
            // No reassignment target provided — unset category on affected rooms
            await RoomType.updateMany({ categoryId: id }, { $unset: { categoryId: '' } });
        }

        await RoomCategory.findByIdAndDelete(id);

        return res.status(200).json({
            success: true,
            message: `Category deleted. ${roomCount} room(s) updated.`,
        });
    } catch (error) {
        console.error('Error in deleteCategory:', error.message);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
};
