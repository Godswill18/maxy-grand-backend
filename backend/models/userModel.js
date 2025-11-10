import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    firstName:{
        type: String,
        required: true,
    },
    lastName:{
        type: String,
        required: true,
    },
    email:{
        type: String,
        required: true,
        unique: true
    },
    phoneNumber:{
        type: String,
        required: true,
        unique: true,
    },
    password:{
        type: String,
        required: true,
    },
    role: {
        type: String,
        required: true,
        enum: ['guest', 'receptionist', 'cleaner', 'waiter','admin', 'superadmin'],
        default: 'guest',
    },
    hotelId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hotel',
        default: null,

    },
    isActive: {
        type: Boolean,
        default: false
    }
}, {timestamps: true});

// Ensure isActive is true for guest and superadmin roles.
// If role is changed or on new documents, enforce the rule.
userSchema.pre('save', function (next) {
    try {
        // Only run on new documents or when role has changed
        if (!this.isNew && !this.isModified('role')) return next();

        if (this.role === 'guest' || this.role === 'superadmin') {
            this.isActive = true;
        }

        return next();
    } catch (err) {
        return next(err);
    }
});

const User = mongoose.model('User', userSchema);

export default User;