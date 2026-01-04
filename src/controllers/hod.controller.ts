
import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { calculateGPA } from '../utils/helpers';

// HOD Staff list for /hod/staff
export const getHodStaff = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = req.user?.userId;
  if (!userId) throw ApiError.unauthorized('Unauthorized');
  const department = await ensureDepartmentForHod(db, userId);
  const { page, limit, skip } = getPagination(req.query.page, req.query.limit);
  const search = normalizeQueryValue(req.query.search);

  let base = db
    .from('profiles')
    .select('id,first_name,last_name,email,phone_number,is_active,created_at', { count: 'exact' })
    .eq('role', 'lecturer')
    .eq('department_id', department.id);

  if (search) {
    const q = `%${search}%`;
    base = base.or(`first_name.ilike.${q},last_name.ilike.${q},email.ilike.${q}`);
  }

  const { data: staffData, count, error } = await base.range(skip, skip + limit - 1);
  if (error) throw ApiError.internal(`Failed to fetch staff: ${error.message}`);
  const staff = (staffData ?? []) as ProfileRow[];
  const total = count ?? 0;

  res.json(
    ApiResponse.success('Staff retrieved successfully', {
      staff,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  );
});

// HOD Analytics for /hod/analytics
export const getHodAnalytics = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = req.user?.userId;
  if (!userId) throw ApiError.unauthorized('Unauthorized');
  const department = await ensureDepartmentForHod(db, userId);
  const stats = await collectDepartmentStats(db, department.id);
  const courses = await getRows<CourseRow>(db.from('courses').select('id').eq('department_id', department.id));
  const courseIds = courses.map((course) => course.id);

  if (!courseIds.length) {
    return res.json(
      ApiResponse.success('Analytics retrieved successfully', {
        ...stats,
        passRate: 0,
        publishedResults: 0,
      })
    );
  }

  const [publishedResults, passedResults] = await Promise.all([
    getExactCount(db.from('results').select('id', { count: 'exact', head: true }).in('course_id', courseIds).eq('is_published', true)),
    getExactCount(db.from('results').select('id', { count: 'exact', head: true }).in('course_id', courseIds).eq('is_published', true).neq('grade', 'F')),
  ]);

  const passRate = publishedResults
    ? parseFloat(((passedResults / publishedResults) * 100).toFixed(1))
    : 0;

  return res.json(
    ApiResponse.success('Analytics retrieved successfully', {
      ...stats,
      publishedResults,
      passRate,
      averageClassSize:
        stats.courseCount > 0 ? parseFloat(((stats.activeEnrollments / stats.courseCount)).toFixed(1)) : 0,
    })
  );
});

type DepartmentRow = { id: string; name?: string; faculty?: string; is_active?: boolean; hod_id?: string };
type ProfileRow = { id: string; role: string; first_name: string; last_name: string; email: string; student_id?: string; level?: string; phone_number?: string; is_active?: boolean; department_id?: string; created_at?: string };
type CourseRow = { id: string; code: string; title: string; level?: string; semester?: string; credits?: number; schedule?: string; department_id?: string; lecturer_id?: string };
type ResultRow = { id: string; course_id: string; total_score?: number; grade_points?: number; grade?: string; is_published?: boolean; approved_by_hod?: boolean; course_details?: { id: string; credits?: number; department_id?: string } };
type EnrollmentRow = { id: string; student_id: string; course_id: string; status?: string };

const getExactCount = async (query: unknown): Promise<number> => {
  const { count, error } = await (query as unknown as Promise<{ count: number | null; error: { message?: string } | null }>);
  if (error) throw new Error(error.message);
  return count ?? 0;
};

const getRows = async <T>(query: unknown): Promise<T[]> => {
  const { data, error } = await (query as unknown as Promise<{ data: T[] | null; error: { message?: string } | null }>);
  if (error) throw new Error(error.message);
  return data ?? [];
};

const getSingle = async <T>(query: unknown): Promise<T | null> => {
  const { data, error } = await (query as unknown as Promise<{ data: T | null; error: { message?: string } | null }>);
  if (error) throw new Error(error.message);
  return data;
};

