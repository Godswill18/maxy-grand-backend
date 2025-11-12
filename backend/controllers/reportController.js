import Booking from '../models/bookingModel.js';
import mongoose from 'mongoose';

/**
 * @desc    Get aggregated analytics data for bookings and revenue
 * @route   GET /api/reports/analytics
 * @access  Private (Superadmin)
 * @query   period - 'day', 'month', 'year' (defaults to 'month')
 * @query   hotelId - (Optional) filter by a specific hotel
 */
export const getAnalyticsData = async (req, res) => {
  try {
    const { period = 'month', hotelId } = req.query;

    let groupByFormat;
    let sortField;

    // Determine the grouping format based on the period
    switch (period) {
      case 'day':
        groupByFormat = '%Y-%m-%d'; // e.g., "2025-11-12"
        sortField = { year: 1, month: 1, day: 1 };
        break;
      case 'year':
        groupByFormat = '%Y'; // e.g., "2025"
        sortField = { year: 1 };
        break;
      case 'month':
      default:
        groupByFormat = '%Y-%m'; // e.g., "2025-11"
        sortField = { year: 1, month: 1 };
        break;
    }

    // --- 1. Base Match Stage ---
    // UPDATED to use the new model's fields
    const matchStage = {
      // "Cash inflow" includes partial and full payments
      paymentStatus: { $in: ['paid', 'partial'] },
      // Only count bookings that are active or completed
      bookingStatus: { $in: ['confirmed', 'checked-in', 'checked-out'] },
      // Add hotelId to the match stage if it's provided
      ...(hotelId && mongoose.Types.ObjectId.isValid(hotelId)
        ? { hotelId: new mongoose.Types.ObjectId(hotelId) }
        : {}),
    };

    // --- 2. Timeseries Aggregation (Revenue & Bookings) ---
    const data = await Booking.aggregate([
      {
        $match: matchStage,
      },
      {
        $group: {
          _id: {
            $dateToString: { format: groupByFormat, date: '$checkInDate' },
          },
          // Sum 'amountPaid' as this is "cash inflow"
          totalRevenue: { $sum: '$amountPaid' },
          totalBookings: { $sum: 1 },
          ...(period === 'day' && {
            year: { $first: { $year: '$checkInDate' } },
            month: { $first: { $month: '$checkInDate' } },
            day: { $first: { $dayOfMonth: '$checkInDate' } },
          }),
          ...(period === 'month' && {
            year: { $first: { $year: '$checkInDate' } },
            month: { $first: { $month: '$checkInDate' } },
          }),
          ...(period === 'year' && {
            year: { $first: { $year: '$checkInDate' } },
          }),
        },
      },
      {
        $sort: sortField,
      },
      {
        $project: {
          _id: 0, 
          label: '$_id', // Rename _id to 'label' for the chart
          totalRevenue: 1,
          totalBookings: 1,
        },
      },
    ]);

    // --- 3. Booking Type Aggregation (Pie Chart) ---
    // UPDATED to use 'bookingType' instead of 'bookingSource'
    const bookingTypeData = await Booking.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$bookingType', // Group by 'online' vs 'in-person'
          value: { $sum: 1 }, // Count bookings per type
        },
      },
      {
        $project: {
          _id: 0,
          name: '$_id', // 'name' is used by the Pie chart
          value: 1,
        },
      },
    ]);

    res.status(200).json({
      timeseries: data,
      sources: bookingTypeData, // Send 'sources' as the key (frontend expects this)
    });
  } catch (error) {
    console.error('Error fetching analytics data:', error);
    res
      .status(500)
      .json({ message: 'Server error fetching analytics', error: error.message });
  }
};