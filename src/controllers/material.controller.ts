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
// Original backup: c:\Users\HP\Desktop\university-portal-backend\backup-mongodb-20260102-062910\material.controller.ts
// =============================================================================
import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { USER_ROLES } from '../utils/constants';
import uploadService from '../services/upload.service';

// Typed rows for safety
interface MaterialRow {
  id: string;
  course_id: string;
  title: string;
  description?: string | null;
  type: string;
  file_url: string;
  file_name: string;
  file_size: number;
  uploaded_by: string;
  uploaded_at?: string;
  downloads: number;
  is_active: boolean;
}

interface ProfileRow {
  id: string; // user id
  first_name: string;
  last_name: string;
}

// @desc    Upload course material (Lecturer)
// @route   POST /api/v1/courses/:id/materials
// @access  Private (Lecturer)
export const uploadCourseMaterial = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { id: courseId } = req.params;
  const userId = req.user?.userId || req.user?._id?.toString();
  const { title, description, type } = req.body as { title: string; description?: string; type?: string };

  if (!userId) throw ApiError.unauthorized('User not authenticated');
  if (!title) throw ApiError.badRequest('Title is required');

  // Verify course exists and user is the instructor or admin
  const { data: course, error: courseError } = await db
    .from('courses')
    .select('id, lecturer_id')
    .eq('id', courseId)
    .maybeSingle();

  if (courseError) throw ApiError.internal(`Failed to fetch course: ${courseError.message}`);
  if (!course) throw ApiError.notFound('Course not found');

  if (req.user?.role !== USER_ROLES.ADMIN && course.lecturer_id !== userId) {
    throw ApiError.forbidden('Not authorized to upload materials for this course');
  }

  // Check if file was uploaded
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) {
    throw ApiError.badRequest('Please upload a file');
  }

  // Upload to Cloudinary
  const uploadResult = file.buffer
    ? await uploadService.uploadFromBuffer(file.buffer, file.originalname, 'course-materials')
    : await uploadService.uploadFile(file.path, 'course-materials', 'raw');

  // Create material record
  const { data: material, error } = await db
    .from('course_materials')
    .insert({
      course_id: courseId,
      title,
      description: description || null,
      type: type || 'pdf',
      file_url: uploadResult.url,
      file_name: file.originalname,
      file_size: file.size,
      uploaded_by: userId,
      is_active: true,
      downloads: 0,
    })
    .select()
    .single();

  if (error) throw ApiError.internal(`Failed to create material: ${error.message}`);

  res.status(201).json(ApiResponse.success('Material uploaded successfully', material));
});

// @desc    Get course materials (Students & Lecturers)
// @route   GET /api/v1/courses/:id/materials
// @access  Private
export const getCourseMaterials = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { id: courseId } = req.params;
  const userId = req.user?.userId || req.user?._id?.toString();
  const userRole = req.user?.role;

  if (!userId) throw ApiError.unauthorized('User not authenticated');

  // Verify course exists
  const { data: course, error: courseError } = await db
    .from('courses')
    .select('id, lecturer_id')
    .eq('id', courseId)
    .maybeSingle();

  if (courseError) throw ApiError.internal(`Failed to fetch course: ${courseError.message}`);
  if (!course) throw ApiError.notFound('Course not found');

  // If student, verify enrollment
  if (userRole === USER_ROLES.STUDENT) {
    const { data: enrollment } = await db
      .from('enrollments')
      .select('id')
      .eq('student_id', userId)
      .eq('course_id', courseId)
      .eq('status', 'active')
      .maybeSingle();

    if (!enrollment) {
      throw ApiError.forbidden('You are not enrolled in this course');
    }
  }

  // If lecturer, verify they're teaching the course (non-admin)
  if (userRole === USER_ROLES.LECTURER && course.lecturer_id !== userId) {
    throw ApiError.forbidden('Not authorized to view materials for this course');
  }

  // Get materials
  const { data: materials, error } = await db
    .from('course_materials')
    .select('*')
    .eq('course_id', courseId)
    .eq('is_active', true)
    .order('uploaded_at', { ascending: false });

  if (error) throw ApiError.internal(`Failed to fetch materials: ${error.message}`);

  const items = (materials || []) as MaterialRow[];
  const uploaderIds = Array.from(new Set(items.map((m) => m.uploaded_by).filter(Boolean)));

  const profilesMap = new Map<string, ProfileRow>();
  if (uploaderIds.length > 0) {
    const { data: profiles, error: profilesError } = await db
      .from('profiles')
      .select('id, first_name, last_name')
      .in('id', uploaderIds);
    if (profilesError) throw ApiError.internal(`Failed to fetch uploader profiles: ${profilesError.message}`);
    (profiles || []).forEach((p) => profilesMap.set(p.id, p as ProfileRow));
  }

  res.json(
    ApiResponse.success('Materials fetched successfully', {
      materials: items.map((m) => {
        const uploader = profilesMap.get(m.uploaded_by);
        return {
          id: m.id,
          title: m.title,
          description: m.description,
          type: m.type,
          fileUrl: m.file_url,
          fileName: m.file_name,
          fileSize: m.file_size,
          uploadedBy: uploader ? { name: `${uploader.first_name} ${uploader.last_name}` } : { name: undefined },
          uploadedAt: m.uploaded_at,
          downloads: m.downloads,
        };
      }),
      total: items.length,
    })
  );
});