const ensureDepartmentForHod = async (db: ReturnType<typeof supabaseAdmin>, hodId: string): Promise<DepartmentRow> => {
  const department = await getSingle<DepartmentRow>(
    db
      .from('departments')
      .select('id,name,faculty,is_active,hod_id')
      .eq('hod_id', hodId)
      .limit(1)
  );
  if (!department || !department.id) {
    throw ApiError.forbidden('You are not assigned to any department');
  }
  return department;
};

const normalizeQueryValue = (value: unknown): string | undefined => {
  if (Array.isArray(value)) {
    return value[0];
  }
  if (value === undefined || value === null) {
    return undefined;
  }
  return String(value);
};

const getPagination = (pageValue: unknown, limitValue: unknown) => {
  const pageNum = Math.max(parseInt(normalizeQueryValue(pageValue) ?? '1', 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(normalizeQueryValue(limitValue) ?? '20', 10) || 20, 1), 100);
  const skip = (pageNum - 1) * limitNum;
  return { page: pageNum, limit: limitNum, skip };
};

export const getHodStudents = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = req.user?.userId;
  if (!userId) throw ApiError.unauthorized('Unauthorized');
  const department = await ensureDepartmentForHod(db, userId);
  const { page, limit, skip } = getPagination(req.query.page, req.query.limit);
  const level = normalizeQueryValue(req.query.level);
  const search = normalizeQueryValue(req.query.search);

  let base = db
    .from('profiles')
    .select('id,first_name,last_name,email,student_id,level,phone_number,is_active,created_at', { count: 'exact' })
    .eq('role', 'student')
    .eq('department_id', department.id);

  if (level) base = base.eq('level', level);
  if (search) {
    const q = `%${search}%`;
    base = base.or(
      `first_name.ilike.${q},last_name.ilike.${q},student_id.ilike.${q},email.ilike.${q}`
    );
  }

  const { data: studentsData, count, error } = await base.range(skip, skip + limit - 1);
  if (error) throw ApiError.internal(`Failed to fetch students: ${error.message}`);
  const students = (studentsData ?? []) as ProfileRow[];
  const total = count ?? 0;

  res.json(
    ApiResponse.success('Students retrieved successfully', {
      students,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  );
});

export const getHodStudentProfile = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = req.user?.userId;
  if (!userId) throw ApiError.unauthorized('Unauthorized');
  const department = await ensureDepartmentForHod(db, userId);
  const student = await getSingle<ProfileRow>(
    db
      .from('profiles')
      .select('id,first_name,last_name,email,role,department_id')
      .eq('id', req.params.id)
      .eq('role', 'student')
      .eq('department_id', department.id)
      .limit(1)
  );

  if (!student) throw ApiError.notFound('Student not found in your department');

  const [enrollments, results] = await Promise.all([
    getRows<EnrollmentRow>(db.from('enrollments').select('id,course_id,status').eq('student_id', student.id)),
    getRows<ResultRow>(
      db
        .from('results')
        .select('id,total_score,grade_points,is_published,course_details:courses(id,credits)')
        .eq('student_id', student.id)
    ),
  ]);

  const gpa = calculateGPA(
    results.map((result) => ({
      totalScore: result.total_score ?? 0,
      gradePoints: result.grade_points ?? 0,
      credits: result.course_details?.credits ?? 0,
    }))
  );

  res.json(
    ApiResponse.success('Student profile retrieved successfully', {
      student,
      enrollments,
      results,
      summary: {
        totalCourses: enrollments.length,
        activeCourses: enrollments.filter((enrollment) => enrollment.status === 'active').length,
        publishedResults: results.filter((result) => result.is_published).length,
        gpa,
      },
    })
  );
});

