import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Payment from '../models/Payment.model';
import Scholarship from '../models/Scholarship.model';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { PAYMENT_STATUS, PAYMENT_TYPES } from '../utils/constants';

const PAYMENT_STATUS_VALUES = Object.values(PAYMENT_STATUS);
const PAYMENT_TYPE_VALUES = Object.values(PAYMENT_TYPES);

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
  studentId: string;
  email: string;
  type: string;
  status: string;
  amount: number;
  session: string;
  semester: string;
  paymentDate: Date | null;
  recordedAt: Date;
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
  const filter: Record<string, any> = {};

  if (sessionId) {
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      throw ApiError.badRequest('Invalid session identifier');
    }
    filter.session = new mongoose.Types.ObjectId(sessionId);
  }

  if (statuses && statuses.length) {
    const uniqueStatuses = [...new Set(statuses)];
    uniqueStatuses.forEach((status) => {
      if (!PAYMENT_STATUS_VALUES.includes(status as any)) {
        throw ApiError.badRequest(`Unsupported payment status: ${status}`);
      }
    });
    filter.status = uniqueStatuses.length === 1 ? uniqueStatuses[0] : { $in: uniqueStatuses };
  }

  if (types && types.length) {
    const uniqueTypes = [...new Set(types)];
    uniqueTypes.forEach((type) => {
      if (!PAYMENT_TYPE_VALUES.includes(type as any)) {
        throw ApiError.badRequest(`Unsupported payment type: ${type}`);
      }
    });
    filter.type = uniqueTypes.length === 1 ? uniqueTypes[0] : { $in: uniqueTypes };
  }

  if (startDate || endDate) {
    const range: Record<string, Date> = {};
    if (startDate) {
      range.$gte = startDate;
    }
    if (endDate) {
      range.$lte = endDate;
    }
    if (range.$gte && range.$lte && range.$gte > range.$lte) {
      throw ApiError.badRequest('startDate cannot be after endDate');
    }
    filter.createdAt = range;
  }

  return filter;
};

const withMatchStage = (filter: Record<string, any>, ...stages: any[]) => {
  if (Object.keys(filter).length === 0) {
    return stages;
  }
  return [{ $match: filter }, ...stages];
};

const mapBreakdown = (docs: Array<{ _id: string; count: number; amount: number }>) =>
  docs.map((doc) => ({ key: doc._id, count: doc.count, amount: doc.amount }));

