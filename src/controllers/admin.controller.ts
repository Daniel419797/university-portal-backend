import fs from 'fs';
import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { generateReference } from '../utils/helpers';
import notificationService from '../services/notification.service';
import emailService from '../services/email.service';
import { USER_ROLES } from '../utils/constants';
import { UserRole } from '../types';

const allowedRoles = new Set<UserRole>(Object.values(USER_ROLES) as UserRole[]);
const isUserRole = (value: string): value is UserRole => allowedRoles.has(value as UserRole);

const splitCsvLine = (line: string): string[] => {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  if (current.length) {
    values.push(current.trim());
  } else if (line.endsWith(',')) {
    values.push('');
  }

  return values;
};

const parseCsvContent = (content: string): Array<Record<string, string>> => {
  const sanitized = content.replace(/\uFEFF/g, '');
  const lines = sanitized
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (!lines.length) {
    return [];
  }

  const headers = splitCsvLine(lines[0]).map((header) => header.toLowerCase());
  const rows: Array<Record<string, string>> = [];

  for (let i = 1; i < lines.length; i += 1) {
    const values = splitCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? '';
    });
    rows.push(row);
  }

  return rows;
};

type HostelRoom = {
  number: string;
  capacity: number;
  occupied?: number;
  students: string[];
};

type HostelRecord = {
  id: string;
  name: string;
  gender: string;
  capacity: number;
  occupied: number;
  rooms: HostelRoom[];
};

type SystemSettings = {
  portal?: {
    defaultCurrency?: string;
  };
};

type InvoiceJoin = {
  id: string;
  reference: string;
  status: string;
  currency: string;
  total_amount: number;
  due_date: string;
  student?: { id: string; email: string } | Array<{ id: string; email: string }>;
};

type PaymentRow = { amount: number; status: string };
type InvoiceRow = { status: string; total_amount: number };
type HostelSummaryRow = { capacity: number; occupied: number };
type RevenuePoint = { month: string; amount: number };
type TopStudent = { studentId: string; amount: number };

const recalculateHostelOccupancy = (hostel: HostelRecord) => {
  hostel.occupied = hostel.rooms.reduce((total, room) => total + (room.students?.length ?? 0), 0);
  hostel.rooms.forEach((room) => {
    room.occupied = room.students?.length ?? 0;
  });
};

const findHostelRoom = async (hostelId: string, roomNumber: string) => {
  const db = supabaseAdmin();
  const { data: hostel, error } = await db
    .from('hostels')
    .select('id, name, gender, capacity, occupied, rooms')
    .eq('id', hostelId)
    .maybeSingle();

  if (error) throw ApiError.internal(`Failed to fetch hostel: ${error.message}`);
  if (!hostel) throw ApiError.notFound('Hostel not found');

  const room = (hostel.rooms as HostelRoom[]).find((r) => r.number === roomNumber);
  if (!room) throw ApiError.notFound('Room not found');

  return { hostel: hostel as unknown as HostelRecord, room };
};

const ensureSystemSettings = async () => {
  const db = supabaseAdmin();
  const { data: existing, error } = await db.from('system_settings').select('*').limit(1).maybeSingle();
  if (error) throw ApiError.internal(`Failed to read settings: ${error.message}`);
  if (existing) return existing;
  const { data: inserted, error: insertError } = await db.from('system_settings').insert({}).select().single();
  if (insertError) throw ApiError.internal(`Failed to init settings: ${insertError.message}`);
  return inserted;
};

const normalizeAudience = (audience?: string[]): Array<UserRole | 'all'> => {
  if (!audience || !audience.length) {
    return ['all'];
  }

  if (audience.includes('all')) {
    return ['all'];
  }

  const filtered = audience.filter((role) => isUserRole(role));
  return filtered.length ? (filtered as UserRole[]) : ['all'];
};

