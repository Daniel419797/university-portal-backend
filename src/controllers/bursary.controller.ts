import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { PAYMENT_STATUS, PAYMENT_TYPES } from '../utils/constants';

const PAYMENT_STATUS_VALUES = Object.values(PAYMENT_STATUS);
const PAYMENT_TYPE_VALUES = Object.values(PAYMENT_TYPES);
const PAYMENT_STATUS_SET = new Set<string>(PAYMENT_STATUS_VALUES as unknown as string[]);
const PAYMENT_TYPE_SET = new Set<string>(PAYMENT_TYPE_VALUES as unknown as string[]);

type MaybeString = string | undefined;

type PaymentFilterParams = {
  sessionId?: MaybeString;
  statuses?: string[];
  types?: string[];
  startDate?: Date;
  endDate?: Date;
};

interface ReportRow {
  reference: string;
  studentName: string;
  student_id: string;
  email: string;
  type: string;
  status: string;
  amount: number;
  session: string;
  semester: string | null;
  paymentDate: string | null;
  recordedAt: string;
}

interface ReportSummary {
  totalTransactions: number;
  totalAmount: number;
  verifiedAmount: number;
  pendingAmount: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  averageTransaction: number;
}

const normalizeSingleValue = (value: unknown): string | undefined => {
  if (Array.isArray(value)) {
    return value[0];
  }
  if (value === undefined || value === null) {
    return undefined;
  }
  return String(value);
};

const normalizeArrayValue = (value: unknown): string[] | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }
  if (typeof value === 'string' && value.includes(',')) {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
  const single = normalizeSingleValue(value);
  return single ? [single] : undefined;
};

const parseDateInput = (value: unknown): Date | undefined => {
  const dateString = normalizeSingleValue(value);
  if (!dateString) {
    return undefined;
  }
  const parsed = new Date(dateString);
  if (Number.isNaN(parsed.getTime())) {
    throw ApiError.badRequest(`Invalid date provided: ${dateString}`);
  }
  return parsed;
};

const buildPaymentFilter = ({ sessionId, statuses, types, startDate, endDate }: PaymentFilterParams) => {
  const uniqueStatuses = statuses ? [...new Set(statuses)] : undefined;
  const uniqueTypes = types ? [...new Set(types)] : undefined;

  if (uniqueStatuses) {
    uniqueStatuses.forEach((status) => {
      if (!PAYMENT_STATUS_SET.has(status)) {
        throw ApiError.badRequest(`Unsupported payment status: ${status}`);
      }
    });
  }

  if (uniqueTypes) {
    uniqueTypes.forEach((type) => {
      if (!PAYMENT_TYPE_SET.has(type)) {
        throw ApiError.badRequest(`Unsupported payment type: ${type}`);
      }
    });
  }

  if (startDate && endDate && startDate > endDate) {
    throw ApiError.badRequest('startDate cannot be after endDate');
  }

  return { sessionId, statuses: uniqueStatuses, types: uniqueTypes, startDate, endDate } as PaymentFilterParams;
};

type PaymentRow = {
  id: string;
  reference: string;
  amount: number;
  status: string;
  type: string;
  created_at: string;
  payment_date: string | null;
  student?: { id: string; first_name: string; last_name: string; email: string; student_id: string } | Array<{ id: string; first_name: string; last_name: string; email: string; student_id: string }>;
  session?: string;
  semester?: string;
};

type ScholarshipRow = {
  id: string;
  name: string;
  amount: number;
  status: string;
  academic_year: string;
  application_deadline: string | null;
  filled_slots: number;
  available_slots: number;
};

const mapBreakdown = (items: PaymentRow[], key: 'status' | 'type') => {
  const acc: Record<string, { count: number; amount: number }> = {};
  for (const p of items) {
    const k = p[key];
    acc[k] = acc[k] || { count: 0, amount: 0 };
    acc[k].count += 1;
    acc[k].amount += Number(p.amount || 0);
  }
  return Object.entries(acc).map(([k, v]) => ({ key: k, count: v.count, amount: v.amount }));
};

