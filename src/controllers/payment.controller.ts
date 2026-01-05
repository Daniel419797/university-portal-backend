// =============================================================================
// MIGRATION STATUS: AUTO-CONVERTED - REQUIRES MANUAL REVIEW
// =============================================================================
// This file has been automatically migrated from MongoDB to Supabase.
// Search for /* MIGRATE: */ comments to find areas needing manual completion.
// 
// Key changes needed:
// 1. Complete query conversions (findById, find, create, etc.)
// 2. Add error handling for Supabase queries
// 3. Convert .populate() to JOIN syntax
// 4. Update field names (camelCase -> snake_case)
// 5. Test all endpoints
// 
// Original backup: c:\Users\HP\Desktop\university-portal-backend\backup-mongodb-20260102-062910\payment.controller.ts
// =============================================================================
import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import paymentService from '../services/payment.service';
import notificationService from '../services/notification.service';
import { USER_ROLES, PAYMENT_STATUS } from '../utils/constants';
import { PaymentStatus } from '../types';
import { generateReference } from '../utils/helpers';

// Typed rows
interface PaymentRow {
  id: string;
  student_id: string;
  type: string;
  amount: number;
  reference: string;
  status: PaymentStatus;
  session_id: string;
  semester: string;
  payment_date: string | null;
  payment_method: string | null;
  verified_by: string | null;
  verified_at: string | null;
  created_at: string;
}

// (no extra interfaces required beyond PaymentRow)

/**
 * @desc    Initialize payment
 * @route   POST /api/v1/payments/initialize
 * @access  Private (Student)
 */
export const initializePayment = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = req.user?.userId || req.user?._id?.toString();
  const { type, amount, session, semester } = req.body as {
    type: string;
    amount: number;
    session: string;
    semester: string;
  };

  if (!userId) throw ApiError.unauthorized('User not authenticated');
  if (!type || !amount || !session || !semester) throw ApiError.badRequest('Missing required fields');

  // Verify session exists
  const { data: sessionExists, error: sessionError } = await db
    .from('sessions')
    .select('id')
    .eq('id', session)
    .maybeSingle();
  if (sessionError) throw ApiError.internal(`Failed to fetch session: ${sessionError.message}`);
  if (!sessionExists) throw ApiError.notFound('Session not found');

  // Check if payment already exists in verified or processing
  const { data: existing, error: existingError } = await db
    .from('payments')
    .select('id')
    .eq('student_id', userId)
    .eq('type', type)
    .eq('session_id', session)
    .eq('semester', semester)
    .in('status', [PAYMENT_STATUS.SUCCESSFUL, PAYMENT_STATUS.PENDING])
    .maybeSingle();
  if (existingError) throw ApiError.internal(`Failed to check existing payments: ${existingError.message}`);
  if (existing) throw ApiError.badRequest('Payment for this type already exists for the session');

  // Generate unique reference
  const reference = generateReference('PAY');

  // Initialize payment with payment service
  if (!req.user?.email) throw ApiError.badRequest('User email is required for payment');
  const paymentInit = await paymentService.initializePayment({
    email: req.user.email,
    amount,
    reference,
    metadata: { student: userId, type, session, semester },
  });

  // Create payment record
  const { data: payment, error } = await db
    .from('payments')
    .insert({
      student_id: userId,
      type,
      amount,
      reference,
      status: 'pending',
      session_id: session,
      semester,
    })
    .select()
    .single();
  if (error) throw ApiError.internal(`Failed to create payment: ${error.message}`);

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
  const db = supabaseAdmin();
  const userId = req.user?.userId || req.user?._id?.toString();
  const { reference } = req.params;

  if (!userId) throw ApiError.unauthorized('User not authenticated');

  const { data: payment, error: fetchError } = await db
    .from('payments')
    .select('*')
    .eq('reference', reference)
    .maybeSingle();
  if (fetchError) throw ApiError.internal(`Failed to fetch payment: ${fetchError.message}`);
  if (!payment) throw ApiError.notFound('Payment not found');

  // Students can only verify their own payments
  if (req.user?.role === USER_ROLES.STUDENT && payment.student_id !== userId) {
    throw ApiError.forbidden('You are not authorized to verify this payment');
  }

  // Verify with payment service
  const verification = await paymentService.verifyPayment(reference);

  if (verification.status) {
    const paidAtIso = (verification.paid_at ? new Date(verification.paid_at) : new Date()).toISOString();
    const { data: updated, error: updateError } = await db
      .from('payments')
      .update({
        status: PAYMENT_STATUS.SUCCESSFUL,
        payment_date: paidAtIso,
        payment_method: verification.channel || 'card',
        verified_at: new Date().toISOString(),
      })
      .eq('id', payment.id)
      .select()
      .single();
    if (updateError) throw ApiError.internal(`Failed to update payment: ${updateError.message}`);

    // Notify student
    await notificationService.createNotification(
      payment.student_id,
      'success',
      'Payment Verified',
      `Your ${payment.type} payment of ₦${payment.amount.toLocaleString()} has been verified successfully.`
    );

    res.json(ApiResponse.success('Payment verified successfully', updated));
  } else {
    const { error: rejectError } = await db
      .from('payments')
      .update({ status: PAYMENT_STATUS.FAILED, verified_at: new Date().toISOString() })
      .eq('id', payment.id);
    if (rejectError) throw ApiError.internal(`Failed to update payment status: ${rejectError.message}`);
    throw ApiError.badRequest('Payment verification failed');
  }
});

