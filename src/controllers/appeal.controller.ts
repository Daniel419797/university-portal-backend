import { Request, Response } from 'express';
import GradeAppeal from '../models/GradeAppeal.model';
import Result from '../models/Result.model';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';

export const submitGradeAppeal = asyncHandler(async (req: Request, res: Response) => {
  const studentId = (req as any).user._id;
  const { resultId, reason, preferredResolution, attachments } = req.body;

  if (!resultId || !reason) {
    throw ApiError.badRequest('Result and reason are required');
  }

  const result = await Result.findById(resultId).populate('course');
  if (!result) {
    throw ApiError.notFound('Result not found');
  }

  if (result.student.toString() !== studentId.toString()) {
    throw ApiError.forbidden('You can only appeal your own results');
  }

  if (!result.isPublished) {
    throw ApiError.badRequest('You can only appeal published results');
  }

  const existingAppeal = await GradeAppeal.findOne({ student: studentId, result: resultId });
  if (existingAppeal) {
    throw ApiError.badRequest('You have already submitted an appeal for this result');
  }

  const appeal = await GradeAppeal.create({
    student: studentId,
    result: resultId,
    course: (result.course as any)?._id,
    reason,
    preferredResolution,
    attachments: attachments || [],
  });

  res.status(201).json(
    ApiResponse.success('Grade appeal submitted successfully', appeal)
  );
});

export const getStudentGradeAppeals = asyncHandler(async (req: Request, res: Response) => {
  const studentId = (req as any).user._id;
  const { status } = req.query;

  const query: Record<string, unknown> = { student: studentId };
  if (status) {
    query.status = status;
  }

  const appeals = await GradeAppeal.find(query)
    .populate('course', 'code title credits')
    .populate('result', 'totalScore grade gradePoints semester session')
    .sort({ createdAt: -1 });

  res.json(
    ApiResponse.success('Grade appeals retrieved successfully', {
      appeals,
      total: appeals.length,
    })
  );
});
