import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';

type ResultRow = { id: string; student_id: string; course_id?: string | null; is_published: boolean };

export const submitGradeAppeal = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const studentId = req.user?.userId;
  const { resultId, reason, preferredResolution, attachments } = req.body as {
    resultId: string;
    reason: string;
    preferredResolution?: string;
    attachments?: string[];
  };

  if (!studentId) throw ApiError.unauthorized('User not authenticated');
  if (!resultId || !reason) throw ApiError.badRequest('Result and reason are required');

  const { data: result, error: resultError } = await db
    .from('results')
    .select('id, student_id, course_id, is_published')
    .eq('id', resultId)
    .maybeSingle();
  if (resultError) throw ApiError.internal(`Failed to fetch result: ${resultError.message}`);
  if (!result) throw ApiError.notFound('Result not found');

  const r = result as ResultRow;
  if (r.student_id !== studentId) throw ApiError.forbidden('You can only appeal your own results');
  if (!r.is_published) throw ApiError.badRequest('You can only appeal published results');

  const { data: existingAppeal } = await db
    .from('grade_appeals')
    .select('id')
    .eq('student_id', studentId)
    .eq('result_id', resultId)
    .maybeSingle();
  if (existingAppeal) throw ApiError.badRequest('You have already submitted an appeal for this result');

  const { data: appeal, error: insertError } = await db
    .from('grade_appeals')
    .insert({
      student_id: studentId,
      result_id: resultId,
      course_id: r.course_id ?? null,
      reason,
      preferred_resolution: preferredResolution ?? null,
      attachments: attachments || [],
      status: 'pending',
    })
    .select()
    .single();
  if (insertError) throw ApiError.internal(`Failed to submit grade appeal: ${insertError.message}`);

  res.status(201).json(ApiResponse.success('Grade appeal submitted successfully', appeal));
});

export const getStudentGradeAppeals = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const studentId = req.user?.userId;
  const { status } = req.query as Record<string, string | undefined>;
  if (!studentId) throw ApiError.unauthorized('User not authenticated');

  let query = db.from('grade_appeals').select('*', { count: 'exact' }).eq('student_id', studentId);
  if (status) query = query.eq('status', status);
  query = query.order('created_at', { ascending: false });

  const { data: appeals, count, error } = await query;
  if (error) throw ApiError.internal(`Failed to fetch grade appeals: ${error.message}`);

  res.json(ApiResponse.success('Grade appeals retrieved successfully', { appeals: appeals || [], total: count || 0 }));
});

