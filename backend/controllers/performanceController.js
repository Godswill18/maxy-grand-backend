import Order from '../models/orderModel.js';
import mongoose from 'mongoose';

// Helper function to build base query based on user role
const buildBaseQuery = (user) => {
  const query = {
    orderStatus: 'delivered',
    paymentStatus: 'paid',
    hotelId: user.hotelId
  };

  // HeadWaiters, Admins, and SuperAdmins see all hotel data
  if (['headWaiter', 'admin', 'superAdmin'].includes(user.role)) {
    // No additional filtering - see all paid & delivered orders in hotel
    return query;
  }
  
  // Regular waiters only see their own data
  if (user.role === 'waiter') {
    query.waiterId = user._id;
  }
  
  // Guests see their own data
  if (user.role === 'guest') {
    query.guestId = user._id;
  }

  return query;
};

// GET Performance Stats
export const getPerformanceStats = async (req, res) => {
  try {
    const user = req.user;
    const baseQuery = buildBaseQuery(user);

    // Get current date ranges
    const now = new Date();
    const todayStart = new Date(now.setHours(0, 0, 0, 0));
    const todayEnd = new Date(now.setHours(23, 59, 59, 999));
    
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay()); // Start of week (Sunday)
    weekStart.setHours(0, 0, 0, 0);
    
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    
    // Previous periods for comparison
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const yesterdayEnd = new Date(todayEnd);
    yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);
    
    const lastWeekStart = new Date(weekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekEnd = new Date(weekStart);
    lastWeekEnd.setMilliseconds(-1);
    
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    lastMonthEnd.setHours(23, 59, 59, 999);

    // Today's data
    const todayOrders = await Order.find({
      ...baseQuery,
      createdAt: { $gte: todayStart, $lte: todayEnd }
    });
    
    const todayRevenue = todayOrders.reduce((sum, order) => sum + order.totalAmount, 0);
    const todayCount = todayOrders.length;

    // Yesterday's data for comparison
    const yesterdayOrders = await Order.find({
      ...baseQuery,
      createdAt: { $gte: yesterdayStart, $lte: yesterdayEnd }
    });
    
    const yesterdayRevenue = yesterdayOrders.reduce((sum, order) => sum + order.totalAmount, 0);

    // Weekly data
    const weekOrders = await Order.find({
      ...baseQuery,
      createdAt: { $gte: weekStart }
    });
    
    const weeklyRevenue = weekOrders.reduce((sum, order) => sum + order.totalAmount, 0);

    // Last week's data for comparison
    const lastWeekOrders = await Order.find({
      ...baseQuery,
      createdAt: { $gte: lastWeekStart, $lte: lastWeekEnd }
    });
    
    const lastWeekRevenue = lastWeekOrders.reduce((sum, order) => sum + order.totalAmount, 0);

    // Monthly data
    const monthOrders = await Order.find({
      ...baseQuery,
      createdAt: { $gte: monthStart }
    });
    
    const monthlyRevenue = monthOrders.reduce((sum, order) => sum + order.totalAmount, 0);
    const monthlyCount = monthOrders.length;

    // Last month's data for comparison
    const lastMonthOrders = await Order.find({
      ...baseQuery,
      createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd }
    });
    
    const lastMonthRevenue = lastMonthOrders.reduce((sum, order) => sum + order.totalAmount, 0);
    const lastMonthCount = lastMonthOrders.length;

    // Calculate percentage changes
    const todayRevenueChange = yesterdayRevenue > 0 
      ? Math.round(((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100) 
      : 0;
    
    const weeklyRevenueChange = lastWeekRevenue > 0
      ? Math.round(((weeklyRevenue - lastWeekRevenue) / lastWeekRevenue) * 100)
      : 0;
    
    const monthlyRevenueChange = lastMonthRevenue > 0
      ? Math.round(((monthlyRevenue - lastMonthRevenue) / lastMonthRevenue) * 100)
      : 0;
    
    const ordersChange = lastMonthCount > 0
      ? Math.round(((monthlyCount - lastMonthCount) / lastMonthCount) * 100)
      : 0;

    // Calculate average rating (mock for now - would come from reviews)
    const averageRating = 4.8;
    const ratingChange = 0.3;

    // Total orders (all time)
    const totalOrders = await Order.countDocuments(baseQuery);

    const stats = {
      todayRevenue,
      todayRevenueChange,
      weeklyRevenue,
      weeklyRevenueChange,
      monthlyRevenue,
      monthlyRevenueChange,
      averageRating,
      ratingChange,
      completedOrders: monthlyCount,
      ordersChange,
      totalOrders
    };

    return res.status(200).json({ 
      success: true, 
      data: stats 
    });
  } catch (error) {
    console.error("Error in getPerformanceStats:", error.message);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// GET Daily Revenue (for week or month)
export const getDailyTips = async (req, res) => {
  try {
    const user = req.user;
    const { period = 'week' } = req.query;
    const baseQuery = buildBaseQuery(user);

    const now = new Date();
    const days = period === 'week' ? 7 : 30;
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    // Aggregate orders by day
    const dailyData = await Order.aggregate([
      {
        $match: {
          ...baseQuery,
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          orders: { $sum: 1 },
          totalAmount: { $sum: "$totalAmount" }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // Format data with day names
    const formattedData = dailyData.map(item => {
      const date = new Date(item._id);
      const dayName = period === 'week' 
        ? date.toLocaleDateString('en-US', { weekday: 'short' })
        : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      
      return {
        day: dayName,
        revenue: item.totalAmount, // Changed from tips to revenue
        orders: item.orders
      };
    });

    return res.status(200).json({ 
      success: true, 
      data: formattedData 
    });
  } catch (error) {
    console.error("Error in getDailyTips:", error.message);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// GET Monthly Performance
export const getMonthlyPerformance = async (req, res) => {
  try {
    const user = req.user;
    const { months = 6 } = req.query;
    const baseQuery = buildBaseQuery(user);

    const now = new Date();
    const startDate = new Date(now);
    startDate.setMonth(startDate.getMonth() - parseInt(months));
    startDate.setDate(1);
    startDate.setHours(0, 0, 0, 0);

    // Aggregate orders by month
    const monthlyData = await Order.aggregate([
      {
        $match: {
          ...baseQuery,
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" }
          },
          orders: { $sum: 1 },
          totalAmount: { $sum: "$totalAmount" }
        }
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1 }
      }
    ]);

    // Format data with month names
    const formattedData = monthlyData.map(item => {
      const monthName = new Date(item._id.year, item._id.month - 1).toLocaleDateString('en-US', { month: 'short' });
      const revenue = item.totalAmount; // Changed from tips to revenue
      
      return {
        month: monthName,
        orders: item.orders,
        revenue: revenue, // Changed from tips to revenue
        averageRevenue: Math.round(revenue / item.orders) // Changed from averageTip to averageRevenue
      };
    });

    return res.status(200).json({ 
      success: true, 
      data: formattedData 
    });
  } catch (error) {
    console.error("Error in getMonthlyPerformance:", error.message);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// GET Performance Highlights
export const getPerformanceHighlights = async (req, res) => {
  try {
    const user = req.user;
    const baseQuery = buildBaseQuery(user);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get this month's orders
    const monthOrders = await Order.find({
      ...baseQuery,
      createdAt: { $gte: monthStart }
    });

    // Calculate best day
    const dayTotals = {};
    monthOrders.forEach(order => {
      const dayName = new Date(order.createdAt).toLocaleDateString('en-US', { weekday: 'long' });
      if (!dayTotals[dayName]) {
        dayTotals[dayName] = 0;
      }
      dayTotals[dayName] += order.totalAmount; // Changed from tips to revenue
    });

    const bestDay = Object.entries(dayTotals).reduce((best, [day, revenue]) => {
      return revenue > best.revenue ? { day, revenue } : best;
    }, { day: 'N/A', revenue: 0 });

    // Calculate most popular table
    const tableCounts = {};
    monthOrders.forEach(order => {
      if (order.orderType === 'table service' && order.tableNumber) {
        const table = `Table ${order.tableNumber}`;
        tableCounts[table] = (tableCounts[table] || 0) + 1;
      }
    });

    const mostPopularTable = Object.entries(tableCounts).reduce((best, [table, orders]) => {
      return orders > best.orders ? { table, orders } : best;
    }, { table: 'N/A', orders: 0 });

    // Calculate most popular room
    const roomCounts = {};
    monthOrders.forEach(order => {
      if (order.orderType === 'room service' && order.roomNumber) {
        const room = `Room ${order.roomNumber}`;
        roomCounts[room] = (roomCounts[room] || 0) + 1;
      }
    });

    const mostPopularRoom = Object.entries(roomCounts).reduce((best, [room, orders]) => {
      return orders > best.orders ? { room, orders } : best;
    }, { room: 'N/A', orders: 0 });

    // Calculate average order value
    const totalRevenue = monthOrders.reduce((sum, order) => sum + order.totalAmount, 0);
    const averageOrderValue = monthOrders.length > 0 ? Math.round(totalRevenue / monthOrders.length) : 0;

    // Customer feedback (mock for now)
    const customerFeedback = {
      rating: 4.8,
      reviews: monthOrders.length
    };

    const highlights = {
      bestDay,
      mostPopularTable,
      mostPopularRoom,
      customerFeedback,
      averageOrderValue // Changed from averageTip to averageOrderValue
    };

    return res.status(200).json({ 
      success: true, 
      data: highlights 
    });
  } catch (error) {
    console.error("Error in getPerformanceHighlights:", error.message);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};