export const bulkUploadUsers = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  if (!req.file) throw ApiError.badRequest('CSV file is required');

  const filePath = req.file.path;
  let rows: Array<Record<string, string>> = [];

  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    rows = parseCsvContent(content);
  } finally {
    fs.promises.unlink(filePath).catch(() => undefined);
  }

  if (!rows.length) throw ApiError.badRequest('CSV file is empty');

  const summary = { totalRows: rows.length, created: 0, skipped: 0, errors: [] as string[] };
  const generatedCredentials: Array<{ email: string; password: string }> = [];

  for (let index = 0; index < rows.length; index += 1) {
    const rowNumber = index + 2;
    const record = rows[index];
    const lower = new Proxy(record, {
      get(target, prop) {
        const key = String(prop).toLowerCase();
        return (target as Record<string, string>)[key];
      },
    }) as Record<string, string>;

    const email = (lower.email || '').toLowerCase();
    const firstName = lower.first_name || lower['first name'] || lower.first_name;
    const lastName = lower.last_name || lower['last name'] || lower.last_name;
    const roleInput = (lower.role || USER_ROLES.STUDENT).toLowerCase();
    const role = allowedRoles.has(roleInput as UserRole) ? (roleInput as UserRole) : undefined;

    if (!email || !firstName || !lastName) {
      summary.errors.push(`Row ${rowNumber}: missing required fields (email, firstName, lastName)`);
      summary.skipped += 1;
      continue;
    }
    if (!role) {
      summary.errors.push(`Row ${rowNumber}: unsupported role`);
      summary.skipped += 1;
      continue;
    }

    const { data: existing } = await db.from('profiles').select('id').eq('email', email).maybeSingle();
    if (existing) {
      summary.skipped += 1;
      continue;
    }

    const password = lower.password?.length ? lower.password : generateReference('PWD').slice(-10);

    const { data: authUser, error: authError } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role },
    });
    if (authError || !authUser?.user) {
      summary.errors.push(`Row ${rowNumber}: auth error ${authError?.message}`);
      summary.skipped += 1;
      continue;
    }

    const { error: profileError } = await db.from('profiles').insert({
      id: authUser.user.id,
      email,
      first_name: firstName,
      last_name: lastName,
      role,
      student_id: lower.student_id || lower['student id'] || lower.matric || null,
      level: lower.level || null,
      phone_number: lower.phonenumber || lower.phone || null,
      address: lower.address || null,
      department: lower.department || null,
    });
    if (profileError) {
      summary.errors.push(`Row ${rowNumber}: profile error ${profileError.message}`);
      summary.skipped += 1;
      continue;
    }

    summary.created += 1;
    generatedCredentials.push({ email, password });
  }

  res.status(201).json(ApiResponse.success('Bulk upload processed successfully', { summary, generatedCredentials }));
});

export const getHostelRoomDetails = asyncHandler(async (req: Request, res: Response) => {
  const { hostel, room } = await findHostelRoom(req.params.hostelId, req.params.roomNumber);
  res.json(
    ApiResponse.success('Room retrieved successfully', {
      hostel: { id: hostel.id, name: hostel.name, gender: hostel.gender },
      room,
    })
  );
});

export const updateHostelRoom = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { hostel, room } = await findHostelRoom(req.params.hostelId, req.params.roomNumber);
  const { capacity, number } = req.body as { capacity?: number; number?: string };

  if (capacity !== undefined) {
    if (typeof capacity !== 'number' || capacity < (room.occupied ?? 0)) {
      throw ApiError.badRequest('Capacity must be a number greater than or equal to current occupancy');
    }
    room.capacity = capacity;
  }

  if (number && number !== room.number) {
    const exists = hostel.rooms.some((r) => r.number === number);
    if (exists) throw ApiError.badRequest('Another room already uses this number');
    room.number = number;
  }

  const updatedRooms = hostel.rooms.map((r) => (r.number === room.number ? room : r));
  const nextHostel: HostelRecord = { ...hostel, rooms: updatedRooms };
  recalculateHostelOccupancy(nextHostel);

  const { error } = await db
    .from('hostels')
    .update({ rooms: nextHostel.rooms, occupied: nextHostel.occupied })
    .eq('id', hostel.id);
  if (error) throw ApiError.internal(`Failed to update room: ${error.message}`);

  res.json(ApiResponse.success('Room updated successfully', room));
});

