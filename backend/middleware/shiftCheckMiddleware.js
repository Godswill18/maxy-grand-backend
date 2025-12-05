import Shift from '../models/shiftModel.js';

/**
 * Middleware to check if user has an active shift before allowing login
 * Uses Nigerian time (WAT = UTC+1)
 * Respects emergency activation
 */
export const checkShiftBeforeLogin = async (user) => {
    try {
        // Skip check for superadmin, admin, and guest roles
        // Admins manage shifts and should always be able to login
        if (user.role === 'superadmin' || user.role === 'admin' || user.role === 'guest') {
            return { allowed: true, message: 'Login allowed' };
        }

        // Get Nigerian time
        const now = Shift.getNigerianTime();

        // Find shifts that could be active today
        const todayShifts = await Shift.find({
            userId: user._id,
            startDate: { $lte: now },
            endDate: { $gte: now },
            status: { $in: ['scheduled', 'in-progress'] },
        });

        // Check if any shift is currently active
        let hasActiveShift = false;
        let activeShift = null;

        for (const shift of todayShifts) {
            if (shift.isCurrentlyActive()) {
                hasActiveShift = true;
                activeShift = shift;
                
                // Update shift status to in-progress if it's scheduled
                if (shift.status === 'scheduled') {
                    shift.status = 'in-progress';
                    shift.isActive = true;
                    await shift.save();
                }
                break;
            }
        }

        if (!hasActiveShift) {
            return {
                allowed: false,
                message: 'You do not have an active shift at this time. Please contact your manager for emergency access.',
                code: 'NO_ACTIVE_SHIFT',
            };
        }

        // Update user's isActive status
        if (!user.isActive) {
            user.isActive = true;
            await user.save();
        }

        // Return success with shift info
        return { 
            allowed: true, 
            message: 'Login allowed',
            shift: activeShift,
            emergencyActivated: activeShift.emergencyActivated || false
        };
    } catch (error) {
        console.error('Error in checkShiftBeforeLogin:', error);
        // In case of error, allow login but log the error
        return { allowed: true, message: 'Login allowed (error checking shift)' };
    }
};

/**
 * Express middleware wrapper for shift checking
 * Can be used as middleware in routes
 */
export const shiftCheckMiddleware = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Not authenticated',
            });
        }

        const shiftCheck = await checkShiftBeforeLogin(req.user);

        if (!shiftCheck.allowed) {
            return res.status(403).json({
                success: false,
                error: shiftCheck.message,
                code: shiftCheck.code,
            });
        }

        // Attach shift info to request
        if (shiftCheck.shift) {
            req.activeShift = shiftCheck.shift;
        }

        next();
    } catch (error) {
        console.error('Error in shiftCheckMiddleware:', error);
        next(); // Allow access on error to prevent lockout
    }
};