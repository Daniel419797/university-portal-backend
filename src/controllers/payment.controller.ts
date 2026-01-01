import { Request, Response } from 'express';
import Payment from '../models/Payment.model';
import Session from '../models/Session.model';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import paymentService from '../services/payment.service';
import notificationService from '../services/notification.service';
import { USER_ROLES } from '../utils/constants';
import { generateReference } from '../utils/helpers';

/**
 * @desc    Initialize payment
 * @route   POST /api/v1/payments/initialize
 * @access  Private (Student)
 */
export const initializePayment = asyncHandler(async (req: Request, res: Response) => {
  const { type, amount, session, semester } = req.body;

  // Verify session exists
  const sessionExists = await Session.findById(session);
  if (!sessionExists) {
    throw ApiError.notFound('Session not found');
  }

  // Check if payment already exists
  const existingPayment = await Payment.findOne({
    student: (req as any).user._id,
    type,
    session,
    semester,
    status: { $in: ['verified', 'processing'] },
  });

  if (existingPayment) {
    throw ApiError.badRequest('Payment for this type already exists for the session');
  }

  // Generate unique reference
  const reference = generateReference('PAY');

  // Initialize payment with payment service
  const paymentInit = await paymentService.initializePayment({
    email: (req as any).user.email,
    amount,
    reference,
    metadata: {
      student: (req as any).user._id,
      type,
      session,
      semester,
    },
  });

  // Create payment record
  const payment = await Payment.create({
    student: (req as any).user._id,
    type,
    amount,
    reference,
    status: 'pending',
    session,
    semester,
  });

  res.status(201).json(
    ApiResponse.success('Payment initialized successfully', {
      payment,
      authorization_url: paymentInit.data.authorization_url,
      access_code: paymentInit.data.access_code,
    })
  );
});

/**
 * @desc    Verify payment
 * @route   GET /api/v1/payments/verify/:reference
 * @access  Private
 */
export const verifyPayment = asyncHandler(async (req: Request, res: Response) => {
  const { reference } = req.params;

  const payment = await Payment.findOne({ reference });
  if (!payment) {
    throw ApiError.notFound('Payment not found');
  }

  // Students can only verify their own payments
  if (
    (req as any).user.role === USER_ROLES.STUDENT &&
    payment.student.toString() !== (req as any).user._id.toString()
  ) {
    throw ApiError.forbidden('You are not authorized to verify this payment');
  }

  // Verify with payment service
  const verification = await paymentService.verifyPayment(reference);

  if (verification.status) {
    payment.status = 'verified';
    payment.paymentDate = new Date(verification.paid_at || Date.now());
    payment.paymentMethod = verification.channel || 'card';
    await payment.save();

    // Notify student
    await notificationService.createNotification(
      payment.student.toString(),
      'success',
      'Payment Verified',
      `Your ${payment.type} payment of ₦${payment.amount} has been verified successfully.`
    );

    res.json(ApiResponse.success('Payment verified successfully', payment));
  } else {
    payment.status = 'rejected';
    await payment.save();

    throw ApiError.badRequest('Payment verification failed');
  }
});

/**
 * @desc    Get all payments (with filtering)
 * @route   GET /api/v1/payments
 * @access  Private
 */
export const getPayments = asyncHandler(async (req: Request, res: Response) => {
  const { student, type, status, session, semester, page = 1, limit = 20 } = req.query;

  const query: Record<string, unknown> = {};

  // Students can only see their own payments
  if ((req as any).user.role === USER_ROLES.STUDENT) {
    query.student = (req as any).user._id;
  } else {
    if (student) query.student = student;
  }

  if (type) query.type = type;
  if (status) query.status = status;
  if (session) query.session = session;
  if (semester) query.semester = semester;

  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;

  const [payments, total] = await Promise.all([
    Payment.find(query)
      .populate('student', 'firstName lastName email studentId')
      .populate('session', 'name')
      .populate('verifiedBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    Payment.countDocuments(query),
  ]);

  res.json(
    ApiResponse.success('Data retrieved successfully', {
      payments,
      pagination: {
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum),
        limit: limitNum,
      },
    })
  );
});

/**
 * @desc    Get single payment by ID
 * @route   GET /api/v1/payments/:id
 * @access  Private
 */
export const getPaymentById = asyncHandler(async (req: Request, res: Response) => {
  const payment = await Payment.findById(req.params.id)
    .populate('student', 'firstName lastName email studentId')
    .populate('session', 'name')
    .populate('verifiedBy', 'firstName lastName');

  if (!payment) {
    throw ApiError.notFound('Payment not found');
  }

  // Students can only view their own payments
  if (
    (req as any).user.role === USER_ROLES.STUDENT &&
    payment.student._id.toString() !== (req as any).user._id.toString()
  ) {
    throw ApiError.forbidden('You are not authorized to view this payment');
  }

  res.json(ApiResponse.success('Data retrieved successfully', payment));
});

/**
 * @desc    Manually verify payment (Bursary/Admin)
 * @route   PUT /api/v1/payments/:id/verify
 * @access  Private (Bursary, Admin)
 */
export const manuallyVerifyPayment = asyncHandler(async (req: Request, res: Response) => {
  const payment = await Payment.findById(req.params.id);

  if (!payment) {
    throw ApiError.notFound('Payment not found');
  }

  if (payment.status === 'verified') {
    throw ApiError.badRequest('Payment already verified');
  }

  payment.status = 'verified';
  payment.verifiedBy = (req as any).user._id;
  payment.verifiedAt = new Date();
  payment.paymentDate = payment.paymentDate || new Date();

  await payment.save();

  // Notify student
  await notificationService.createNotification(
    payment.student.toString(),
    'success',
    'Payment Verified',
    `Your ${payment.type} payment has been verified by the bursary.`
  );

  res.json(ApiResponse.success('Payment verified successfully', payment));
});

