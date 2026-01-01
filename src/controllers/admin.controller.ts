import fs from 'fs';
import mongoose from 'mongoose';
import { Request, Response } from 'express';
import User from '../models/User.model';
import Hostel, { IHostel } from '../models/Hostel.model';
import HostelApplication from '../models/HostelApplication.model';
import Announcement from '../models/Announcement.model';
import Invoice from '../models/Invoice.model';
import Payment from '../models/Payment.model';
import SystemSetting from '../models/SystemSetting.model';
import Course from '../models/Course.model';
import Result from '../models/Result.model';
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

const recalculateHostelOccupancy = (hostel: IHostel) => {
  hostel.occupied = hostel.rooms.reduce((total, room) => total + (room.students?.length ?? 0), 0);
  hostel.rooms.forEach((room) => {
    room.occupied = room.students?.length ?? 0;
  });
};

const findHostelRoom = async (hostelId: string, roomNumber: string) => {
  if (!mongoose.Types.ObjectId.isValid(hostelId)) {
    throw ApiError.badRequest('Invalid hostel identifier');
  }

  const hostel = await Hostel.findById(hostelId).populate('rooms.students', 'firstName lastName email studentId level phoneNumber');
  if (!hostel) {
    throw ApiError.notFound('Hostel not found');
  }

  const room = hostel.rooms.find((r) => r.number === roomNumber);
  if (!room) {
    throw ApiError.notFound('Room not found');
  }

  return { hostel, room };
};

const ensureSystemSettings = async () => {
  let settings = await SystemSetting.findOne();
  if (!settings) {
    settings = await SystemSetting.create({});
  }
  return settings;
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
  if (!req.file) {
    throw ApiError.badRequest('CSV file is required');
  }

  const filePath = req.file.path;
  let rows: Array<Record<string, string>> = [];

  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    rows = parseCsvContent(content);
  } finally {
    fs.promises.unlink(filePath).catch(() => undefined);
  }

  if (!rows.length) {
    throw ApiError.badRequest('CSV file is empty');
  }

  const summary = {
    totalRows: rows.length,
    created: 0,
    skipped: 0,
    errors: [] as string[],
  };

  const generatedCredentials: Array<{ email: string; password: string }> = [];

  for (let index = 0; index < rows.length; index += 1) {
    const rowNumber = index + 2; // account for header line
    const record = rows[index];
    const lower = new Proxy(record, {
      get(target, prop) {
        const key = String(prop).toLowerCase();
        return target[key];
      },
    }) as Record<string, string>;

    const email = (lower.email || '').toLowerCase();
    const firstName = lower.firstname || lower['first name'] || lower.first_name;
    const lastName = lower.lastname || lower['last name'] || lower.last_name;
      const roleInput = (lower.role || USER_ROLES.STUDENT).toLowerCase();
      const role = allowedRoles.has(roleInput as UserRole) ? (roleInput as UserRole) : undefined;

    if (!email || !firstName || !lastName) {
      summary.errors.push(`Row ${rowNumber}: missing required fields (email, firstName, lastName)`);
      summary.skipped += 1;
      continue;
    }

      if (!role) {
      summary.errors.push(`Row ${rowNumber}: unsupported role "${role}"`);
      summary.skipped += 1;
      continue;
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      summary.skipped += 1;
      continue;
    }

    const password = lower.password?.length ? lower.password : generateReference('PWD').slice(-10);

    const user = new User({
      email,
      password,
      firstName,
      lastName,
      role,
      studentId: lower.studentid || lower['student id'] || lower.matric || undefined,
      level: lower.level || undefined,
      phoneNumber: lower.phonenumber || lower.phone || undefined,
      address: lower.address || undefined,
    });

    if (lower.department && mongoose.Types.ObjectId.isValid(lower.department)) {
      user.department = new mongoose.Types.ObjectId(lower.department);
    }

    await user.save();
    summary.created += 1;
    generatedCredentials.push({ email, password });
  }

  res.status(201).json(
    ApiResponse.success('Bulk upload processed successfully', {
      summary,
      generatedCredentials,
    })
  );
});