export const assignHostelRoom = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { hostel, room } = await findHostelRoom(req.params.hostelId, req.params.roomNumber);
  const { studentId, applicationId } = req.body as { studentId: string; applicationId?: string };

  if (!studentId) throw ApiError.badRequest('Valid studentId is required');

  const { data: student } = await db.from('profiles').select('id, role, first_name, email').eq('id', studentId).maybeSingle();
  if (!student || student.role !== USER_ROLES.STUDENT) throw ApiError.badRequest('Student not found or invalid role');

  if (room.students.includes(studentId)) throw ApiError.badRequest('Student already assigned to this room');
  if ((room.occupied ?? 0) >= room.capacity) throw ApiError.badRequest('Room is already at full capacity');

  const updatedRooms = hostel.rooms.map((r) => (r.number === room.number ? { ...room, students: [...room.students, studentId] } : r));
  const nextHostel: HostelRecord = { ...hostel, rooms: updatedRooms };
  recalculateHostelOccupancy(nextHostel);
  const { error } = await db.from('hostels').update({ rooms: nextHostel.rooms, occupied: nextHostel.occupied }).eq('id', hostel.id);
  if (error) throw ApiError.internal(`Failed to update hostel: ${error.message}`);

  if (applicationId) {
    await db
      .from('hostel_applications')
      .update({ hostel: hostel.id, room: room.number, status: 'allocated', allocated_at: new Date().toISOString() })
      .eq('id', applicationId);
  }

  await notificationService.createNotification(
    student.id,
    'success',
    'Hostel Assignment',
    `You have been assigned to ${hostel.name}, room ${room.number}.`
  );

  res.status(201).json(
    ApiResponse.success('Student assigned successfully', {
      room: { ...room, students: [...room.students, studentId] },
      hostel: { id: hostel.id, occupied: nextHostel.occupied },
    })
  );
});

export const evictStudentFromRoom = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { hostel, room } = await findHostelRoom(req.params.hostelId, req.params.roomNumber);
  const { studentId } = req.body as { studentId: string };

  if (!studentId) throw ApiError.badRequest('Valid studentId is required');

  const initialLength = room.students.length;
  const updatedRoom = { ...room, students: room.students.filter((id) => id !== studentId) };
  if (updatedRoom.students.length === initialLength) throw ApiError.notFound('Student not found in this room');

  const updatedRooms = hostel.rooms.map((r) => (r.number === room.number ? updatedRoom : r));
  const nextHostel: HostelRecord = { ...hostel, rooms: updatedRooms };
  recalculateHostelOccupancy(nextHostel);
  const { error } = await db.from('hostels').update({ rooms: nextHostel.rooms, occupied: nextHostel.occupied }).eq('id', hostel.id);
  if (error) throw ApiError.internal(`Failed to update hostel: ${error.message}`);

  await db
    .from('hostel_applications')
    .update({ status: 'approved', room: null })
    .match({ student: studentId, hostel: hostel.id, room: room.number });

  await notificationService.createNotification(
    studentId,
    'warning',
    'Hostel Update',
    `You have been removed from ${hostel.name}, room ${room.number}. Please contact the administrator for more details.`
  );

  res.json(ApiResponse.success('Student evicted successfully', { room: updatedRoom, hostel: { id: hostel.id, occupied: nextHostel.occupied } }));
});

export const getAnnouncements = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { audience, search, isPinned, status, page = 1, limit = 20 } = req.query as Record<string, string>;

  const pageNum = Number(page) || 1;
  const limitNum = Math.min(Number(limit) || 20, 100);
  const from = (pageNum - 1) * limitNum;
  const to = from + limitNum - 1;

  let query = db.from('announcements').select('*');

  if (audience && audience !== 'all') {
    query = query.contains('audience', [audience]);
  }
  if (status === 'published') {
    query = query.eq('is_published', true).lte('publish_at', new Date().toISOString());
  } else if (status === 'scheduled') {
    query = query.gt('publish_at', new Date().toISOString());
  }
  if (typeof isPinned === 'string') {
    query = query.eq('is_pinned', isPinned === 'true');
  }
  if (search) {
    query = query.or(`title.ilike.%${search}%,message.ilike.%${search}%`);
  }

  query = query.order('publish_at', { ascending: false }).range(from, to);

  const [{ data: announcements, error }, { count }] = await Promise.all([
    query,
    db.from('announcements').select('id', { count: 'exact', head: true }),
  ]);

  if (error) throw ApiError.internal(`Failed to fetch announcements: ${error.message}`);

  res.json(
    ApiResponse.success('Announcements retrieved successfully', {
      announcements: announcements || [],
      pagination: {
        total: count || 0,
        page: pageNum,
        totalPages: Math.ceil((count || 0) / limitNum),
        limit: limitNum,
      },
    })
  );
});

