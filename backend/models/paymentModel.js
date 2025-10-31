import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema({
    bookingId:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking',
        required: true,
    },
    amount:{
        type: Number,
        required: true,
    },
    status:{
        type: String,
        enum: ['pending', 'completed', 'failed'],
        default: 'pending',
        required: true,
    },
    gatewayRef:{
        type: String,
        // required: true,
    },
  
}, {timestamps: true});

const Payment = mongoose.model('Payment', paymentSchema);

export default Payment;