// @desc    Download course material
// @route   POST /api/v1/courses/:id/materials/:materialId/download
// @access  Private (Student)
export const downloadCourseMaterial = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { id: courseId, materialId } = req.params;
  const userId = req.user?.userId || req.user?._id?.toString();

  if (!userId) throw ApiError.unauthorized('User not authenticated');

  // Verify enrollment
  const { data: enrollment } = await db
    .from('enrollments')
    .select('id')
    .eq('student_id', userId)
    .eq('course_id', courseId)
    .eq('status', 'active')
    .maybeSingle();

  if (!enrollment) {
    throw ApiError.forbidden('You are not enrolled in this course');
  }

  // Get material
  const { data: material, error: materialError } = await db
    .from('course_materials')
    .select('*')
    .eq('id', materialId)
    .maybeSingle();

  if (materialError) throw ApiError.internal(`Failed to fetch material: ${materialError.message}`);
  if (!material) throw ApiError.notFound('Material not found');
  if (material.course_id !== courseId) {
    throw ApiError.badRequest('Material does not belong to this course');
  }

  // Increment download count
  const newDownloads = (material.downloads || 0) + 1;
  const { error: updateError } = await db
    .from('course_materials')
    .update({ downloads: newDownloads, updated_at: new Date().toISOString() })
    .eq('id', materialId);

  if (updateError) throw ApiError.internal(`Failed to update download count: ${updateError.message}`);

  res.json(
    ApiResponse.success('Material download link retrieved', {
      fileUrl: material.file_url,
      fileName: material.file_name,
      fileSize: material.file_size,
    })
  );
});

// @desc    Delete course material (Lecturer)
// @route   DELETE /api/v1/courses/:id/materials/:materialId
// @access  Private (Lecturer)
export const deleteCourseMaterial = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { id: courseId, materialId } = req.params;
  const userId = req.user?.userId || req.user?._id?.toString();

  if (!userId) throw ApiError.unauthorized('User not authenticated');

  // Verify course and authorization
  const { data: course, error: courseError } = await db
    .from('courses')
    .select('id, lecturer_id')
    .eq('id', courseId)
    .maybeSingle();

  if (courseError) throw ApiError.internal(`Failed to fetch course: ${courseError.message}`);
  if (!course) throw ApiError.notFound('Course not found');

  if (req.user?.role !== USER_ROLES.ADMIN && course.lecturer_id !== userId) {
    throw ApiError.forbidden('Not authorized to delete materials for this course');
  }

  // Get material
  const { data: material, error: materialError } = await db
    .from('course_materials')
    .select('*')
    .eq('id', materialId)
    .maybeSingle();

  if (materialError) throw ApiError.internal(`Failed to fetch material: ${materialError.message}`);
  if (!material) throw ApiError.notFound('Material not found');
  if (material.course_id !== courseId) {
    throw ApiError.badRequest('Material does not belong to this course');
  }

  // Delete from Cloudinary (if it's a Cloudinary URL)
  if (material.file_url && material.file_url.includes('cloudinary')) {
    try {
      const publicId = material.file_url.split('/').slice(-2).join('/').split('.')[0];
      await uploadService.deleteFile(publicId, 'raw');
    } catch (err) {
      // Best-effort delete; log and continue
      console.error('Error deleting from Cloudinary:', err);
    }
  }

  // Soft delete
  const { error: deleteError } = await db
    .from('course_materials')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', materialId);

  if (deleteError) throw ApiError.internal(`Failed to delete material: ${deleteError.message}`);

  res.json(ApiResponse.success('Material deleted successfully', null));
});