/**
 * @desc    Reject payment
 * @route   PUT /api/v1/payments/:id/reject
 * @access  Private (Bursary, Admin)
 */
export const rejectPayment = asyncHandler(async (req: Request, res: Response) => {
  const payment = await Payment.findById(req.params.id);

  if (!payment) {
    throw ApiError.notFound('Payment not found');
  }

  if (payment.status === 'verified') {
    throw ApiError.badRequest('Cannot reject verified payment');
  }

  payment.status = 'rejected';
  payment.verifiedBy = (req as any).user._id;
  payment.verifiedAt = new Date();

  await payment.save();

  // Notify student
  await notificationService.createNotification(
    payment.student.toString(),
    'error',
    'Payment Rejected',
    `Your ${payment.type} payment has been rejected. Please contact the bursary for more information.`
  );

  res.json(ApiResponse.success('Payment rejected', payment));
});

/**
 * @desc    Get payment receipt
 * @route   GET /api/v1/payments/:id/receipt
 * @access  Private
 */
export const getPaymentReceipt = asyncHandler(async (req: Request, res: Response) => {
  const payment = await Payment.findById(req.params.id)
    .populate('student', 'firstName lastName email studentId')
    .populate('session', 'name')
    .populate('verifiedBy', 'firstName lastName');

  if (!payment) {
    throw ApiError.notFound('Payment not found');
  }

  // Students can only get their own receipts
  if (
    (req as any).user.role === USER_ROLES.STUDENT &&
    payment.student._id.toString() !== (req as any).user._id.toString()
  ) {
    throw ApiError.forbidden('You are not authorized to access this receipt');
  }

  if (payment.status !== 'verified') {
    throw ApiError.badRequest('Receipt only available for verified payments');
  }

  const receipt = paymentService.generateReceipt({
    reference: payment.reference,
    studentName: `${(payment.student as any).firstName} ${(payment.student as any).lastName}`,
    studentId: (payment.student as any).studentId,
    type: payment.type,
    amount: payment.amount,
    paymentDate: payment.paymentDate,
    status: payment.status,
    session: (payment.session as any).name,
    semester: payment.semester,
    verifiedBy: payment.verifiedBy
      ? `${(payment.verifiedBy as any).firstName} ${(payment.verifiedBy as any).lastName}`
      : 'System',
    verifiedAt: payment.verifiedAt,
  });

  res.json(ApiResponse.success('Data retrieved successfully', receipt));
});

/**
 * @desc    Get payment statistics
 * @route   GET /api/v1/payments/stats/overview
 * @access  Private (Bursary, Admin)
 */
export const getPaymentStats = asyncHandler(async (req: Request, res: Response) => {
  const { session, semester } = req.query;

  const matchStage: Record<string, unknown> = {};
  if (session) matchStage.session = session;
  if (semester) matchStage.semester = semester;

  const stats = await Payment.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$type',
        totalAmount: { $sum: '$amount' },
        verifiedAmount: {
          $sum: { $cond: [{ $eq: ['$status', 'verified'] }, '$amount', 0] },
        },
        pendingAmount: {
          $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0] },
        },
        count: { $sum: 1 },
        verifiedCount: { $sum: { $cond: [{ $eq: ['$status', 'verified'] }, 1, 0] } },
        pendingCount: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
        rejectedCount: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
      },
    },
  ]);

  const overallStats = await Payment.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalRevenue: {
          $sum: { $cond: [{ $eq: ['$status', 'verified'] }, '$amount', 0] },
        },
        totalPayments: { $sum: 1 },
        verifiedPayments: { $sum: { $cond: [{ $eq: ['$status', 'verified'] }, 1, 0] } },
        pendingPayments: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
        rejectedPayments: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
      },
    },
  ]);

  res.json(
    ApiResponse.success('Data retrieved successfully', {
      byType: stats,
      overall: overallStats[0] || {
        totalRevenue: 0,
        totalPayments: 0,
        verifiedPayments: 0,
        pendingPayments: 0,
        rejectedPayments: 0,
      },
    })
  );
});

/**
 * @desc    Get student payment history
 * @route   GET /api/v1/payments/student/:studentId
 * @access  Private
 */
export const getStudentPayments = asyncHandler(async (req: Request, res: Response) => {
  const { studentId } = req.params;

  // Students can only view their own payment history
  if ((req as any).user.role === USER_ROLES.STUDENT && (req as any).user._id.toString() !== studentId) {
    throw ApiError.forbidden('You can only view your own payment history');
  }

  const payments = await Payment.find({ student: studentId })
    .populate('session', 'name')
    .sort({ createdAt: -1 });

  const summary = {
    totalPaid: payments
      .filter((p: any) => p.status === 'verified')
      .reduce((sum: number, p: any) => sum + p.amount, 0),
    totalPending: payments
      .filter((p: any) => p.status === 'pending')
      .reduce((sum: number, p: any) => sum + p.amount, 0),
    verifiedCount: payments.filter((p: any) => p.status === 'verified').length,
    pendingCount: payments.filter((p: any) => p.status === 'pending').length,
    rejectedCount: payments.filter((p: any) => p.status === 'rejected').length,
  };

  res.json(ApiResponse.success('Data retrieved successfully', { summary, payments }));
});
