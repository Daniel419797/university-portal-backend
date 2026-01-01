import mongoose, { Document, Schema } from 'mongoose';

export type InvoiceStatus = 'pending' | 'paid' | 'overdue' | 'cancelled';

export interface IInvoiceItem {
  label: string;
  amount: number;
  type?: string;
}

export interface IInvoiceReminder {
  sentAt: Date;
  channel: 'email' | 'notification';
  message: string;
}

export interface IInvoice extends Document {
  reference: string;
  student: mongoose.Types.ObjectId;
  items: IInvoiceItem[];
  totalAmount: number;
  currency: string;
  dueDate: Date;
  status: InvoiceStatus;
  notes?: string;
  createdBy: mongoose.Types.ObjectId;
  sentAt?: Date;
  paidAt?: Date;
  reminders: IInvoiceReminder[];
  createdAt: Date;
  updatedAt: Date;
}

const invoiceItemSchema = new Schema<IInvoiceItem>(
  {
    label: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    type: { type: String },
  },
  { _id: false }
);

const reminderSchema = new Schema<IInvoiceReminder>(
  {
    sentAt: { type: Date, default: Date.now },
    channel: { type: String, enum: ['email', 'notification'], required: true },
    message: { type: String, required: true },
  },
  { _id: false }
);

const invoiceSchema = new Schema<IInvoice>(
  {
    reference: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    student: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    items: {
      type: [invoiceItemSchema],
      validate: [(val: IInvoiceItem[]) => val.length > 0, 'At least one item is required'],
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: 'NGN',
    },
    dueDate: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'paid', 'overdue', 'cancelled'],
      default: 'pending',
      index: true,
    },
    notes: String,
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    sentAt: Date,
    paidAt: Date,
    reminders: {
      type: [reminderSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

invoiceSchema.index({ student: 1, status: 1 });

const Invoice = mongoose.model<IInvoice>('Invoice', invoiceSchema);
export default Invoice;
