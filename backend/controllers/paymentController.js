import Booking from '../models/bookingModel.js';
import Payment from '../models/paymentModel.js';
import https from 'https';

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

/**
 * @desc Verify payment from Paystack
 * @route POST /api/payments/verify
 */
export const verifyPayment = async (req, res) => {
  try {
    const { reference, bookingIds } = req.body;

    if (!reference || !bookingIds || !Array.isArray(bookingIds)) {
      return res.status(400).json({
        success: false,
        error: 'Payment reference and booking IDs are required'
      });
    }

    // Verify payment with Paystack
    const options = {
      hostname: 'api.paystack.co',
      port: 443,
      path: `/transaction/verify/${reference}`,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`
      }
    };

    const paystackRequest = https.request(options, (paystackRes) => {
      let data = '';

      paystackRes.on('data', (chunk) => {
        data += chunk;
      });

      paystackRes.on('end', async () => {
        try {
          const response = JSON.parse(data);

          if (response.status && response.data.status === 'success') {
            // Payment verified successfully
            const amountPaid = response.data.amount / 100; // Convert from kobo to naira

            // Update all bookings
            const updatePromises = bookingIds.map(bookingId =>
              Booking.findByIdAndUpdate(
                bookingId,
                {
                  amountPaid: amountPaid / bookingIds.length, // Divide equally
                  paymentStatus: 'paid',
                  bookingStatus: 'confirmed'
                },
                { new: true }
              )
            );

            await Promise.all(updatePromises);

            // Emit socket event for each updated booking
            if (req.io) {
              for (const bookingId of bookingIds) {
                const booking = await Booking.findById(bookingId)
                  .populate('hotelId', 'name')
                  .populate('roomId', 'roomNumber')
                  .populate('guestId', 'firstName lastName email');
                req.io.emit('bookingUpdated', booking);
              }
            }

            return res.status(200).json({
              success: true,
              message: 'Payment verified and bookings confirmed',
              data: response.data
            });
          } else {
            return res.status(400).json({
              success: false,
              error: 'Payment verification failed',
              data: response
            });
          }
        } catch (error) {
          console.error('Error parsing Paystack response:', error);
          return res.status(500).json({
            success: false,
            error: 'Error processing payment verification'
          });
        }
      });
    });

    paystackRequest.on('error', (error) => {
      console.error('Paystack request error:', error);
      return res.status(500).json({
        success: false,
        error: 'Error connecting to payment gateway'
      });
    });

    paystackRequest.end();

  } catch (error) {
    console.error('Error verifying payment:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

/**
 * @desc Handle Paystack webhook
 * @route POST /api/payments/webhook
 */
export const handleWebhook = async (req, res) => {
  try {
    const hash = require('crypto')
      .createHmac('sha512', PAYSTACK_SECRET_KEY)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (hash === req.headers['x-paystack-signature']) {
      const event = req.body;

      if (event.event === 'charge.success') {
        const { reference, metadata } = event.data;
        const bookingIds = metadata.bookingIds || [];

        if (bookingIds.length > 0) {
          const amountPaid = event.data.amount / 100;

          // Update bookings
          const updatePromises = bookingIds.map(bookingId =>
            Booking.findByIdAndUpdate(
              bookingId,
              {
                amountPaid: amountPaid / bookingIds.length,
                paymentStatus: 'paid',
                bookingStatus: 'confirmed'
              },
              { new: true }
            )
          );

          await Promise.all(updatePromises);
        }
      }

      res.status(200).send();
    } else {
      res.status(400).send('Invalid signature');
    }
  } catch (error) {
    console.error('Webhook error:', error.message);
    res.status(500).send('Webhook handler error');
  }
};

// ----------------------------------------- Controllsers for payment related operations can be added here ------------------------------

/**
 * @desc Get all payments for a specific hotel
 * @route GET /api/payments/hotel/:hotelId
 */
export const getHotelPayments = async (req, res) => {
  try {
    const hotelId = req.params.hotelId || req.user.hotelId;

    // First, find all bookings for this hotel
    const hotelBookings = await Booking.find({ hotelId }).select('_id');
    const bookingIds = hotelBookings.map(b => b._id);

    console.log(`Fetching payments for hotel ${hotelId}, found ${bookingIds.length} bookings`);

    const payments = await Payment.find({ bookingId: { $in: bookingIds } })
      .populate({
        path: 'bookingId',
        select: 'guestName guestEmail confirmationCode bookingType checkInDate checkOutDate roomTypeId',
        populate: {
          path: 'roomTypeId',
          select: 'name roomNumber'
        }
      })
      .sort({ createdAt: -1 });

    console.log(`Found ${payments.length} payments`);

    return res.status(200).json({
      success: true,
      data: payments,
      count: payments.length
    });
  } catch (error) {
    console.error('Error fetching hotel payments:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
};

/**
 * @desc Get all payments (Admin only)
 * @route GET /api/payments/all
 */
export const getAllPayments = async (req, res) => {
  try {
    const payments = await Payment.find()
      .populate({
        path: 'bookingId',
        select: 'guestName guestEmail confirmationCode bookingType checkInDate checkOutDate roomTypeId hotelId totalAmount',
        populate: [
          {
            path: 'roomTypeId',
            select: 'name roomNumber'
          },
          {
            path: 'hotelId',
            select: 'name'
          }
        ]
      })
      .sort({ createdAt: -1 });

    console.log(`Found ${payments.length} total payments`);

    return res.status(200).json({
      success: true,
      data: payments,
      count: payments.length
    });
  } catch (error) {
    console.error('Error fetching all payments:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
};

/**
 * @desc Get single payment by ID
 * @route GET /api/payments/:id
 */
export const getPaymentById = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate({
        path: 'bookingId',
        select: 'guestName guestEmail guestPhone confirmationCode bookingType checkInDate checkOutDate roomTypeId hotelId totalAmount',
        populate: [
          {
            path: 'roomTypeId',
            select: 'name roomNumber price'
          },
          {
            path: 'hotelId',
            select: 'name address'
          }
        ]
      });

    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: payment
    });
  } catch (error) {
    console.error('Error fetching payment:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
};

/**
 * @desc Create a payment record
 * @route POST /api/payments/create
 */
export const createPayment = async (req, res) => {
  try {
    const { bookingId, amount, status, gatewayRef } = req.body;

    // Validate booking exists
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }

    const payment = new Payment({
      bookingId,
      amount,
      status: status || 'completed',
      gatewayRef: gatewayRef || undefined
    });

    const savedPayment = await payment.save();

    // Populate the payment
    const populatedPayment = await Payment.findById(savedPayment._id)
      .populate({
        path: 'bookingId',
        select: 'guestName guestEmail confirmationCode bookingType',
        populate: {
          path: 'roomTypeId',
          select: 'name roomNumber'
        }
      });

    return res.status(201).json({
      success: true,
      message: 'Payment created successfully',
      data: populatedPayment
    });
  } catch (error) {
    console.error('Error creating payment:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
};

/**
 * @desc Get payment statistics for a hotel
 * @route GET /api/payments/stats/:hotelId
 */
export const getPaymentStats = async (req, res) => {
  try {
    const hotelId = req.params.hotelId || req.user.hotelId;

    // Get all bookings for this hotel
    const hotelBookings = await Booking.find({ hotelId }).select('_id');
    const bookingIds = hotelBookings.map(b => b._id);

    // Get all payments for these bookings
    const payments = await Payment.find({ bookingId: { $in: bookingIds } });

    const stats = {
      totalPayments: payments.length,
      totalRevenue: payments
        .filter(p => p.status === 'completed')
        .reduce((sum, p) => sum + p.amount, 0),
      completedPayments: payments.filter(p => p.status === 'completed').length,
      pendingPayments: payments.filter(p => p.status === 'pending').length,
      failedPayments: payments.filter(p => p.status === 'failed').length,
      averageTransactionValue: payments.length > 0
        ? payments.reduce((sum, p) => sum + p.amount, 0) / payments.length
        : 0
    };

    return res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching payment stats:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
};