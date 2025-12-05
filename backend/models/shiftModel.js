import mongoose from 'mongoose';

const shiftSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    hotelId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hotel',
        required: true,
    },
    startDate: {
        type: Date,
        required: true,
    },
    startTime: {
        type: String, // Format: "HH:mm" e.g., "09:00"
        required: true,
    },
    endDate: {
        type: Date,
        required: true,
    },
    endTime: {
        type: String, // Format: "HH:mm" e.g., "17:00"
        required: true,
    },
    shiftType: {
        type: String,
        enum: ['morning', 'afternoon', 'evening', 'night', 'full-day', 'custom'],
        default: 'custom',
    },
    status: {
        type: String,
        enum: ['scheduled', 'in-progress', 'completed', 'cancelled'],
        default: 'scheduled',
    },
    notes: {
        type: String,
        default: '',
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    isActive: {
        type: Boolean,
        default: false, // True when shift is currently in progress
    },
    // ✅ NEW: Emergency activation
    emergencyActivated: {
        type: Boolean,
        default: false, // When true, bypasses time checks
    },
    emergencyActivatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    emergencyActivatedAt: {
        type: Date,
    },
}, { timestamps: true });

// Index for efficient queries
shiftSchema.index({ userId: 1, startDate: 1 });
shiftSchema.index({ hotelId: 1, startDate: 1 });
shiftSchema.index({ status: 1, isActive: 1 });
shiftSchema.index({ startDate: 1, endDate: 1 });
shiftSchema.index({ emergencyActivated: 1 });

// ✅ Helper to get Nigerian time (WAT = UTC+1)
shiftSchema.statics.getNigerianTime = function() {
    const now = new Date();
    // Convert to Nigerian time (UTC+1)
    const nigerianTime = new Date(now.getTime() + (1 * 60 * 60 * 1000));
    return nigerianTime;
};

// ✅ Method to check if shift is currently active (uses Nigerian time)
shiftSchema.methods.isCurrentlyActive = function() {
    // Get Nigerian time
    const now = this.constructor.getNigerianTime();
    
    // If emergency activated, consider it active
    if (this.emergencyActivated && this.status !== 'cancelled' && this.status !== 'completed') {
        return true;
    }
    
    // Parse start time in Nigerian timezone
    const [startHour, startMinute] = this.startTime.split(':').map(Number);
    const shiftStart = new Date(this.startDate);
    shiftStart.setHours(startHour, startMinute, 0, 0);
    
    // Parse end time in Nigerian timezone
    const [endHour, endMinute] = this.endTime.split(':').map(Number);
    const shiftEnd = new Date(this.endDate);
    shiftEnd.setHours(endHour, endMinute, 0, 0);
    
    // Check if current Nigerian time is within shift period
    return now >= shiftStart && now <= shiftEnd;
};

// ✅ Method to activate shift for emergency access
shiftSchema.methods.activateEmergency = async function(activatedBy) {
    this.emergencyActivated = true;
    this.emergencyActivatedBy = activatedBy;
    this.emergencyActivatedAt = this.constructor.getNigerianTime();
    this.isActive = true;
    this.status = 'in-progress';
    return await this.save();
};

// ✅ Method to deactivate emergency access
shiftSchema.methods.deactivateEmergency = async function() {
    this.emergencyActivated = false;
    // Check if should still be active based on time
    if (!this.isCurrentlyActive()) {
        this.isActive = false;
    }
    return await this.save();
};

// Validation: endDate must be >= startDate
shiftSchema.pre('save', function(next) {
    if (this.endDate < this.startDate) {
        return next(new Error('End date cannot be before start date'));
    }
    next();
});

const Shift = mongoose.model('Shift', shiftSchema);

export default Shift;