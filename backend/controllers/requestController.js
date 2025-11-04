import Request from '../models/requestModel.js'; // Adjust the path as needed
import User from '../models/userModel.js'; // Assuming you have a User model
import Hotel from '../models/hotelModel.js'; // Assuming you have a Hotel model
import mongoose from 'mongoose';

/**
 * @desc    Create a new financial request (request)
 * @route   POST /api/requests
 * @access  Private (Admin)
 */
export const createRequest = async (req, res) => {
  try {
    const { amount, description, images } = req.body;

    // Get admin details from the auth middleware
    const raisedById = req.user.id;
    const hotelId = req.user.hotelId; 

    // Basic validation
    if (!amount || !description ) {
      return res.status(400).json({ message: 'Please provide amount and description' });
    }

    if (!hotelId) {
        return res.status(400).json({ message: 'Admin user is not associated with any hotel.' });
    }

    const request = new Request({
      hotelId,
      raisedBy: raisedById,
      amount,
      description,
      images,
      status: 'pending', // Default, but good to be explicit
    });

    const createdRequest = await request.save();

    // TODO: Implement logic to notify Superadmins (e.g., via email, websocket)

    res.status(201).json(createdRequest);
  } catch (error) {
    res.status(500).json({ message: 'Server error creating request', error: error.message });
  }
};

/**
 * @desc    Update an request's status (approve/reject)
 * @route   PATCH /api/requests/:id/status
 * @access  Private (Superadmin)
 */
export const updateRequestStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const superadminId = req.user.id;
    const { id: requestId } = req.params;

    // Validate request ID
    if (!mongoose.Types.ObjectId.isValid(requestId)) {
        return res.status(400).json({ message: 'Invalid request ID' });
    }

    // Validate status
    if (status !== 'approved' && status !== 'rejected') {
      return res.status(400).json({ message: "Status must be 'approved' or 'rejected'" });
    }

    const request = await Request.findById(requestId);

    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }

    // Check if the request is already actioned
    if (request.status !== 'pending') {
      return res.status(400).json({ message: `Request is already ${request.status}` });
    }

    // Update the request
    request.status = status;
    request.approvedBy = superadminId;
    
    const updatedRequest = await request.save();

    // TODO: Implement logic to notify the original Admin (raisedBy) of the status change

    res.status(200).json(updatedRequest);
  } catch (error) {
    res.status(500).json({ message: 'Server error updating request status', error: error.message });
  }
};

/**
 * @desc    Get all requests (for Superadmin)
 * @route   GET /api/requests/all
 * @access  Private (Superadmin)
 */
export const getAllRequests = async (req, res) => {
  try {
    const requests = await Request.find({})
      .populate('hotelId', 'name location') // Populate with hotel name and location
      .populate('raisedBy', 'name email') // Populate with admin's name and email
      .populate('approvedBy', 'name email') // Populate with superadmin's name and email
      .sort({ createdAt: -1 }); // Show newest first

    res.status(200).json(requests);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching all requests', error: error.message });
  }
};

/**
 * @desc    Get all requests for a specific hotel
 * @route   GET /api/requests
 * @access  Private (Admin)
 */
export const getHotelRequests = async (req, res) => {
  try {
    const hotelId = req.user.hotelId;

    if (!hotelId) {
        return res.status(400).json({ message: 'Admin user is not associated with any hotel.' });
    }

    const requests = await Request.find({ hotelId: hotelId })
      .populate('raisedBy', 'name email')
      .populate('approvedBy', 'name email')
      .sort({ createdAt: -1 });

    res.status(200).json(requests);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching hotel requests', error: error.message });
  }
};

/**
 * @desc    Get a single request by ID
 * @route   GET /api/requests/:id
 * @access  Private (Admin or Superadmin)
 */
export const getRequestById = async (req, res) => {
  try {
    const { id: requestId } = req.params;

    // Validate request ID
    if (!mongoose.Types.ObjectId.isValid(requestId)) {
        return res.status(400).json({ message: 'Invalid request ID' });
    }

    const request = await Request.findById(requestId)
      .populate('hotelId', 'name location')
      .populate('raisedBy', 'name email')
      .populate('approvedBy', 'name email');

    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }

    // **Security Check:**
    // Allow if user is a Superadmin OR if the user is an Admin for that specific hotel
    if (req.user.role === 'superadmin' || request.hotelId._id.toString() === req.user.hotelId) {
      res.status(200).json(request);
    } else {
      res.status(403).json({ message: 'Not authorized to view this request' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching request', error: error.message });
  }
};