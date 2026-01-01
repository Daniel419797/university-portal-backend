import mongoose, { Document, Schema } from 'mongoose';

export interface IQuiz extends Document {
  course: mongoose.Types.ObjectId;
  title: string;
  description: string;
  duration: number; // in minutes
  totalMarks: number;
  startDate: Date;
  endDate: Date;
  questions: Array<{
    question: string;
    type: 'multiple_choice' | 'true_false' | 'short_answer';
    options?: string[];
    correctAnswer: string;
    marks: number;
  }>;
  createdBy: mongoose.Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const quizSchema = new Schema<IQuiz>(
  {
    course: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: String,
    duration: {
      type: Number,
      required: true,
      min: 5,
    },
    totalMarks: {
      type: Number,
      required: true,
      min: 1,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    questions: [
      {
        question: {
          type: String,
          required: true,
        },
        type: {
          type: String,
          enum: ['multiple_choice', 'true_false', 'short_answer'],
          required: true,
        },
        options: [String],
        correctAnswer: {
          type: String,
          required: true,
        },
        marks: {
          type: Number,
          required: true,
          min: 1,
        },
      },
    ],
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

const Quiz = mongoose.model<IQuiz>('Quiz', quizSchema);

export default Quiz;
