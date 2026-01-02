import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';

type InstallmentStatus = 'pending' | 'overdue' | 'paid';

interface InstallmentItem {
  due_date: string; // ISO date
  amount: number;
  status: InstallmentStatus;
}

interface InstallmentPlanRow {
  id: string;
  student_id: string;
  payment_type: string;
  session_id: string;
  semester: string;
  total_amount: number;
  installments: InstallmentItem[];
  created_at?: string;
  updated_at?: string;
}

export const createInstallmentPlan = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const studentId = req.user!.userId as string;
  const { paymentType, session, semester, totalAmount, installments } = req.body as {
    paymentType: string;
    session: string;
    semester: string;
    totalAmount: number | string;
    installments: Array<{ dueDate: string; amount: number | string }>;
  };

  if (!paymentType || !session || !semester || !totalAmount || !installments?.length) {
    throw ApiError.badRequest('Payment type, session, semester, amount, and installments are required');
  }

  const { data: sessionRow, error: sessionErr } = await db
    .from('sessions')
    .select('id')
    .eq('id', session)
    .maybeSingle();
  if (sessionErr) throw ApiError.internal(`Failed to verify session: ${sessionErr.message}`);
  if (!sessionRow) throw ApiError.notFound('Session not found');

  const numericTotal = Number(totalAmount);
  const sum = installments.reduce((acc: number, it) => acc + Number(it.amount || 0), 0);
  if (Math.abs(sum - numericTotal) > 1) {
    throw ApiError.badRequest('Installment amounts must add up to the total amount');
  }

  const { data: existing, error: existErr } = await db
    .from('installment_plans')
    .select('id')
    .eq('student_id', studentId)
    .eq('payment_type', paymentType)
    .eq('session_id', session)
    .eq('semester', semester)
    .limit(1)
    .maybeSingle();
  if (existErr) throw ApiError.internal(`Failed to check existing plan: ${existErr.message}`);
  if (existing) throw ApiError.badRequest('You already created an installment plan for this payment and session');

  const payload = {
    student_id: studentId,
    payment_type: paymentType,
    session_id: session,
    semester,
    total_amount: numericTotal,
    installments: installments.map((item) => ({
      due_date: item.dueDate,
      amount: Number(item.amount),
      status: 'pending' as InstallmentStatus,
    })),
  } satisfies Omit<InstallmentPlanRow, 'id'>;

  const { data, error } = await db
    .from('installment_plans')
    .insert(payload)
    .select('*')
    .maybeSingle();
  if (error) throw ApiError.internal(`Failed to create installment plan: ${error.message}`);
  if (!data) throw ApiError.internal('Failed to create installment plan');

  res.status(201).json(ApiResponse.success('Installment plan created successfully', data));
});

export const getStudentInstallmentPlans = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const studentId = req.user!.userId as string;

  const { data, error } = await db
    .from('installment_plans')
    .select('*')
    .eq('student_id', studentId);
  if (error) throw ApiError.internal(`Failed to fetch installment plans: ${error.message}`);

  const rows = (data ?? []) as InstallmentPlanRow[];
  const now = new Date();

  const normalizedPlans = rows.map((plan) => {
    const normalizedItems = (plan.installments ?? []).map((inst) => {
      const due = new Date(inst.due_date);
      if (inst.status === 'pending' && due < now) {
        return { ...inst, status: 'overdue' as InstallmentStatus };
      }
      return inst;
    });
    return { ...plan, installments: normalizedItems };
  });

  res.json(
    ApiResponse.success('Installment plans retrieved successfully', {
      plans: normalizedPlans,
      total: normalizedPlans.length,
    })
  );
});

