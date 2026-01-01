import mongoose, { Document, Schema } from 'mongoose';

export interface IMessage extends Document {
  sender: mongoose.Types.ObjectId;
  recipient: mongoose.Types.ObjectId;
  subject: string;
  body: string;
  attachments: Array<{
    url: string;
    name: string;
    size: number;
  }>;
  isRead: boolean;
  readAt?: Date;
  thread?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new Schema<IMessage>(
  {
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    recipient: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    body: {
      type: String,
      required: true,
    },
    attachments: [
      {
        url: String,
        name: String,
        size: Number,
      },
    ],
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: Date,
    thread: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
    },
  },
  {
    timestamps: true,
  }
);

messageSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
messageSchema.index({ sender: 1, createdAt: -1 });

const Message = mongoose.model<IMessage>('Message', messageSchema);

export default Message;
