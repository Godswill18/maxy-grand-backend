import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
    firstName: {
        type: String,
        required: true,
    },
    lastName: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
    },
    password: {
        type: String,
        required: true,
    },
    phoneNumber: {
        type: String,
    },
    role: {
        type: String,
        enum: ['superadmin', 'admin', 'receptionist', 'cleaner', 'waiter', 'headWaiter', 'guest'],
        default: 'guest',
    },
    hotelId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hotel',
        // NOT required globally - we'll validate conditionally
    },
    isActive: {
        type: Boolean,
        default: true,
    },
}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

// IMPORTANT: Conditional validation for hotelId
userSchema.pre('save', function(next) {
    // Only admin role REQUIRES hotelId
    if (this.role === 'admin' && (!this.hotelId || this.hotelId === '')) {
        return next(new Error('Admin users must have a hotelId'));
    }
    
    // Ensure superadmin and guest don't have hotelId
    if (this.role === 'superadmin' || this.role === 'guest') {
        this.hotelId = undefined;
    }
    
    // Staff roles should have hotelId but we won't enforce it here
    // (can be set later)
    
    next();
});

// Always keep superadmin and guests active
userSchema.pre('save', function(next) {
    if (this.role === 'superadmin' || this.role === 'guest') {
        this.isActive = true;
    }
    next();
});

const User = mongoose.model('User', userSchema);

export default User;





// import mongoose from 'mongoose';

// const userSchema = new mongoose.Schema({
//     firstName:{
//         type: String,
//         required: true,
//     },
//     lastName:{
//         type: String,
//         required: true,
//     },
//     email:{
//         type: String,
//         required: true,
//         unique: true
//     },
//     phoneNumber:{
//         type: String,
//         required: true,
//         unique: true,
//     },
//     password:{
//         type: String,
//         required: true,
//     },
//     role: {
//         type: String,
//         required: true,
//         enum: ['guest', 'receptionist', 'cleaner', 'waiter', 'headWaiter','admin', 'superadmin'],
//         default: 'guest',
//     },
//     hotelId: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'Hotel',
//         default: '',

//     },
//     isActive: {
//         type: Boolean,
//         default: false
//     }
// }, {timestamps: true});

// // Ensure isActive is true for guest and superadmin roles.
// // If role is changed or on new documents, enforce the rule.
// userSchema.pre('save', function (next) {
//     try {
//         // Only run on new documents or when role has changed
//         if (!this.isNew && !this.isModified('role')) return next();

//         if (this.role === 'guest' || this.role === 'superadmin') {
//             this.isActive = true;
//         }

//         return next();
//     } catch (err) {
//         return next(err);
//     }
// });

// const User = mongoose.model('User', userSchema);

// export default User;