# University Portal - Backend API Documentation

## Base URL
```
https://api.university-portal.com/v1
```

## Authentication
All endpoints (except login/signup) require JWT authentication.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

---

## Table of Contents
1. [Authentication](#authentication-endpoints)
2. [User Management](#user-management)
3. [Student Endpoints](#student-endpoints)
4. [Lecturer Endpoints](#lecturer-endpoints)
5. [HOD Endpoints](#hod-endpoints)
6. [Bursary Endpoints](#bursary-endpoints)
7. [Admin Endpoints](#admin-endpoints)
8. [Shared Endpoints](#shared-endpoints)

---

## Authentication Endpoints

### POST /auth/login
Login to the system
```json
Request:
{
  "email": "student@university.edu",
  "password": "password123"
}

Response:
{
  "token": "jwt-token",
  "user": {
    "id": "user-id",
    "email": "student@university.edu",
    "firstName": "John",
    "lastName": "Doe",
    "role": "student",
    "avatar": "url",
    "studentId": "CS/2021/001",
    "department": "Computer Science",
    "level": "400"
  }
}
```

### POST /auth/register
Register new user (Admin only)
```json
Request:
{
  "email": "student@university.edu",
  "password": "password123",
  "firstName": "John",
  "lastName": "Doe",
  "role": "student",
  "department": "Computer Science",
  "level": "100"
}
```

### POST /auth/logout
Logout current user

### POST /auth/refresh-token
Refresh authentication token

### POST /auth/forgot-password
Request password reset
```json
Request:
{
  "email": "student@university.edu"
}
```

### POST /auth/reset-password
Reset password with token
```json
Request:
{
  "token": "reset-token",
  "newPassword": "newpassword123"
}
```

---

## User Management

### GET /users/profile
Get current user profile

### PUT /users/profile
Update current user profile
```json
Request:
{
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+234 801 234 5678",
  "avatar": "base64-image"
}
```

### PUT /users/password
Change password
```json
Request:
{
  "currentPassword": "oldpassword",
  "newPassword": "newpassword123"
}
```

### DELETE /users/account
Deactivate account
```json
Request:
{
  "password": "password123",
  "reason": "Graduated"
}
```

---

## Student Endpoints

### Dashboard
#### GET /students/dashboard
Get student dashboard statistics
```json
Response:
{
  "enrolledCourses": 5,
  "pendingAssignments": 3,
  "cgpa": 4.5,
  "paymentStatus": "Verified",
  "recentCourses": [...],
  "recentAssignments": [...],
  "upcomingEvents": [...]
}
```

### Courses
#### GET /students/courses
Get enrolled courses
```json
Query Parameters:
- semester: string (optional)
- level: string (optional)
- page: number (optional)
- limit: number (optional)

Response:
{
  "courses": [...],
  "total": 5,
  "page": 1,
  "limit": 10
}
```

#### GET /students/courses/:id
Get course details

#### GET /students/courses/:id/materials
Get course materials
```json
Response:
{
  "materials": [
    {
      "id": "mat-1",
      "title": "Lecture Notes - Week 1",
      "type": "pdf",
      "url": "url",
      "uploadedAt": "2025-01-15",
      "size": "2.5 MB"
    }
  ]
}
```

#### POST /students/courses/:id/materials/:materialId/download
Download course material

### Enrollment
#### GET /students/enrollment/available-courses
Get available courses for enrollment

#### POST /students/enrollment
Enroll in courses
```json
Request:
{
  "courseIds": ["course-1", "course-2", "course-3"]
}
```

#### DELETE /students/enrollment/:courseId
Drop a course

### Assignments
#### GET /students/assignments
Get all assignments
```json
Query Parameters:
- status: "pending" | "submitted" | "graded" (optional)
- courseId: string (optional)

Response:
{
  "assignments": [...],
  "total": 10
}
```

#### GET /students/assignments/:id
Get assignment details

#### POST /students/assignments/:id/submit
Submit assignment
```json
Request:
{
  "files": ["file-url-1", "file-url-2"],
  "comment": "My submission"
}
```

#### GET /students/assignments/:id/submission
Get submission details

### Quizzes
#### GET /students/quizzes
Get all quizzes

#### GET /students/quizzes/:id
Get quiz details

#### POST /students/quizzes/:id/start
Start quiz attempt

#### POST /students/quizzes/:id/submit
Submit quiz answers
```json
Request:
{
  "attemptId": "attempt-id",
  "answers": [
    {
      "questionId": "q1",
      "answer": "Option A"
    }
  ]
}
```

#### GET /students/quizzes/:id/results
Get quiz results

### Results
#### GET /students/results
Get academic results
```json
Query Parameters:
- semester: string (optional)
- level: string (optional)

Response:
{
  "results": [
    {
      "courseCode": "CSC 401",
      "courseTitle": "Artificial Intelligence",
      "score": 85,
      "grade": "A",
      "gradePoint": 5.0,
      "creditUnit": 3
    }
  ],
  "gpa": 4.75,
  "cgpa": 4.50
}
```

#### GET /students/results/transcript
Get full academic transcript

#### POST /students/results/appeal
Submit grade appeal
```json
Request:
{
  "courseId": "course-id",
  "semester": "First Semester",
  "reason": "Calculation error in final exam",
  "description": "Detailed explanation..."
}
```

#### GET /students/results/appeals
Get grade appeals history

### Attendance
#### GET /students/attendance
Get attendance records
```json
Response:
{
  "courses": [
    {
      "courseCode": "CSC 401",
      "courseTitle": "Artificial Intelligence",
      "totalClasses": 24,
      "attended": 22,
      "percentage": 91.7,
      "status": "Good"
    }
  ]
}
```

### Payments
#### GET /students/payments
Get payment history

#### GET /students/payments/:id
Get payment details

#### GET /students/payments/:id/receipt
Get payment receipt

#### POST /students/payments
Make payment
```json
Request:
{
  "amount": 150000,
  "paymentType": "School Fees",
  "paymentMethod": "card",
  "reference": "payment-ref"
}
```

#### GET /students/payments/installments
Get installment plan details

#### POST /students/payments/installments
Setup installment plan
```json
Request:
{
  "totalAmount": 300000,
  "numberOfInstallments": 3,
  "firstPaymentDate": "2025-02-01"
}
```

### Hostel
#### GET /students/hostel
Get hostel information

#### POST /students/hostel/apply
Apply for hostel accommodation
```json
Request:
{
  "hostelId": "hostel-1",
  "roomPreference": "4-bed",
  "specialRequirements": "Ground floor preference"
}
```

#### GET /students/hostel/application
Get hostel application status

### Scholarships
#### GET /students/scholarships
Get available scholarships

#### POST /students/scholarships/apply
Apply for scholarship
```json
Request:
{
  "scholarshipId": "sch-1",
  "reason": "Academic Excellence",
  "documents": ["doc-url-1", "doc-url-2"]
}
```

#### GET /students/scholarships/applications
Get scholarship applications

### Clearance
#### GET /students/clearance
Get clearance status
```json
Response:
{
  "overallStatus": "In Progress",
  "departments": [
    {
      "name": "Library",
      "status": "approved",
      "approvedBy": "Librarian Name",
      "approvedAt": "2025-01-15",
      "comment": "No outstanding books"
    }
  ]
}
```

#### POST /students/clearance/documents/request
Request clearance documents
```json
Request:
{
  "documentType": "Clearance Letter",
  "purpose": "Job Application",
  "deliveryMethod": "Email PDF",
  "urgency": "Normal"
}
```

### Timetable
#### GET /students/timetable
Get class timetable
```json
Response:
{
  "schedule": [
    {
      "day": "Monday",
      "classes": [
        {
          "courseCode": "CSC 401",
          "courseTitle": "Artificial Intelligence",
          "time": "08:00 - 10:00",
          "venue": "LT 101",
          "lecturer": "Dr. John Smith"
        }
      ]
    }
  ]
}
```

### Messages
#### GET /students/messages
Get messages/conversations

#### POST /students/messages
Send message
```json
Request:
{
  "recipientId": "lecturer-id",
  "subject": "Assignment Query",
  "message": "I have a question about..."
}
```

#### GET /students/messages/:id
Get message thread

### ID Card
#### GET /students/id-card
Get digital ID card information
```json
Response:
{
  "name": "Sarah Williams",
  "matricNumber": "CS/2021/001",
  "email": "sarah@university.edu",
  "phone": "+234 801 234 5678",
  "department": "Computer Science",
  "faculty": "Science",
  "level": "400 Level",
  "bloodGroup": "O+",
  "photo": "photo-url",
  "cardNumber": "UNI2021CS001",
  "expiryDate": "2025-08-31",
  "qrCode": "qr-code-data"
}
```

### Notifications
#### GET /students/notifications
Get notifications
```json
Query Parameters:
- filter: "all" | "unread" | "read"
- type: "assignment" | "grade" | "payment" | "announcement" (optional)
- page: number
- limit: number

Response:
{
  "notifications": [...],
  "unreadCount": 5,
  "total": 20
}
```

#### PUT /students/notifications/:id/read
Mark notification as read

#### PUT /students/notifications/read-all
Mark all notifications as read

#### DELETE /students/notifications/:id
Delete notification

---

## Lecturer Endpoints

### Dashboard
#### GET /lecturers/dashboard
Get lecturer dashboard statistics

### Courses
#### GET /lecturers/courses
Get assigned courses

#### GET /lecturers/courses/:id
Get course details

#### GET /lecturers/courses/:id/students
Get enrolled students
```json
Response:
{
  "students": [
    {
      "id": "student-id",
      "name": "John Doe",
      "matricNumber": "CS/2021/001",
      "email": "john@university.edu",
      "attendance": {
        "total": 24,
        "attended": 22,
        "percentage": 91.7
      },
      "performance": {
        "assignment": 28,
        "quiz": 18,
        "midterm": 45,
        "total": 91
      }
    }
  ],
  "stats": {
    "totalStudents": 45,
    "goodAttendance": 38,
    "averageScore": 75.5,
    "passRate": 95
  }
}
```

#### POST /lecturers/courses/:id/materials
Upload course material
```json
Request:
{
  "title": "Lecture Notes - Week 1",
  "type": "pdf",
  "file": "base64-file-data"
}
```

#### DELETE /lecturers/courses/:id/materials/:materialId
Delete course material

### Students
#### GET /lecturers/students
Get all students in lecturer's courses

#### GET /lecturers/students/:id
Get student profile
```json
Response:
{
  "id": "student-id",
  "name": "John Doe",
  "matricNumber": "CS/2021/001",
  "email": "john@university.edu",
  "phone": "+234 801 234 5678",
  "department": "Computer Science",
  "level": "400",
  "cgpa": 4.85,
  "courses": [...],
  "attendance": [...],
  "guardian": {...}
}
```

### Assignments
#### GET /lecturers/assignments
Get all assignments

#### POST /lecturers/assignments
Create assignment
```json
Request:
{
  "courseId": "course-id",
  "title": "AI Project",
  "description": "Build a neural network...",
  "dueDate": "2025-02-15",
  "totalMarks": 100,
  "attachments": []
}
```

#### GET /lecturers/assignments/:id
Get assignment details

#### PUT /lecturers/assignments/:id
Update assignment

#### DELETE /lecturers/assignments/:id
Delete assignment

#### GET /lecturers/assignments/:id/submissions
Get assignment submissions
```json
Response:
{
  "submissions": [
    {
      "studentId": "student-id",
      "studentName": "John Doe",
      "matricNumber": "CS/2021/001",
      "submittedAt": "2025-02-10T14:30:00",
      "files": [...],
      "grade": 85,
      "status": "graded"
    }
  ],
  "stats": {
    "total": 45,
    "submitted": 42,
    "pending": 3,
    "graded": 38
  }
}
```

#### POST /lecturers/assignments/:id/submissions/:submissionId/grade
Grade submission
```json
Request:
{
  "grade": 85,
  "feedback": "Excellent work! Well structured..."
}
```

### Quizzes
#### GET /lecturers/quizzes
Get all quizzes

#### POST /lecturers/quizzes
Create quiz
```json
Request:
{
  "courseId": "course-id",
  "title": "Mid-Semester Test",
  "description": "Covers topics 1-5",
  "duration": 60,
  "totalMarks": 50,
  "startDate": "2025-02-20T10:00:00",
  "endDate": "2025-02-20T11:00:00",
  "questions": [
    {
      "question": "What is AI?",
      "type": "multiple-choice",
      "options": ["A", "B", "C", "D"],
      "correctAnswer": "A",
      "marks": 5
    }
  ]
}
```

#### GET /lecturers/quizzes/:id
Get quiz details

#### PUT /lecturers/quizzes/:id
Update quiz

#### DELETE /lecturers/quizzes/:id
Delete quiz

#### GET /lecturers/quizzes/:id/responses
Get quiz responses
```json
Response:
{
  "responses": [
    {
      "studentId": "student-id",
      "studentName": "John Doe",
      "score": 45,
      "totalMarks": 50,
      "percentage": 90,
      "completedAt": "2025-02-20T10:45:00"
    }
  ],
  "stats": {
    "totalAttempts": 42,
    "averageScore": 38.5,
    "highestScore": 50,
    "lowestScore": 22
  }
}
```

### Attendance
#### GET /lecturers/attendance
Get attendance overview

#### POST /lecturers/attendance
Record attendance
```json
Request:
{
  "courseId": "course-id",
  "date": "2025-01-29",
  "attendees": ["student-id-1", "student-id-2"],
  "absentees": ["student-id-3"]
}
```

#### GET /lecturers/attendance/history
Get attendance history

#### PUT /lecturers/attendance/:id
Update attendance record

### Results
#### GET /lecturers/results
Get results overview by course

#### POST /lecturers/results/import
Import results from CSV
```json
Request:
{
  "courseId": "course-id",
  "semester": "First Semester",
  "csvData": "base64-csv-data"
}
```

#### POST /lecturers/results
Submit course results
```json
Request:
{
  "courseId": "course-id",
  "semester": "First Semester",
  "results": [
    {
      "studentId": "student-id",
      "assignment": 28,
      "quiz": 18,
      "midterm": 45,
      "exam": 75,
      "total": 91,
      "grade": "A"
    }
  ]
}
```

#### PUT /lecturers/results/:resultId
Update student result

### Messages
#### GET /lecturers/messages
Get messages

#### POST /lecturers/messages
Send message

#### GET /lecturers/messages/:id
Get message thread

### Analytics
#### GET /lecturers/analytics
Get teaching analytics
```json
Response:
{
  "coursesOverview": [...],
  "studentPerformance": {...},
  "attendanceTrends": {...},
  "assignmentStats": {...}
}
```

---

## HOD Endpoints

### Dashboard
#### GET /hod/dashboard
Get HOD dashboard statistics
```json
Response:
{
  "departmentStats": {
    "totalStudents": 450,
    "totalStaff": 25,
    "totalCourses": 48,
    "activeLecturers": 22
  },
  "pendingApprovals": {
    "results": 5,
    "clearances": 3,
    "courseRegistrations": 12
  },
  "recentActivities": [...]
}
```

### Students
#### GET /hod/students
Get all students in department
```json
Query Parameters:
- level: string (optional)
- status: "active" | "inactive" (optional)
- search: string (optional)
```

#### GET /hod/students/:id
Get student academic profile
```json
Response:
{
  "personalInfo": {...},
  "academicInfo": {
    "currentLevel": "400",
    "cgpa": 4.95,
    "classification": "First Class",
    "totalCredits": 120
  },
  "semesterResults": [
    {
      "semester": "First Semester 2024/2025",
      "gpa": 4.85,
      "courses": [...]
    }
  ],
  "currentCourses": [...],
  "achievements": [...]
}
```

### Staff
#### GET /hod/staff
Get all staff in department

#### GET /hod/staff/:id
Get staff profile and performance

#### POST /hod/staff/:id/assign-courses
Assign courses to lecturer
```json
Request:
{
  "courseIds": ["course-1", "course-2"]
}
```

### Department
#### GET /hod/department
Get department information

#### PUT /hod/department
Update department information

#### GET /hod/department/statistics
Get department statistics

### Results
#### GET /hod/results/pending-approval
Get results pending approval

#### GET /hod/results/:id
Get result details for review

#### POST /hod/results/:id/approve
Approve course results
```json
Request:
{
  "comment": "Results verified and approved"
}
```

#### POST /hod/results/:id/reject
Reject course results
```json
Request:
{
  "reason": "Inconsistencies found in grading"
}
```

### Analytics
#### GET /hod/analytics
Get department analytics
```json
Response:
{
  "enrollmentTrends": {...},
  "performanceMetrics": {...},
  "graduationRates": {...},
  "staffProductivity": {...}
}
```

---

## Bursary Endpoints

### Dashboard
#### GET /bursary/dashboard
Get bursary dashboard statistics

### Payments
#### GET /bursary/payments
Get all payments
```json
Query Parameters:
- status: "pending" | "verified" | "failed"
- dateFrom: string
- dateTo: string
- studentId: string (optional)
```

#### GET /bursary/payments/:id
Get payment details

#### POST /bursary/payments/:id/verify
Verify payment
```json
Request:
{
  "status": "verified",
  "comment": "Payment confirmed"
}
```

#### POST /bursary/payments/:id/reject
Reject payment

### Scholarships
#### GET /bursary/scholarships
Get all scholarship applications

#### GET /bursary/scholarships/:id
Get scholarship application details
```json
Response:
{
  "applicationInfo": {...},
  "studentInfo": {...},
  "financialInfo": {
    "familyIncome": 500000,
    "outstandingFees": 150000,
    "previousScholarships": [...]
  },
  "academicInfo": {
    "cgpa": 4.95,
    "achievements": [...]
  },
  "documents": [...]
}
```

#### POST /bursary/scholarships/:id/approve
Approve scholarship
```json
Request:
{
  "amount": 500000,
  "duration": "One Academic Year",
  "notes": "Exceptional academic performance"
}
```

#### POST /bursary/scholarships/:id/reject
Reject scholarship application
```json
Request:
{
  "reason": "Does not meet eligibility criteria"
}
```

### Reports
#### GET /bursary/reports
Get financial reports
```json
Query Parameters:
- reportType: "payments" | "scholarships" | "revenue"
- period: "daily" | "weekly" | "monthly" | "yearly"
- dateFrom: string
- dateTo: string

Response:
{
  "summary": {...},
  "data": [...],
  "charts": {...}
}
```

#### POST /bursary/reports/generate
Generate custom report

---

## Admin Endpoints

### Dashboard
#### GET /admin/dashboard
Get admin dashboard statistics

### Users
#### GET /admin/users
Get all users
```json
Query Parameters:
- role: "student" | "lecturer" | "admin" | "hod" | "bursary"
- department: string (optional)
- status: "active" | "inactive"
- search: string
```

#### POST /admin/users
Create new user
```json
Request:
{
  "email": "user@university.edu",
  "password": "password123",
  "firstName": "John",
  "lastName": "Doe",
  "role": "student",
  "department": "Computer Science",
  "level": "100",
  "matricNumber": "CS/2025/001"
}
```

#### GET /admin/users/:id
Get user details

#### PUT /admin/users/:id
Update user

#### DELETE /admin/users/:id
Deactivate user

#### POST /admin/users/bulk-upload
Bulk create users from CSV
```json
Request:
{
  "role": "student",
  "csvData": "base64-csv-data"
}
```

### Courses
#### GET /admin/courses
Get all courses

#### POST /admin/courses
Create course
```json
Request:
{
  "code": "CSC 401",
  "title": "Artificial Intelligence",
  "description": "Introduction to AI...",
  "credits": 3,
  "level": "400",
  "semester": "First",
  "department": "Computer Science",
  "lecturerId": "lecturer-id"
}
```

#### GET /admin/courses/:id
Get course details

#### PUT /admin/courses/:id
Update course

#### DELETE /admin/courses/:id
Delete course

### Hostel
#### GET /admin/hostel
Get all hostels

#### POST /admin/hostel
Create hostel
```json
Request:
{
  "name": "Kings Hall",
  "gender": "Male",
  "capacity": 200,
  "location": "Campus A",
  "facilities": ["WiFi", "Generator", "Security"]
}
```

#### GET /admin/hostel/:id
Get hostel details
```json
Response:
{
  "hostelInfo": {...},
  "occupancy": {
    "total": 200,
    "occupied": 185,
    "available": 15,
    "percentage": 92.5
  },
  "rooms": [...]
}
```

#### GET /admin/hostel/:id/rooms/:roomNumber
Get room details
```json
Response:
{
  "roomInfo": {
    "number": "205",
    "type": "4-bed",
    "capacity": 4,
    "floor": "2nd Floor",
    "facilities": [...]
  },
  "occupants": [...],
  "maintenanceRequests": [...]
}
```

#### PUT /admin/hostel/:id/rooms/:roomNumber
Update room details

#### POST /admin/hostel/:id/rooms/:roomNumber/assign
Assign student to room

#### POST /admin/hostel/:id/rooms/:roomNumber/evict
Evict student from room

#### GET /admin/hostel/applications
Get hostel applications

#### GET /admin/hostel/applications/:id
Get application details

#### POST /admin/hostel/applications/:id/approve
Approve hostel application

#### POST /admin/hostel/applications/:id/reject
Reject hostel application

### Clearance
#### GET /admin/clearance
Get all clearance requests

#### GET /admin/clearance/:id
Get clearance request details

#### POST /admin/clearance/:id/approve
Approve clearance

#### POST /admin/clearance/:id/reject
Reject clearance

### Announcements
#### GET /admin/announcements
Get all announcements

#### POST /admin/announcements
Create announcement
```json
Request:
{
  "title": "Semester Break",
  "content": "The semester break will commence...",
  "targetAudience": "All Users",
  "priority": "High",
  "expiryDate": "2025-03-01"
}
```

#### PUT /admin/announcements/:id
Update announcement

#### DELETE /admin/announcements/:id
Delete announcement

### Financial
#### GET /admin/financial
Get financial overview
```json
Response:
{
  "revenue": {
    "total": 45000000,
    "paid": 38000000,
    "pending": 7000000
  },
  "recentTransactions": [...],
  "paymentMethods": {...}
}
```

#### POST /admin/financial/generate-invoice
Generate invoice for student
```json
Request:
{
  "studentId": "student-id",
  "amount": 150000,
  "description": "School Fees",
  "dueDate": "2025-02-28"
}
```

#### POST /admin/financial/send-reminder
Send payment reminder

#### GET /admin/financial/reports
Get financial reports

#### GET /admin/financial/analytics
Get revenue analytics

### Analytics
#### GET /admin/analytics
Get system-wide analytics
```json
Response:
{
  "users": {...},
  "courses": {...},
  "financials": {...},
  "performance": {...},
  "trends": {...}
}
```

### Settings
#### GET /admin/settings
Get system settings

#### PUT /admin/settings
Update system settings
```json
Request:
{
  "academicYear": "2024/2025",
  "currentSemester": "Second Semester",
  "registrationOpen": true,
  "paymentDeadline": "2025-02-28"
}
```

---

## Shared Endpoints

### Notifications
#### GET /notifications
Get user notifications

#### GET /notifications/unread-count
Get unread notifications count

#### PUT /notifications/:id/read
Mark as read

#### DELETE /notifications/:id
Delete notification

### Settings
#### GET /settings
Get user settings

#### PUT /settings
Update user settings
```json
Request:
{
  "theme": "dark",
  "emailNotifications": true,
  "pushNotifications": false,
  "language": "en"
}
```

### Files
#### POST /files/upload
Upload file
```json
Request:
{
  "file": "base64-file-data",
  "type": "assignment" | "material" | "profile" | "document"
}

Response:
{
  "fileId": "file-id",
  "url": "file-url",
  "size": 2048576
}
```

#### GET /files/:id
Download file

#### DELETE /files/:id
Delete file

---

## Response Formats

### Success Response
```json
{
  "success": true,
  "data": {...},
  "message": "Operation successful"
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Error message",
    "details": {...}
  }
}
```

### Paginated Response
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "totalPages": 10
  }
}
```

---

## Status Codes

- **200** - Success
- **201** - Created
- **204** - No Content
- **400** - Bad Request
- **401** - Unauthorized
- **403** - Forbidden
- **404** - Not Found
- **422** - Validation Error
- **500** - Internal Server Error

---

## Rate Limiting

- **General**: 1000 requests per hour
- **Authentication**: 10 requests per minute
- **File Upload**: 50 requests per hour

---

## Webhooks (Optional)

### POST /webhooks/payment
Payment gateway webhook for payment verification

### POST /webhooks/email
Email delivery status webhook

---

## Notes

1. All dates should be in ISO 8601 format
2. File uploads should use multipart/form-data or base64 encoding
3. Pagination defaults: page=1, limit=10
4. Search queries support partial matching
5. Soft delete is implemented for most resources
6. All financial amounts are in Naira (₦)
7. Academic years follow format: "2024/2025"
8. Semesters: "First Semester" or "Second Semester"
9. Student IDs follow format: "{DEPT}/{YEAR}/{NUMBER}" (e.g., CS/2021/001)

---

## Future Enhancements

- GraphQL API support
- WebSocket for real-time notifications
- Bulk operations for admin
- Advanced search and filtering
- Export to Excel/PDF for all list endpoints
- Multi-language support
- Mobile app specific endpoints
- Integration with external payment gateways
- SSO (Single Sign-On) support
- API versioning strategy