export const createAnnouncement = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { title, message, audience, tags, publishAt, expiresAt, isPinned = false, isPublished = true, notifyUsers = false } = req.body;

  if (!title || !message) throw ApiError.badRequest('Title and message are required');

  const normalizedAudience = normalizeAudience(audience) as UserRole[] | ['all'];

  const { data: announcement, error } = await db
    .from('announcements')
    .insert({
      title,
      message,
      tags: tags || [],
      audience: normalizedAudience,
      publish_at: publishAt ? new Date(publishAt).toISOString() : new Date().toISOString(),
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      is_pinned: isPinned,
      is_published: isPublished,
      created_by: req.user?.userId || null,
    })
    .select()
    .single();
  if (error) throw ApiError.internal(`Failed to create announcement: ${error.message}`);

  if (notifyUsers) {
    const broadcastToAll = normalizedAudience.some((role) => role === 'all');
    let recipientsQuery = db.from('profiles').select('id').limit(1000);
    if (!broadcastToAll) {
      recipientsQuery = recipientsQuery.in('role', normalizedAudience as string[]);
    }
    const { data: recipients } = await recipientsQuery;
    if ((recipients || []).length) {
      await notificationService.createBulkNotifications(
        (recipients || []).map((r) => r.id),
        'info',
        title,
        message,
        '/announcements'
      );
    }
  }

  res.status(201).json(ApiResponse.success('Announcement created successfully', announcement));
});

export const updateAnnouncement = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { title, message, audience, tags, publishAt, expiresAt, isPinned, isPublished } = req.body;
  const updates: Record<string, unknown> = {};
  if (title) updates.title = title;
  if (message) updates.message = message;
  if (audience) updates.audience = normalizeAudience(audience);
  if (tags) updates.tags = tags;
  if (publishAt) updates.publish_at = new Date(publishAt).toISOString();
  if (expiresAt) updates.expires_at = new Date(expiresAt).toISOString();
  if (typeof isPinned === 'boolean') updates.is_pinned = isPinned;
  if (typeof isPublished === 'boolean') updates.is_published = isPublished;
  updates.updated_by = req.user?.userId || null;

  const { data, error } = await db.from('announcements').update(updates).eq('id', req.params.id).select().single();
  if (error) throw ApiError.notFound(`Announcement update failed: ${error.message}`);
  res.json(ApiResponse.success('Announcement updated successfully', data));
});

export const deleteAnnouncement = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { error } = await db.from('announcements').delete().eq('id', req.params.id);
  if (error) throw ApiError.internal(`Delete failed: ${error.message}`);
  res.json(ApiResponse.success('Announcement deleted successfully', null));
});

export const getFinancialOverview = asyncHandler(async (_req: Request, res: Response) => {
  const db = supabaseAdmin();
  const [{ data: outstanding }, { data: recent }] = await Promise.all([
    db.from('invoices').select('*').in('status', ['pending', 'overdue']).order('created_at', { ascending: false }).limit(10),
    db.from('invoices').select('*').order('created_at', { ascending: false }).limit(10),
  ]);

  res.json(
    ApiResponse.success('Financial overview retrieved successfully', {
      payments: {
        byStatus: [],
        byType: [],
        monthlyTrend: [],
      },
      invoices: {
        outstanding: outstanding || [],
        recent: recent || [],
      },
    })
  );
});

