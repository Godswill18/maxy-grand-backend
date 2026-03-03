import mongoose from 'mongoose';

const passwordResetSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        tokenHash: {
            type: String,
            required: true,
        },
        expiresAt: {
            type: Date,
            required: true,
        },
        used: {
            type: Boolean,
            default: false,
        },
    },
    { timestamps: true }
);

// Index for fast token lookups
passwordResetSchema.index({ tokenHash: 1 });

// TTL index — MongoDB automatically removes documents after expiresAt
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const PasswordReset = mongoose.model('PasswordReset', passwordResetSchema);

export default PasswordReset;