export const getHodStaffProfile = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = req.user?.userId;
  if (!userId) throw ApiError.unauthorized('Unauthorized');
  const department = await ensureDepartmentForHod(db, userId);
  const staffMember = await getSingle<ProfileRow>(
    db
      .from('profiles')
      .select('id,first_name,last_name,email,role,department_id')
      .eq('id', req.params.id)
      .eq('role', 'lecturer')
      .eq('department_id', department.id)
      .limit(1)
  );

  if (!staffMember) throw ApiError.notFound('Staff member not found in your department');

  const courses = await getRows<CourseRow>(
    db
      .from('courses')
      .select('id,code,title,level,semester,credits,schedule')
      .eq('lecturer_id', staffMember.id)
      .eq('department_id', department.id)
  );

  const courseIds = courses.map((course) => course.id);

  const activeStudents = courseIds.length
    ? await getExactCount(
        db.from('enrollments').select('id', { count: 'exact', head: true }).in('course_id', courseIds).eq('status', 'active')
      )
    : 0;
  const pendingResults = courseIds.length
    ? await getExactCount(
        db
          .from('results')
          .select('id', { count: 'exact', head: true })
          .in('course_id', courseIds)
          .eq('approved_by_hod', false)
      )
    : 0;

  res.json(
    ApiResponse.success('Staff profile retrieved successfully', {
      staff: staffMember,
      courses,
      stats: {
        totalCourses: courses.length,
        activeStudents,
        pendingResults,
      },
    })
  );
});

export const assignCoursesToStaff = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = req.user?.userId;
  if (!userId) throw ApiError.unauthorized('Unauthorized');
  const department = await ensureDepartmentForHod(db, userId);
  const staffId = req.params.id;
  const { courseIds } = req.body as { courseIds: string[] };

  if (!Array.isArray(courseIds) || courseIds.length === 0) {
    throw ApiError.badRequest('courseIds array is required');
  }
  const staffMember = await getSingle<ProfileRow>(
    db
      .from('profiles')
      .select('id,first_name,last_name,role,department_id')
      .eq('id', staffId)
      .eq('role', 'lecturer')
      .eq('department_id', department.id)
      .limit(1)
  );

  if (!staffMember) throw ApiError.notFound('Staff member not found in your department');

  const courses = await getRows<CourseRow>(
    db
      .from('courses')
      .select('id,title,code,department_id')
      .in('id', courseIds)
      .eq('department_id', department.id)
  );

  if (courses.length !== courseIds.length) {
    throw ApiError.badRequest('One or more courses do not belong to your department');
  }

  const { error: updateError } = await db
    .from('courses')
    .update({ lecturer_id: staffMember.id })
    .in('id', courseIds);
  if (updateError) throw ApiError.internal(`Failed to assign courses: ${updateError.message}`);

  res.json(
    ApiResponse.success('Courses assigned successfully', {
      staff: {
        id: staffMember.id,
        name: `${staffMember.first_name} ${staffMember.last_name}`,
      },
      assignedCourses: courses,
    })
  );
});

export const getHodDepartmentProfile = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = req.user?.userId;
  if (!userId) throw ApiError.unauthorized('Unauthorized');
  const department = await ensureDepartmentForHod(db, userId);
  return res.json(ApiResponse.success('Department retrieved successfully', department));
});

export const updateHodDepartmentProfile = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = req.user?.userId;
  if (!userId) throw ApiError.unauthorized('Unauthorized');
  const department = await ensureDepartmentForHod(db, userId);
  const allowedFields = ['name', 'description', 'faculty', 'is_active'] as const;
  type UpdatePayload = Partial<Record<(typeof allowedFields)[number], string | boolean>>;
  const updates: UpdatePayload = {};

  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  });

  if (Object.keys(updates).length === 0) {
    throw ApiError.badRequest('No valid fields supplied');
  }
  const { data: updated, error } = await db
    .from('departments')
    .update(updates)
    .eq('id', department.id)
    .select()
    .single();
  if (error || !updated) throw ApiError.internal(`Failed to update department: ${error?.message}`);
  return res.json(ApiResponse.success('Department updated successfully', updated));
});

