import { Request, Response } from 'express';
import Hostel from '../models/Hostel.model';
import HostelApplication from '../models/HostelApplication.model';
import Session from '../models/Session.model';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import notificationService from '../services/notification.service';
import { USER_ROLES } from '../utils/constants';

/**
 * @desc    Create new hostel
 * @route   POST /api/v1/hostels
 * @access  Private (Admin)
 */
export const createHostel = asyncHandler(async (req: Request, res: Response) => {
  const { name, gender, totalRooms, capacity, rooms, facilities } = req.body;

  const hostel = await Hostel.create({
    name,
    gender,
    totalRooms,
    capacity,
    rooms: rooms || [],
    facilities: facilities || [],
    occupied: 0,
    isActive: true,
  });

  res.status(201).json(ApiResponse.success('Hostel created successfully', hostel));
});

/**
 * @desc    Get all hostels
 * @route   GET /api/v1/hostels
 * @access  Public (Authenticated)
 */
export const getHostels = asyncHandler(async (req: Request, res: Response) => {
  const { gender, available, page = 1, limit = 20 } = req.query;

  const query: any = {};

  if (gender) query.gender = gender;
  if (available === 'true') {
    query.$expr = { $lt: ['$occupied', '$capacity'] };
  }

  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;

  const [hostels, total] = await Promise.all([
    Hostel.find(query).sort({ name: 1 }).skip(skip).limit(limitNum),
    Hostel.countDocuments(query),
  ]);

  res.json(
    ApiResponse.success('Data retrieved successfully', {
      hostels,
      pagination: {
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum),
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
  const hostel = await Hostel.findById(req.params.id).populate('rooms.students', 'firstName lastName email studentId');

  if (!hostel) {
    throw ApiError.notFound('Hostel not found');
  }

  res.json(ApiResponse.success('Data retrieved successfully', hostel));
});

/**
 * @desc    Update hostel
 * @route   PUT /api/v1/hostels/:id
 * @access  Private (Admin)
 */
export const updateHostel = asyncHandler(async (req: Request, res: Response) => {
  const hostel = await Hostel.findById(req.params.id);

  if (!hostel) {
    throw ApiError.notFound('Hostel not found');
  }

  const { name, gender, totalRooms, capacity, facilities, isActive } = req.body;

  if (name) hostel.name = name;
  if (gender) hostel.gender = gender;
  if (totalRooms) hostel.totalRooms = totalRooms;
  if (capacity) hostel.capacity = capacity;
  if (facilities) hostel.facilities = facilities;
  if (typeof isActive !== 'undefined') hostel.isActive = isActive;

  await hostel.save();

  res.json(ApiResponse.success('Hostel updated successfully', hostel));
});

/**
 * @desc    Delete hostel
 * @route   DELETE /api/v1/hostels/:id
 * @access  Private (Admin)
 */
export const deleteHostel = asyncHandler(async (req: Request, res: Response) => {
  const hostel = await Hostel.findById(req.params.id);

  if (!hostel) {
    throw ApiError.notFound('Hostel not found');
  }

  if (hostel.occupied > 0) {
    throw ApiError.badRequest('Cannot delete hostel with allocated rooms');
  }

  await hostel.deleteOne();

  res.json(ApiResponse.success('Hostel deleted successfully', null));
});

/**
 * @desc    Apply for hostel accommodation
 * @route   POST /api/v1/hostels/apply
 * @access  Private (Student)
 */
export const applyForHostel = asyncHandler(async (req: Request, res: Response) => {
  const { session, roommatePref, specialRequests } = req.body;

  // Verify session exists
  const sessionExists = await Session.findById(session);
  if (!sessionExists) {
    throw ApiError.notFound('Session not found');
  }

  // Check if student already has an application for this session
  const existingApplication = await HostelApplication.findOne({
    student: (req as any).user._id,
    session,
  });

  if (existingApplication) {
    throw ApiError.badRequest('You have already applied for hostel accommodation this session');
  }

  const application = await HostelApplication.create({
    student: (req as any).user._id,
    session,
    roommatePref,
    specialRequests,
    status: 'pending',
  });

  res
    .status(201)
    .json(ApiResponse.success('Hostel application submitted successfully', application));
});

/**
 * @desc    Get all hostel applications
 * @route   GET /api/v1/hostels/applications
 * @access  Private (Admin or own applications for students)
 */
export const getHostelApplications = asyncHandler(async (req: Request, res: Response) => {
  const { status, session, page = 1, limit = 20 } = req.query;

  const query: any = {};

  // Students can only see their own applications
  if ((req as any).user.role === USER_ROLES.STUDENT) {
    query.student = (req as any).user._id;
  }

  if (status) query.status = status;
  if (session) query.session = session;

  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;

  const [applications, total] = await Promise.all([
    HostelApplication.find(query)
      .populate('student', 'firstName lastName email studentId gender')
      .populate('hostel', 'name')
      .populate('session', 'name')
      .populate('processedBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    HostelApplication.countDocuments(query),
  ]);

  res.json(
    ApiResponse.success('Data retrieved successfully', {
      applications,
      pagination: {
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum),
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
  const application = await HostelApplication.findById(req.params.id)
    .populate('student', 'firstName lastName email studentId gender')
    .populate('hostel', 'name')
    .populate('session', 'name')
    .populate('processedBy', 'firstName lastName');

  if (!application) {
    throw ApiError.notFound('Application not found');
  }

  // Students can only view their own applications
  if (
    (req as any).user.role === USER_ROLES.STUDENT &&
    application.student._id.toString() !== (req as any).user._id.toString()
  ) {
    throw ApiError.forbidden('You are not authorized to view this application');
  }

  res.json(ApiResponse.success('Data retrieved successfully', application));
});

export const getMyHostelApplication = asyncHandler(async (req: Request, res: Response) => {
  const application = await HostelApplication.findOne({
    student: (req as any).user._id,
  })
    .sort({ createdAt: -1 })
    .populate('student', 'firstName lastName email studentId gender')
    .populate('hostel', 'name')
    .populate('session', 'name')
    .populate('processedBy', 'firstName lastName');

  if (!application) {
    throw ApiError.notFound('No hostel application found for this student');
  }

  res.json(ApiResponse.success('Data retrieved successfully', application));
});

/**
 * @desc    Approve hostel application
 * @route   PUT /api/v1/hostels/applications/:id/approve
 * @access  Private (Admin)
 */
export const approveHostelApplication = asyncHandler(async (req: Request, res: Response) => {
  const application = await HostelApplication.findById(req.params.id).populate(
    'student',
    'gender'
  );

  if (!application) {
    throw ApiError.notFound('Application not found');
  }

  if (application.status !== 'pending') {
    throw ApiError.badRequest('Application has already been processed');
  }

  application.status = 'approved';
  application.processedBy = (req as any).user._id;
  application.processedAt = new Date();

  await application.save();

  // Notify student
  await notificationService.createNotification(
    (application.student as any)._id.toString(),
    'success',
    'Hostel Application Approved',
    'Your hostel application has been approved. Room allocation will be done soon.'
  );

  res.json(ApiResponse.success('Application approved successfully', application));
});

/**
 * @desc    Reject hostel application
 * @route   PUT /api/v1/hostels/applications/:id/reject
 * @access  Private (Admin)
 */
export const rejectHostelApplication = asyncHandler(async (req: Request, res: Response) => {
  const application = await HostelApplication.findById(req.params.id);

  if (!application) {
    throw ApiError.notFound('Application not found');
  }

  if (application.status !== 'pending') {
    throw ApiError.badRequest('Application has already been processed');
  }

  application.status = 'rejected';
  application.processedBy = (req as any).user._id;
  application.processedAt = new Date();

  await application.save();

  // Notify student
  await notificationService.createNotification(
    application.student.toString(),
    'error',
    'Hostel Application Rejected',
    'Your hostel application has been rejected. Please contact administration for more information.'
  );

  res.json(ApiResponse.success('Application rejected', application));
});

/**
 * @desc    Allocate room to approved application
 * @route   PUT /api/v1/hostels/applications/:id/allocate
 * @access  Private (Admin)
 */
export const allocateRoom = asyncHandler(async (req: Request, res: Response) => {
  const { hostelId, roomNumber } = req.body;

  const application = await HostelApplication.findById(req.params.id).populate(
    'student',
    'gender'
  );

  if (!application) {
    throw ApiError.notFound('Application not found');
  }

  if (application.status !== 'approved') {
    throw ApiError.badRequest('Only approved applications can be allocated rooms');
  }

  const hostel = await Hostel.findById(hostelId);
  if (!hostel) {
    throw ApiError.notFound('Hostel not found');
  }

  // Verify gender match
  const studentGender = (application.student as any).gender;
  if (hostel.gender !== 'mixed' && hostel.gender !== studentGender) {
    throw ApiError.badRequest('Student gender does not match hostel type');
  }

  // Find the room
  const room = hostel.rooms.find((r: any) => r.number === roomNumber);
  if (!room) {
    throw ApiError.notFound('Room not found');
  }

  if (room.occupied >= room.capacity) {
    throw ApiError.badRequest('Room is full');
  }

  // Allocate room
  room.students.push(application.student._id);
  room.occupied += 1;
  hostel.occupied += 1;

  await hostel.save();

  application.hostel = hostel._id;
  application.room = roomNumber;
  application.status = 'allocated';
  application.allocatedAt = new Date();

  await application.save();

  // Notify student
  await notificationService.createNotification(
    (application.student as any)._id.toString(),
    'success',
    'Room Allocated',
    `You have been allocated ${hostel.name}, Room ${roomNumber}.`
  );

  res.json(ApiResponse.success('Room allocated successfully', application));
});

/**
 * @desc    Get hostel statistics
 * @route   GET /api/v1/hostels/stats/overview
 * @access  Private (Admin)
 */
export const getHostelStats = asyncHandler(async (_req: Request, res: Response) => {
  const hostels = await Hostel.find();

  const stats = {
    totalHostels: hostels.length,
    totalCapacity: hostels.reduce((sum: number, h: any) => sum + h.capacity, 0),
    totalOccupied: hostels.reduce((sum: number, h: any) => sum + h.occupied, 0),
    totalAvailable: hostels.reduce((sum: number, h: any) => sum + (h.capacity - h.occupied), 0),
    occupancyRate:
      hostels.length > 0
        ? (hostels.reduce((sum: number, h: any) => sum + h.occupied, 0) /
            hostels.reduce((sum: number, h: any) => sum + h.capacity, 0)) *
          100
        : 0,
    byGender: {
      male: hostels.filter((h: any) => h.gender === 'male').length,
      female: hostels.filter((h: any) => h.gender === 'female').length,
      mixed: hostels.filter((h: any) => h.gender === 'mixed').length,
    },
  };

  const applicationStats = await HostelApplication.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      },
    },
  ]);

  res.json(
    ApiResponse.success('Data retrieved successfully', {
      hostelStats: stats,
      applicationStats,
    })
  );
});
