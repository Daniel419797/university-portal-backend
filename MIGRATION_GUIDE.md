# MongoDB to Supabase Migration Patterns
# Complete reference guide for migrating all controllers

## COMPLETED MIGRATIONS:
- ✅ auth.controller.ts
- ✅ user.controller.ts
- ✅ course.controller.ts
- ✅ assignment.controller.ts
- ✅ notification.controller.ts
- ✅ notification.service.ts

## MIGRATION PATTERNS:

### 1. IMPORTS
```typescript
// OLD:
import ModelName from '../models/ModelName.model';

// NEW:
import { supabaseAdmin } from '../config/supabase';
```

### 2. INITIALIZATION
```typescript
// Add at start of each function:
const db = supabaseAdmin();
const userId = req.user?.userId || req.user?._id?.toString();
```

### 3. COMMON QUERY PATTERNS:

#### Find by ID
```typescript
// OLD:
const item = await Model.findById(id);

// NEW:
const { data, error } = await db
  .from('table_name')
  .select('*')
  .eq('id', id)
  .maybeSingle();
if (error) throw ApiError.internal(`Failed: ${error.message}`);
if (!data) throw ApiError.notFound('Not found');
```

#### Find with filter
```typescript
// OLD:
const items = await Model.find({ field: value });

// NEW:
const { data, error } = await db
  .from('table_name')
  .select('*')
  .eq('field', value);
if (error) throw ApiError.internal(`Failed: ${error.message}`);
```

#### Create
```typescript
// OLD:
const item = await Model.create(data);

// NEW:
const { data: item, error } = await db
  .from('table_name')
  .insert({
    field_one: data.fieldOne, // Convert camelCase to snake_case
    field_two: data.fieldTwo,
  })
  .select()
  .single();
if (error) throw ApiError.internal(`Failed: ${error.message}`);
```

#### Update
```typescript
// OLD:
const item = await Model.findByIdAndUpdate(id, updates, { new: true });

// NEW:
const patch: Record<string, unknown> = {};
if (updates.field !== undefined) patch.field_name = updates.field;
patch.updated_at = new Date().toISOString();

const { data, error } = await db
  .from('table_name')
  .update(patch)
  .eq('id', id)
  .select()
  .single();
if (error) throw ApiError.internal(`Failed: ${error.message}`);
```

#### Delete (soft delete)
```typescript
// OLD:
await Model.findByIdAndDelete(id);

// NEW:
const { error } = await db
  .from('table_name')
  .update({ deleted_at: new Date().toISOString() })
  .eq('id', id);
```

#### Delete (hard delete)
```typescript
// OLD:
await item.deleteOne();

// NEW:
const { error } = await db
  .from('table_name')
  .delete()
  .eq('id', id);
```

#### Count
```typescript
// OLD:
const total = await Model.countDocuments(query);

// NEW:
const { count, error } = await db
  .from('table_name')
  .select('*', { count: 'exact', head: true })
  .eq('field', value);
```

#### Pagination
```typescript
// OLD:
const skip = (page - 1) * limit;
const items = await Model.find(query).skip(skip).limit(limit);

// NEW:
const skip = (page - 1) * limit;
const { data, error, count } = await db
  .from('table_name')
  .select('*', { count: 'exact' })
  .range(skip, skip + limit - 1);
```

#### Populate (Join)
```typescript
// OLD:
.populate('course', 'name code')
.populate('lecturer', 'firstName lastName')

// NEW:
.select('*, courses(name, code), lecturer:profiles!fkey_name(first_name, last_name)')
```

#### Sort
```typescript
// OLD:
.sort({ createdAt: -1 })

// NEW:
.order('created_at', { ascending: false })
```

#### Search (case-insensitive)
```typescript
// OLD:
{ name: { $regex: search, $options: 'i' } }

// NEW:
.ilike('name', `%${search}%`)
// OR for multiple fields:
.or(`name.ilike.%${search}%,email.ilike.%${search}%`)
```

### 4. FIELD NAME MAPPING (MongoDB → Supabase):

```
MongoDB          →  Supabase
--------------------------------
_id              →  id
userId           →  id (from auth.users)
firstName        →  first_name
lastName         →  last_name
studentId        →  student_id
createdAt        →  created_at
updatedAt        →  updated_at
isActive         →  is_active
isRead           →  (use read_at IS NULL/NOT NULL)
readAt           →  read_at
deletedAt        →  deleted_at
```

