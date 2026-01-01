import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import Scholarship from '../models/Scholarship.model';
import ScholarshipApplication from '../models/ScholarshipApplication.model';
import User from '../models/User.model';
import Result from '../models/Result.model';
import notificationService from '../services/notification.service';

// @desc    Get available scholarships (Student)
// @route   GET /api/v1/students/scholarships
// @access  Private (Student)
export const getAvailableScholarships = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const user = await User.findById(userId);

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  const userDepartment = user.department ? user.department.toString() : undefined;
  const userLevel = user.level || '';

  // Get student's CGPA
  const results = await Result.find({
    student: userId,
    isPublished: true
  }).populate('course', 'credits');

  let cgpa = 0;
  if (results.length > 0) {
    const totalGradePoints = results.reduce((sum, r) => sum + (r.gradePoints || 0), 0);
    const totalCredits = results.reduce((sum, r) => sum + (((r.course as any)?.credits) || 0), 0);
    cgpa = totalCredits > 0 ? totalGradePoints / totalCredits : 0;
  }

  // Get active scholarships
  const scholarships = await Scholarship.find({
    status: 'active',
    isActive: true,
    applicationDeadline: { $gte: new Date() }
  }).sort({ applicationDeadline: 1 });

  // Filter scholarships based on eligibility
  const eligibleScholarships = scholarships.filter(scholarship => {
    const criteria = scholarship.eligibilityCriteria;
    
    // Check CGPA
    if (criteria.minCGPA && cgpa < criteria.minCGPA) return false;
    
    // Check level
    if (criteria.levels && criteria.levels.length > 0 && !criteria.levels.includes(userLevel)) return false;
    
    // Check department
    if (criteria.departments && criteria.departments.length > 0 && (!userDepartment || !criteria.departments.includes(userDepartment))) return false;
    
    return true;
  });

  // Check which scholarships student has already applied for
  const applicationIds = await ScholarshipApplication.find({
    student: userId
  }).distinct('scholarship');

  const scholarshipsWithStatus = eligibleScholarships.map(scholarship => ({
    id: scholarship._id,
    name: scholarship.name,
    description: scholarship.description,
    amount: scholarship.amount,
    eligibilityCriteria: scholarship.eligibilityCriteria,
    availableSlots: scholarship.availableSlots,
    filledSlots: scholarship.filledSlots,
    applicationDeadline: scholarship.applicationDeadline,
    academicYear: scholarship.academicYear,
    hasApplied: applicationIds.includes(scholarship._id as any)
  }));

  res.json(
    ApiResponse.success('Scholarships fetched successfully', {
      scholarships: scholarshipsWithStatus,
      studentCGPA: parseFloat(cgpa.toFixed(2))
    })
  );
});

// @desc    Apply for scholarship
// @route   POST /api/v1/students/scholarships/apply
// @access  Private (Student)
export const applyForScholarship = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { scholarshipId, reason, documents, financialInfo } = req.body;

  // Check if scholarship exists and is active
  const scholarship = await Scholarship.findById(scholarshipId);
  if (!scholarship) {
    res.status(404);
    throw new Error('Scholarship not found');
  }

  if (scholarship.status !== 'active' || !scholarship.isActive) {
    res.status(400);
    throw new Error('This scholarship is no longer accepting applications');
  }

  if (new Date() > scholarship.applicationDeadline) {
    res.status(400);
    throw new Error('Application deadline has passed');
  }

  if (scholarship.filledSlots >= scholarship.availableSlots) {
    res.status(400);
    throw new Error('All scholarship slots are filled');
  }

  // Check if already applied
  const existingApplication = await ScholarshipApplication.findOne({
    scholarship: scholarshipId,
    student: userId
  });

  if (existingApplication) {
    res.status(400);
    throw new Error('You have already applied for this scholarship');
  }

  // Create application
  const application = await ScholarshipApplication.create({
    scholarship: scholarshipId,
    student: userId,
    reason,
    documents: documents || [],
    financialInfo
  });

  const populatedApplication = await ScholarshipApplication.findById(application._id)
    .populate('scholarship', 'name amount')
    .populate('student', 'firstName lastName email matricNumber');

  res.status(201).json(
    ApiResponse.success('Scholarship application submitted successfully', populatedApplication)
  );
});

