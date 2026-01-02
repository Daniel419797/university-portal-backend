import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import notificationService from '../services/notification.service';
import { USER_ROLES } from '../utils/constants';

type Gender = 'male' | 'female' | 'mixed';

interface HostelRoom {
  number: string;
  capacity: number;
  occupied: number;
  students: string[];
}

interface HostelRow {
  id: string;
  name: string;
  gender: Gender;
  total_rooms: number;
  capacity: number;
  occupied: number;
  rooms: HostelRoom[];
  facilities: string[] | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

interface HostelApplicationRow {
  id: string;
  student_id: string;
  hostel_id: string | null;
  room: string | null;
  session_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'allocated';
  roommate_pref?: string | null;
  special_requests?: string | null;
  processed_by?: string | null;
  processed_at?: string | null;
  allocated_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * @desc    Create new hostel
 * @route   POST /api/v1/hostels
 * @access  Private (Admin)
 */
export const createHostel = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { name, gender, totalRooms, capacity, rooms, facilities } = req.body as {
    name: string;
    gender: Gender;
    totalRooms: number;
    capacity: number;
    rooms?: HostelRoom[];
    facilities?: string[];
  };

  const { data, error } = await db
    .from('hostels')
    .insert({
      name,
      gender,
      total_rooms: totalRooms,
      capacity,
      rooms: rooms ?? [],
      facilities: facilities ?? [],
      occupied: 0,
      is_active: true,
    })
    .select('*')
    .maybeSingle();

  if (error) throw ApiError.internal(`Failed to create hostel: ${error.message}`);
  if (!data) throw ApiError.internal('Failed to create hostel');

  res.status(201).json(ApiResponse.success('Hostel created successfully', data));
});

/**
 * @desc    Get all hostels
 * @route   GET /api/v1/hostels
 * @access  Public (Authenticated)
 */
export const getHostels = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { gender, available, page = '1', limit = '20' } = req.query as Record<string, string>;

  const pageNum = Number(page) || 1;
  const limitNum = Number(limit) || 20;
  const start = (pageNum - 1) * limitNum;
  const end = start + limitNum - 1;

  let base = db.from('hostels').select('*');
  if (gender) base = base.eq('gender', gender as Gender);

  if (available === 'true') {
    const { data, error } = await base;
    if (error) throw ApiError.internal(`Failed to fetch hostels: ${error.message}`);
    const rows = (data ?? []) as HostelRow[];
    const filtered = rows.filter((h) => (h.occupied ?? 0) < (h.capacity ?? 0));
    const total = filtered.length;
    const paged = filtered.slice(start, end + 1);
    res.json(
      ApiResponse.success('Data retrieved successfully', {
        hostels: paged,
        pagination: {
          total,
          page: pageNum,
          pages: Math.ceil(total / limitNum),
          limit: limitNum,
        },
      })
    );
    return;
  }

  const [{ data, error }, countRes] = await Promise.all([
    base.range(start, end),
    (async () => {
      let c = db.from('hostels').select('id', { count: 'exact', head: true });
      if (gender) c = c.eq('gender', gender as Gender);
      return c;
    })(),
  ]);

  if (error) throw ApiError.internal(`Failed to fetch hostels: ${error.message}`);
  const total = countRes.count ?? 0;

  res.json(
    ApiResponse.success('Data retrieved successfully', {
      hostels: (data ?? []) as HostelRow[],
      pagination: {
        total,
        page: pageNum,
        pages: Math.ceil((total || 0) / limitNum),
        limit: limitNum,
      },
    })
  );
});

/**
 * @desc    Get single hostel by ID
 * @route   GET /api/v1/hostels/:id
 * @access  Public (Authenticated)
 */
export const getHostelById = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('hostels')
    .select('*')
    .eq('id', req.params.id)
    .maybeSingle();
  if (error) throw ApiError.internal(`Failed to fetch hostel: ${error.message}`);
  if (!data) throw ApiError.notFound('Hostel not found');
  res.json(ApiResponse.success('Data retrieved successfully', data));
});

/**
 * @desc    Update hostel
 * @route   PUT /api/v1/hostels/:id
 * @access  Private (Admin)
 */
