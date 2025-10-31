import mongoose from 'mongoose';

const hotelSchema = new mongoose.Schema({
    name:{
        type: String,
        required: true,
    },
    city:{
        type: String,
        required: true,
    },
    address:{
        type: String,
        required: true,
        unique: true,
    },
    phoneNumber:{
        type: String,
        required: true,
    },
    isActive: {
        type: Boolean,
        default: false
    }
}, {timestamps: true});

const Hotel = mongoose.model('Hotel', hotelSchema);

export default Hotel;