import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import User from '../models/User.model';
import Department from '../models/Department.model';
import Session from '../models/Session.model';
import Course from '../models/Course.model';
import logger from '../config/logger';

const seedDatabase = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/university_portal';
    await mongoose.connect(mongoUri);
    logger.info('Connected to MongoDB for seeding');

    // Clear existing data
    await User.deleteMany({});
    await Department.deleteMany({});
    await Session.deleteMany({});
    await Course.deleteMany({});
    logger.info('Cleared existing data');

    // Seed Departments
    const departments = await Department.insertMany([
      {
        name: 'Computer Science',
        code: 'CSC',
        faculty: 'Science',
        isActive: true,
      },
      {
        name: 'Engineering',
        code: 'ENG',
        faculty: 'Engineering',
        isActive: true,
      },
      {
        name: 'Medicine',
        code: 'MED',
        faculty: 'Medicine',
        isActive: true,
      },
      {
        name: 'Law',
        code: 'LAW',
        faculty: 'Law',
        isActive: true,
      },
      {
        name: 'Business Administration',
        code: 'BUS',
        faculty: 'Business',
        isActive: true,
      },
    ]);
    logger.info(`Seeded ${departments.length} departments`);

    // Seed Sessions
    const sessions = await Session.insertMany([
      {
        name: '2023/2024',
        startDate: new Date('2023-09-01'),
        endDate: new Date('2024-08-31'),
        isCurrent: false,
        isActive: true,
      },
      {
        name: '2024/2025',
        startDate: new Date('2024-09-01'),
        endDate: new Date('2025-08-31'),
        isCurrent: true,
        isActive: true,
      },
    ]);
    logger.info(`Seeded ${sessions.length} sessions`);

    // Seed Admin User
    await User.create({
      email: 'admin@university.edu',
      password: 'Admin@123',
      firstName: 'System',
      lastName: 'Administrator',
      role: 'admin',
      isEmailVerified: true,
    });
    logger.info('Created admin user: admin@university.edu / Admin@123');

    // Seed HOD Users
    const hod1 = await User.create({
      email: 'hod.csc@university.edu',
      password: 'Hod@123',
      firstName: 'John',
      lastName: 'Smith',
      role: 'hod',
      department: departments[0]._id,
      isEmailVerified: true,
    });

    const hod2 = await User.create({
      email: 'hod.eng@university.edu',
      password: 'Hod@123',
      firstName: 'Jane',
      lastName: 'Doe',
      role: 'hod',
      department: departments[1]._id,
      isEmailVerified: true,
    });

    // Update departments with HODs
    departments[0].hod = hod1._id;
    departments[1].hod = hod2._id;
    await Department.updateOne({ _id: departments[0]._id }, { hod: hod1._id });
    await Department.updateOne({ _id: departments[1]._id }, { hod: hod2._id });
    logger.info('Created 2 HOD users');

    // Seed Bursary User
    await User.create({
      email: 'bursary@university.edu',
      password: 'Bursary@123',
      firstName: 'Finance',
      lastName: 'Officer',
      role: 'bursary',
      isEmailVerified: true,
    });
    logger.info('Created bursary user: bursary@university.edu / Bursary@123');

    // Seed Lecturers
    const lecturers = [];
    for (let i = 1; i <= 10; i++) {
      const lecturer = await User.create({
        email: `lecturer${i}@university.edu`,
        password: 'Lecturer@123',
        firstName: `Lecturer`,
        lastName: `${i}`,
        role: 'lecturer',
        department: departments[i % 5]._id,
        isEmailVerified: true,
      });
      lecturers.push(lecturer);
    }
    logger.info(`Created ${lecturers.length} lecturer users`);

    // Seed Students
    const students = [];
    for (let i = 1; i <= 50; i++) {
      const deptIndex = i % 5;
      const student = await User.create({
        email: `student${i}@university.edu`,
        password: 'Student@123',
        firstName: `Student`,
        lastName: `${i}`,
        role: 'student',
        department: departments[deptIndex]._id,
        level: `${100 + ((i % 4) * 100)}`,
        studentId: `${departments[deptIndex].code}2024${String(i).padStart(4, '0')}`,
        isEmailVerified: true,
      });
      students.push(student);
    }
    logger.info(`Created ${students.length} student users`);

    // Seed Courses
    const courses = await Course.insertMany([
      {
        code: 'CSC101',
        title: 'Introduction to Computer Science',
        description: 'Fundamentals of computer science',
        credits: 3,
        level: '100',
        semester: 'first',
        department: departments[0]._id,
        lecturer: lecturers[0]._id,
        session: sessions[1]._id,
        capacity: 100,
        isActive: true,
      },
      {
        code: 'CSC201',
        title: 'Data Structures and Algorithms',
        description: 'Study of data structures and algorithms',
        credits: 4,
        level: '200',
        semester: 'first',
        department: departments[0]._id,
        lecturer: lecturers[1]._id,
        session: sessions[1]._id,
        capacity: 80,
        isActive: true,
      },
      {
        code: 'ENG101',
        title: 'Engineering Mathematics I',
        description: 'Mathematical foundations for engineering',
        credits: 3,
        level: '100',
        semester: 'first',
        department: departments[1]._id,
        lecturer: lecturers[2]._id,
        session: sessions[1]._id,
        capacity: 120,
        isActive: true,
      },
      {
        code: 'MED101',
        title: 'Human Anatomy',
        description: 'Study of human body structure',
        credits: 4,
        level: '100',
        semester: 'first',
        department: departments[2]._id,
        lecturer: lecturers[3]._id,
        session: sessions[1]._id,
        capacity: 60,
        isActive: true,
      },
      {
        code: 'LAW101',
        title: 'Introduction to Law',
        description: 'Fundamentals of legal studies',
        credits: 3,
        level: '100',
        semester: 'first',
        department: departments[3]._id,
        lecturer: lecturers[4]._id,
        session: sessions[1]._id,
        capacity: 100,
        isActive: true,
      },
    ]);
    logger.info(`Seeded ${courses.length} courses`);

    logger.info('Database seeding completed successfully!');
    logger.info('\nTest Credentials:');
    logger.info('Admin: admin@university.edu / Admin@123');
    logger.info('HOD (CSC): hod.csc@university.edu / Hod@123');
    logger.info('HOD (ENG): hod.eng@university.edu / Hod@123');
    logger.info('Bursary: bursary@university.edu / Bursary@123');
    logger.info('Lecturer: lecturer1@university.edu to lecturer10@university.edu / Lecturer@123');
    logger.info('Student: student1@university.edu to student50@university.edu / Student@123');

    process.exit(0);
  } catch (error) {
    logger.error('Error seeding database:', error);
    process.exit(1);
  }
};

seedDatabase();
