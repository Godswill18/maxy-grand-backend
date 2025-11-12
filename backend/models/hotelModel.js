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
    manager:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        // required: false,
        default: '',
    },
    roomCount:{
        type: Number,
        required: true,
        default: 0,
    },
    staffCount:{
        type: Number,
        required: true,
        default: 0,
    },
    isActive: {
        type: Boolean,
        default: false
    }
}, {timestamps: true});

const Hotel = mongoose.model('Hotel', hotelSchema);

export default Hotel;