const collectDepartmentStats = async (db: ReturnType<typeof supabaseAdmin>, departmentId: string) => {
  if (!departmentId) throw ApiError.internal('Invalid department id');

  const [studentCount, staffCount, courseRows] = await Promise.all([
    getExactCount(db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student').eq('department_id', departmentId)),
    getExactCount(db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'lecturer').eq('department_id', departmentId)),
    getRows<CourseRow>(db.from('courses').select('id').eq('department_id', departmentId)),
  ]);

  const courseIds = (courseRows || []).map((course) => course.id).filter((id): id is string => typeof id === 'string' && id.length > 0);

  const [activeEnrollments, pendingResults] = await Promise.all([
    courseIds.length
      ? getExactCount(db.from('enrollments').select('id', { count: 'exact', head: true }).in('course_id', courseIds).eq('status', 'active'))
      : Promise.resolve(0),
    courseIds.length
      ? getExactCount(db.from('results').select('id', { count: 'exact', head: true }).in('course_id', courseIds).eq('approved_by_hod', false))
      : Promise.resolve(0),
  ]);

  return {
    studentCount,
    staffCount,
    courseCount: courseIds.length,
    activeEnrollments,
    pendingResults,
  };
};

export const getHodDepartmentStatistics = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = req.user?.userId;
  if (!userId) throw ApiError.unauthorized('Unauthorized');
  const department = await ensureDepartmentForHod(db, userId);
  const stats = await collectDepartmentStats(db, department.id);
  return res.json(ApiResponse.success('Department statistics retrieved successfully', stats));
});

export const getHodPendingResults = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = req.user?.userId;
  if (!userId) throw ApiError.unauthorized('Unauthorized');
  const department = await ensureDepartmentForHod(db, userId);
  const courses = await getRows<CourseRow>(db.from('courses').select('id').eq('department_id', department.id));
  const courseIds = courses.map((course) => course.id);

  if (!courseIds.length) {
    return res.json(ApiResponse.success('No pending results', []));
  }

  const results = await getRows<ResultRow>(
    db
      .from('results')
      .select('id,course_id,approved_by_hod,is_published,grade')
      .in('course_id', courseIds)
      .eq('approved_by_hod', false)
  );

  return res.json(ApiResponse.success('Pending results retrieved successfully', results));
});

export const getHodResultDetail = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = req.user?.userId;
  if (!userId) throw ApiError.unauthorized('Unauthorized');
  const department = await ensureDepartmentForHod(db, userId);
  const result = await getSingle<ResultRow>(
    db
      .from('results')
      .select('id,course_id,grade,is_published,course_details:courses(id,department_id)')
      .eq('id', req.params.id)
      .limit(1)
  );

  if (!result) throw ApiError.notFound('Result not found');

  const courseDepartment = result.course_details?.department_id;
  if (!courseDepartment || courseDepartment !== department.id) {
    throw ApiError.forbidden('You are not authorized to view this result');
  }

  return res.json(ApiResponse.success('Result retrieved successfully', result));
});

export const getHodDashboard = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = req.user?.userId;
  if (!userId) throw ApiError.unauthorized('Unauthorized');
  const department = await ensureDepartmentForHod(db, userId);
  // Collect department stats
  const stats = await collectDepartmentStats(db, department.id);
  // Get recent courses
  const courses = await getRows<CourseRow>(db.from('courses').select('id,code,title,level,semester,credits').eq('department_id', department.id).limit(5));
  // Get recent students
  const students = await getRows<ProfileRow>(db.from('profiles').select('id,first_name,last_name,email,student_id,level').eq('department_id', department.id).eq('role', 'student').limit(5));
  // Get pending results
  const pendingResults = await getRows<ResultRow>(db.from('results').select('id,course_id,total_score,grade,is_published,approved_by_hod').in('course_id', courses.map(c => c.id)).eq('approved_by_hod', false).limit(5));
  return res.json(ApiResponse.success('HOD dashboard data retrieved successfully', {
    department,
    stats,
    recentCourses: courses,
    recentStudents: students,
    pendingResults,
  }));
});

