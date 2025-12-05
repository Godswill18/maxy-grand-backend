import cron from 'node-cron';
import Shift from '../models/shiftModel.js';
import User from '../models/userModel.js';

/**
 * Cron job to update shift and user active status
 * Runs every minute to check if shifts should be activated/deactivated
 * Uses Nigerian time (WAT = UTC+1)
 * Respects emergency activation
 * FORCEFULLY LOGS OUT STAFF when shift ends
 */
export const setupShiftCronJobs = (io) => {
    console.log('Setting up shift cron jobs (Nigerian Time - WAT)...');

    // Run every minute
    cron.schedule('* * * * *', async () => {
        try {
            console.log('Running shift status update (Nigerian Time)...');
            
            // Get Nigerian time
            const now = Shift.getNigerianTime();
            console.log('Nigerian Time:', now.toISOString());

            // Get all shifts that might be active now
            const todayShifts = await Shift.find({
                startDate: { $lte: now },
                endDate: { $gte: now },
                status: { $in: ['scheduled', 'in-progress'] },
            }).populate('userId');

            const updates = {
                activated: [],
                deactivated: [],
                loggedOut: [],
            };

            // Check each shift
            for (const shift of todayShifts) {
                const isActive = shift.isCurrentlyActive();
                const user = shift.userId;

                // Skip if user doesn't exist or is superadmin/guest/admin
                if (!user || user.role === 'superadmin' || user.role === 'guest' || user.role === 'admin') {
                    continue;
                }

                // Update shift isActive status and status
                if (shift.isActive !== isActive) {
                    const wasActive = shift.isActive;
                    shift.isActive = isActive;
                    
                    if (isActive && shift.status === 'scheduled') {
                        shift.status = 'in-progress';
                        console.log(`✅ Activating shift for ${user.firstName} ${user.lastName}`);
                    } else if (!isActive && shift.status === 'in-progress') {
                        // Don't mark as completed if emergency activated
                        if (!shift.emergencyActivated) {
                            // Check if shift has ended
                            if (now >= shift.endDate) {
                                shift.status = 'completed';
                                console.log(`✅ Completing shift for ${user.firstName} ${user.lastName}`);
                            }
                        }
                    }
                    
                    await shift.save();

                    // Emit socket event for shift update
                    if (io) {
                        io.emit('shift:updated', shift);
                        io.emit(`hotel:${shift.hotelId}:shift:updated`, shift);
                        io.emit(`user:${user._id}:shift:updated`, shift);
                    }

                    // ✅ FORCEFUL LOGOUT: If shift just became inactive (shift ended)
                    if (wasActive && !isActive && !shift.emergencyActivated) {
                        console.log(`🚪 FORCE LOGOUT: ${user.firstName} ${user.lastName} - Shift ended`);
                        
                        // Set user as inactive
                        user.isActive = false;
                        await user.save();

                        updates.loggedOut.push({
                            userId: user._id,
                            name: `${user.firstName} ${user.lastName}`,
                            reason: 'Shift ended',
                        });

                        // Emit FORCEFUL logout event
                        if (io) {
                            io.emit(`user:${user._id}:status:changed`, {
                                userId: user._id,
                                isActive: false,
                            });
                            
                            // ✅ FORCE LOGOUT - This will trigger frontend logout
                            io.emit(`user:${user._id}:force:logout`, {
                                message: 'Your shift has ended. You have been logged out.',
                                reason: 'shift_ended',
                                timestamp: now.toISOString(),
                            });

                            // Also emit general logout event
                            io.to(`user:${user._id}`).emit('force:logout', {
                                message: 'Your shift has ended. You have been logged out.',
                                reason: 'shift_ended',
                            });
                        }
                    }
                }

                // Update user isActive status (for activation)
                if (user.isActive !== isActive && isActive) {
                    user.isActive = true;
                    await user.save();

                    updates.activated.push({
                        userId: user._id,
                        name: `${user.firstName} ${user.lastName}`,
                    });

                    // Emit socket event for user status change
                    if (io) {
                        io.emit(`user:${user._id}:status:changed`, {
                            userId: user._id,
                            isActive: true,
                        });
                    }
                }
            }

            // ✅ FORCEFULLY deactivate users who don't have active shifts right now
            // But skip those with emergency activated shifts
            const usersWithActiveShifts = todayShifts
                .filter(s => s.isCurrentlyActive())
                .map(s => s.userId._id.toString());
            
            const staffRoles = ['receptionist', 'cleaner', 'waiter', 'headWaiter'];
            
            // Build query carefully to avoid empty string issues
            const queryConditions = {
                role: { $in: staffRoles },
                isActive: true,
                _id: { $nin: usersWithActiveShifts },
            };
            
            const usersToDeactivate = await User.find(queryConditions);

            for (const user of usersToDeactivate) {
                try {
                    // Check if they have any emergency activated shift
                    const emergencyShift = await Shift.findOne({
                        userId: user._id,
                        emergencyActivated: true,
                        status: { $in: ['scheduled', 'in-progress'] },
                    });

                    // Don't deactivate if they have emergency shift
                    if (emergencyShift) {
                        console.log(`⚠️ Skipping deactivation for ${user.firstName} ${user.lastName} - has emergency shift`);
                        continue;
                    }

                    console.log(`🚪 FORCE LOGOUT: ${user.firstName} ${user.lastName} - No active shift`);

                    // ✅ FORCEFULLY set to inactive
                    user.isActive = false;
                    await user.save();
                    
                    updates.deactivated.push({
                        userId: user._id,
                        name: `${user.firstName} ${user.lastName}`,
                    });

                    updates.loggedOut.push({
                        userId: user._id,
                        name: `${user.firstName} ${user.lastName}`,
                        reason: 'No active shift',
                    });

                    if (io) {
                        io.emit(`user:${user._id}:status:changed`, {
                            userId: user._id,
                            isActive: false,
                        });
                        
                        // ✅ FORCE LOGOUT
                        io.emit(`user:${user._id}:force:logout`, {
                            message: 'Your shift has ended. You have been logged out.',
                            reason: 'no_active_shift',
                            timestamp: now.toISOString(),
                        });

                        // Also emit general logout event
                        io.to(`user:${user._id}`).emit('force:logout', {
                            message: 'Your shift has ended. You have been logged out.',
                            reason: 'no_active_shift',
                        });
                    }
                } catch (error) {
                    console.error(`❌ Error deactivating user ${user._id}:`, error.message);
                    // Continue with other users even if one fails
                }
            }

            // Log summary
            if (updates.activated.length > 0 || updates.deactivated.length > 0 || updates.loggedOut.length > 0) {
                console.log('📊 Shift status updates:', {
                    activated: updates.activated.length,
                    deactivated: updates.deactivated.length,
                    loggedOut: updates.loggedOut.length,
                    nigerianTime: now.toISOString(),
                });

                if (updates.loggedOut.length > 0) {
                    console.log('🚪 Forced logout users:');
                    updates.loggedOut.forEach(u => {
                        console.log(`   - ${u.name} (Reason: ${u.reason})`);
                    });
                }
            }

        } catch (error) {
            console.error('❌ Error in shift cron job:', error);
        }
    });

    console.log('✅ Shift cron jobs setup complete (Nigerian Time)');
};

