import Order from '../models/orderModel.js';
import MenuItem from '../models/menuItemModel.js';

// 🛒 CREATE Order
export const createOrder = async (req, res) => {
  try {
    // Get order details from body
    const {
      hotelId,
      orderType,   // 'room-service', 'pickup', 'table-service'
      roomNumber,
      tableNumber,
      customerName,
      items,         // Array of { menuItemId: "...", quantity: 2 }
      specialInstructions,
    } = req.body;

    // Check for a logged-in user
    const guestId = req.user ? req.user._id : null;

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, error: "Order cart is empty" });
    }

    let totalAmount = 0;
    const processedItems = [];

    // --- Securely validate items and calculate total from DB ---
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
    // --- End of validation ---

    const newOrder = new Order({
      hotelId,
      guestId,
      orderType,
      roomNumber: orderType === 'room-service' ? roomNumber : null,
      tableNumber: orderType === 'table-service' ? tableNumber : null,
      customerName: orderType === 'pickup' ? customerName : null,
      items: processedItems,
      totalAmount,
      specialInstructions,
      orderStatus: 'pending',    // Default status
      paymentStatus: 'pending', // Default status
    });

    const savedOrder = await newOrder.save(); // The pre-save hook will run here!
    
    // Here you would also push this new order to a WebSocket room
    // for the kitchen/bar dashboard to update in real-time.

    return res.status(201).json({
      success: true,
      message: "Order placed successfully",
      data: savedOrder,
    });

  } catch (error) {
    console.error("Error in createOrder:", error.message);
    // The pre-save hook error will be caught here
    return res.status(500).json({ success: false, error: error.message || "Internal server error" });
  }
};

// 🍳 GET All Orders (for Staff)
export const getAllOrders = async (req, res) => {
  try {
    // Find active orders (not delivered/cancelled) and sort by oldest first
    const orders = await Order.find({
      orderStatus: { $in: ['pending', 'confirmed', 'preparing', 'ready'] }
    })
    .populate('items.menuItemId', 'name')
    .sort({ createdAt: 'asc' }); 

    return res.status(200).json({ success: true, data: orders });
  } catch (error) {
    console.error("Error in getAllOrders:", error.message);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// 🏃 GET My Orders (for logged-in Guest)
export const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ guestId: req.user._id })
      .sort({ createdAt: 'desc' });
      
    return res.status(200).json({ success: true, data: orders });
  } catch (error) {
    console.error("Error in getMyOrders:", error.message);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// 📊 GET Order Status (for anyone with the ID)
export const getOrderStatus = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .select('orderStatus items totalAmount createdAt'); // Only send non-sensitive info
      
    if (!order) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }
    return res.status(200).json({ success: true, data: order });
  } catch (error) {
    console.error("Error in getOrderStatus:", error.message);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// 👨‍🍳 UPDATE Order Status (for Staff)
export const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body; // e.g., "confirmed", "preparing", "ready"
    
    if (!['confirmed', 'preparing', 'ready', 'delivered', 'cancelled'].includes(status)) {
        return res.status(400).json({ success: false, error: "Invalid status" });
    }
    
    const updatedOrder = await Order.findByIdAndUpdate(
      req.params.id,
      { orderStatus: status },
      { new: true }
    );
    
    if (!updatedOrder) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }
    
    // Here you would push the status update to the guest via WebSocket

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