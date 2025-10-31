import mongoose from 'mongoose';

const invoiceSchema = new mongoose.Schema({
    hotelId:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hotel',
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

const Invoice = mongoose.model('Invoice', invoiceSchema);

export default Invoice;