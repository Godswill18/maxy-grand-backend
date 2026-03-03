import mongoose from 'mongoose';

const roomCategorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true,
    },
    slug: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
    },
    description: {
        type: String,
        default: '',
    },
    isActive: {
        type: Boolean,
        default: true,
    },
}, { timestamps: true });

roomCategorySchema.index({ slug: 1 });

const RoomCategory = mongoose.model('RoomCategory', roomCategorySchema);

export default RoomCategory;
