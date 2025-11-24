// models/orderModel.js
import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
  hotelId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hotel',
    required: true,
  },

  // --- Flexible Guest Identification ---
  guestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null, // <-- NOW OPTIONAL
  },
  // Used if guestId is null (e.g., walk-in pickup)
  customerName: {
    type: String,
    trim: true,
  },
  
  // --- Order Location / Type ---
  orderType: {
    type: String,
    enum: ['room service', 'pickup', 'table service'],
    required: true,
  },
  // Required if orderType is 'room service'
  roomNumber: {
    type: String,
    default: null,
  },
  // Required if orderType is 'table service'
  tableNumber: {
    type: String,
    default: null,
  },

  // --- Order Details ---
  items: [
    {
      menuItemId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MenuItem',
      },
      name: String,
      quantity: {
        type: Number,
        required: true,
        min: 1,
      },
      price: Number, 
    }
  ],
  
  totalAmount: {
    type: Number,
    required: true,
  },

  // --- Progress & Payment Status ---
  orderStatus: {
    type: String,
    enum: ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'],
    default: 'pending',
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'billed-to-room'],
    default: 'pending',
  },
  specialInstructions: {
    type: String,
  },
}, { timestamps: true });

// --- VALIDATION HOOK ---
// This ensures every order is identifiable
orderSchema.pre('save', function(next) {
  // If we have a logged-in user, we are good.
  if (this.guestId) {
    return next();
  }

  // If anonymous, check based on order type
  if (this.orderType === 'room service' && !this.roomNumber) {
    return next(new Error('Room number is required for anonymous room service orders.'));
  }
  if (this.orderType === 'table service' && !this.tableNumber) {
    return next(new Error('Table number is required for table service orders.'));
  }
  if (this.orderType === 'pickup' && !this.customerName) {
    return next(new Error('Customer name is required for pickup orders.'));
  }

  // If none of the above, it's an invalid anonymous order
  if (!this.roomNumber && !this.tableNumber && !this.customerName) {
     return next(new Error('Order must have a Guest, Room Number, Table Number, or Customer Name.'));
  }

  next();
});


const Order = mongoose.model('Order', orderSchema);
export default Order;