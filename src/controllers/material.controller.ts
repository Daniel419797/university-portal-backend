import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import CourseMaterial from '../models/CourseMaterial.model';
import Course from '../models/Course.model';
import Enrollment from '../models/Enrollment.model';
import uploadService from '../services/upload.service';

// @desc    Upload course material (Lecturer)
// @route   POST /api/v1/courses/:id/materials
// @access  Private (Lecturer)
export const uploadCourseMaterial = asyncHandler(async (req: Request, res: Response) => {
  const { id: courseId } = req.params;
  const userId = (req as any).user.id;
  const { title, description, type } = req.body;

  // Verify course exists and user is the instructor
  const course = await Course.findById(courseId);
  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  if (course.lecturer.toString() !== userId) {
    res.status(403);
    throw new Error('Not authorized to upload materials for this course');
  }

  // Check if file was uploaded
  if (!(req as any).file) {
    res.status(400);
    throw new Error('Please upload a file');
  }

  const file = (req as any).file;

  // Upload to Cloudinary
  const uploadResult = file.buffer
    ? await uploadService.uploadFromBuffer(file.buffer, file.originalname, 'course-materials')
    : await uploadService.uploadFile(file.path, 'course-materials', 'raw');

  // Create material record
  const material = await CourseMaterial.create({
    course: courseId,
    title,
    description,
    type: type || 'pdf',
    fileUrl: uploadResult.url,
    fileName: file.originalname,
    fileSize: file.size,
    uploadedBy: userId
  });

  const populatedMaterial = await CourseMaterial.findById(material._id)
    .populate('uploadedBy', 'firstName lastName email');

  res.status(201).json(
    ApiResponse.success('Material uploaded successfully', populatedMaterial)
  );
});

// @desc    Get course materials (Students & Lecturers)
// @route   GET /api/v1/courses/:id/materials
// @access  Private
export const getCourseMaterials = asyncHandler(async (req: Request, res: Response) => {
  const { id: courseId } = req.params;
  const userId = (req as any).user.id;
  const userRole = (req as any).user.role;

  // Verify course exists
  const course = await Course.findById(courseId);
  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  // If student, verify enrollment
  if (userRole === 'student') {
    const enrollment = await Enrollment.findOne({
      student: userId,
      course: courseId,
      status: 'active'
    });

    if (!enrollment) {
      res.status(403);
      throw new Error('You are not enrolled in this course');
    }
  }

  // If lecturer, verify they're teaching the course
  if (userRole === 'lecturer' && course.lecturer.toString() !== userId) {
    res.status(403);
    throw new Error('Not authorized to view materials for this course');
  }

  // Get materials
  const materials = await CourseMaterial.find({
    course: courseId,
    isActive: true
  })
    .populate('uploadedBy', 'firstName lastName')
    .sort({ uploadedAt: -1 });

  res.json(
    ApiResponse.success('Materials fetched successfully', {
      materials: materials.map(m => ({
        id: m._id,
        title: m.title,
        description: m.description,
        type: m.type,
        fileUrl: m.fileUrl,
        fileName: m.fileName,
        fileSize: m.fileSize,
        uploadedBy: {
          name: (m.uploadedBy as any).firstName + ' ' + (m.uploadedBy as any).lastName
        },
        uploadedAt: m.uploadedAt,
        downloads: m.downloads
      })),
      total: materials.length
    })
  );
});

// @desc    Download course material
// @route   POST /api/v1/courses/:id/materials/:materialId/download
// @access  Private (Student)
export const downloadCourseMaterial = asyncHandler(async (req: Request, res: Response) => {
  const { id: courseId, materialId } = req.params;
  const userId = (req as any).user.id;

  // Verify enrollment
  const enrollment = await Enrollment.findOne({
    student: userId,
    course: courseId,
    status: 'active'
  });

  if (!enrollment) {
    res.status(403);
    throw new Error('You are not enrolled in this course');
  }

  // Get material
  const material = await CourseMaterial.findById(materialId);
  if (!material) {
    res.status(404);
    throw new Error('Material not found');
  }

  if (material.course.toString() !== courseId) {
    res.status(400);
    throw new Error('Material does not belong to this course');
  }

  // Increment download count
  material.downloads += 1;
  await material.save();

  res.json(
    ApiResponse.success('Material download link retrieved', {
      fileUrl: material.fileUrl,
      fileName: material.fileName,
      fileSize: material.fileSize
    })
  );
});

// @desc    Delete course material (Lecturer)
// @route   DELETE /api/v1/courses/:id/materials/:materialId
// @access  Private (Lecturer)
export const deleteCourseMaterial = asyncHandler(async (req: Request, res: Response) => {
  const { id: courseId, materialId } = req.params;
  const userId = (req as any).user.id;

  // Verify course and authorization
  const course = await Course.findById(courseId);
  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  if (course.lecturer.toString() !== userId) {
    res.status(403);
    throw new Error('Not authorized to delete materials for this course');
  }

  // Get and delete material
  const material = await CourseMaterial.findById(materialId);
  if (!material) {
    res.status(404);
    throw new Error('Material not found');
  }

  if (material.course.toString() !== courseId) {
    res.status(400);
    throw new Error('Material does not belong to this course');
  }

  // Delete from Cloudinary (if it's a Cloudinary URL)
  if (material.fileUrl.includes('cloudinary')) {
    try {
      const publicId = material.fileUrl.split('/').slice(-2).join('/').split('.')[0];
      await uploadService.deleteFile(publicId, 'raw');
    } catch (error) {
      console.error('Error deleting from Cloudinary:', error);
    }
  }

  // Soft delete
  material.isActive = false;
  await material.save();

  res.json(
    ApiResponse.success('Material deleted successfully', null)
  );
});
