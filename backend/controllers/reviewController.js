import crypto from 'crypto';
import Review from '../models/reviewModel.js';
import ReviewToken from '../models/reviewTokenModel.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const hashToken = (raw) =>
    crypto.createHash('sha256').update(raw).digest('hex');

/** Build a shared date/rating filter object from query params */
const buildReviewFilter = (query) => {
    const { rating, startDate, endDate } = query;
    const filter = {};

    if (rating) {
        const r = parseInt(rating, 10);
        if (r >= 1 && r <= 5) filter.rating = r;
    }
    if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate);
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            filter.createdAt.$lte = end;
        }
    }
    return filter;
};

// ─── Public: Validate Token ───────────────────────────────────────────────────

/**
 * @desc    Validate a review token and return booking snapshot for the form
 * @route   GET /api/reviews/validate-token/:token
 * @access  Public
 */
export const validateToken = async (req, res) => {
    try {
        const { token } = req.params;
        if (!token) {
            return res.status(400).json({ success: false, message: 'No token provided.' });
        }

        const tokenDoc = await ReviewToken.findOne({ tokenHash: hashToken(token) })
            .populate('hotelId', 'name')
            .populate('bookingId', 'guestName checkInDate checkOutDate confirmationCode');

        if (!tokenDoc) {
            return res.status(404).json({
                success: false,
                message: 'This review link is invalid or has expired.',
            });
        }

        if (tokenDoc.used) {
            return res.status(410).json({
                success: false,
                message: 'This review link has already been used.',
            });
        }

        if (new Date() > tokenDoc.expiresAt) {
            return res.status(410).json({
                success: false,
                message: 'This review link has expired.',
            });
        }

        // Check if a review already exists for this booking
        const existingReview = await Review.findOne({ bookingId: tokenDoc.bookingId });
        if (existingReview) {
            return res.status(410).json({
                success: false,
                message: 'A review has already been submitted for this stay.',
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                guestName:        tokenDoc.bookingId?.guestName  || 'Guest',
                hotelName:        tokenDoc.hotelId?.name         || 'Maxy Grand Hotel',
                checkInDate:      tokenDoc.bookingId?.checkInDate,
                checkOutDate:     tokenDoc.bookingId?.checkOutDate,
                confirmationCode: tokenDoc.bookingId?.confirmationCode,
            },
        });
    } catch (error) {
        console.error('[validateToken] Error:', error.message);
        return res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// ─── Public: Submit Review ────────────────────────────────────────────────────

/**
 * @desc    Submit a review using a valid one-time token
 * @route   POST /api/reviews/submit
 * @access  Public (rate-limited)
 */
export const submitReview = async (req, res) => {
    try {
        const { token, rating, title, comment, serviceRating, cleanlinessRating, wouldRecommend } = req.body;

        if (!token) {
            return res.status(400).json({ success: false, message: 'No token provided.' });
        }

        const tokenDoc = await ReviewToken.findOne({ tokenHash: hashToken(token) })
            .populate('hotelId', 'name')
            .populate('bookingId', 'guestName guestId hotelId checkInDate checkOutDate');

        if (!tokenDoc || tokenDoc.used || new Date() > tokenDoc.expiresAt) {
            return res.status(410).json({
                success: false,
                message: 'This review link is invalid, expired, or has already been used.',
            });
        }

        // Duplicate review guard (belt + suspenders alongside unique index)
        const already = await Review.findOne({ bookingId: tokenDoc.bookingId });
        if (already) {
            await ReviewToken.updateOne({ _id: tokenDoc._id }, { used: true });
            return res.status(409).json({
                success: false,
                message: 'A review has already been submitted for this booking.',
            });
        }

        // Input validation
        const parsedRating = parseInt(rating, 10);
        if (!parsedRating || parsedRating < 1 || parsedRating > 5) {
            return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5.' });
        }

        const trimmedComment = typeof comment === 'string' ? comment.trim() : '';
        if (!trimmedComment || trimmedComment.length < 5) {
            return res.status(400).json({ success: false, message: 'Please provide a comment (min 5 characters).' });
        }
        if (trimmedComment.length > 1000) {
            return res.status(400).json({ success: false, message: 'Comment must be 1000 characters or less.' });
        }

        const trimmedTitle = typeof title === 'string' ? title.trim().slice(0, 150) : null;

        const clampRating = (val) => {
            const n = parseInt(val, 10);
            return n >= 1 && n <= 5 ? n : null;
        };

        const parsedServiceRating     = serviceRating     !== undefined ? clampRating(serviceRating)     : null;
        const parsedCleanlinessRating = cleanlinessRating !== undefined ? clampRating(cleanlinessRating) : null;
        const parsedWouldRecommend    =
            typeof wouldRecommend === 'boolean' ? wouldRecommend
            : wouldRecommend === 'true'  ? true
            : wouldRecommend === 'false' ? false
            : null;

        const booking = tokenDoc.bookingId;
        const review = await Review.create({
            hotelId:           tokenDoc.hotelId,
            bookingId:         booking._id,
            guestId:           booking.guestId || null,
            guestName:         booking.guestName,
            rating:            parsedRating,
            comment:           trimmedComment,
            title:             trimmedTitle || null,
            serviceRating:     parsedServiceRating,
            cleanlinessRating: parsedCleanlinessRating,
            wouldRecommend:    parsedWouldRecommend,
        });

        // Mark token used immediately
        await ReviewToken.updateOne({ _id: tokenDoc._id }, { used: true });

        console.log(`[Review] Submitted for booking ${booking._id} by ${booking.guestName}`);

        return res.status(201).json({
            success: true,
            message: 'Thank you for your feedback!',
            data: review,
        });
    } catch (error) {
        console.error('[submitReview] Error:', error.message);
        return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
    }
};

// ─── Admin: Branch Manager Reviews ───────────────────────────────────────────

/**
 * @desc    Get reviews for the branch manager's hotel only
 * @route   GET /api/reviews/branch
 * @access  Private (admin role)
 */
export const getManagerReviews = async (req, res) => {
    try {
        const filter = {
            hotelId: req.user.hotelId,
            ...buildReviewFilter(req.query),
        };

        const reviews = await Review.find(filter)
            .populate('hotelId', 'name')
            .populate('bookingId', 'confirmationCode checkInDate checkOutDate')
            .sort({ createdAt: -1 });

        return res.status(200).json({ success: true, data: reviews });
    } catch (error) {
        console.error('[getManagerReviews] Error:', error.message);
        return res.status(500).json({ success: false, message: 'Server error fetching reviews.' });
    }
};

// ─── Superadmin / Admin: All Reviews ─────────────────────────────────────────

/**
 * @desc    Get all reviews (superadmin sees all; admin is limited to their hotel server-side)
 * @route   GET /api/reviews
 * @access  Private (admin + superadmin)
 */
export const getAllReviews = async (req, res) => {
    try {
        const { hotelId } = req.query;
        const filter = buildReviewFilter(req.query);

        // Server-side enforcement: admin can only ever see their own hotel
        if (req.user.role === 'admin') {
            filter.hotelId = req.user.hotelId;
        } else if (hotelId && hotelId !== 'all') {
            filter.hotelId = hotelId;
        }

        const reviews = await Review.find(filter)
            .populate('hotelId', 'name')
            .populate('bookingId', 'confirmationCode checkInDate checkOutDate')
            .sort({ createdAt: -1 });

        return res.status(200).json({ success: true, data: reviews });
    } catch (error) {
        console.error('[getAllReviews] Error:', error.message);
        return res.status(500).json({ success: false, message: 'Server error fetching reviews.' });
    }
};
