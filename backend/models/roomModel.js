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
    required: true,
    enum: ['available', 'reserved','occupied', 'maintenance', 'cleaning'],
    default: 'available',
  },
 currentBookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    default: null,
  }
}, { timestamps: true });

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