import Order from '../models/orderModel.js';
import MenuItem from '../models/menuItemModel.js';
import User from '../models/userModel.js';
import mongoose from 'mongoose';

// 🛒 CREATE Order (unchanged, but emit socket)
export const createOrder = async (req, res) => {
  try {
    const {
      hotelId,
      orderType,
      roomNumber,
      tableNumber,
      customerName,
      items,
      specialInstructions,
      waiterId,
    } = req.body;
    const guestId = req.user ? req.user._id : null;
    
    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, error: "Order cart is empty" });
    }
    
    let totalAmount = 0;
    const processedItems = [];
    
    for (const item of items) {
      const menuItem = await MenuItem.findById(item.menuItemId);
      if (!menuItem) {
        return res.status(404).json({ success: false, error: `Menu item not found` });
      }
      if (!menuItem.isAvailable) {
        return res.status(400).json({ success: false, error: `${menuItem.name} is currently unavailable` });
      }
      const itemPrice = menuItem.price;
      totalAmount += itemPrice * item.quantity;
      processedItems.push({
        menuItemId: item.menuItemId,
        name: menuItem.name,
        quantity: item.quantity,
        price: itemPrice,
      });
    }
    
    const newOrder = new Order({
      hotelId,
      guestId,
      orderType,
      roomNumber: orderType === 'room service' ? roomNumber : null,
      tableNumber: orderType === 'table service' ? tableNumber : null,
      customerName: orderType === 'pickup' ? customerName : null,
      items: processedItems,
      totalAmount,
      specialInstructions,
      waiterId,
      orderStatus: 'pending',
      paymentStatus: 'pending',
    });
    
    const savedOrder = await newOrder.save();
    
    // Emit socket event
    req.io?.emit('orderCreated', savedOrder);
    
    return res.status(201).json({
      success: true,
      message: "Order placed successfully",
      data: savedOrder,
    });
  } catch (error) {
    console.error("Error in createOrder:", error.message);
    return res.status(500).json({ success: false, error: error.message || "Internal server error" });
  }
};

