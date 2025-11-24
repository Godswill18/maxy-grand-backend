import mongoose from 'mongoose';

const requestSchema = new mongoose.Schema({
    hotelId:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hotel',
        required: true,
    },
    title:{
        type: String,
        required: true,
    },
    raisedBy:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    approvedBy:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        
    },
    amount:{
        type: Number,
        required: true,
    },
    description: {
        type: String,
        required: true
    },
    status:{
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
    required: true,
    },
    images: {
        type: [String],
        required: true
    },

}, {timestamps: true});

const Request = mongoose.model('Request', requestSchema);

export default Request;