/**
 * @desc    Get all payments (with filtering)
 * @route   GET /api/v1/payments
 * @access  Private
 */
export const getPayments = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = req.user?.userId || req.user?._id?.toString();
  const { student, type, status, session, semester, page = 1, limit = 20 } = req.query;

  const pageNum = parseInt(page as string) || 1;
  const limitNum = parseInt(limit as string) || 20;
  const skip = (pageNum - 1) * limitNum;

  let query = db.from('payments').select('*', { count: 'exact' });

  // Role-based filter
  if (req.user?.role === USER_ROLES.STUDENT) {
    query = query.eq('student_id', userId);
  } else if (student) {
    query = query.eq('student_id', student as string);
  }

  if (type) query = query.eq('type', type as string);
  if (status) query = query.eq('status', status as string);
  if (session) query = query.eq('session_id', session as string);
  if (semester) query = query.eq('semester', semester as string);

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(skip, skip + limitNum - 1);
  if (error) throw ApiError.internal(`Failed to fetch payments: ${error.message}`);

  res.json(
    ApiResponse.success('Data retrieved successfully', {
      payments: data || [],
      pagination: {
        total: count || 0,
        page: pageNum,
        pages: Math.ceil((count || 0) / limitNum),
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
  const db = supabaseAdmin();
  const userId = req.user?.userId || req.user?._id?.toString();
  const { id } = req.params;

  const { data: payment, error } = await db
    .from('payments')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw ApiError.internal(`Failed to fetch payment: ${error.message}`);
  if (!payment) throw ApiError.notFound('Payment not found');

  // Students can only view their own payments
  if (req.user?.role === USER_ROLES.STUDENT && payment.student_id !== userId) {
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
  const db = supabaseAdmin();
  const userId = req.user?.userId || req.user?._id?.toString();
  const { id } = req.params;

  const { data: payment, error } = await db
    .from('payments')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw ApiError.internal(`Failed to fetch payment: ${error.message}`);
  if (!payment) throw ApiError.notFound('Payment not found');
  if (payment.status === PAYMENT_STATUS.SUCCESSFUL) throw ApiError.badRequest('Payment already verified');

  const paidAtIso = payment.payment_date || new Date().toISOString();
  const { data: updated, error: updateError } = await db
    .from('payments')
    .update({
      status: PAYMENT_STATUS.SUCCESSFUL,
      verified_by: userId,
      verified_at: new Date().toISOString(),
      payment_date: paidAtIso,
    })
    .eq('id', id)
    .select()
    .single();
  if (updateError) throw ApiError.internal(`Failed to update payment: ${updateError.message}`);

  await notificationService.createNotification(
    payment.student_id,
    'success',
    'Payment Verified',
    `Your ${payment.type} payment has been verified by the bursary.`
  );

  res.json(ApiResponse.success('Payment verified successfully', updated));
});

/**
 * @desc    Reject payment
 * @route   PUT /api/v1/payments/:id/reject
 * @access  Private (Bursary, Admin)
 */
export const rejectPayment = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = req.user?.userId || req.user?._id?.toString();
  const { id } = req.params;

  const { data: payment, error } = await db
    .from('payments')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw ApiError.internal(`Failed to fetch payment: ${error.message}`);
  if (!payment) throw ApiError.notFound('Payment not found');
  if (payment.status === PAYMENT_STATUS.SUCCESSFUL) throw ApiError.badRequest('Cannot reject verified payment');

  const { data: updated, error: updateError } = await db
    .from('payments')
    .update({ status: PAYMENT_STATUS.FAILED, verified_by: userId, verified_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (updateError) throw ApiError.internal(`Failed to update payment: ${updateError.message}`);

  await notificationService.createNotification(
    payment.student_id,
    'error',
    'Payment Rejected',
    `Your ${payment.type} payment has been rejected. Please contact the bursary for more information.`
  );

  res.json(ApiResponse.success('Payment rejected', updated));
});

/**
 * @desc    Get payment receipt
 * @route   GET /api/v1/payments/:id/receipt
 * @access  Private
 */
export const getPaymentReceipt = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = req.user?.userId || req.user?._id?.toString();
  const { id } = req.params;

  const { data: payment, error } = await db
    .from('payments')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw ApiError.internal(`Failed to fetch payment: ${error.message}`);
  if (!payment) throw ApiError.notFound('Payment not found');

  // Students can only get their own receipts
  if (req.user?.role === USER_ROLES.STUDENT && payment.student_id !== userId) {
    throw ApiError.forbidden('You are not authorized to access this receipt');
  }

  if (payment.status !== PAYMENT_STATUS.SUCCESSFUL) {
    throw ApiError.badRequest('Receipt only available for successful payments');
  }

  // Fetch related data
  const [{ data: student, error: studentErr }, { data: sess, error: sessErr }] = await Promise.all([
    db.from('profiles').select('first_name, last_name, student_id').eq('id', payment.student_id).maybeSingle(),
    db.from('sessions').select('name').eq('id', payment.session_id).maybeSingle(),
  ]);
  if (studentErr) throw ApiError.internal(`Failed to fetch student profile: ${studentErr.message}`);
  if (sessErr) throw ApiError.internal(`Failed to fetch session: ${sessErr.message}`);

  let verifierName = 'System';
  if (payment.verified_by) {
    const { data: verifier } = await db
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', payment.verified_by)
      .maybeSingle();
    if (verifier) verifierName = `${verifier.first_name} ${verifier.last_name}`;
  }

  const receipt = paymentService.generateReceipt({
    reference: payment.reference,
    studentName: student ? `${student.first_name} ${student.last_name}` : 'Student',
    student_id: student?.student_id || '',
    type: payment.type,
    amount: payment.amount,
    paymentDate: payment.payment_date ? new Date(payment.payment_date) : new Date(),
    status: payment.status,
    session: sess?.name || '',
    semester: payment.semester,
    verifiedBy: verifierName,
    verifiedAt: payment.verified_at ? new Date(payment.verified_at) : undefined,
  });

  res.json(ApiResponse.success('Data retrieved successfully', receipt));
});

/**
 * @desc    Get payment statistics
 * @route   GET /api/v1/payments/stats/overview
 * @access  Private (Bursary, Admin)
 */
export const getPaymentStats = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { session, semester } = req.query;

  let query = db.from('payments').select('*');
  if (session) query = query.eq('session_id', session as string);
  if (semester) query = query.eq('semester', semester as string);

  const { data, error } = await query;
  if (error) throw ApiError.internal(`Failed to fetch payments: ${error.message}`);
  const rows = (data || []) as PaymentRow[];

  const byTypeMap = new Map<
    string,
    {
      totalAmount: number;
      verifiedAmount: number;
      pendingAmount: number;
      count: number;
      verifiedCount: number;
      pendingCount: number;
      rejectedCount: number;
    }
  >();

  let totalRevenue = 0;
  let totalPayments = 0;
  let verifiedPayments = 0;
  let pendingPayments = 0;
  let rejectedPayments = 0;

  for (const p of rows) {
    totalPayments += 1;
    const entry = byTypeMap.get(p.type) || {
      totalAmount: 0,
      verifiedAmount: 0,
      pendingAmount: 0,
      count: 0,
      verifiedCount: 0,
      pendingCount: 0,
      rejectedCount: 0,
    };
    entry.totalAmount += p.amount;
    entry.count += 1;
    if (p.status === PAYMENT_STATUS.SUCCESSFUL) {
      entry.verifiedAmount += p.amount;
      entry.verifiedCount += 1;
      totalRevenue += p.amount;
      verifiedPayments += 1;
    } else if (p.status === PAYMENT_STATUS.PENDING) {
      entry.pendingAmount += p.amount;
      entry.pendingCount += 1;
      pendingPayments += 1;
    } else if (p.status === PAYMENT_STATUS.FAILED) {
      entry.rejectedCount += 1;
      rejectedPayments += 1;
    }
    byTypeMap.set(p.type, entry);
  }

  const byType = Array.from(byTypeMap.entries()).map(([type, stats]) => ({ type, ...stats }));

  res.json(
    ApiResponse.success('Data retrieved successfully', {
      byType,
      overall: {
        totalRevenue,
        totalPayments,
        verifiedPayments,
        pendingPayments,
        rejectedPayments,
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
  const db = supabaseAdmin();
  const { studentId } = req.params;

  // Students can only view their own payment history
  if (req.user?.role === USER_ROLES.STUDENT && (req.user?.userId || req.user?._id?.toString()) !== studentId) {
    throw ApiError.forbidden('You can only view your own payment history');
  }

  const { data: payments, error } = await db
    .from('payments')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });
  if (error) throw ApiError.internal(`Failed to fetch payments: ${error.message}`);

  const rows = (payments || []) as PaymentRow[];
  const summary = {
    totalPaid: rows.filter((p) => p.status === PAYMENT_STATUS.SUCCESSFUL).reduce((sum, p) => sum + p.amount, 0),
    totalPending: rows.filter((p) => p.status === PAYMENT_STATUS.PENDING).reduce((sum, p) => sum + p.amount, 0),
    verifiedCount: rows.filter((p) => p.status === PAYMENT_STATUS.SUCCESSFUL).length,
    pendingCount: rows.filter((p) => p.status === PAYMENT_STATUS.PENDING).length,
    rejectedCount: rows.filter((p) => p.status === PAYMENT_STATUS.FAILED).length,
  };

  res.json(ApiResponse.success('Data retrieved successfully', { summary, payments: rows }));
});

