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
      // FIX: Added 'title' to destructuring to match frontend payload
      const { title, amount, description, images } = req.body; 

      // Get admin details from the auth middleware
      const raisedById = req.user.id;
      const hotelId = req.user.hotelId; 

      // Basic validation
      // FIX: Include title in required fields
      if (!title || !amount || !description ) {
        return res.status(400).json({ message: 'Please provide title, amount, and purpose/description' });
      }

      if (!hotelId) {
          return res.status(400).json({ message: 'Admin user is not associated with any hotel.' });
      }

      const request = new Request({
        hotelId,
        raisedBy: raisedById,
        title, // New field
        amount,
        description,
        images,
        status: 'pending',
      });

      const createdRequest = await request.save();

      // FIX: Populate the returned object to ensure frontend types match
      const populatedRequest = await createdRequest.populate([
          { path: 'hotelId', select: 'name location' },
          { path: 'raisedBy', select: 'firstName lastName email' }
      ]);


      res.status(201).json(populatedRequest);
    } catch (error) {
      res.status(500).json({ message: 'Server error creating request', error: error.message });
    }
};

export const editRequest = async (req, res) => {
    try {
        const { title, description, amount } = req.body;
        // The ID of the currently logged-in Admin, provided by the auth middleware
        const loggedInAdminId = req.user.id; 
        const { id: requestId } = req.params;

        // 1. Validate request ID format
        if (!mongoose.Types.ObjectId.isValid(requestId)) {
            return res.status(400).json({ message: 'Invalid request ID' });
        }

        const request = await Request.findById(requestId);

        // 2. Check if request exists
        if (!request) {
            return res.status(404).json({ message: 'Request not found' });
        }

        // --- ENFORCING EDIT RESTRICTIONS ---
        
        // 3. Check if the request is still pending
        if (request.status !== 'pending') {
            return res.status(403).json({ 
                message: `Cannot edit request. Status is already ${request.status}.` 
            });
        }

        // 4. Check if the logged-in user is the original creator ('raisedBy')
        // Ensure both IDs are converted to strings for accurate comparison
        if (request.raisedBy.toString() !== loggedInAdminId.toString()) {
            return res.status(403).json({ 
                message: 'Unauthorized. Only the original creator can edit this request.' 
            });
        }
        
        // --- PROCEED WITH UPDATE ---

        // Update the request fields if they are provided in the body
        if (title !== undefined) request.title = title;
        if (description !== undefined) request.description = description;
        // Use a standard check for amount, allowing 0 if needed, but checking for undefined
        if (amount !== undefined) request.amount = amount; 
        
        const updatedRequest = await request.save();

        res.status(200).json(updatedRequest);

    } catch (error) {
        // Log the error for debugging
        console.error("Error in editRequest:", error.message);
        res.status(500).json({ message: 'Server error updating request', error: error.message });
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
      .populate('raisedBy', 'firstName lastName email')
      .populate('approvedBy', 'firstName lastName email')
      .populate('hotelId', 'name location')
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
      .populate('title')
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