// 🍳 GET All Orders (for Staff) - Updated to include all statuses
export const getAllOrders = async (req, res) => {
  try {
    const hotelId = req.user.hotelId;
    // Get all orders (not just active ones) to support order history
    const orders = await Order.find({
      hotelId: hotelId
    })
    .populate('items.menuItemId', 'name')
    .populate('waiterId', 'firstName lastName email') // ✅ Populate firstName and lastName
    .sort({ createdAt: 'desc' }); // Most recent first
    
    return res.status(200).json({ success: true, data: orders });
  } catch (error) {
    console.error("Error in getAllOrders:", error.message);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// 🏃 GET My Orders
export const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ guestId: req.user._id })
      .sort({ createdAt: 'desc' })
      .populate('waiterId', 'firstName lastName email'); // ✅ Populate firstName and lastName
    
    return res.status(200).json({ success: true, data: orders });
  } catch (error) {
    console.error("Error in getMyOrders:", error.message);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// 📊 GET Order Status
export const getOrderStatus = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .select('orderStatus items totalAmount createdAt paymentStatus')
      .populate('waiterId', 'firstName lastName email'); // ✅ Populate firstName and lastName
    
    if (!order) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }
    
    return res.status(200).json({ success: true, data: order });
  } catch (error) {
    console.error("Error in getOrderStatus:", error.message);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// 👨‍🍳 UPDATE Order Status (emit socket)
export const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!['confirmed', 'preparing', 'ready', 'delivered', 'cancelled'].includes(status)) {
      return res.status(400).json({ success: false, error: "Invalid status" });
    }
    
    const updatedOrder = await Order.findByIdAndUpdate(
      req.params.id,
      { orderStatus: status },
      { new: true }
    ).populate('waiterId', 'firstName lastName email'); // ✅ Populate firstName and lastName
    
    if (!updatedOrder) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }
    
    // Emit socket event
    req.io?.emit('orderUpdated', updatedOrder);
    
    return res.status(200).json({
      success: true,
      message: `Order status updated to ${status}`,
      data: updatedOrder
    });
  } catch (error) {
    console.error("Error in updateOrderStatus:", error.message);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// 💳 UPDATE Payment Status (NEW)
export const updatePaymentStatus = async (req, res) => {
  try {
    const { paymentStatus } = req.body;
    
    if (!['pending', 'paid', 'refunded'].includes(paymentStatus)) {
      return res.status(400).json({ success: false, error: "Invalid payment status" });
    }
    
    const updatedOrder = await Order.findByIdAndUpdate(
      req.params.id,
      { paymentStatus },
      { new: true }
    ).populate('waiterId', 'firstName lastName email'); // ✅ Populate firstName and lastName
    
    if (!updatedOrder) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }
    
    // Emit socket event
    req.io?.emit('orderUpdated', updatedOrder);
    
    return res.status(200).json({
      success: true,
      message: `Payment status updated to ${paymentStatus}`,
      data: updatedOrder
    });
  } catch (error) {
    console.error("Error in updatePaymentStatus:", error.message);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// GET Admin Orders with pagination, filters, sorting
export const getAdminOrders = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      sortBy = 'createdAt', 
      sortDir = 'desc', 
      status, 
      fromDate, 
      toDate, 
      amount, 
      hotelId,
      paymentStatus 
    } = req.query;
    
    const skip = (Number(page) - 1) * Number(limit);
    const query = {};
    const user = req.user;

    // Hotel filter: admin uses own hotelId, superadmin uses query hotelId or all
    if (user.role === 'admin') {
      query.hotelId = user.hotelId;
    } else if (user.role === 'superAdmin' && hotelId) {
      query.hotelId = hotelId;
    }

    // Status filter
    if (status) query.orderStatus = status;

    // Payment status filter
    if (paymentStatus) query.paymentStatus = paymentStatus;

    // Date range filter
    if (fromDate || toDate) {
      query.createdAt = {};
      if (fromDate) query.createdAt.$gte = new Date(fromDate);
      if (toDate) query.createdAt.$lte = new Date(toDate);
    }

    // Amount search
    if (amount) {
      query.totalAmount = { $gte: Number(amount) };
    }

    const orders = await Order.find(query)
      .populate('items.menuItemId', 'name')
      .populate('waiterId', 'firstName lastName email') // ✅ Populate firstName and lastName
      .sort({ [sortBy]: sortDir === 'desc' ? -1 : 1 })
      .skip(skip)
      .limit(Number(limit));

    const total = await Order.countDocuments(query);

    return res.status(200).json({ 
      success: true, 
      data: orders, 
      pagination: { 
        page: Number(page), 
        limit: Number(limit), 
        total, 
        pages: Math.ceil(total / Number(limit)) 
      } 
    });
  } catch (error) {
    console.error("Error in getAdminOrders:", error.message);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// GET Order Summary
export const getOrderSummary = async (req, res) => {
  try {
    const user = req.user;
    const query = { hotelId: user.hotelId };
    
    if (user.role === 'superAdmin') {
      const { hotelId } = req.query;
      if (hotelId) query.hotelId = hotelId;
    }

    const now = new Date();
    const startOfDay = new Date(now.setHours(0, 0, 0, 0));
    const endOfDay = new Date(now.setHours(23, 59, 59, 999));
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(now.setDate(now.getDate() + (6 - now.getDay())));
    endOfWeek.setHours(23, 59, 59, 999);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);

    const [dailyCompleted, weeklyOrders, monthlyOrders] = await Promise.all([
      Order.countDocuments({ 
        ...query, 
        orderStatus: 'delivered', 
        createdAt: { $gte: startOfDay, $lte: endOfDay } 
      }),
      Order.countDocuments({ 
        ...query, 
        createdAt: { $gte: startOfWeek, $lte: endOfWeek } 
      }),
      Order.countDocuments({ 
        ...query, 
        createdAt: { $gte: startOfMonth, $lte: endOfMonth } 
      }),
    ]);

    return res.status(200).json({ 
      success: true, 
      data: { dailyCompleted, weeklyOrders, monthlyOrders } 
    });
  } catch (error) {
    console.error("Error in getOrderSummary:", error.message);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Track Orders by IDs
export const trackOrdersByIds = async (req, res) => {
  try {
    const { orderIds } = req.body;
    
    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ success: false, error: "An array of orderIds is required" });
    }
    
    const orders = await Order.find({
      _id: { $in: orderIds }
    })
    .sort({ createdAt: 'desc' })
    .populate('waiterId', 'firstName lastName email'); // ✅ Populate firstName and lastName
    
    const safeOrders = orders.map(order => ({
      _id: order._id,
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
      items: order.items,
      totalAmount: order.totalAmount,
      createdAt: order.createdAt,
      orderType: order.orderType,
      roomNumber: order.roomNumber,
      tableNumber: order.tableNumber,
      customerName: order.customerName,
      waiterId: order.waiterId,
    }));
    
    return res.status(200).json({ success: true, data: safeOrders });
  } catch (error) {
    console.error("Error in trackOrdersByIds:", error.message);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    // Validate order ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false, 
        error: "Invalid order ID" 
      });
    }

    // Find order
    const order = await Order.findById(id)
      .populate('waiterId', 'firstName lastName email')
      .populate('items.menuItemId', 'name');

    if (!order) {
      return res.status(404).json({ 
        success: false, 
        error: "Order not found" 
      });
    }

    // Check access permissions
    // HeadWaiters, Admins, and SuperAdmins can see all orders in their hotel
    // if (['headWaiter', 'admin', 'superAdmin'].includes(user.role)) {
    //   if (order.hotelId.toString() !== user.hotelId.toString()) {
    //     return res.status(403).json({ 
    //       success: false, 
    //       error: "Access denied" 
    //     });
    //   }
    // } 
    // // Regular waiters can only see their own orders
    // else if (user.role === 'waiter') {
    //   const orderWaiterId = order.waiterId?._id || order.waiterId;
    //   if (orderWaiterId.toString() !== user._id.toString() || 
    //       order.hotelId.toString() !== user.hotelId.toString()) {
    //     return res.status(403).json({ 
    //       success: false, 
    //       error: "Access denied" 
    //     });
    //   }
    // }
    // Guests can only see their own orders
    // else if (user.role === 'guest') {
    //   if (order.guestId?.toString() !== user._id.toString()) {
    //     return res.status(403).json({ 
    //       success: false, 
    //       error: "Access denied" 
    //     });
    //   }
    // }

    return res.status(200).json({ 
      success: true, 
      data: order 
    });
  } catch (error) {
    console.error("Error in getOrderById:", error.message);
    return res.status(500).json({ 
      success: false, 
      error: "Internal server error" 
    });
  }
};