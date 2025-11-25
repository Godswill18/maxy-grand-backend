import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
  hotelId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hotel',
    required: true,
  },
  guestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  customerName: {
    type: String,
    trim: true,
  },
  orderType: {
    type: String,
    enum: ['room service', 'pickup', 'table service'],
    required: true,
  },
  roomNumber: {
    type: String,
    default: null,
  },
  tableNumber: {
    type: String,
    default: null,
  },
  waiterId: { // New field
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
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

orderSchema.pre('save', function(next) {
  if (this.guestId) {
    return next();
  }
  if (this.orderType === 'room service' && !this.roomNumber) {
    return next(new Error('Room number is required for anonymous room service orders.'));
  }
  if (this.orderType === 'table service' && !this.tableNumber) {
    return next(new Error('Table number is required for table service orders.'));
  }
  if (this.orderType === 'pickup' && !this.customerName) {
    return next(new Error('Customer name is required for pickup orders.'));
  }
  if (!this.roomNumber && !this.tableNumber && !this.customerName) {
     return next(new Error('Order must have a Guest, Room Number, Table Number, or Customer Name.'));
  }
  next();
});

const Order = mongoose.model('Order', orderSchema);
export default Order;