export const getBursaryReports = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const sessionId = normalizeSingleValue(req.query.session);
  const status = normalizeSingleValue(req.query.status);
  const type = normalizeSingleValue(req.query.type);
  const startDate = parseDateInput(req.query.startDate);
  const endDate = parseDateInput(req.query.endDate);
  const academicYear = normalizeSingleValue(req.query.academicYear);
  const scholarshipStatus = normalizeSingleValue(req.query.scholarshipStatus);

  const paymentFilter = buildPaymentFilter({
    sessionId,
    statuses: status ? [status] : undefined,
    types: type ? [type] : undefined,
    startDate,
    endDate,
  });

  let paymentsQuery = db
    .from('payments')
    .select(
      'id, reference, amount, status, type, created_at, payment_date, student:profiles!payments_student_id_fkey(id,first_name,last_name,email,student_id), session, semester'
    )
    .order('created_at', { ascending: false });
  if (paymentFilter.sessionId) paymentsQuery = paymentsQuery.eq('session', paymentFilter.sessionId);
  if (paymentFilter.statuses && paymentFilter.statuses.length === 1) paymentsQuery = paymentsQuery.eq('status', paymentFilter.statuses[0]);
  if (paymentFilter.statuses && paymentFilter.statuses.length > 1) paymentsQuery = paymentsQuery.in('status', paymentFilter.statuses);
  if (paymentFilter.types && paymentFilter.types.length === 1) paymentsQuery = paymentsQuery.eq('type', paymentFilter.types[0]);
  if (paymentFilter.types && paymentFilter.types.length > 1) paymentsQuery = paymentsQuery.in('type', paymentFilter.types);
  if (paymentFilter.startDate) paymentsQuery = paymentsQuery.gte('created_at', paymentFilter.startDate.toISOString());
  if (paymentFilter.endDate) paymentsQuery = paymentsQuery.lte('created_at', paymentFilter.endDate.toISOString());

  const { data: recentPayments, error: paymentsErr } = await paymentsQuery.limit(15); // note: student profile join uses payments_student_id_fkey to disambiguate relationship
  if (paymentsErr) throw ApiError.internal(`Failed to fetch payments: ${paymentsErr.message}`);

  let scholarshipQuery = db
    .from('scholarships')
    .select('id, name, amount, status, academic_year, application_deadline, filled_slots, available_slots');
  if (academicYear) scholarshipQuery = scholarshipQuery.eq('academic_year', academicYear);
  if (scholarshipStatus) scholarshipQuery = scholarshipQuery.eq('status', scholarshipStatus);
  const { data: scholarships, error: scholarshipsErr } = await scholarshipQuery.limit(1000);
  if (scholarshipsErr) throw ApiError.internal(`Failed to fetch scholarships: ${scholarshipsErr.message}`);

  const totals = (recentPayments || []).reduce(
    (acc, p: PaymentRow) => {
      acc.totalCount += 1;
      acc.totalAmount += Number(p.amount || 0);
      if (p.status === PAYMENT_STATUS.SUCCESSFUL) acc.verifiedAmount += Number(p.amount || 0);
      if (p.status === PAYMENT_STATUS.PENDING) acc.pendingAmount += Number(p.amount || 0);
      if (p.status === PAYMENT_STATUS.FAILED) acc.rejectedAmount += Number(p.amount || 0);
      return acc;
    },
    { totalCount: 0, totalAmount: 0, verifiedAmount: 0, pendingAmount: 0, rejectedAmount: 0, processingAmount: 0 }
  );

  const scholarshipSummary = (scholarships || []).reduce(
    (acc, s: ScholarshipRow) => {
      acc.totalScholarships += 1;
      acc.totalAmount += Number(s.amount || 0);
      acc.totalBeneficiaries += Number(s.filled_slots || 0);
      acc.availableSlots += Number(s.available_slots || 0);
      return acc;
    },
    { totalAmount: 0, totalScholarships: 0, totalBeneficiaries: 0, availableSlots: 0 }
  );

  const byStatus = mapBreakdown((recentPayments || []) as PaymentRow[], 'status');
  const byType = mapBreakdown((recentPayments || []) as PaymentRow[], 'type');

  const scholarshipBreakdown = (scholarships || []).reduce(
    (acc: Record<string, { count: number; amount: number; beneficiaries: number }>, s: ScholarshipRow) => {
      const key = s.status;
      acc[key] = acc[key] || { count: 0, amount: 0, beneficiaries: 0 };
      acc[key].count += 1;
      acc[key].amount += Number(s.amount || 0);
      acc[key].beneficiaries += Number(s.filled_slots || 0);
      return acc;
    },
    {}
  );

  const scholarshipTimelineMap = (scholarships || []).reduce(
    (acc: Record<string, { totalAmount: number; scholarships: number; beneficiaries: number }>, s: ScholarshipRow) => {
      const key = s.academic_year;
      acc[key] = acc[key] || { totalAmount: 0, scholarships: 0, beneficiaries: 0 };
      acc[key].totalAmount += Number(s.amount || 0);
      acc[key].scholarships += 1;
      acc[key].beneficiaries += Number(s.filled_slots || 0);
      return acc;
    },
    {}
  );
  const scholarshipTimeline = Object.entries(scholarshipTimelineMap)
    .sort((a, b) => (a[0] > b[0] ? -1 : 1))
    .slice(0, 5)
    .map(([academicYear, v]) => ({ academicYear, totalAmount: v.totalAmount, scholarships: v.scholarships, beneficiaries: v.beneficiaries }));

  const recentScholarships = (scholarships || []).slice(0, 5);

  res.json(
    ApiResponse.success('Bursary reports retrieved successfully', {
      filters: {
        session: sessionId ?? null,
        status: status ?? null,
        type: type ?? null,
        startDate: startDate ?? null,
        endDate: endDate ?? null,
        academicYear: academicYear ?? null,
        scholarshipStatus: scholarshipStatus ?? null,
      },
      payments: {
        totals: {
          ...totals,
          averageTransaction: totals.totalCount > 0 ? parseFloat((totals.totalAmount / totals.totalCount).toFixed(2)) : 0,
        },
        byStatus,
        byType,
        recent: (recentPayments || []).map((payment: PaymentRow) => {
          const studentJoin = Array.isArray(payment.student) ? payment.student[0] : payment.student;
          return {
            id: payment.id,
            reference: payment.reference,
            amount: payment.amount,
            status: payment.status,
            type: payment.type,
            recordedAt: payment.created_at,
            paymentDate: payment.payment_date,
            student: studentJoin
              ? {
                  id: studentJoin.id,
                  name: `${studentJoin.first_name} ${studentJoin.last_name}`,
                  email: studentJoin.email,
                  student_id: studentJoin.student_id,
                }
              : null,
            session: payment.session || null,
            semester: payment.semester || null,
          };
        }),
      },
      scholarships: {
        summary: scholarshipSummary,
        byStatus: Object.entries(scholarshipBreakdown).map(([key, v]) => ({ key, count: v.count, amount: v.amount, beneficiaries: v.beneficiaries })),
        timeline: scholarshipTimeline,
        recent: recentScholarships,
      },
    })
  );
});

