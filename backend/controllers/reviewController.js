import Review from '../models/reviewModel.js';

/**
 * @desc    Get all reviews, with optional filtering by hotel
 * @route   GET /api/reviews
 * @access  Private (Superadmin)
 */
export const getAllReviews = async (req, res) => {
  try {
    const { hotelId } = req.query;

    const filter = {};
    if (hotelId) {
      filter.hotelId = hotelId;
    }

    const reviews = await Review.find(filter)
      .populate('hotelId', 'name') // 'hotelId.name' will be the "Branch"
      .sort({ createdAt: -1 }); // Newest reviews first

    res.status(200).json(reviews);
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Server error fetching reviews', error: error.message });
  }
};