export const updateHostel = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { name, gender, totalRooms, capacity, facilities, isActive } = req.body as Partial<{
    name: string;
    gender: Gender;
    totalRooms: number;
    capacity: number;
    facilities: string[];
    isActive: boolean;
  }>;

  const payload: Partial<HostelRow> = {};
  if (typeof name !== 'undefined') payload.name = name as string;
  if (typeof gender !== 'undefined') payload.gender = gender as Gender;
  if (typeof totalRooms !== 'undefined') payload.total_rooms = totalRooms as number;
  if (typeof capacity !== 'undefined') payload.capacity = capacity as number;
  if (typeof facilities !== 'undefined') payload.facilities = (facilities ?? []) as string[];
  if (typeof isActive !== 'undefined') payload.is_active = Boolean(isActive);

  const { data, error } = await db
    .from('hostels')
    .update(payload)
    .eq('id', req.params.id)
    .select('*')
    .maybeSingle();
  if (error) throw ApiError.internal(`Failed to update hostel: ${error.message}`);
  if (!data) throw ApiError.notFound('Hostel not found');

  res.json(ApiResponse.success('Hostel updated successfully', data));
});

/**
 * @desc    Delete hostel
 * @route   DELETE /api/v1/hostels/:id
 * @access  Private (Admin)
 */
export const deleteHostel = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { data: existing, error: fetchErr } = await db
    .from('hostels')
    .select('*')
    .eq('id', req.params.id)
    .maybeSingle();
  if (fetchErr) throw ApiError.internal(`Failed to fetch hostel: ${fetchErr.message}`);
  if (!existing) throw ApiError.notFound('Hostel not found');

  if ((existing.occupied ?? 0) > 0) {
    throw ApiError.badRequest('Cannot delete hostel with allocated rooms');
  }

  const { error } = await db.from('hostels').delete().eq('id', req.params.id);
  if (error) throw ApiError.internal(`Failed to delete hostel: ${error.message}`);

  res.json(ApiResponse.success('Hostel deleted successfully', null));
});

/**
 * @desc    Apply for hostel accommodation
 * @route   POST /api/v1/hostels/apply
 * @access  Private (Student)
 */
export const applyForHostel = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { session, roommatePref, specialRequests } = req.body as {
    session: string;
    roommatePref?: string;
    specialRequests?: string;
  };

  const { data: sessionRow, error: sessionErr } = await db
    .from('sessions')
    .select('id')
    .eq('id', session)
    .maybeSingle();
  if (sessionErr) throw ApiError.internal(`Failed to verify session: ${sessionErr.message}`);
  if (!sessionRow) throw ApiError.notFound('Session not found');

  const { data: existing, error: existErr } = await db
    .from('hostel_applications')
    .select('id')
    .eq('student_id', req.user!.userId as string)
    .eq('session_id', session)
    .maybeSingle();
  if (existErr) throw ApiError.internal(`Failed to check existing application: ${existErr.message}`);
  if (existing) throw ApiError.badRequest('You have already applied for hostel accommodation this session');

  const { data, error } = await db
    .from('hostel_applications')
    .insert({
      student_id: req.user!.userId as string,
      session_id: session,
      roommate_pref: roommatePref ?? null,
      special_requests: specialRequests ?? null,
      status: 'pending',
    })
    .select('*')
    .maybeSingle();
  if (error) throw ApiError.internal(`Failed to submit application: ${error.message}`);
  if (!data) throw ApiError.internal('Failed to submit application');

  res.status(201).json(ApiResponse.success('Hostel application submitted successfully', data));
});

/**
 * @desc    Get all hostel applications
 * @route   GET /api/v1/hostels/applications
 * @access  Private (Admin or own applications for students)
 */
export const getHostelApplications = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { status, session, page = '1', limit = '20' } = req.query as Record<string, string>;

  const pageNum = Number(page) || 1;
  const limitNum = Number(limit) || 20;
  const start = (pageNum - 1) * limitNum;
  const end = start + limitNum - 1;

  let base = db.from('hostel_applications').select('*');
  if (req.user!.role === USER_ROLES.STUDENT) base = base.eq('student_id', req.user!.userId as string);
  if (status) base = base.eq('status', status);
  if (session) base = base.eq('session_id', session);

  const [{ data, error }, countRes] = await Promise.all([
    base.range(start, end),
    (async () => {
      let c = db.from('hostel_applications').select('id', { count: 'exact', head: true });
      if (req.user!.role === USER_ROLES.STUDENT) c = c.eq('student_id', req.user!.userId as string);
      if (status) c = c.eq('status', status);
      if (session) c = c.eq('session_id', session);
      return c;
    })(),
  ]);

  if (error) throw ApiError.internal(`Failed to fetch applications: ${error.message}`);
  const total = countRes.count ?? 0;

  res.json(
    ApiResponse.success('Data retrieved successfully', {
      applications: (data ?? []) as HostelApplicationRow[],
      pagination: {
        total,
        page: pageNum,
        pages: Math.ceil((total || 0) / limitNum),
        limit: limitNum,
      },
    })
  );
});

