import mongoose from 'mongoose';

const roomSchema = new mongoose.Schema({
  hotelId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hotel',
    required: true,
  },
  roomTypeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RoomType',
    required: true,
  },
  roomNumber: {
    type: String,
    required: true,
  },
    status: {
      type: String,
      enum: ['available', 'occupied', 'cleaning', 'maintenance', 'out-of-service'],
      default: 'available',
    },
    floor: {
      type: Number,
    },
    lastCleaned: {
      type: Date,
    },
    currentGuest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
 currentBookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    default: null,
  }
}, { timestamps: true });

// Compound index for efficient queries
roomSchema.index({ hotelId: 1, roomNumber: 1 }, { unique: true });

const Room = mongoose.model('Room', roomSchema);
export default Room;


// import mongoose from 'mongoose';

// const roomSchema = new mongoose.Schema({
//     hotelId:{
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'Hotel',
//         required: true,
//     },
//     roomTypeId:{
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'RoomType',
//         required: true,
//     },
//     roomNumber:{
//         type: String,
//         required: true,
//     },
//     status:{
//         type: String,
//         required: true,
//         enum: ['available', 'occupied', 'maintenance', 'cleaning'],
//         default: 'available',
//     }
  
// }, {timestamps: true});

// const Room = mongoose.model('Room', roomSchema);

// export default Room;