// @desc    Get student's scholarship applications
// @route   GET /api/v1/students/scholarships/applications
// @access  Private (Student)
export const getStudentApplications = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;

  const applications = await ScholarshipApplication.find({
    student: userId
  })
    .populate('scholarship', 'name amount status disbursementDate')
    .sort({ createdAt: -1 });

  res.json(
    ApiResponse.success('Applications fetched successfully', {
      applications: applications.map(app => ({
        id: app._id,
        scholarship: {
          name: (app.scholarship as any).name,
          amount: (app.scholarship as any).amount
        },
        status: app.status,
        approvedAmount: app.approvedAmount,
        disbursed: app.disbursed,
        reviewComment: app.reviewComment,
        appliedAt: app.createdAt,
        reviewedAt: app.reviewedAt
      })),
      total: applications.length
    })
  );
});

// @desc    Get all scholarship applications (Bursary)
// @route   GET /api/v1/bursary/scholarships
// @access  Private (Bursary)
export const getAllApplications = asyncHandler(async (req: Request, res: Response) => {
  const { status, scholarshipId, page = 1, limit = 20 } = req.query;

  const skip = (Number(page) - 1) * Number(limit);

  let query: any = {};
  if (status) query.status = status;
  if (scholarshipId) query.scholarship = scholarshipId;

  const applications = await ScholarshipApplication.find(query)
    .populate('scholarship', 'name amount')
    .populate('student', 'firstName lastName email matricNumber department level')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit));

  const total = await ScholarshipApplication.countDocuments(query);

  res.json(
    ApiResponse.success('Applications fetched successfully', {
      applications: applications.map(app => ({
        id: app._id,
        scholarship: {
          name: (app.scholarship as any).name,
          amount: (app.scholarship as any).amount
        },
        student: {
          id: (app.student as any)._id,
          name: (app.student as any).firstName + ' ' + (app.student as any).lastName,
          email: (app.student as any).email,
          matricNumber: (app.student as any).matricNumber,
          department: (app.student as any).department,
          level: (app.student as any).level
        },
        reason: app.reason,
        financialInfo: app.financialInfo,
        documents: app.documents,
        status: app.status,
        reviewComment: app.reviewComment,
        appliedAt: app.createdAt
      })),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit))
      }
    })
  );
});

// @desc    Get scholarship application details (Bursary)
// @route   GET /api/v1/bursary/scholarships/:id
// @access  Private (Bursary)
export const getApplicationDetails = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const application = await ScholarshipApplication.findById(id)
    .populate('scholarship', 'name amount eligibilityCriteria')
    .populate('student', 'firstName lastName email matricNumber department level phoneNumber')
    .populate('reviewedBy', 'firstName lastName');

  if (!application) {
    res.status(404);
    throw new Error('Application not found');
  }

  // Get student's CGPA and achievements
  const studentId = (application.student as any)._id;
  const results = await Result.find({
    student: studentId,
    isPublished: true
  }).populate('course', 'credits');

  let cgpa = 0;
  if (results.length > 0) {
    const totalGradePoints = results.reduce((sum, r) => sum + (r.gradePoints || 0), 0);
    const totalCredits = results.reduce((sum, r) => sum + (((r.course as any)?.credits) || 0), 0);
    cgpa = totalCredits > 0 ? totalGradePoints / totalCredits : 0;
  }

  res.json(
    ApiResponse.success('Application details fetched successfully', {
      applicationInfo: {
        id: application._id,
        reason: application.reason,
        documents: application.documents,
        status: application.status,
        reviewComment: application.reviewComment,
        appliedAt: application.createdAt
      },
      scholarshipInfo: {
        name: (application.scholarship as any).name,
        amount: (application.scholarship as any).amount,
        eligibilityCriteria: (application.scholarship as any).eligibilityCriteria
      },
      studentInfo: {
        name: (application.student as any).firstName + ' ' + (application.student as any).lastName,
        email: (application.student as any).email,
        matricNumber: (application.student as any).matricNumber,
        department: (application.student as any).department,
        level: (application.student as any).level,
        phone: (application.student as any).phoneNumber
      },
      financialInfo: application.financialInfo,
      academicInfo: {
        cgpa: parseFloat(cgpa.toFixed(2)),
        totalCourses: results.length
      },
      reviewInfo: application.reviewedBy ? {
        reviewedBy: (application.reviewedBy as any).firstName + ' ' + (application.reviewedBy as any).lastName,
        reviewedAt: application.reviewedAt
      } : null
    })
  );
});