/**
 * Manual trigger for shift status update (can be called via API or admin panel)
 * Uses Nigerian time
 * FORCEFULLY logs out staff
 */
export const manualShiftStatusUpdate = async (io) => {
    try {
        console.log('🔄 Manual shift status update triggered (Nigerian Time)...');
        
        const now = Shift.getNigerianTime();
        console.log('Nigerian Time:', now.toISOString());

        const activeShifts = await Shift.find({
            startDate: { $lte: now },
            endDate: { $gte: now },
            status: { $in: ['scheduled', 'in-progress'] },
        }).populate('userId');

        const updates = {
            activated: [],
            deactivated: [],
            loggedOut: [],
            errors: [],
        };

        for (const shift of activeShifts) {
            try {
                const isActive = shift.isCurrentlyActive();
                const user = shift.userId;

                if (!user || user.role === 'superadmin' || user.role === 'guest' || user.role === 'admin') {
                    continue;
                }

                const wasActive = shift.isActive;

                if (shift.isActive !== isActive) {
                    shift.isActive = isActive;
                    if (isActive) shift.status = 'in-progress';
                    await shift.save();

                    // ✅ FORCEFUL LOGOUT if shift ended
                    if (wasActive && !isActive && !shift.emergencyActivated) {
                        user.isActive = false;
                        await user.save();

                        updates.loggedOut.push(user._id);

                        if (io) {
                            io.emit(`user:${user._id}:force:logout`, {
                                message: 'Your shift has ended. You have been logged out.',
                                reason: 'shift_ended',
                                timestamp: now.toISOString(),
                            });
                        }
                    }
                }

                if (user.isActive !== isActive) {
                    user.isActive = isActive;
                    await user.save();

                    if (isActive) {
                        updates.activated.push(user._id);
                    } else {
                        updates.deactivated.push(user._id);
                    }

                    if (io) {
                        io.emit(`user:${user._id}:status:changed`, {
                            userId: user._id,
                            isActive,
                        });
                    }
                }
            } catch (error) {
                updates.errors.push({
                    shiftId: shift._id,
                    error: error.message,
                });
            }
        }

        console.log('✅ Manual update completed:', updates);
        return updates;
    } catch (error) {
        console.error('❌ Error in manual shift status update:', error);
        throw error;
    }
};