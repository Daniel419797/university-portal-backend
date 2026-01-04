-- Idempotent seed for testing lecturer dashboard
-- Replace the LECTURER_ID if you want to target a different user
\set LECTURER_ID '28dee4ec-68d0-48b6-a0ed-9930a1c8d5d0'
\set LECTURER_EMAIL 'dan@gmail.com'

-- Create department if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.departments WHERE code = 'SEED_DEP') THEN
    INSERT INTO public.departments (id, name, code, faculty, created_at, updated_at)
    VALUES (gen_random_uuid(), 'Seed Department', 'SEED_DEP', 'Seed Faculty', now(), now());
  END IF;
END$$;

-- Create session if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sessions WHERE name = '2025/2026-SEED') THEN
    INSERT INTO public.sessions (id, name, start_date, end_date, is_active, created_at, updated_at)
    VALUES (gen_random_uuid(), '2025/2026-SEED', '2025-09-01', '2026-06-01', true, now(), now());
  END IF;
END$$;

-- Ensure lecturer profile exists (will fail if corresponding auth.users id is missing)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = :LECTURER_ID) THEN
    INSERT INTO public.profiles (id, email, first_name, last_name, role, created_at, updated_at)
    VALUES (:LECTURER_ID, :LECTURER_EMAIL, 'Dan', 'Dee', 'lecturer', now(), now());
  END IF;
END$$;

-- Create a test student profile
DO $$
DECLARE
  student_id uuid := gen_random_uuid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE email = 'seed.student@example.com') THEN
    INSERT INTO public.profiles (id, email, first_name, last_name, role, created_at, updated_at)
    VALUES (student_id, 'seed.student@example.com', 'Seed', 'Student', 'student', now(), now());
  END IF;
END$$;

-- Create a test course for the lecturer
DO $$
DECLARE
  dept_id uuid;
  sess_id uuid;
  course_exists boolean;
BEGIN
  SELECT id INTO dept_id FROM public.departments WHERE code = 'SEED_DEP' LIMIT 1;
  SELECT id INTO sess_id FROM public.sessions WHERE name = '2025/2026-SEED' LIMIT 1;
  SELECT EXISTS(SELECT 1 FROM public.courses WHERE code = 'SEED101' AND lecturer_id = :LECTURER_ID) INTO course_exists;
  IF NOT course_exists THEN
    INSERT INTO public.courses (id, code, title, description, credits, level, semester, department_id, lecturer_id, session_id, capacity, created_at, updated_at)
    VALUES (gen_random_uuid(), 'SEED101', 'Seeded Test Course', 'Auto-generated course for testing dashboard', 3, '100', 'first', dept_id, :LECTURER_ID, sess_id, 100, now(), now());
  END IF;
END$$;

-- Enroll the test student in the seeded course
DO $$
DECLARE
  c_id uuid;
  s_id uuid;
  student uuid;
BEGIN
  SELECT id INTO c_id FROM public.courses WHERE code = 'SEED101' LIMIT 1;
  SELECT id INTO student FROM public.profiles WHERE email = 'seed.student@example.com' LIMIT 1;
  SELECT id INTO s_id FROM public.sessions WHERE name = '2025/2026-SEED' LIMIT 1;
  IF c_id IS NOT NULL AND student IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.enrollments WHERE student_id = student AND course_id = c_id AND session_id = s_id) THEN
      INSERT INTO public.enrollments (id, student_id, course_id, session_id, semester, status, created_at, updated_at)
      VALUES (gen_random_uuid(), student, c_id, s_id, 'first', 'active', now(), now());
    END IF;
  END IF;
END$$;

-- Create an assignment for the seed course
DO $$
DECLARE
  c_id uuid;
