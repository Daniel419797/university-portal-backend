-- Supabase-compatible idempotent seed for testing lecturer dashboard
-- Edit LECTURER_ID and LECTURER_EMAIL below if you want to target a different user

-- Configuration
-- Replace these values if needed
-- SET these variables at top of editor by editing the literals below

-- Lecturer to seed/use
-- Example: '28dee4ec-68d0-48b6-a0ed-9930a1c8d5d0'

-- NOTE: This file uses plain SQL / PLPGSQL only (no psql backslash commands).

DO $$
DECLARE
  lecturer_id uuid := '28dee4ec-68d0-48b6-a0ed-9930a1c8d5d0';
  lecturer_email text := 'dan@gmail.com';
  student_email text := 'seed.student@example.com';
BEGIN
  -- Create department if not exists
  IF NOT EXISTS (SELECT 1 FROM public.departments WHERE code = 'SEED_DEP') THEN
    INSERT INTO public.departments (id, name, code, faculty, created_at, updated_at)
    VALUES (gen_random_uuid(), 'Seed Department', 'SEED_DEP', 'Seed Faculty', now(), now());
  END IF;

  -- Create session if not exists
  IF NOT EXISTS (SELECT 1 FROM public.sessions WHERE name = '2025/2026-SEED') THEN
    INSERT INTO public.sessions (id, name, start_date, end_date, is_active, created_at, updated_at)
    VALUES (gen_random_uuid(), '2025/2026-SEED', '2025-09-01', '2026-06-01', true, now(), now());
  END IF;

  -- Ensure lecturer profile exists (will succeed even if auth.users row doesn't exist; you may prefer to create auth.user first)
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = lecturer_id) THEN
    INSERT INTO public.profiles (id, email, first_name, last_name, role, created_at, updated_at)
    VALUES (lecturer_id, lecturer_email, 'Dan', 'Dee', 'lecturer', now(), now());
  END IF;

  -- ensure profile only if auth user exists
  DO $$
  DECLARE
    auth_id uuid;
    student_email text := 'seed.student@example.com';
  BEGIN
    SELECT id INTO auth_id FROM auth.users WHERE email = student_email LIMIT 1;
    IF auth_id IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth_id) THEN
        INSERT INTO public.profiles (id, email, first_name, last_name, role, created_at, updated_at)
        VALUES (auth_id, student_email, 'Seed', 'Student', 'student', now(), now());
      END IF;
    ELSE
      RAISE NOTICE 'No auth user found for %, skipping profile insert', student_email;
    END IF;
  END$$;

  -- Create a test course for the lecturer
  IF NOT EXISTS (SELECT 1 FROM public.courses WHERE code = 'SEED101' AND lecturer_id = lecturer_id) THEN
    INSERT INTO public.courses (id, code, title, description, credits, level, semester, department_id, lecturer_id, session_id, capacity, created_at, updated_at)
    SELECT gen_random_uuid(), 'SEED101', 'Seeded Test Course', 'Auto-generated course for testing dashboard', 3, '100', 'first', d.id, lecturer_id, s.id, 100, now(), now()
    FROM public.departments d, public.sessions s
    WHERE d.code = 'SEED_DEP' AND s.name = '2025/2026-SEED'
    LIMIT 1;
  END IF;

  -- Supabase-compatible idempotent seed for testing lecturer dashboard
  -- This version only creates `profiles` when matching `auth.users` entries exist,
  -- avoiding foreign key violations on `profiles.id -> auth.users(id)`.

  DO $$
  DECLARE
    lecturer_email text := 'dan@gmail.com';
    student_email text := 'seed.student@example.com';
    lecturer_auth_id uuid;
    student_auth_id uuid;
  BEGIN
    -- Resolve auth user IDs (if users exist in auth.users)
    SELECT id INTO lecturer_auth_id FROM auth.users WHERE email = lecturer_email LIMIT 1;
    SELECT id INTO student_auth_id FROM auth.users WHERE email = student_email LIMIT 1;

    -- Create department if not exists
    IF NOT EXISTS (SELECT 1 FROM public.departments WHERE code = 'SEED_DEP') THEN
      INSERT INTO public.departments (id, name, code, faculty, created_at, updated_at)
      VALUES (gen_random_uuid(), 'Seed Department', 'SEED_DEP', 'Seed Faculty', now(), now());
    END IF;

    -- Create session if not exists
    IF NOT EXISTS (SELECT 1 FROM public.sessions WHERE name = '2025/2026-SEED') THEN
      INSERT INTO public.sessions (id, name, start_date, end_date, is_active, created_at, updated_at)
      VALUES (gen_random_uuid(), '2025/2026-SEED', '2025-09-01', '2026-06-01', true, now(), now());
    END IF;

    -- Ensure lecturer profile exists only if auth user exists
    IF lecturer_auth_id IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = lecturer_auth_id) THEN
        INSERT INTO public.profiles (id, email, first_name, last_name, role, created_at, updated_at)
        VALUES (lecturer_auth_id, lecturer_email, 'Dan', 'Dee', 'lecturer', now(), now());
      END IF;
    ELSE
      RAISE NOTICE 'Auth user for lecturer % not found; skipping lecturer profile and course seeding', lecturer_email;
    END IF;

    -- Ensure student profile exists only if auth user exists
    IF student_auth_id IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = student_auth_id) THEN
        INSERT INTO public.profiles (id, email, first_name, last_name, role, created_at, updated_at)
        VALUES (student_auth_id, student_email, 'Seed', 'Student', 'student', now(), now());
      END IF;
    ELSE
      RAISE NOTICE 'Auth user for student % not found; skipping student profile and enrollment seeding', student_email;
    END IF;

    -- Create a test course for the lecturer (only if lecturer auth exists)
    IF lecturer_auth_id IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.courses WHERE code = 'SEED101' AND lecturer_id = lecturer_auth_id) THEN
        INSERT INTO public.courses (id, code, title, description, credits, level, semester, department_id, lecturer_id, session_id, capacity, created_at, updated_at)
        SELECT gen_random_uuid(), 'SEED101', 'Seeded Test Course', 'Auto-generated course for testing dashboard', 3, '100', 'first', d.id, lecturer_auth_id, s.id, 100, now(), now()
        FROM public.departments d, public.sessions s
        WHERE d.code = 'SEED_DEP' AND s.name = '2025/2026-SEED'
        LIMIT 1;
      END IF;
    END IF;

    -- Enroll the test student in the seeded course (only if student profile exists)
    IF student_auth_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.courses WHERE code = 'SEED101') THEN
      INSERT INTO public.enrollments (id, student_id, course_id, session_id, semester, status, created_at, updated_at)
      SELECT gen_random_uuid(), p.id, c.id, s.id, 'first', 'active', now(), now()
      FROM public.profiles p, public.courses c, public.sessions s
      WHERE p.id = student_auth_id AND c.code = 'SEED101' AND s.name = '2025/2026-SEED'
      AND NOT EXISTS (
        SELECT 1 FROM public.enrollments e WHERE e.student_id = p.id AND e.course_id = c.id AND e.session_id = s.id
      )
      LIMIT 1;
    END IF;

    -- Create an assignment for the seed course
    INSERT INTO public.assignments (id, course_id, lecturer_id, title, description, due_date, total_marks, is_published, created_at, updated_at)
    SELECT gen_random_uuid(), c.id, lecturer_auth_id, 'Seed Assignment 1', 'Auto-generated assignment', now() + interval '7 days', 100, true, now(), now()
    FROM public.courses c
    WHERE c.code = 'SEED101' AND NOT EXISTS (
      SELECT 1 FROM public.assignments a WHERE a.title = 'Seed Assignment 1' AND a.course_id = c.id
    )
    LIMIT 1;

    -- Create a submission by the test student (ungraded)
    IF student_auth_id IS NOT NULL THEN
      INSERT INTO public.submissions (id, assignment_id, student_id, content, created_at, updated_at)
      SELECT gen_random_uuid(), a.id, p.id, 'Seed submission content', now(), now()
      FROM public.assignments a, public.profiles p
      WHERE a.title = 'Seed Assignment 1' AND p.id = student_auth_id
      AND NOT EXISTS (
        SELECT 1 FROM public.submissions s WHERE s.assignment_id = a.id AND s.student_id = p.id
      )
      LIMIT 1;
    END IF;

    -- Create a quiz
    INSERT INTO public.quizzes (id, course_id, lecturer_id, title, questions, duration_minutes, total_marks, status, created_at, updated_at)
    SELECT gen_random_uuid(), c.id, lecturer_auth_id, 'Seed Quiz 1', '[]'::jsonb, 30, 50, 'published', now(), now()
    FROM public.courses c
    WHERE c.code = 'SEED101' AND NOT EXISTS (
      SELECT 1 FROM public.quizzes q WHERE q.title = 'Seed Quiz 1' AND q.course_id = c.id
    )
    LIMIT 1;

    -- Add notifications for lecturer and student (only if profiles exist)
    INSERT INTO public.notifications (id, user_id, title, message, created_at, updated_at)
    SELECT gen_random_uuid(), p.id, 'Seed notification to lecturer', 'This is a seeded notification for the lecturer dashboard', now(), now()
    FROM public.profiles p
    WHERE p.id = lecturer_auth_id AND NOT EXISTS (
      SELECT 1 FROM public.notifications n WHERE n.user_id = p.id AND n.title = 'Seed notification to lecturer'
    )
    LIMIT 1;

    INSERT INTO public.notifications (id, user_id, title, message, created_at, updated_at)
    SELECT gen_random_uuid(), p.id, 'Seed notification to student', 'This is a seeded notification for the student', now(), now()
    FROM public.profiles p
    WHERE p.id = student_auth_id AND NOT EXISTS (
      SELECT 1 FROM public.notifications n WHERE n.user_id = p.id AND n.title = 'Seed notification to student'
    )
    LIMIT 1;

  END$$;

  -- Summary selects
  SELECT 'SEED COMPLETE' as status;
  SELECT id, email, first_name, last_name, role FROM public.profiles WHERE email = 'dan@gmail.com';
  SELECT id, code, title, lecturer_id FROM public.courses WHERE code = 'SEED101';
  SELECT count(*) AS enrollments FROM public.enrollments WHERE course_id IN (SELECT id FROM public.courses WHERE code = 'SEED101');
  SELECT count(*) AS assignments FROM public.assignments WHERE course_id IN (SELECT id FROM public.courses WHERE code = 'SEED101');
  SELECT count(*) AS submissions FROM public.submissions WHERE assignment_id IN (SELECT id FROM public.assignments WHERE course_id IN (SELECT id FROM public.courses WHERE code = 'SEED101'));
  SELECT count(*) AS quizzes FROM public.quizzes WHERE course_id IN (SELECT id FROM public.courses WHERE code = 'SEED101');
  SELECT count(*) AS notifications FROM public.notifications WHERE user_id IN (SELECT id FROM public.profiles WHERE email IN ('dan@gmail.com', 'seed.student@example.com'));
