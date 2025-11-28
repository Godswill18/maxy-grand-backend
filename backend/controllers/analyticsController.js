// analyticsController.js
import Booking from "../models/bookingModel.js"; 
import Review from "../models/reviewModel.js";   
import User from "../models/userModel.js";
import Room from "../models/roomModel.js";
import { Types } from 'mongoose';

/**
 * @desc Get aggregated analytics data for the hotel of the logged-in user
 * @route GET /api/analytics/branch-data
 * @access Private (Admin/Staff only)
 */
export const getBranchAnalytics = async (req, res) => {
    try {
        const hotelId = req.user.hotelId;

        if (!hotelId) {
            return res.status(400).json({ 
                success: false, 
                message: "User is not associated with a hotel." 
            });
        }
        
        const hotelObjectId = new Types.ObjectId(hotelId);

        // --- 1. Monthly Revenue & Bookings (Last 6 Months) ---
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const monthlyData = await Booking.aggregate([
            { 
                $match: { 
                    hotelId: hotelObjectId, 
                    bookingStatus: { $in: ['confirmed', 'checked-in', 'checked-out'] },
                    createdAt: { $gte: sixMonthsAgo }
                } 
            },
            { 
                $group: {
                    _id: { 
                        year: { $year: "$createdAt" },
                        month: { $month: "$createdAt" }
                    },
                    totalRevenue: { $sum: "$totalAmount" },
                    totalBookings: { $sum: 1 }
                } 
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } },
            { 
                $project: { 
                    _id: 0,
                    month: {
                        $let: {
                            vars: {
                                monthsInString: ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
                            },
                            in: { $arrayElemAt: ["$$monthsInString", "$_id.month"] }
                        }
                    },
                    revenue: "$totalRevenue",
                    bookings: "$totalBookings"
                } 
            }
        ]);

        // Fill in missing months with zero values
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const filledMonthlyData = [];
        const now = new Date();
        
        for (let i = 5; i >= 0; i--) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthName = monthNames[date.getMonth()];
            
            const existingData = monthlyData.find(d => d.month === monthName);
            filledMonthlyData.push({
                month: monthName,
                revenue: existingData ? existingData.revenue : 0,
                bookings: existingData ? existingData.bookings : 0
            });
        }
        
        // --- 2. Revenue by Room Type ---
        const roomTypeData = await Booking.aggregate([
            { 
                $match: { 
                    hotelId: hotelObjectId, 
                    bookingStatus: { $in: ['confirmed', 'checked-in', 'checked-out'] } 
                } 
            },
            {
                $lookup: {
                    from: 'rooms',
                    localField: 'roomId',
                    foreignField: '_id',
                    as: 'roomDetails'
                }
            },
            { $unwind: '$roomDetails' },
            {
                $lookup: {
                    from: 'roomtypes',
                    localField: 'roomDetails.roomTypeId',
                    foreignField: '_id',
                    as: 'roomTypeDetails'
                }
            },
            { $unwind: '$roomTypeDetails' },
            { 
                $group: {
                    _id: "$roomTypeDetails.name",
                    totalRevenue: { $sum: "$totalAmount" }
                }
            },
            { 
                $project: { 
                    _id: 0, 
                    type: "$_id", 
                    value: "$totalRevenue" 
                }
            }
        ]);

        // --- 3. Customer Satisfaction (Reviews) ---
        const satisfactionData = await Review.aggregate([
            { $match: { hotelId: hotelObjectId } },
            { 
                $group: {
                    _id: "$rating",
                    count: { $sum: 1 }
                }
            },
            { $sort: { "_id": -1 } }
        ]);

        // --- 4. Calculate Quick Stats ---
        // Total revenue (all time)
        const totalRevenueResult = await Booking.aggregate([
            { 
                $match: { 
                    hotelId: hotelObjectId, 
                    bookingStatus: { $in: ['confirmed', 'checked-in', 'checked-out'] } 
                } 
            },
            { 
                $group: {
                    _id: null,
                    totalRevenue: { $sum: "$totalAmount" }
                }
            }
        ]);

        // Total bookings
        const totalBookings = await Booking.countDocuments({ 
            hotelId: hotelObjectId,
            bookingStatus: { $in: ['confirmed', 'checked-in', 'checked-out'] }
        });

        // Average occupancy (based on current state)
        const totalRooms = await Room.countDocuments({ hotelId: hotelObjectId });
        const occupiedRooms = await Room.countDocuments({ 
            hotelId: hotelObjectId, 
            status: 'occupied' 
        });
        const avgOccupancy = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;

        // Average rating
        const avgRatingResult = await Review.aggregate([
            { $match: { hotelId: hotelObjectId } },
            { 
                $group: {
                    _id: null,
                    avgRating: { $avg: "$rating" }
                }
            }
        ]);

        const quickStats = {
            totalRevenue: totalRevenueResult[0]?.totalRevenue || 0,
            totalBookings: totalBookings,
            avgOccupancy: avgOccupancy,
            avgRating: avgRatingResult[0]?.avgRating ? Number(avgRatingResult[0].avgRating.toFixed(1)) : 0,
        };

        res.status(200).json({
            success: true,
            data: {
                quickStats,
                monthlyRevenue: filledMonthlyData,
                roomTypeRevenue: roomTypeData,
                customerSatisfaction: satisfactionData,
            }
        });

    } catch (error) {
        console.error("Error in getBranchAnalytics:", error.message);
        res.status(500).json({ 
            success: false, 
            message: "Internal server error",
            error: error.message 
        });
    }
};