-- Supabase Postgres schema for university-portal-backend
-- Apply in Supabase Dashboard: SQL Editor → New query → run

-- Extensions
create extension if not exists pgcrypto;

-- Enums
do $$ begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type user_role as enum ('student','lecturer','admin','hod','bursary');
  end if;
  if not exists (select 1 from pg_type where typname = 'semester_type') then
    create type semester_type as enum ('first','second');
  end if;
  if not exists (select 1 from pg_type where typname = 'enrollment_status') then
    create type enrollment_status as enum ('active','dropped','completed');
  end if;
  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type payment_status as enum ('pending','successful','failed','refunded');
  end if;
  if not exists (select 1 from pg_type where typname = 'hostel_application_status') then
    create type hostel_application_status as enum ('pending','approved','rejected','cancelled');
  end if;
  if not exists (select 1 from pg_type where typname = 'quiz_status') then
    create type quiz_status as enum ('draft','published','closed');
  end if;
  if not exists (select 1 from pg_type where typname = 'clearance_status') then
    create type clearance_status as enum ('pending','approved','rejected');
  end if;
  if not exists (select 1 from pg_type where typname = 'notification_type') then
    create type notification_type as enum ('info','success','warning','error');
  end if;
exception when others then
  -- no-op
end $$;

-- Core tables

-- Users live in Supabase Auth (auth.users). This table stores app profile data.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  first_name text not null,
  last_name text not null,
  role user_role not null default 'student',
  avatar text,
  student_id text unique,
  department_id uuid,
  level text,
  phone_number text,
  address text,
  date_of_birth date,
  nationality text,
  state_of_origin text,
  blood_group text,
  emergency_contact jsonb,
  bio text,
  is_active boolean not null default true,
  two_factor_method text,
  two_factor_secret text,
  two_factor_enabled boolean not null default false,
  last_login timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text not null unique,
  faculty text not null,
  hod_id uuid references public.profiles(id),
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add constraint profiles_department_fk
  foreign key (department_id) references public.departments(id);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date,
  end_date date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  description text not null,
  credits int not null,
  level text not null,
  semester semester_type not null,
  department_id uuid not null references public.departments(id),
  lecturer_id uuid not null references public.profiles(id),
  prerequisites uuid[] default '{}',
  schedule jsonb default '[]'::jsonb,
  capacity int not null default 100,
  session_id uuid not null references public.sessions(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists courses_filter_idx on public.courses (department_id, level, semester);

create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id),
  course_id uuid not null references public.courses(id),
  session_id uuid not null references public.sessions(id),
  semester text not null,
  enrolled_at timestamptz not null default now(),
  status enrollment_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, course_id, session_id)
);

-- Assignments & submissions
create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id),
  lecturer_id uuid not null references public.profiles(id),
  title text not null,
  description text,
  due_date timestamptz,
  total_marks int,
  attachment_url text,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id),
  student_id uuid not null references public.profiles(id),
  submitted_at timestamptz not null default now(),
  content text,
  file_url text,
  score int,
  feedback text,
  graded_by uuid references public.profiles(id),
  graded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id, student_id)
);

-- Quizzes
create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id),
  lecturer_id uuid not null references public.profiles(id),
  title text not null,
  description text,
  questions jsonb not null default '[]'::jsonb,
  duration_minutes int,
  total_marks int,
  status quiz_status not null default 'draft',
  start_time timestamptz,
  end_time timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id),
  student_id uuid not null references public.profiles(id),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  answers jsonb not null default '{}'::jsonb,
  score int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quiz_id, student_id)
);

-- Results
create table if not exists public.results (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id),
  course_id uuid not null references public.courses(id),
  session_id uuid not null references public.sessions(id),
  semester text,
  ca_score numeric,
  exam_score numeric,
  total_score numeric,
  grade text,
  remark text,
  entered_by uuid references public.profiles(id),
  hod_approved_by uuid references public.profiles(id),
  admin_approved_by uuid references public.profiles(id),
  hod_rejected_by uuid references public.profiles(id),
  status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, course_id, session_id)
);

-- Payments
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id),
  session_id uuid references public.sessions(id),
  amount numeric not null,
  reference text unique,
  status payment_status not null default 'pending',
  channel text,
  verified_by uuid references public.profiles(id),
  verified_at timestamptz,
  meta jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Installment plans
create table if not exists public.installment_plans (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id),
  session_id uuid not null references public.sessions(id),
  total_amount numeric not null,
  installments jsonb not null default '[]'::jsonb,
  payment_id uuid references public.payments(id),
  status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Hostels
create table if not exists public.hostels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text,
  description text,
  capacity int,
  fee numeric,
  session_id uuid references public.sessions(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hostel_applications (
  id uuid primary key default gen_random_uuid(),
  hostel_id uuid not null references public.hostels(id),
  student_id uuid not null references public.profiles(id),
  session_id uuid references public.sessions(id),
  status hostel_application_status not null default 'pending',
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (hostel_id, student_id, session_id)
);

-- Messages
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id),
  receiver_id uuid not null references public.profiles(id),
  content text not null,
  attachments jsonb,
  read_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Notifications
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  title text not null,
  message text not null,
  type notification_type not null default 'info',
  data jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Attendance
create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id),
  lecturer_id uuid not null references public.profiles(id),
  session_id uuid references public.sessions(id),
  date date not null,
  attendees uuid[] not null default '{}',
  absentees uuid[] not null default '{}',
  meta jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Scholarships
create table if not exists public.scholarships (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  amount numeric,
  deadline timestamptz,
  eligibility jsonb,
  created_by uuid references public.profiles(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scholarship_applications (
  id uuid primary key default gen_random_uuid(),
  scholarship_id uuid not null references public.scholarships(id),
  student_id uuid not null references public.profiles(id),
  status text not null default 'pending',
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  attachments jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scholarship_id, student_id)
);

-- Clearance
create table if not exists public.clearance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id),
  department_id uuid references public.departments(id),
  session_id uuid references public.sessions(id),
  status clearance_status not null default 'pending',
  approved_by uuid references public.profiles(id),
  processed_by uuid references public.profiles(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Appeals
create table if not exists public.grade_appeals (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id),
  result_id uuid references public.results(id),
  course_id uuid references public.courses(id),
  reason text,
  evidence_url text,
  status text not null default 'pending',
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Course materials
create table if not exists public.course_materials (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id),
  uploaded_by uuid not null references public.profiles(id),
  title text not null,
  description text,
  file_url text,
  file_type text,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- File assets
create table if not exists public.file_assets (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid not null references public.profiles(id),
  name text not null,
  url text not null,
  mime_type text,
  size_bytes bigint,
  meta jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Admin/system content
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  published_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id),
  session_id uuid references public.sessions(id),
  items jsonb not null default '[]'::jsonb,
  amount numeric not null,
  status text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.system_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb,
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  preferences jsonb not null default '{}'::jsonb,
  privacy jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

-- Audit logs
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id),
  action text not null,
  resource text,
  resource_id text,
  details jsonb,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);