BEGIN
  SELECT id INTO c_id FROM public.courses WHERE code = 'SEED101' LIMIT 1;
  IF c_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.assignments WHERE title = 'Seed Assignment 1' AND course_id = c_id) THEN
      INSERT INTO public.assignments (id, course_id, lecturer_id, title, description, due_date, total_marks, is_published, created_at, updated_at)
      VALUES (gen_random_uuid(), c_id, :LECTURER_ID, 'Seed Assignment 1', 'Auto-generated assignment', now() + interval '7 days', 100, true, now(), now());
    END IF;
  END IF;
END$$;

-- Create a submission by the test student (ungraded)
DO $$
DECLARE
  a_id uuid;
  student uuid;
BEGIN
  SELECT id INTO a_id FROM public.assignments WHERE title = 'Seed Assignment 1' LIMIT 1;
  SELECT id INTO student FROM public.profiles WHERE email = 'seed.student@example.com' LIMIT 1;
  IF a_id IS NOT NULL AND student IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.submissions WHERE assignment_id = a_id AND student_id = student) THEN
      INSERT INTO public.submissions (id, assignment_id, student_id, content, created_at, updated_at)
      VALUES (gen_random_uuid(), a_id, student, 'Seed submission content', now(), now());
    END IF;
  END IF;
END$$;

-- Create a quiz
DO $$
DECLARE
  c_id uuid;
BEGIN
  SELECT id INTO c_id FROM public.courses WHERE code = 'SEED101' LIMIT 1;
  IF c_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.quizzes WHERE title = 'Seed Quiz 1' AND course_id = c_id) THEN
      INSERT INTO public.quizzes (id, course_id, lecturer_id, title, questions, duration_minutes, total_marks, status, created_at, updated_at)
      VALUES (gen_random_uuid(), c_id, :LECTURER_ID, 'Seed Quiz 1', '[]'::jsonb, 30, 50, 'published', now(), now());
    END IF;
  END IF;
END$$;

-- Add notifications for lecturer and student
DO $$
DECLARE
  lect uuid := :LECTURER_ID;
  student uuid;
BEGIN
  SELECT id INTO student FROM public.profiles WHERE email = 'seed.student@example.com' LIMIT 1;
  IF NOT EXISTS(SELECT 1 FROM public.notifications WHERE title = 'Seed notification to lecturer' AND user_id = lect) THEN
    INSERT INTO public.notifications (id, user_id, title, message, created_at, updated_at)
    VALUES (gen_random_uuid(), lect, 'Seed notification to lecturer', 'This is a seeded notification for the lecturer dashboard', now(), now());
  END IF;
  IF student IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.notifications WHERE title = 'Seed notification to student' AND user_id = student) THEN
    INSERT INTO public.notifications (id, user_id, title, message, created_at, updated_at)
    VALUES (gen_random_uuid(), student, 'Seed notification to student', 'This is a seeded notification for the student', now(), now());
  END IF;
END$$;

-- Summary selects
SELECT 'SEED COMPLETE' as status;
SELECT id, email, first_name, last_name, role FROM public.profiles WHERE id = :LECTURER_ID;
SELECT id, code, title, lecturer_id FROM public.courses WHERE code = 'SEED101';
SELECT count(*) AS enrollments FROM public.enrollments WHERE course_id IN (SELECT id FROM public.courses WHERE code = 'SEED101');
SELECT count(*) AS assignments FROM public.assignments WHERE course_id IN (SELECT id FROM public.courses WHERE code = 'SEED101');
SELECT count(*) AS submissions FROM public.submissions WHERE assignment_id IN (SELECT id FROM public.assignments WHERE course_id IN (SELECT id FROM public.courses WHERE code = 'SEED101'));
SELECT count(*) AS quizzes FROM public.quizzes WHERE course_id IN (SELECT id FROM public.courses WHERE code = 'SEED101');
SELECT count(*) AS notifications FROM public.notifications WHERE user_id IN (SELECT id FROM public.profiles WHERE email IN (:LECTURER_EMAIL, 'seed.student@example.com'));
