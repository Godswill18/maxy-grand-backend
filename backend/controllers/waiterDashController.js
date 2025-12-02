import Order from '../models/orderModel.js';
import mongoose from 'mongoose';

// Helper function to build base query based on user role
const buildBaseQuery = (user) => {
  const query = {
    hotelId: user.hotelId
  };

  // HeadWaiters, Admins, and SuperAdmins see all hotel data
  if (['headWaiter', 'admin', 'superAdmin'].includes(user.role)) {
    // No additional filtering - see all orders in hotel
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

// GET Dashboard Stats
export const getDashboardStats = async (req, res) => {
  try {
    const user = req.user;
    const baseQuery = buildBaseQuery(user);

    // Get current date ranges
    const now = new Date();
    const todayStart = new Date(now.setHours(0, 0, 0, 0));
    const todayEnd = new Date(now.setHours(23, 59, 59, 999));
    
    // Yesterday for comparison
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const yesterdayEnd = new Date(todayEnd);
    yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);

    // Today's orders (all statuses)
    const todayOrders = await Order.countDocuments({
      ...baseQuery,
      createdAt: { $gte: todayStart, $lte: todayEnd }
    });

    // Yesterday's orders for comparison
    const yesterdayOrders = await Order.countDocuments({
      ...baseQuery,
      createdAt: { $gte: yesterdayStart, $lte: yesterdayEnd }
    });

    // Calculate today's change percentage
    const todayChange = yesterdayOrders > 0
      ? Math.round(((todayOrders - yesterdayOrders) / yesterdayOrders) * 100)
      : 0;

    // Pending orders (all time)
    const pendingOrders = await Order.countDocuments({
      ...baseQuery,
      orderStatus: 'pending'
    });

    // In-progress orders (confirmed or preparing)
    const inProgressOrders = await Order.countDocuments({
      ...baseQuery,
      orderStatus: { $in: ['confirmed', 'preparing'] }
    });

    // Ready orders
    const readyOrders = await Order.countDocuments({
      ...baseQuery,
      orderStatus: 'ready'
    });

    // Completed orders today (delivered status)
    const completedToday = await Order.countDocuments({
      ...baseQuery,
      orderStatus: 'delivered',
      createdAt: { $gte: todayStart, $lte: todayEnd }
    });

    // Completed orders yesterday for comparison
    const completedYesterday = await Order.countDocuments({
      ...baseQuery,
      orderStatus: 'delivered',
      createdAt: { $gte: yesterdayStart, $lte: yesterdayEnd }
    });

    // Calculate completed change percentage
    const completedChange = completedYesterday > 0
      ? Math.round(((completedToday - completedYesterday) / completedYesterday) * 100)
      : 0;

    // Tables assigned (unique table numbers from today's table service orders)
    const tablesData = await Order.aggregate([
      {
        $match: {
          ...baseQuery,
          orderType: 'table service',
          tableNumber: { $exists: true, $ne: null },
          createdAt: { $gte: todayStart, $lte: todayEnd }
        }
      },
      {
        $group: {
          _id: '$tableNumber'
        }
      },
      {
        $count: 'total'
      }
    ]);

    const tablesAssigned = tablesData.length > 0 ? tablesData[0].total : 0;

    // Reservations (placeholder - would need a separate reservations collection)
    // For now, count future orders or use table service orders as proxy
    const reservationsToday = await Order.countDocuments({
      ...baseQuery,
      orderType: 'table service',
      createdAt: { $gte: todayStart, $lte: todayEnd }
    });

    const stats = {
      totalOrdersToday: todayOrders,
      todayChange,
      pendingOrders,
      inProgressOrders,
      readyOrders,
      completedOrders: completedToday,
      completedChange,
      tablesAssigned,
      reservationsToday
    };

    return res.status(200).json({ 
      success: true, 
      data: stats 
    });
  } catch (error) {
    console.error("Error in getDashboardStats:", error.message);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// GET Recent Orders
export const getRecentOrders = async (req, res) => {
  try {
    const user = req.user;
    const { limit = 10 } = req.query;
    const baseQuery = buildBaseQuery(user);

    // Get recent orders
    const orders = await Order.find(baseQuery)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate('waiterId', 'firstName lastName')
      .select('_id orderType tableNumber roomNumber customerName items totalAmount orderStatus createdAt waiterId');

    return res.status(200).json({ 
      success: true, 
      data: orders 
    });
  } catch (error) {
    console.error("Error in getRecentOrders:", error.message);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// GET Quick Stats (for smaller widgets)
export const getQuickStats = async (req, res) => {
  try {
    const user = req.user;
    const baseQuery = buildBaseQuery(user);

    // Get active orders count (not delivered or cancelled)
    const activeOrders = await Order.countDocuments({
      ...baseQuery,
      orderStatus: { $in: ['pending', 'confirmed', 'preparing', 'ready'] }
    });

    // Get today's revenue (delivered + paid orders)
    const now = new Date();
    const todayStart = new Date(now.setHours(0, 0, 0, 0));
    
    const revenueData = await Order.aggregate([
      {
        $match: {
          ...baseQuery,
          orderStatus: 'delivered',
          paymentStatus: 'paid',
          createdAt: { $gte: todayStart }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$totalAmount' }
        }
      }
    ]);

    const todayRevenue = revenueData.length > 0 ? revenueData[0].total : 0;

    // Get average order value today
    const todayOrdersCount = await Order.countDocuments({
      ...baseQuery,
      createdAt: { $gte: todayStart }
    });

    const avgOrderValue = todayOrdersCount > 0 
      ? Math.round(todayRevenue / todayOrdersCount) 
      : 0;

    const stats = {
      activeOrders,
      todayRevenue,
      avgOrderValue,
      todayOrdersCount
    };

    return res.status(200).json({ 
      success: true, 
      data: stats 
    });
  } catch (error) {
    console.error("Error in getQuickStats:", error.message);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// GET Orders by Status (for pie charts, etc.)
export const getOrdersByStatus = async (req, res) => {
  try {
    const user = req.user;
    const baseQuery = buildBaseQuery(user);

    // Get today's orders grouped by status
    const now = new Date();
    const todayStart = new Date(now.setHours(0, 0, 0, 0));

    const statusData = await Order.aggregate([
      {
        $match: {
          ...baseQuery,
          createdAt: { $gte: todayStart }
        }
      },
      {
        $group: {
          _id: '$orderStatus',
          count: { $sum: 1 }
        }
      }
    ]);

    // Format data
    const formattedData = statusData.map(item => ({
      status: item._id,
      count: item.count
    }));

    return res.status(200).json({ 
      success: true, 
      data: formattedData 
    });
  } catch (error) {
    console.error("Error in getOrdersByStatus:", error.message);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};