export const generateInvoice = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { studentId, items, dueDate, notes, sendNotification = true } = req.body as {
    studentId: string;
    items: Array<{ label: string; amount: number; type?: string }>;
    dueDate: string;
    notes?: string;
    sendNotification?: boolean;
  };

  if (!studentId) throw ApiError.badRequest('Valid studentId is required');
  if (!Array.isArray(items) || !items.length) throw ApiError.badRequest('At least one invoice item is required');
  if (!dueDate) throw ApiError.badRequest('dueDate is required');

  const { data: student } = await db.from('profiles').select('id, email, first_name').eq('id', studentId).maybeSingle();
  if (!student) throw ApiError.notFound('Student not found');

  const totalAmount = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const settings = await ensureSystemSettings();
  const currency = (settings as SystemSettings).portal?.defaultCurrency ?? 'NGN';

  const reference = generateReference('INV');
  const { data: invoice, error } = await db
    .from('invoices')
    .insert({
      reference,
      student: student.id,
      items,
      total_amount: totalAmount,
      currency,
      due_date: new Date(dueDate).toISOString(),
      status: 'pending',
      notes: notes || null,
      created_by: req.user?.userId || null,
      sent_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw ApiError.internal(`Failed to create invoice: ${error.message}`);

  const emailHtml = `
    <h1>Invoice ${reference}</h1>
    <p>Dear ${student.first_name},</p>
    <p>You have a new invoice with total amount <strong>${currency} ${totalAmount.toLocaleString()}</strong>.</p>
    <p>Due Date: ${new Date(dueDate).toDateString()}</p>
    <p>Please log in to the portal to complete your payment.</p>
  `;

  await emailService.sendEmail({ to: student.email, subject: `Invoice ${reference}`, html: emailHtml });

  if (sendNotification) {
    await notificationService.createNotification(
      student.id,
      'info',
      'New Invoice Generated',
      `An invoice (${reference}) totaling ${currency} ${totalAmount.toLocaleString()} has been generated.`,
      '/payments'
    );
  }

  res.status(201).json(ApiResponse.success('Invoice generated successfully', invoice));
});

export const sendFinancialReminder = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { invoiceId, channels = ['email', 'notification'], message } = req.body as { invoiceId: string; channels?: string[]; message?: string };
  if (!invoiceId) throw ApiError.badRequest('Valid invoiceId is required');

  const { data: invoice, error } = await db
    .from('invoices')
    .select('id, reference, status, currency, total_amount, due_date, student:profiles(id,email)')
    .eq('id', invoiceId)
    .maybeSingle();
  if (error) throw ApiError.internal(`Failed to fetch invoice: ${error.message}`);
  if (!invoice) throw ApiError.notFound('Invoice not found');

  if (invoice.status === 'paid' || invoice.status === 'cancelled') throw ApiError.badRequest('Reminders can only be sent for pending or overdue invoices');

  const reminderMessage =
    message ||
    `Reminder: Invoice ${invoice.reference} totaling ${invoice.currency} ${(invoice.total_amount || 0).toLocaleString()} is pending. Due on ${new Date(invoice.due_date as unknown as string).toDateString()}.`;

  const inv = invoice as InvoiceJoin;
  const studentJoin = Array.isArray(inv.student) ? inv.student[0] : inv.student;
  if (channels.includes('email') && studentJoin?.email) {
    await emailService.sendEmail({ to: studentJoin.email, subject: `Reminder: Invoice ${invoice.reference}`, html: `<p>${reminderMessage}</p>` });
  }
  if (channels.includes('notification') && studentJoin?.id) {
    await notificationService.createNotification(studentJoin.id, 'warning', 'Invoice Reminder', reminderMessage, '/payments');
  }

  const nowIso = new Date().toISOString();
  const reminders = [{ sent_at: nowIso, channel: channels.includes('email') ? 'email' : 'notification', message: reminderMessage }];
  const nextStatus = new Date(invoice.due_date as unknown as string).getTime() < Date.now() ? 'overdue' : invoice.status;
  const { data: updated, error: updateError } = await db.from('invoices').update({ reminders, status: nextStatus }).eq('id', invoice.id).select().single();
  if (updateError) throw ApiError.internal(`Failed to update invoice: ${updateError.message}`);

  res.json(ApiResponse.success('Reminder sent successfully', updated));
});

