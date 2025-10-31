import mongoose, { Schema } from 'mongoose';

const bookingSchema = new mongoose.Schema({
    hotelId:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hotel',
        required: true,
    },
    userId:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    roomId:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'RoomType',
        required: false,
    },
    checkIn:{
        type: Date,
        required: true,
    },
    checkOut: {
        type: Date,
        required: true
    },
    totalPrice: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'cancelled', 'completed'],
        default: 'pending',
        required: true
    },
    paymentId: {
        type: Schema.Types.ObjectId,
        ref: 'Payment',
        
    }
}, {timestamps: true});

const Booking = mongoose.model('Booking', bookingSchema);

export default Booking;