### 5. USER AUTHENTICATION:

```typescript
// OLD:
const userId = (req as any).user._id;

// NEW:
const userId = req.user?.userId || req.user?._id?.toString();
if (!userId) throw ApiError.unauthorized('User not authenticated');
```

### 6. AUTHORIZATION CHECKS:

```typescript
// OLD:
if (item.user.toString() !== userId.toString())

// NEW:
if (item.user_id !== userId)
```

### 7. BULK INSERT:

```typescript
// OLD:
await Model.insertMany(items);

// NEW:
const { error } = await db
  .from('table_name')
  .insert(items);
```

### 8. BULK UPDATE:

```typescript
// OLD:
await Model.updateMany(filter, updates);

// NEW:
const { error, count } = await db
  .from('table_name')
  .update(updates)
  .eq('field', value)
  .select('*', { count: 'exact', head: true });
```

## TABLE MAPPING:

```
Model Name              →  Supabase Table
------------------------------------------------
User                    →  profiles
Course                  →  courses
Assignment              →  assignments
Submission              →  submissions
Quiz                    →  quizzes
QuizAttempt             →  quiz_attempts
Result                  →  results
Enrollment              →  enrollments
Attendance              →  attendance
Payment                 →  payments
InstallmentPlan         →  installment_plans
Hostel                  →  hostels
HostelApplication       →  hostel_applications
Message                 →  messages
Notification            →  notifications
Department              →  departments
Session                 →  sessions
Scholarship             →  scholarships
ScholarshipApplication  →  scholarship_applications
Clearance               →  clearance
GradeAppeal             →  grade_appeals
AuditLog                →  audit_logs
```

## REMAINING CONTROLLERS TO MIGRATE:

Priority 1 (Core functionality):
- [ ] quiz.controller.ts
- [ ] result.controller.ts
- [ ] attendance.controller.ts

Priority 2 (Financial):
- [ ] payment.controller.ts
- [ ] bursary.controller.ts
- [ ] installment.controller.ts

Priority 3 (Student services):
- [ ] hostel.controller.ts
- [ ] clearance.controller.ts
- [ ] scholarship.controller.ts
- [ ] appeal.controller.ts

Priority 4 (Communications):
- [ ] message.controller.ts

Priority 5 (Role-specific):
- [ ] lecturer.controller.ts
- [ ] student.controller.ts
- [ ] hod.controller.ts
- [ ] admin.controller.ts

Priority 6 (Support features):
- [ ] dashboard.controller.ts
- [ ] file.controller.ts
- [ ] material.controller.ts
- [ ] settings.controller.ts

## QUICK MIGRATION CHECKLIST:

For each controller file:
1. [ ] Replace MongoDB model imports with Supabase import
2. [ ] Add `const db = supabaseAdmin();` at function start
3. [ ] Convert user ID extraction pattern
4. [ ] Replace all Model.find* with db.from().select()
5. [ ] Replace all Model.create with db.from().insert()
6. [ ] Replace all Model.*Update with db.from().update()
7. [ ] Replace all Model.delete* with db.from().delete()
8. [ ] Convert field names (camelCase → snake_case)
9. [ ] Replace .populate() with JOIN syntax in .select()
10. [ ] Replace .sort() with .order()
11. [ ] Replace .skip().limit() with .range()
12. [ ] Test the controller endpoints

## COMMON GOTCHAS:

1. Supabase returns `null` not `undefined` for missing values
2. Always check for `error` before using `data`
3. Use `.maybeSingle()` instead of `.single()` when record might not exist
4. Foreign key field names use `_id` suffix (e.g., `course_id`, not `course`)
5. JOIN syntax requires knowing the foreign key constraint name
6. For counting with operations, use `{ count: 'exact', head: true }`
7. Pagination uses `.range(from, to)` where `to` is inclusive

## TESTING APPROACH:

After migrating each controller:
```bash
# Check for TypeScript errors
npm run build

# Run tests
npm test

# Test specific endpoints manually
# Example: POST /api/v1/courses
# Example: GET /api/v1/courses?page=1&limit=10
```