// @desc    Approve scholarship application
// @route   POST /api/v1/bursary/scholarships/:id/approve
// @access  Private (Bursary)
export const approveApplication = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const { amount, notes } = req.body;

  const application = await ScholarshipApplication.findById(id)
    .populate('scholarship')
    .populate('student', 'firstName lastName email');

  if (!application) {
    res.status(404);
    throw new Error('Application not found');
  }

  if (application.status !== 'pending') {
    res.status(400);
    throw new Error('This application has already been reviewed');
  }

  const scholarship = application.scholarship as any;

  // Check if slots are available
  if (scholarship.filledSlots >= scholarship.availableSlots) {
    res.status(400);
    throw new Error('All scholarship slots are filled');
  }

  // Update application
  application.status = 'approved';
  application.reviewedBy = userId;
  application.reviewedAt = new Date();
  application.reviewComment = notes;
  application.approvedAmount = amount ?? scholarship.amount;
  await application.save();

  // Update scholarship filled slots
  scholarship.filledSlots += 1;
  await scholarship.save();

  // Send notification to student
  await notificationService.createNotification(
    (application.student as any)._id.toString(),
    'success',
    'Scholarship Approved',
    `Your application for ${scholarship.name} has been approved with an amount of ₦${(application.approvedAmount ?? scholarship.amount).toLocaleString()}`,
    `/scholarships/applications/${application._id}`
  );

  res.json(
    ApiResponse.success('Scholarship application approved successfully', {
      id: application._id,
      status: application.status,
      approvedAmount: application.approvedAmount
    })
  );
});

// @desc    Reject scholarship application
// @route   POST /api/v1/bursary/scholarships/:id/reject
// @access  Private (Bursary)
export const rejectApplication = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const { reason } = req.body;

  const application = await ScholarshipApplication.findById(id)
    .populate('scholarship', 'name')
    .populate('student', 'firstName lastName email');

  if (!application) {
    res.status(404);
    throw new Error('Application not found');
  }

  if (application.status !== 'pending') {
    res.status(400);
    throw new Error('This application has already been reviewed');
  }

  // Update application
  application.status = 'rejected';
  application.reviewedBy = userId;
  application.reviewedAt = new Date();
  application.reviewComment = reason;
  await application.save();

  // Send notification to student
  await notificationService.createNotification(
    (application.student as any)._id.toString(),
    'warning',
    'Scholarship Application Update',
    `Your application for ${(application.scholarship as any).name} was not successful.${reason ? ` ${reason}` : ''}`,
    `/scholarships/applications/${application._id}`
  );

  res.json(
    ApiResponse.success('Scholarship application rejected', {
      id: application._id,
      status: application.status
    })
  );
});

// @desc    Create new scholarship (Admin/Bursary)
// @route   POST /api/v1/bursary/scholarships/create
// @access  Private (Bursary, Admin)
export const createScholarship = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const {
    name,
    description,
    amount,
    eligibilityCriteria,
    availableSlots,
    applicationDeadline,
    academicYear
  } = req.body;

  const scholarship = await Scholarship.create({
    name,
    description,
    amount,
    eligibilityCriteria: eligibilityCriteria || {},
    availableSlots,
    applicationDeadline,
    academicYear: academicYear || '2024/2025',
    createdBy: userId
  });

  res.status(201).json(
    ApiResponse.success('Scholarship created successfully', scholarship)
  );
});
