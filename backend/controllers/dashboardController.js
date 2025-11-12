import User from '../models/userModel.js';
import Hotel from '../models/hotelModel.js';
import Room from '../models/roomModel.js';
import Booking from '../models/bookingModel.js';
import moment from 'moment';

/**
 * @desc    Get all aggregated data for the superadmin dashboard
 * @route   GET /api/dashboard/overview
 * @access  Private (Superadmin)
 */
export const getDashboardOverview = async (req, res) => {
  try {
    // 1. Define Time Ranges
    const today = moment().startOf('day');
    const yesterday = moment().subtract(1, 'days').startOf('day');
    const startOfWeek = moment().startOf('week');
    const startOfLastWeek = moment().subtract(1, 'week').startOf('week');
    const startOfMonth = moment().startOf('month');
    const startOfLastMonth = moment().subtract(1, 'month').startOf('month');
    const startOfYear = moment().startOf('year');

    // 2. Create all aggregation promises
    const promises = {
      // --- Main Stats ---
      totalStaff: User.countDocuments({
        role: { $in: ['admin', 'cleaner', 'receptionist', 'waiter'] },
      }),
      totalUsers: User.countDocuments({ role: 'user' }),
      branchManagers: User.countDocuments({ role: 'admin' }),
      hotelBranches: Hotel.countDocuments(),
      totalRooms: Room.countDocuments(),
      cleaners: User.countDocuments({ role: 'cleaner' }),
      receptionists: User.countDocuments({ role: 'receptionist' }),
      waiters: User.countDocuments({ role: 'waiter' }),
      availableRooms: Room.countDocuments({ status: 'available' }),
      roomsToClean: Room.countDocuments({
        status: { $in: ['dirty', 'cleaning'] }, // Or whatever your status is
      }),

      // --- Quick Overview Stats ---
      bookingsToday: Booking.countDocuments({
        createdAt: { $gte: today.toDate() },
      }),
      bookingsYesterday: Booking.countDocuments({
        createdAt: {
          $gte: yesterday.toDate(),
          $lt: today.toDate(),
        },
      }),
      bookingsThisWeek: Booking.countDocuments({
        createdAt: { $gte: startOfWeek.toDate() },
      }),
      bookingsLastWeek: Booking.countDocuments({
        createdAt: {
          $gte: startOfLastWeek.toDate(),
          $lt: startOfWeek.toDate(),
        },
      }),
      bookingsThisMonth: Booking.countDocuments({
        createdAt: { $gte: startOfMonth.toDate() },
      }),
      bookingsLastMonth: Booking.countDocuments({
        createdAt: {
          $gte: startOfLastMonth.toDate(),
          $lt: startOfMonth.toDate(),
        },
      }),

      // --- Revenue Chart (This Year) ---
      revenueChartData: Booking.aggregate([
        {
          $match: {
            createdAt: { $gte: startOfYear.toDate() },
            paymentStatus: { $in: ['paid', 'partial'] },
          },
        },
        {
          $group: {
            _id: { $month: '$createdAt' }, // Group by month number
            revenue: { $sum: '$amountPaid' },
          },
        },
        { $sort: { _id: 1 } }, // Sort by month number
      ]),

      // --- Booking Trends Chart (Last 7 Days) ---
      bookingChartData: Booking.aggregate([
        {
          $match: {
            createdAt: { $gte: moment().subtract(7, 'days').startOf('day').toDate() },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            daily: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } }, // Sort by date
      ]),
    };

    // 3. Resolve all promises concurrently
    const [stats, charts] = await Promise.all([
      Promise.all(Object.values(promises).slice(0, 16)).then((results) => {
        // Map keys back to the results for the stats object
        const statsKeys = Object.keys(promises).slice(0, 16);
        return statsKeys.reduce((acc, key, index) => {
          acc[key] = results[index];
          return acc;
        }, {});
      }),
      Promise.all([promises.revenueChartData, promises.bookingChartData]),
    ]);

    const [revenueChartDataRaw, bookingChartDataRaw] = charts;

    // --- 4. Format Chart Data ---

    // Format Revenue Data
    const monthNames = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    const revenueChartData = monthNames.map((month, index) => {
      const monthData = revenueChartDataRaw.find((item) => item._id === index + 1);
      return {
        month: month,
        revenue: monthData ? monthData.revenue : 0,
      };
    });

    // Format Booking Data
    // We will create 7 days, even if there are no bookings
    const bookingChartData = [];
    let cumulativeWeek = 0;
    let cumulativeMonth = 0;
    const allMonthBookings = await Booking.find({ createdAt: { $gte: startOfMonth.toDate() }});

    for (let i = 6; i >= 0; i--) {
      const day = moment().subtract(i, 'days').startOf('day');
      const dayString = day.format('YYYY-MM-DD');
      const dayData = bookingChartDataRaw.find((item) => item._id === dayString);
      
      const daily = dayData ? dayData.daily : 0;
      
      // Cumulative for the week
      if (day.isSameOrAfter(startOfWeek)) {
        cumulativeWeek += daily;
      }
      
      // Cumulative for the month
      if (day.isSameOrAfter(startOfMonth)) {
        cumulativeMonth += daily;
      }

      bookingChartData.push({
        name: day.format('ddd'), // e.g., "Mon"
        daily: daily,
        weekly: cumulativeWeek,
        monthly: cumulativeMonth,
      });
    }

    // 5. Send Response
    res.status(200).json({
      stats,
      revenueChartData,
      bookingChartData,
    });
  } catch (error) {
    res.status(500).json({
      message: 'Server error fetching dashboard data',
      error: error.message,
    });
  }
};