/**
 * @desc    Get single hostel application
 * @route   GET /api/v1/hostels/applications/:id
 * @access  Private
 */
export const getHostelApplicationById = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('hostel_applications')
    .select('*')
    .eq('id', req.params.id)
    .maybeSingle();
  if (error) throw ApiError.internal(`Failed to fetch application: ${error.message}`);
  if (!data) throw ApiError.notFound('Application not found');

  if (req.user!.role === USER_ROLES.STUDENT && data.student_id !== (req.user!.userId as string)) {
    throw ApiError.forbidden('You are not authorized to view this application');
  }

  res.json(ApiResponse.success('Data retrieved successfully', data));
});

export const getMyHostelApplication = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('hostel_applications')
    .select('*')
    .eq('student_id', req.user!.userId as string)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw ApiError.internal(`Failed to fetch application: ${error.message}`);
  const application = (data ?? [])[0] || null;
  if (!application) throw ApiError.notFound('No hostel application found for this student');
  res.json(ApiResponse.success('Data retrieved successfully', application));
});

/**
 * @desc    Approve hostel application
 * @route   PUT /api/v1/hostels/applications/:id/approve
 * @access  Private (Admin)
 */
export const approveHostelApplication = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { data: existing, error: fetchErr } = await db
    .from('hostel_applications')
    .select('*')
    .eq('id', req.params.id)
    .maybeSingle();
  if (fetchErr) throw ApiError.internal(`Failed to fetch application: ${fetchErr.message}`);
  if (!existing) throw ApiError.notFound('Application not found');
  if (existing.status !== 'pending') throw ApiError.badRequest('Application has already been processed');

  const { data, error } = await db
    .from('hostel_applications')
    .update({
      status: 'approved',
      processed_by: req.user!.userId as string,
      processed_at: new Date().toISOString(),
    })
    .eq('id', req.params.id)
    .select('*')
    .maybeSingle();
  if (error) throw ApiError.internal(`Failed to approve application: ${error.message}`);

  await notificationService.createNotification(
    existing.student_id,
    'success',
    'Hostel Application Approved',
    'Your hostel application has been approved. Room allocation will be done soon.'
  );

  res.json(ApiResponse.success('Application approved successfully', data));
});

/**
 * @desc    Reject hostel application
 * @route   PUT /api/v1/hostels/applications/:id/reject
 * @access  Private (Admin)
 */
export const rejectHostelApplication = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { data: existing, error: fetchErr } = await db
    .from('hostel_applications')
    .select('*')
    .eq('id', req.params.id)
    .maybeSingle();
  if (fetchErr) throw ApiError.internal(`Failed to fetch application: ${fetchErr.message}`);
  if (!existing) throw ApiError.notFound('Application not found');
  if (existing.status !== 'pending') throw ApiError.badRequest('Application has already been processed');

  const { data, error } = await db
    .from('hostel_applications')
    .update({
      status: 'rejected',
      processed_by: req.user!.userId as string,
      processed_at: new Date().toISOString(),
    })
    .eq('id', req.params.id)
    .select('*')
    .maybeSingle();
  if (error) throw ApiError.internal(`Failed to reject application: ${error.message}`);

  await notificationService.createNotification(
    existing.student_id,
    'error',
    'Hostel Application Rejected',
    'Your hostel application has been rejected. Please contact administration for more information.'
  );

  res.json(ApiResponse.success('Application rejected', data));
});

/**
 * @desc    Allocate room to approved application
 * @route   PUT /api/v1/hostels/applications/:id/allocate
 * @access  Private (Admin)
 */