const buildReportRows = (payments: PaymentRow[]): ReportRow[] =>
  payments.map((payment) => ({
    reference: payment.reference,
    studentName: payment.student
      ? `${(Array.isArray(payment.student) ? payment.student[0].first_name : payment.student.first_name)} ${
          (Array.isArray(payment.student) ? payment.student[0].last_name : payment.student.last_name)
        }`
      : 'Unknown',
    student_id: (Array.isArray(payment.student) ? payment.student[0]?.student_id : payment.student?.student_id) ?? 'N/A',
    email: (Array.isArray(payment.student) ? payment.student[0]?.email : payment.student?.email) ?? 'N/A',
    type: payment.type,
    status: payment.status,
    amount: payment.amount,
    session: payment.session || 'N/A',
    semester: payment.semester ?? null,
    paymentDate: payment.payment_date ?? null,
    recordedAt: payment.created_at,
  }));

const escapeCsv = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value).replace(/"/g, '""');
  return `"${str}"`;
};

const buildCsvPayload = (rows: ReportRow[]) => {
  const header = [
    'Reference',
    'Student Name',
    'Student ID',
    'Email',
    'Type',
    'Status',
    'Amount',
    'Session',
    'Semester',
    'Payment Date',
    'Recorded At',
  ];

  const csvLines = [
    header.join(','),
    ...rows.map((row) =>
      [
        row.reference,
        row.studentName,
        row.student_id,
        row.email,
        row.type,
        row.status,
        row.amount,
        row.session,
        row.semester,
        row.paymentDate ? new Date(row.paymentDate).toISOString() : '',
        row.recordedAt ? new Date(row.recordedAt).toISOString() : '',
      ]
        .map(escapeCsv)
        .join(',')
    ),
  ];

  const csvBuffer = Buffer.from(csvLines.join('\n'), 'utf-8');
  return {
    fileName: `bursary-report-${Date.now()}.csv`,
    mimeType: 'text/csv',
    size: csvBuffer.length,
    content: csvBuffer.toString('base64'),
  };
};