export const getHostelRoomDetails = asyncHandler(async (req: Request, res: Response) => {
  const { hostel, room } = await findHostelRoom(req.params.hostelId, req.params.roomNumber);

  res.json(
    ApiResponse.success('Room retrieved successfully', {
      hostel: {
        id: hostel._id,
        name: hostel.name,
        gender: hostel.gender,
      },
      room,
    })
  );
});

export const updateHostelRoom = asyncHandler(async (req: Request, res: Response) => {
  const { hostel, room } = await findHostelRoom(req.params.hostelId, req.params.roomNumber);
  const { capacity, number } = req.body;

  if (capacity !== undefined) {
    if (typeof capacity !== 'number' || capacity < room.occupied) {
      throw ApiError.badRequest('Capacity must be a number greater than or equal to current occupancy');
    }
    room.capacity = capacity;
  }

  if (number && number !== room.number) {
    const exists = hostel.rooms.some((r) => r.number === number);
    if (exists) {
      throw ApiError.badRequest('Another room already uses this number');
    }
    room.number = number;
  }

  hostel.markModified('rooms');
  await hostel.save();

  res.json(ApiResponse.success('Room updated successfully', room));
});

export const assignHostelRoom = asyncHandler(async (req: Request, res: Response) => {
  const { hostel, room } = await findHostelRoom(req.params.hostelId, req.params.roomNumber);
  const { studentId, applicationId } = req.body as { studentId: string; applicationId?: string };

  if (!studentId || !mongoose.Types.ObjectId.isValid(studentId)) {
    throw ApiError.badRequest('Valid studentId is required');
  }

  const student = await User.findById(studentId);
  if (!student || student.role !== USER_ROLES.STUDENT) {
    throw ApiError.badRequest('Student not found or invalid role');
  }

  if (room.students.find((id) => id.toString() === studentId)) {
    throw ApiError.badRequest('Student already assigned to this room');
  }

  if (room.occupied >= room.capacity) {
    throw ApiError.badRequest('Room is already at full capacity');
  }

  room.students.push(new mongoose.Types.ObjectId(studentId));
  recalculateHostelOccupancy(hostel);
  hostel.markModified('rooms');
  await hostel.save();

  if (applicationId && mongoose.Types.ObjectId.isValid(applicationId)) {
    await HostelApplication.findByIdAndUpdate(applicationId, {
      hostel: hostel._id,
      room: room.number,
      status: 'allocated',
      allocatedAt: new Date(),
    });
  }

  await notificationService.createNotification(
    student._id.toString(),
    'success',
    'Hostel Assignment',
    `You have been assigned to ${hostel.name}, room ${room.number}.`
  );

  res.status(201).json(
    ApiResponse.success('Student assigned successfully', {
      room,
      hostel: {
        id: hostel._id,
        occupied: hostel.occupied,
      },
    })
  );
});

export const evictStudentFromRoom = asyncHandler(async (req: Request, res: Response) => {
  const { hostel, room } = await findHostelRoom(req.params.hostelId, req.params.roomNumber);
  const { studentId } = req.body as { studentId: string };

  if (!studentId || !mongoose.Types.ObjectId.isValid(studentId)) {
    throw ApiError.badRequest('Valid studentId is required');
  }

  const initialLength = room.students.length;
  room.students = room.students.filter((id) => id.toString() !== studentId);

  if (room.students.length === initialLength) {
    throw ApiError.notFound('Student not found in this room');
  }

  recalculateHostelOccupancy(hostel);
  hostel.markModified('rooms');
  await hostel.save();

  await HostelApplication.findOneAndUpdate(
    { student: studentId, hostel: hostel._id, room: room.number },
    { status: 'approved', room: undefined }
  );

  await notificationService.createNotification(
    studentId,
    'warning',
    'Hostel Update',
    `You have been removed from ${hostel.name}, room ${room.number}. Please contact the administrator for more details.`
  );

  res.json(
    ApiResponse.success('Student evicted successfully', {
      room,
      hostel: {
        id: hostel._id,
        occupied: hostel.occupied,
      },
    })
  );
});