export const getFinancialReports = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { status, type, startDate, endDate } = req.query as Record<string, string>;

  let query = db.from('payments').select('*');
  if (status) query = query.eq('status', status);
  if (type) query = query.eq('type', type);
  if (startDate) query = query.gte('created_at', new Date(startDate).toISOString());
  if (endDate) query = query.lte('created_at', new Date(endDate).toISOString());

  const { data: payments, error } = await query.limit(500);
  if (error) throw ApiError.internal(`Failed to fetch payments: ${error.message}`);

  const totals = (payments || []).reduce(
    (acc, p: PaymentRow) => {
      acc.totalAmount += Number(p.amount || 0);
      acc.byStatus[p.status] = (acc.byStatus[p.status] ?? 0) + Number(p.amount || 0);
      return acc;
    },
    { totalAmount: 0, byStatus: {} as Record<string, number> }
  );

  res.json(ApiResponse.success('Financial reports generated successfully', { totals, payments: payments || [] }));
});

export const getFinancialAnalytics = asyncHandler(async (_req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { data: invoices } = await db.from('invoices').select('status, total_amount');

  const monthlyRevenue: RevenuePoint[] = [];
  const topStudents: TopStudent[] = [];
  const invoiceStats = (invoices || []).reduce((acc: Record<string, { count: number; total: number }>, inv: InvoiceRow) => {
    const key = inv.status;
    acc[key] = acc[key] || { count: 0, total: 0 };
    acc[key].count += 1;
    acc[key].total += Number(inv.total_amount || 0);
    return acc;
  }, {});

  res.json(ApiResponse.success('Financial analytics retrieved successfully', { monthlyRevenue, topStudents, invoices: invoiceStats }));
});

export const getAdminAnalytics = asyncHandler(async (_req: Request, res: Response) => {
  const db = supabaseAdmin();
  const [usersCountResp, studentsCountResp, lecturersCountResp, coursesCountResp, pendingPaymentsResp, publishedResultsResp, hostelsResp] = await Promise.all([
    db.from('profiles').select('id', { count: 'exact', head: true }),
    db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', USER_ROLES.STUDENT),
    db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', USER_ROLES.LECTURER),
    db.from('courses').select('id', { count: 'exact', head: true }).eq('is_active', true),
    db.from('payments').select('id', { count: 'exact', head: true }).in('status', ['pending', 'processing']),
    db.from('results').select('id', { count: 'exact', head: true }).eq('is_published', true),
    db.from('hostels').select('capacity, occupied'),
  ]);

  const capacity = (hostelsResp.data || []).reduce((sum: number, h: HostelSummaryRow) => sum + Number(h.capacity || 0), 0);
  const occupied = (hostelsResp.data || []).reduce((sum: number, h: HostelSummaryRow) => sum + Number(h.occupied || 0), 0);
  const occupancyRate = capacity ? parseFloat(((occupied / capacity) * 100).toFixed(1)) : 0;

  res.json(
    ApiResponse.success('Admin analytics retrieved successfully', {
      totals: {
        users: usersCountResp.count || 0,
        students: studentsCountResp.count || 0,
        lecturers: lecturersCountResp.count || 0,
        courses: coursesCountResp.count || 0,
      },
      finance: {
        pendingPayments: pendingPaymentsResp.count || 0,
        publishedResults: publishedResultsResp.count || 0,
      },
      hostels: { capacity, occupied, occupancyRate },
    })
  );
});

export const getAdminSettings = asyncHandler(async (_req: Request, res: Response) => {
  const settings = await ensureSystemSettings();
  res.json(ApiResponse.success('Settings retrieved successfully', settings));
});

export const updateAdminSettings = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const updates = req.body ?? {};
  const existing = await ensureSystemSettings();
  const { data, error } = await db
    .from('system_settings')
    .update({ ...updates, updated_by: req.user?.userId || null })
    .eq('id', (existing as { id: string }).id)
    .select()
    .single();
  if (error) throw ApiError.internal(`Failed to update settings: ${error.message}`);
  res.json(ApiResponse.success('Settings updated successfully', data));
});

