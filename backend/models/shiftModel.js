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
    // ✅ NEW: isShiftTime (True when current time is within shift hours)
    isShiftTime: {
        type: Boolean,
        default: false,
    },
    // ✅ Emergency activation (bypasses time checks)
    emergencyActivated: {
        type: Boolean,
        default: false,
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
shiftSchema.index({ status: 1, isShiftTime: 1 });
shiftSchema.index({ startDate: 1, endDate: 1 });
shiftSchema.index({ emergencyActivated: 1 });

/**
 * Get Nigerian Time (WAT = UTC+1)
 */
shiftSchema.statics.getNigerianTime = function() {
    const now = new Date();
    // Nigerian time is UTC+1
    const nigerianTime = new Date(now.getTime());
    return nigerianTime;
};

/**
 * ✅ Check if current time is within shift hours (uses Nigerian time)
 * This method checks if RIGHT NOW is within the shift's daily time window
 */
shiftSchema.methods.isCurrentlyActive = function() {
    const now = this.constructor.getNigerianTime();
    
    // If emergency activated, consider it active
    if (this.emergencyActivated && this.status !== 'cancelled' && this.status !== 'completed') {
        return true;
    }
    
    // Check if current date is within shift date range
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);
    
    const shiftStart = new Date(this.startDate);
    shiftStart.setHours(0, 0, 0, 0);
    
    const shiftEnd = new Date(this.endDate);
    shiftEnd.setHours(23, 59, 59, 999);
    
    // Check if today is within the shift date range
    if (todayStart < shiftStart || todayStart > shiftEnd) {
        return false; // Not within shift date range
    }
    
    // Parse shift times
    const [startHour, startMinute] = this.startTime.split(':').map(Number);
    const [endHour, endMinute] = this.endTime.split(':').map(Number);
    
    // Create time boundaries for TODAY
    const shiftStartToday = new Date(now);
    shiftStartToday.setHours(startHour, startMinute, 0, 0);
    
    const shiftEndToday = new Date(now);
    shiftEndToday.setHours(endHour, endMinute, 0, 0);
    
    // Check if current Nigerian time is within today's shift hours
    return now >= shiftStartToday && now <= shiftEndToday;
};

/**
 * ✅ Method to activate shift for emergency access
 */
shiftSchema.methods.activateEmergency = async function(activatedBy) {
    this.emergencyActivated = true;
    this.emergencyActivatedBy = activatedBy;
    this.emergencyActivatedAt = this.constructor.getNigerianTime();
    this.isShiftTime = true;
    this.status = 'in-progress';
    return await this.save();
};

/**
 * ✅ Method to deactivate emergency access
 */
shiftSchema.methods.deactivateEmergency = async function() {
    this.emergencyActivated = false;
    // Check if should still be active based on time
    if (!this.isCurrentlyActive()) {
        this.isShiftTime = false;
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