export const getAnnouncements = asyncHandler(async (req: Request, res: Response) => {
  const { audience, search, isPinned, status, page = 1, limit = 20 } = req.query;
  const filter: Record<string, any> = {};

  if (audience && audience !== 'all') {
    filter.audience = { $in: [audience] };
  }

  if (status === 'published') {
    filter.isPublished = true;
    filter.publishAt = { $lte: new Date() };
  } else if (status === 'scheduled') {
    filter.publishAt = { $gt: new Date() };
  }

  if (typeof isPinned === 'string') {
    filter.isPinned = isPinned === 'true';
  }

  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: 'i' } },
      { message: { $regex: search, $options: 'i' } },
    ];
  }

  const pageNum = Number(page) || 1;
  const limitNum = Math.min(Number(limit) || 20, 100);
  const skip = (pageNum - 1) * limitNum;

  const [announcements, total] = await Promise.all([
    Announcement.find(filter)
      .sort({ isPinned: -1, publishAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate('createdBy', 'firstName lastName'),
    Announcement.countDocuments(filter),
  ]);

  res.json(
    ApiResponse.success('Announcements retrieved successfully', {
      announcements,
      pagination: {
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum),
        limit: limitNum,
      },
    })
  );
});

export const createAnnouncement = asyncHandler(async (req: Request, res: Response) => {
  const { title, message, audience, tags, publishAt, expiresAt, isPinned = false, isPublished = true, notifyUsers = false } = req.body;

  if (!title || !message) {
    throw ApiError.badRequest('Title and message are required');
  }

  const normalizedAudience = normalizeAudience(audience) as UserRole[] | ['all'];

  const announcement = await Announcement.create({
    title,
    message,
    tags: tags || [],
    audience: normalizedAudience,
    publishAt: publishAt ? new Date(publishAt) : new Date(),
    expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    isPinned,
    isPublished,
    createdBy: (req as any).user._id,
  });

  if (notifyUsers) {
    let userFilter: Record<string, any> = {};
    const broadcastToAll = normalizedAudience.some((role) => role === 'all');
    if (!broadcastToAll) {
      userFilter = { role: { $in: normalizedAudience } };
    }
    const recipients = await User.find(userFilter).select('_id').limit(1000);
    if (recipients.length) {
      await notificationService.createBulkNotifications(
        recipients.map((recipient) => recipient._id.toString()),
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
  const announcement = await Announcement.findById(req.params.id);
  if (!announcement) {
    throw ApiError.notFound('Announcement not found');
  }

  const { title, message, audience, tags, publishAt, expiresAt, isPinned, isPublished } = req.body;

  if (title) announcement.title = title;
  if (message) announcement.message = message;
  if (audience) announcement.audience = normalizeAudience(audience) as UserRole[] | ['all'];
  if (tags) announcement.tags = tags;
  if (publishAt) announcement.publishAt = new Date(publishAt);
  if (expiresAt) announcement.expiresAt = new Date(expiresAt);
  if (typeof isPinned === 'boolean') announcement.isPinned = isPinned;
  if (typeof isPublished === 'boolean') announcement.isPublished = isPublished;
  announcement.updatedBy = (req as any).user._id;

  await announcement.save();

  res.json(ApiResponse.success('Announcement updated successfully', announcement));
});

export const deleteAnnouncement = asyncHandler(async (req: Request, res: Response) => {
  const announcement = await Announcement.findById(req.params.id);
  if (!announcement) {
    throw ApiError.notFound('Announcement not found');
  }

  await announcement.deleteOne();
  res.json(ApiResponse.success('Announcement deleted successfully', null));
});

export const getFinancialOverview = asyncHandler(async (_req: Request, res: Response) => {
  const now = new Date();
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(now.getMonth() - 5);

  const [statusBreakdown, typeBreakdown, monthlyTrend, outstandingInvoices, recentInvoices] = await Promise.all([
    Payment.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$amount' } } },
    ]),
    Payment.aggregate([
      { $group: { _id: '$type', count: { $sum: 1 }, amount: { $sum: '$amount' } } },
    ]),
    Payment.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
          amount: { $sum: '$amount' },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]),
    Invoice.find({ status: { $in: ['pending', 'overdue'] } })
      .sort({ dueDate: 1 })
      .limit(10)
      .populate('student', 'firstName lastName email studentId'),
    Invoice.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('student', 'firstName lastName email studentId'),
  ]);

  res.json(
    ApiResponse.success('Financial overview retrieved successfully', {
      payments: {
        byStatus: statusBreakdown,
        byType: typeBreakdown,
        monthlyTrend,
      },
      invoices: {
        outstanding: outstandingInvoices,
        recent: recentInvoices,
      },
    })
  );
});

