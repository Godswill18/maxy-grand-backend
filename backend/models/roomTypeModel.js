import mongoose from 'mongoose';

const roomTypeSchema = new mongoose.Schema({
    hotelId:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hotel',
        required: true,
    },
    name:{
        type: String,
        required: true,
    },
    roomNumber:{
        type: String,
        required: true,
    },
    description:{
        type: String,
        required: false,
    },
    price:{
        type: Number,
        required: true,
    },
    capacity: {
        type: Number,
        required: true
    },
    amenities: {
        type: String,
        required: true
    },
    images: {
        type: [String],
        required: true
    },
    isAvailable: {
        type: Boolean,
        default: true
    }
}, {timestamps: true});

const RoomType = mongoose.model('RoomType', roomTypeSchema);

export default RoomType;