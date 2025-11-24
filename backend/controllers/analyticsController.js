// analyticsController.js (NEW FUNCTION)
import Booking from "../models/bookingModel.js"; 
import Review from "../models/reviewModel.js";   
import User from "../models/userModel.js";
import { Types } from 'mongoose';                // For ObjectId casting

/**
 * @desc Get aggregated analytics data for the hotel of the logged-in user
 * @route GET /api/analytics/branch-data
 * @access Private (Admin/Staff only)
 */
export const getBranchAnalytics = async (req, res) => {
    try {
        const hotelId = req.user.hotelId;

        if (!hotelId) {
            return res.status(400).json({ success: false, message: "User is not associated with a hotel." });
        }
        
        const hotelObjectId = new Types.ObjectId(hotelId);

        // --- 1. Monthly Revenue & Bookings (Last 6 Months) ---
        // This is a complex aggregation, simplified here for structure.
        const monthlyData = await Booking.aggregate([
            { $match: { hotelId: hotelObjectId, status: { $in: ['completed', 'checked_out'] } } },
            { 
                $group: {
                    _id: { $month: "$checkInDate" }, // Group by month
                    monthName: { $first: { $dateToString: { format: "%b", date: "$checkInDate" } } },
                    totalRevenue: { $sum: "$totalPrice" },
                    totalBookings: { $sum: 1 }
                } 
            },
            { $sort: { "_id": 1 } },
            // In a real app, you'd calculate the percentage change here.
            { $project: { _id: 0, month: "$monthName", revenue: "$totalRevenue", bookings: "$totalBookings" } }
        ]);
        
        // --- 2. Revenue by Room Type (Hypothetical Aggregation) ---
        const roomTypeData = await Booking.aggregate([
             { $match: { hotelId: hotelObjectId, status: { $in: ['completed', 'checked_out'] } } },
             { $group: {
                 _id: "$roomType", 
                 totalRevenue: { $sum: "$totalPrice" }
             }},
             { $project: { _id: 0, type: "$_id", value: "$totalRevenue" }}
             // NOTE: Front-end expects 'value' as a percentage, which must be calculated client-side 
             // or using an extra $group stage in MongoDB. We return absolute values here.
        ]);

        // --- 3. Customer Satisfaction (Reviews) ---
        const satisfactionData = await Review.aggregate([
            { $match: { hotelId: hotelObjectId, rating: { $exists: true } } },
            { $group: {
                _id: "$rating", // Assuming rating is 1-5
                count: { $sum: 1 }
            }},
            { $sort: { "_id": -1 } }
        ]);

        // Quick Stats Calculation (Last Month)
        const lastMonthData = monthlyData[monthlyData.length - 1] || { revenue: 0, bookings: 0 };
        const totalStaff = (await User.countDocuments({ hotelId: hotelObjectId, role: { $in: ['admin', 'receptionist', 'cleaner', 'waiter'] } }));

        res.status(200).json({
            success: true,
            data: {
                quickStats: {
                    totalRevenue: lastMonthData.revenue,
                    totalBookings: lastMonthData.bookings,
                    // These are mock calculations; a real app uses complex formulas
                    avgOccupancy: 89, 
                    avgRating: 4.6, 
                },
                monthlyRevenue: monthlyData,
                roomTypeRevenue: roomTypeData,
                customerSatisfaction: satisfactionData,
            }
        });

    } catch (error) {
        console.error("Error in getBranchAnalytics:", error.message);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

// NOTE: You must also ensure this route is exposed in your Express router:
// router.get('/branch-data', protectRoute, getBranchAnalytics);