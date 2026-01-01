import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import Clearance, { IClearance } from '../models/Clearance.model';
import notificationService from '../services/notification.service';

const DEFAULT_DEPARTMENTS = [
  {
    name: 'Library',
    description: 'Ensure all borrowed books are returned and fines cleared',
    status: 'pending',
    required: true
  },
  {
    name: 'Bursary',
    description: 'Confirm all outstanding fees have been paid',
    status: 'pending',
    required: true
  },
  {
    name: 'Department',
    description: 'Departmental clearance from HOD',
    status: 'pending',
    required: true
  },
  {
    name: 'Hostel',
    description: 'Hostel clearance (if applicable)',
    status: 'pending',
    required: false
  },
  {
    name: 'Security',
    description: 'Security clearance and ID card return',
    status: 'pending',
    required: true
  }
];

const getCurrentAcademicYear = () => '2024/2025';

const ensureClearanceRecord = async (studentId: string): Promise<IClearance> => {
  let clearance = await Clearance.findOne({
    student: studentId,
    academicYear: getCurrentAcademicYear()
  })
    .populate('student', 'firstName lastName email matricNumber department level')
    .populate('departments.approvedBy', 'firstName lastName');

  if (!clearance) {
    clearance = await Clearance.create({
      student: studentId,
      academicYear: getCurrentAcademicYear(),
      semester: 'Second Semester',
      departments: DEFAULT_DEPARTMENTS.map((dept) => ({ ...dept }))
    });

    await clearance.populate('student', 'firstName lastName email matricNumber department level');
    await clearance.populate('departments.approvedBy', 'firstName lastName');
  }

  if (!clearance) {
    throw new Error('Unable to initialize clearance record');
  }

  return clearance;
};

const recomputeOverallStatus = (clearance: any) => {
  const deptStatuses = clearance.departments.map((dept: any) => dept.status);
  if (deptStatuses.every((status: string) => status === 'approved')) {
    clearance.overallStatus = 'completed';
    clearance.completedAt = new Date();
  } else if (deptStatuses.includes('rejected')) {
    clearance.overallStatus = 'rejected';
    clearance.completedAt = undefined;
  } else {
    clearance.overallStatus = 'in-progress';
    clearance.completedAt = undefined;
  }
};

// @desc    Get student clearance status
// @route   GET /api/v1/students/clearance
// @access  Private (Student)
export const getStudentClearance = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;

  const clearance = await ensureClearanceRecord(userId);

  res.json(
    ApiResponse.success('Clearance status fetched successfully', clearance)
  );
});

// @desc    Request clearance document
// @route   POST /api/v1/students/clearance/documents/request
// @access  Private (Student)
export const requestClearanceDocument = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { documentType, purpose, deliveryMethod, urgency } = req.body;

  const clearance = await ensureClearanceRecord(userId);

  clearance.documentRequests.push({
    documentType,
    purpose,
    deliveryMethod,
    urgency: urgency || 'normal',
    status: 'pending',
    requestedAt: new Date()
  });

  await clearance.save();

  res.status(201).json(
    ApiResponse.success('Document request submitted successfully', clearance.documentRequests.slice(-1)[0])
  );
});

// @desc    Get all clearance requests (Admin)
// @route   GET /api/v1/admin/clearance
// @access  Private (Admin)
export const getAllClearanceRequests = asyncHandler(async (req: Request, res: Response) => {
  const { status, department, page = 1, limit = 20 } = req.query;

  const skip = (Number(page) - 1) * Number(limit);

  const query: Record<string, any> = {};
  if (status) query.overallStatus = status;
  if (department) query['departments.name'] = department;

  const clearances = await Clearance.find(query)
    .populate('student', 'firstName lastName email matricNumber department level')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit));

  const total = await Clearance.countDocuments(query);

  res.json(
    ApiResponse.success('Clearance requests fetched successfully', {
      requests: clearances,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit))
      }
    })
  );
});

// @desc    Get clearance request details (Admin)
// @route   GET /api/v1/admin/clearance/:id
// @access  Private (Admin)
export const getClearanceDetails = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const clearance = await Clearance.findById(id)
    .populate('student', 'firstName lastName email matricNumber department level phoneNumber')
    .populate('departments.approvedBy', 'firstName lastName email');

  if (!clearance) {
    res.status(404);
    throw new Error('Clearance request not found');
  }

  res.json(
    ApiResponse.success('Clearance details fetched successfully', clearance)
  );
});

// @desc    Update department clearance status
// @route   POST /api/v1/admin/clearance/:id/departments
// @access  Private (Admin)
export const updateDepartmentStatus = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const { departmentName, status, comment } = req.body;

  const clearance = await Clearance.findById(id);

  if (!clearance) {
    res.status(404);
    throw new Error('Clearance request not found');
  }

  const department = clearance.departments.find(dept => dept.name === departmentName);

  if (!department) {
    res.status(400);
    throw new Error('Department not found in clearance workflow');
  }

  department.status = status;
  department.comment = comment;
  department.approvedBy = userId;
  department.approvedAt = new Date();

  recomputeOverallStatus(clearance);
  await clearance.save();

  await notificationService.createNotification(
    clearance.student.toString(),
    'info',
    'Clearance Update',
    `${departmentName} department ${status === 'approved' ? 'approved' : 'updated'} your clearance status`,
    `/clearance/${clearance._id}`
  );

  res.json(
    ApiResponse.success('Department status updated successfully', clearance)
  );
});

// @desc    Approve clearance request (overall)
// @route   POST /api/v1/admin/clearance/:id/approve
// @access  Private (Admin)
export const approveClearance = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const { comment } = req.body;

  const clearance = await Clearance.findById(id);

  if (!clearance) {
    res.status(404);
    throw new Error('Clearance request not found');
  }

  clearance.departments = clearance.departments.map((dept: any) => ({
    ...(typeof dept.toObject === 'function' ? dept.toObject() : dept),
    status: 'approved',
    comment: comment || dept.comment,
    approvedBy: userId,
    approvedAt: new Date()
  }));

  clearance.overallStatus = 'completed';
  clearance.completedAt = new Date();
  await clearance.save();

  await notificationService.createNotification(
    clearance.student.toString(),
    'success',
    'Clearance Completed',
    'Congratulations! Your clearance process has been completed successfully.',
    `/clearance/${clearance._id}`
  );

  res.json(
    ApiResponse.success('Clearance approved successfully', clearance)
  );
});

// @desc    Reject clearance request (overall)
// @route   POST /api/v1/admin/clearance/:id/reject
// @access  Private (Admin)
export const rejectClearance = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const { reason, departmentName } = req.body;

  const clearance = await Clearance.findById(id);

  if (!clearance) {
    res.status(404);
    throw new Error('Clearance request not found');
  }

  if (departmentName) {
    const department = clearance.departments.find(dept => dept.name === departmentName);
    if (department) {
      department.status = 'rejected';
      department.comment = reason;
      department.approvedBy = userId;
      department.approvedAt = new Date();
    }
  }

  clearance.overallStatus = 'rejected';
  clearance.completedAt = undefined;
  await clearance.save();

  await notificationService.createNotification(
    clearance.student.toString(),
    'warning',
    'Clearance Update',
    `Your clearance request was rejected${reason ? `: ${reason}` : ''}`,
    `/clearance/${clearance._id}`
  );

  res.json(
    ApiResponse.success('Clearance rejected successfully', clearance)
  );
});
