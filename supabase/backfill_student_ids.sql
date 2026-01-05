-- Backfill missing student_id values for student profiles using generate_student_id()
-- Run this in Supabase SQL editor to assign IDs to existing students without a student_id

DO $$
BEGIN
  UPDATE public.profiles
  SET student_id = public.generate_student_id()
  WHERE role = 'student' AND (student_id IS NULL OR student_id = '');
END$$;

-- Summary
SELECT count(*) AS backfilled FROM public.profiles WHERE role = 'student' AND student_id IS NOT NULL;