const buildPdfLikePayload = (rows: ReportRow[], summary: ReportSummary) => {
  const preview = rows.slice(0, 50);
  const lines = [
    'Bursary Report',
    `Generated At: ${new Date().toISOString()}`,
    `Total Transactions: ${summary.totalTransactions}`,
    `Total Amount: ${summary.totalAmount}`,
    '',
    'Preview (first 50 rows):',
    ...preview.map(
      (row) =>
        `${row.reference} | ${row.studentName} | ${row.type} | ${row.status} | ${row.amount} | ${row.session} | ${row.semester}`
    ),
  ];

  const buffer = Buffer.from(lines.join('\n'), 'utf-8');
  return {
    fileName: `bursary-report-${Date.now()}.pdf`,
    mimeType: 'application/pdf',
    size: buffer.length,
    content: buffer.toString('base64'),
  };
};

export const generateBursaryReport = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { format = 'json', filters = {}, includeScholarships = false, limit = 500 } = req.body;
  const normalizedFormat = String(format).toLowerCase();

  if (!['json', 'csv', 'pdf'].includes(normalizedFormat)) {
    throw ApiError.badRequest('format must be one of json, csv, or pdf');
  }

  const sessionFilter = normalizeSingleValue(filters.session ?? filters.sessionId);
  const statusFilters = normalizeArrayValue(filters.statuses ?? filters.status);
  const typeFilters = normalizeArrayValue(filters.types ?? filters.type);
  const startRange = parseDateInput(filters.startDate);
  const endRange = parseDateInput(filters.endDate);

  const paymentFilter = buildPaymentFilter({ sessionId: sessionFilter, statuses: statusFilters, types: typeFilters, startDate: startRange, endDate: endRange });

  const sanitizedLimit = Math.min(Math.max(Number(limit) || 500, 1), 2000);

  let paymentsQuery = db
    .from('payments')
    .select('id, reference, amount, status, type, created_at, payment_date, student:profiles(id,first_name,last_name,email,student_id), session, semester')
    .order('created_at', { ascending: false })
    .limit(sanitizedLimit);
  if (paymentFilter.sessionId) paymentsQuery = paymentsQuery.eq('session', paymentFilter.sessionId);
  if (paymentFilter.statuses && paymentFilter.statuses.length === 1) paymentsQuery = paymentsQuery.eq('status', paymentFilter.statuses[0]);
  if (paymentFilter.statuses && paymentFilter.statuses.length > 1) paymentsQuery = paymentsQuery.in('status', paymentFilter.statuses);
  if (paymentFilter.types && paymentFilter.types.length === 1) paymentsQuery = paymentsQuery.eq('type', paymentFilter.types[0]);
  if (paymentFilter.types && paymentFilter.types.length > 1) paymentsQuery = paymentsQuery.in('type', paymentFilter.types);
  if (paymentFilter.startDate) paymentsQuery = paymentsQuery.gte('created_at', paymentFilter.startDate.toISOString());
  if (paymentFilter.endDate) paymentsQuery = paymentsQuery.lte('created_at', paymentFilter.endDate.toISOString());

  const { data: payments, error } = await paymentsQuery;
  if (error) throw ApiError.internal(`Failed to fetch payments: ${error.message}`);

  const rows = buildReportRows((payments || []) as PaymentRow[]);

  const summary = rows.reduce<ReportSummary>(
    (acc, row) => {
      acc.totalTransactions += 1;
      acc.totalAmount += row.amount;
      acc.byStatus[row.status] = (acc.byStatus[row.status] ?? 0) + 1;
      acc.byType[row.type] = (acc.byType[row.type] ?? 0) + 1;
      if (row.status === PAYMENT_STATUS.SUCCESSFUL) {
        acc.verifiedAmount += row.amount;
      }
      if (row.status === PAYMENT_STATUS.PENDING) {
        acc.pendingAmount += row.amount;
      }
      return acc;
    },
    {
      totalTransactions: 0,
      totalAmount: 0,
      verifiedAmount: 0,
      pendingAmount: 0,
      byStatus: {},
      byType: {},
      averageTransaction: 0,
    }
  );

  summary.averageTransaction =
    summary.totalTransactions > 0 ? parseFloat((summary.totalAmount / summary.totalTransactions).toFixed(2)) : 0;

  let scholarshipSummary: Array<{ status: string; count: number; amount: number; beneficiaries: number }> | null = null;
  if (includeScholarships) {
    const { data: scholarships, error: sErr } = await db
      .from('scholarships')
      .select('id, status, amount, filled_slots')
      .limit(2000);
    if (sErr) throw ApiError.internal(`Failed to fetch scholarships: ${sErr.message}`);
    const breakdown = (scholarships || []).reduce(
      (acc: Record<string, { count: number; amount: number; beneficiaries: number }>, s: ScholarshipRow) => {
        const key = s.status;
        acc[key] = acc[key] || { count: 0, amount: 0, beneficiaries: 0 };
        acc[key].count += 1;
        acc[key].amount += Number(s.amount || 0);
        acc[key].beneficiaries += Number(s.filled_slots || 0);
        return acc;
      },
      {}
    );
    scholarshipSummary = Object.entries(breakdown).map(([status, v]) => ({ status, count: v.count, amount: v.amount, beneficiaries: v.beneficiaries }));
  }

  type FilePayload = { fileName: string; mimeType: string; size: number; content: string };
  let filePayload: FilePayload | null = null;
  if (normalizedFormat === 'csv') {
    filePayload = buildCsvPayload(rows);
  } else if (normalizedFormat === 'pdf') {
    filePayload = buildPdfLikePayload(rows, summary);
  }

  res.status(201).json(
    ApiResponse.success('Report generated successfully', {
      metadata: {
        format: normalizedFormat,
        generatedAt: new Date(),
        rowCount: rows.length,
        limit: sanitizedLimit,
        filters: {
          session: sessionFilter ?? null,
          statuses: statusFilters ?? null,
          types: typeFilters ?? null,
          startDate: startRange ? startRange.toISOString() : null,
          endDate: endRange ? endRange.toISOString() : null,
        },
      },
      summary,
      scholarshipSummary,
      rows: normalizedFormat === 'json' ? rows : undefined,
      preview: normalizedFormat === 'json' ? undefined : rows.slice(0, 10),
      file: filePayload ?? null,
    })
  );
});

