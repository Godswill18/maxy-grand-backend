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
    // ✅ KEEP: isActive - Manual account activation/deactivation (Staff Management)
    isActive: {
        type: Boolean,
        default: true,
    },
    // ✅ NEW: isShiftTime - Automatic shift time control (Shift System)
    isShiftTime: {
        type: Boolean,
        default: false,
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
    
    next();
});

// ✅ Always keep superadmin, admin, and guests with isShiftTime = true
// ✅ isActive is separate and controlled by staff management
userSchema.pre('save', function(next) {
    if (this.role === 'superadmin' || this.role === 'guest' || this.role === 'admin') {
        this.isShiftTime = true; // These roles don't need shift time restrictions
        this.isActive = true; // These roles are always active
    }
    next();
});

const User = mongoose.model('User', userSchema);

export default User;