export const generateInvoice = asyncHandler(async (req: Request, res: Response) => {
  const { studentId, items, dueDate, notes, sendNotification = true } = req.body;

  if (!studentId || !mongoose.Types.ObjectId.isValid(studentId)) {
    throw ApiError.badRequest('Valid studentId is required');
  }

  if (!Array.isArray(items) || !items.length) {
    throw ApiError.badRequest('At least one invoice item is required');
  }

  if (!dueDate) {
    throw ApiError.badRequest('dueDate is required');
  }

  const student = await User.findById(studentId);
  if (!student) {
    throw ApiError.notFound('Student not found');
  }

  const totalAmount = items.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);
  const settings = await ensureSystemSettings();
  const currency = settings.portal.defaultCurrency ?? 'NGN';

  const invoice = await Invoice.create({
    reference: generateReference('INV'),
    student: student._id,
    items: items.map((item: any) => ({ label: item.label, amount: item.amount, type: item.type })),
    totalAmount,
    currency,
    dueDate: new Date(dueDate),
    status: 'pending',
    notes,
    createdBy: (req as any).user._id,
    sentAt: new Date(),
  });

  const emailHtml = `
    <h1>Invoice ${invoice.reference}</h1>
    <p>Dear ${student.firstName},</p>
    <p>You have a new invoice with total amount <strong>${currency} ${totalAmount.toLocaleString()}</strong>.</p>
    <p>Due Date: ${new Date(dueDate).toDateString()}</p>
    <p>Please log in to the portal to complete your payment.</p>
  `;

  await emailService.sendEmail({
    to: student.email,
    subject: `Invoice ${invoice.reference}`,
    html: emailHtml,
  });

  if (sendNotification) {
    await notificationService.createNotification(
      student._id.toString(),
      'info',
      'New Invoice Generated',
      `An invoice (${invoice.reference}) totaling ${currency} ${totalAmount.toLocaleString()} has been generated.`,
      '/payments'
    );
  }

  res.status(201).json(ApiResponse.success('Invoice generated successfully', invoice));
});

export const sendFinancialReminder = asyncHandler(async (req: Request, res: Response) => {
  const { invoiceId, channels = ['email', 'notification'], message } = req.body;

  if (!invoiceId || !mongoose.Types.ObjectId.isValid(invoiceId)) {
    throw ApiError.badRequest('Valid invoiceId is required');
  }

  const invoice = await Invoice.findById(invoiceId).populate('student', 'email firstName lastName');
  if (!invoice) {
    throw ApiError.notFound('Invoice not found');
  }

  if (invoice.status === 'paid' || invoice.status === 'cancelled') {
    throw ApiError.badRequest('Reminders can only be sent for pending or overdue invoices');
  }

  const reminderMessage =
    message ||
    `Reminder: Invoice ${invoice.reference} totaling ${invoice.currency} ${invoice.totalAmount.toLocaleString()} is pending. Due on ${invoice.dueDate.toDateString()}.`;

  if (channels.includes('email') && (invoice.student as any)?.email) {
    await emailService.sendEmail({
      to: (invoice.student as any).email,
      subject: `Reminder: Invoice ${invoice.reference}`,
      html: `<p>${reminderMessage}</p>`,
    });
  }

  if (channels.includes('notification')) {
    await notificationService.createNotification(
      (invoice.student as any)._id?.toString() ?? '',
      'warning',
      'Invoice Reminder',
      reminderMessage,
      '/payments'
    );
  }

  invoice.reminders.push({
    sentAt: new Date(),
    channel: channels.includes('email') ? 'email' : 'notification',
    message: reminderMessage,
  });

  if (invoice.dueDate.getTime() < Date.now()) {
    invoice.status = 'overdue';
  }

  await invoice.save();

  res.json(ApiResponse.success('Reminder sent successfully', invoice));
});

