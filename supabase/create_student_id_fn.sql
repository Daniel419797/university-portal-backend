-- Create sequence and RPC function to generate student IDs
-- Format: ST/<counter>/<YEAR> e.g. ST/0001/2026

CREATE SEQUENCE IF NOT EXISTS public.student_id_seq;

CREATE OR REPLACE FUNCTION public.generate_student_id()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  n bigint;
  yr text;
BEGIN
  n := nextval('public.student_id_seq');
  yr := to_char(now(), 'YYYY');
  RETURN format('ST/%s/%s', lpad(n::text, 4, '0'), yr);
END;
$$;

-- Grant execute to authenticated roles if desired (optional)
-- GRANT EXECUTE ON FUNCTION public.generate_student_id() TO authenticated;