export const allocateRoom = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { hostelId, roomNumber } = req.body as { hostelId: string; roomNumber: string };

  const { data: application, error: appErr } = await db
    .from('hostel_applications')
    .select('*')
    .eq('id', req.params.id)
    .maybeSingle();
  if (appErr) throw ApiError.internal(`Failed to fetch application: ${appErr.message}`);
  if (!application) throw ApiError.notFound('Application not found');
  if (application.status !== 'approved') throw ApiError.badRequest('Only approved applications can be allocated rooms');

  const { data: hostel, error: hostelErr } = await db
    .from('hostels')
    .select('*')
    .eq('id', hostelId)
    .maybeSingle();
  if (hostelErr) throw ApiError.internal(`Failed to fetch hostel: ${hostelErr.message}`);
  if (!hostel) throw ApiError.notFound('Hostel not found');

  const { data: profile, error: profErr } = await db
    .from('profiles')
    .select('id, gender')
    .eq('id', application.student_id)
    .maybeSingle();
  if (profErr) throw ApiError.internal(`Failed to fetch student profile: ${profErr.message}`);
  if (!profile) throw ApiError.notFound('Student profile not found');
  const studentGender = profile.gender as Gender;
  if (hostel.gender !== 'mixed' && hostel.gender !== studentGender) {
    throw ApiError.badRequest('Student gender does not match hostel type');
  }

  const rooms = (hostel.rooms ?? []) as HostelRoom[];
  const idx = rooms.findIndex((r) => r.number === roomNumber);
  if (idx === -1) throw ApiError.notFound('Room not found');
  const room = rooms[idx];
  if ((room.occupied ?? 0) >= (room.capacity ?? 0)) throw ApiError.badRequest('Room is full');

  const updatedRoom: HostelRoom = {
    ...room,
    students: [...(room.students ?? []), application.student_id],
    occupied: (room.occupied ?? 0) + 1,
  };
  const updatedRooms = rooms.slice();
  updatedRooms[idx] = updatedRoom;

  const { error: updHostelErr } = await db
    .from('hostels')
    .update({ rooms: updatedRooms, occupied: (hostel.occupied ?? 0) + 1 })
    .eq('id', hostel.id);
  if (updHostelErr) throw ApiError.internal(`Failed to update hostel occupancy: ${updHostelErr.message}`);

  const { data: updatedApp, error: updAppErr } = await db
    .from('hostel_applications')
    .update({
      hostel_id: hostel.id,
      room: roomNumber,
      status: 'allocated',
      allocated_at: new Date().toISOString(),
    })
    .eq('id', application.id)
    .select('*')
    .maybeSingle();
  if (updAppErr) throw ApiError.internal(`Failed to update application: ${updAppErr.message}`);

  await notificationService.createNotification(
    application.student_id,
    'success',
    'Room Allocated',
    `You have been allocated ${hostel.name}, Room ${roomNumber}.`
  );

  res.json(ApiResponse.success('Room allocated successfully', updatedApp));
});

/**
 * @desc    Get hostel statistics
 * @route   GET /api/v1/hostels/stats/overview
 * @access  Private (Admin)
 */
export const getHostelStats = asyncHandler(async (_req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { data: hostels, error: hostErr } = await db.from('hostels').select('*');
  if (hostErr) throw ApiError.internal(`Failed to fetch hostels: ${hostErr.message}`);
  const rows = (hostels ?? []) as HostelRow[];

  const totalHostels = rows.length;
  const totalCapacity = rows.reduce((sum, h) => sum + (h.capacity ?? 0), 0);
  const totalOccupied = rows.reduce((sum, h) => sum + (h.occupied ?? 0), 0);
  const totalAvailable = rows.reduce((sum, h) => sum + ((h.capacity ?? 0) - (h.occupied ?? 0)), 0);
  const occupancyRate = totalCapacity > 0 ? (totalOccupied / totalCapacity) * 100 : 0;
  const byGender = {
    male: rows.filter((h) => h.gender === 'male').length,
    female: rows.filter((h) => h.gender === 'female').length,
    mixed: rows.filter((h) => h.gender === 'mixed').length,
  };

  const { data: applications, error: appErr } = await db
    .from('hostel_applications')
    .select('status');
  if (appErr) throw ApiError.internal(`Failed to fetch applications: ${appErr.message}`);
  const typedApps = (applications ?? []) as Array<{ status: HostelApplicationRow['status'] }>;
  const statsByStatus = typedApps.reduce<Record<string, number>>((acc, row) => {
    const key = row.status ?? 'unknown';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  res.json(
    ApiResponse.success('Data retrieved successfully', {
      hostelStats: {
        totalHostels,
        totalCapacity,
        totalOccupied,
        totalAvailable,
        occupancyRate,
        byGender,
      },
      applicationStats: statsByStatus,
    })
  );
});