export const getFinancialReports = asyncHandler(async (req: Request, res: Response) => {
  const { status, type, startDate, endDate } = req.query;

  const filter: Record<string, any> = {};
  if (status) filter.status = status;
  if (type) filter.type = type;

  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(String(startDate));
    if (endDate) filter.createdAt.$lte = new Date(String(endDate));
  }

  const payments = await Payment.find(filter)
    .sort({ createdAt: -1 })
    .limit(500)
    .populate('student', 'firstName lastName email studentId');

  const totals = payments.reduce(
    (acc, payment) => {
      acc.totalAmount += payment.amount;
      acc.byStatus[payment.status] = (acc.byStatus[payment.status] ?? 0) + payment.amount;
      return acc;
    },
    { totalAmount: 0, byStatus: {} as Record<string, number> }
  );

  res.json(
    ApiResponse.success('Financial reports generated successfully', {
      totals,
      payments,
    })
  );
});

export const getFinancialAnalytics = asyncHandler(async (_req: Request, res: Response) => {
  const now = new Date();
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(now.getFullYear() - 1);

  const [monthlyRevenue, topStudents, invoiceStats] = await Promise.all([
    Payment.aggregate([
      { $match: { createdAt: { $gte: oneYearAgo }, status: 'verified' } },
      { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, amount: { $sum: '$amount' } } },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]),
    Payment.aggregate([
      { $match: { status: 'verified' } },
      { $group: { _id: '$student', amount: { $sum: '$amount' } } },
      { $sort: { amount: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'student',
        },
      },
      { $unwind: '$student' },
      {
        $project: {
          amount: 1,
          student: {
            _id: '$student._id',
            name: { $concat: ['$student.firstName', ' ', '$student.lastName'] },
            email: '$student.email',
          },
        },
      },
    ]),
    Invoice.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$totalAmount' } } },
    ]),
  ]);

  res.json(
    ApiResponse.success('Financial analytics retrieved successfully', {
      monthlyRevenue,
      topStudents,
      invoices: invoiceStats,
    })
  );
});

export const getAdminAnalytics = asyncHandler(async (_req: Request, res: Response) => {
  const [totalUsers, totalStudents, totalLecturers, activeCourses, pendingPayments, publishedResults] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ role: USER_ROLES.STUDENT }),
    User.countDocuments({ role: USER_ROLES.LECTURER }),
    Course.countDocuments({ isActive: true }),
    Payment.countDocuments({ status: { $in: ['pending', 'processing'] } }),
    Result.countDocuments({ isPublished: true }),
  ]);

  const hostelStats = await Hostel.aggregate([
    {
      $group: {
        _id: null,
        capacity: { $sum: '$capacity' },
        occupied: { $sum: '$occupied' },
      },
    },
  ]);

  const capacity = hostelStats[0]?.capacity ?? 0;
  const occupied = hostelStats[0]?.occupied ?? 0;
  const occupancyRate = capacity ? parseFloat(((occupied / capacity) * 100).toFixed(1)) : 0;

  res.json(
    ApiResponse.success('Admin analytics retrieved successfully', {
      totals: {
        users: totalUsers,
        students: totalStudents,
        lecturers: totalLecturers,
        courses: activeCourses,
      },
      finance: {
        pendingPayments,
        publishedResults,
      },
      hostels: {
        capacity,
        occupied,
        occupancyRate,
      },
    })
  );
});

export const getAdminSettings = asyncHandler(async (_req: Request, res: Response) => {
  const settings = await ensureSystemSettings();
  res.json(ApiResponse.success('Settings retrieved successfully', settings));
});

export const updateAdminSettings = asyncHandler(async (req: Request, res: Response) => {
  const updates = req.body ?? {};
  const updated = await SystemSetting.findOneAndUpdate(
    {},
    { $set: { ...updates, updatedBy: (req as any).user._id } },
    { new: true, upsert: true }
  );

  res.json(ApiResponse.success('Settings updated successfully', updated));
});