export const getBursaryReports = asyncHandler(async (req: Request, res: Response) => {
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

  const scholarshipFilter: Record<string, any> = {};
  if (academicYear) {
    scholarshipFilter.academicYear = academicYear;
  }
  if (scholarshipStatus) {
    scholarshipFilter.status = scholarshipStatus;
  }

  const [statusBreakdown, typeBreakdown, totalsAggregation, recentPayments, scholarshipBreakdown, scholarshipTimeline, scholarshipTotals, recentScholarships] =
    await Promise.all([
      Payment.aggregate(
        withMatchStage(paymentFilter, {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            amount: { $sum: '$amount' },
          },
        })
      ),
      Payment.aggregate(
        withMatchStage(paymentFilter, {
          $group: {
            _id: '$type',
            count: { $sum: 1 },
            amount: { $sum: '$amount' },
          },
        })
      ),
      Payment.aggregate(
        withMatchStage(paymentFilter, {
          $group: {
            _id: null,
            totalCount: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
            verifiedAmount: {
              $sum: {
                $cond: [{ $eq: ['$status', PAYMENT_STATUS.VERIFIED] }, '$amount', 0],
              },
            },
            pendingAmount: {
              $sum: {
                $cond: [{ $eq: ['$status', PAYMENT_STATUS.PENDING] }, '$amount', 0],
              },
            },
            rejectedAmount: {
              $sum: {
                $cond: [{ $eq: ['$status', PAYMENT_STATUS.REJECTED] }, '$amount', 0],
              },
            },
            processingAmount: {
              $sum: {
                $cond: [{ $eq: ['$status', PAYMENT_STATUS.PROCESSING] }, '$amount', 0],
              },
            },
          },
        })
      ),
      Payment.find(paymentFilter)
        .populate('student', 'firstName lastName email studentId')
        .populate('session', 'name')
        .sort({ createdAt: -1 })
        .limit(15),
      Scholarship.aggregate(
        withMatchStage(scholarshipFilter, {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            amount: { $sum: '$amount' },
            beneficiaries: { $sum: '$filledSlots' },
          },
        })
      ),
      Scholarship.aggregate(
        withMatchStage(
          scholarshipFilter,
          { $group: { _id: '$academicYear', totalAmount: { $sum: '$amount' }, scholarships: { $sum: 1 }, beneficiaries: { $sum: '$filledSlots' } } },
          { $sort: { _id: -1 } },
          { $limit: 5 }
        )
      ),
      Scholarship.aggregate(
        withMatchStage(scholarshipFilter, {
          $group: {
            _id: null,
            totalAmount: { $sum: '$amount' },
            totalScholarships: { $sum: 1 },
            totalBeneficiaries: { $sum: '$filledSlots' },
            availableSlots: { $sum: '$availableSlots' },
          },
        })
      ),
      Scholarship.find(scholarshipFilter)
        .select('name amount status academicYear applicationDeadline filledSlots availableSlots')
        .sort({ createdAt: -1 })
        .limit(5),
    ]);

  const totals = totalsAggregation[0] ?? {
    totalAmount: 0,
    totalCount: 0,
    verifiedAmount: 0,
    pendingAmount: 0,
    rejectedAmount: 0,
    processingAmount: 0,
  };

  const scholarshipSummary = scholarshipTotals[0] ?? {
    totalAmount: 0,
    totalScholarships: 0,
    totalBeneficiaries: 0,
    availableSlots: 0,
  };

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
          averageTransaction:
            totals.totalCount > 0 ? parseFloat((totals.totalAmount / totals.totalCount).toFixed(2)) : 0,
        },
        byStatus: mapBreakdown(statusBreakdown),
        byType: mapBreakdown(typeBreakdown),
        recent: recentPayments.map((payment: any) => ({
          id: payment._id,
          reference: payment.reference,
          amount: payment.amount,
          status: payment.status,
          type: payment.type,
          recordedAt: payment.createdAt,
          paymentDate: payment.paymentDate,
          student: payment.student
            ? {
                id: payment.student._id,
                name: `${payment.student.firstName} ${payment.student.lastName}`,
                email: payment.student.email,
                studentId: payment.student.studentId,
              }
            : null,
          session: payment.session ? (payment.session as any).name : null,
          semester: payment.semester,
        })),
      },
      scholarships: {
        summary: scholarshipSummary,
        byStatus: scholarshipBreakdown.map((doc) => ({
          key: doc._id,
          count: doc.count,
          amount: doc.amount,
          beneficiaries: doc.beneficiaries,
        })),
        timeline: scholarshipTimeline.map((doc) => ({
          academicYear: doc._id,
          totalAmount: doc.totalAmount,
          scholarships: doc.scholarships,
          beneficiaries: doc.beneficiaries,
        })),
        recent: recentScholarships,
      },
    })
  );
});

const buildReportRows = (payments: any[]): ReportRow[] =>
  payments.map((payment) => ({
    reference: payment.reference,
    studentName: payment.student
      ? `${payment.student.firstName} ${payment.student.lastName}`
      : 'Unknown',
    studentId: payment.student?.studentId ?? 'N/A',
    email: payment.student?.email ?? 'N/A',
    type: payment.type,
    status: payment.status,
    amount: payment.amount,
    session: payment.session ? (payment.session as any).name : 'N/A',
    semester: payment.semester,
    paymentDate: payment.paymentDate ?? null,
    recordedAt: payment.createdAt,
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
        row.studentId,
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

  const paymentFilter = buildPaymentFilter({
    sessionId: sessionFilter,
    statuses: statusFilters,
    types: typeFilters,
    startDate: startRange,
    endDate: endRange,
  });

  const sanitizedLimit = Math.min(Math.max(Number(limit) || 500, 1), 2000);

  const payments = await Payment.find(paymentFilter)
    .populate('student', 'firstName lastName email studentId')
    .populate('session', 'name')
    .sort({ createdAt: -1 })
    .limit(sanitizedLimit);

  const rows = buildReportRows(payments as any[]);

  const summary = rows.reduce<ReportSummary>(
    (acc, row) => {
      acc.totalTransactions += 1;
      acc.totalAmount += row.amount;
      acc.byStatus[row.status] = (acc.byStatus[row.status] ?? 0) + 1;
      acc.byType[row.type] = (acc.byType[row.type] ?? 0) + 1;
      if (row.status === PAYMENT_STATUS.VERIFIED) {
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

  let scholarshipSummary: any;
  if (includeScholarships) {
    const data = await Scholarship.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          amount: { $sum: '$amount' },
          beneficiaries: { $sum: '$filledSlots' },
        },
      },
    ]);
    scholarshipSummary = data.map((doc) => ({
      status: doc._id,
      count: doc.count,
      amount: doc.amount,
      beneficiaries: doc.beneficiaries,
    }));
  }

  let filePayload: any;
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
      scholarshipSummary: scholarshipSummary ?? null,
      rows: normalizedFormat === 'json' ? rows : undefined,
      preview: normalizedFormat === 'json' ? undefined : rows.slice(0, 10),
      file: filePayload ?? null,
    })
  );
});
