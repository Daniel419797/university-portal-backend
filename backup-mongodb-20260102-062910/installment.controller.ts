import { Request, Response } from 'express';
import InstallmentPlan from '../models/InstallmentPlan.model';
import Session from '../models/Session.model';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';

export const createInstallmentPlan = asyncHandler(async (req: Request, res: Response) => {
  const studentId = (req as any).user._id;
  const { paymentType, session, semester, totalAmount, installments } = req.body;

  if (!paymentType || !session || !semester || !totalAmount || !installments?.length) {
    throw ApiError.badRequest('Payment type, session, semester, amount, and installments are required');
  }

  const sessionExists = await Session.findById(session);
  if (!sessionExists) {
    throw ApiError.notFound('Session not found');
  }

  const sum = installments.reduce((acc: number, installment: any) => acc + Number(installment.amount || 0), 0);
  if (Math.abs(sum - Number(totalAmount)) > 1) {
    throw ApiError.badRequest('Installment amounts must add up to the total amount');
  }

  const existingPlan = await InstallmentPlan.findOne({
    student: studentId,
    paymentType,
    session,
    semester,
  });

  if (existingPlan) {
    throw ApiError.badRequest('You already created an installment plan for this payment and session');
  }

  const plan = await InstallmentPlan.create({
    student: studentId,
    paymentType,
    session,
    semester,
    totalAmount,
    installments: installments.map((item: any) => ({
      dueDate: item.dueDate,
      amount: item.amount,
      status: 'pending',
    })),
  });

  res.status(201).json(
    ApiResponse.success('Installment plan created successfully', plan)
  );
});

export const getStudentInstallmentPlans = asyncHandler(async (req: Request, res: Response) => {
  const studentId = (req as any).user._id;

  const plans = await InstallmentPlan.find({ student: studentId })
    .populate('session', 'name')
    .sort({ createdAt: -1 });

  const normalizedPlans = plans.map((plan) => {
    const planObj: any = plan.toObject();
    planObj.installments = planObj.installments.map((installment: any) => {
      if (installment.status === 'pending' && new Date(installment.dueDate) < new Date()) {
        return { ...installment, status: 'overdue' };
      }
      return installment;
    });
    return planObj;
  });

  res.json(
    ApiResponse.success('Installment plans retrieved successfully', {
      plans: normalizedPlans,
      total: normalizedPlans.length,
    })
  );
});

