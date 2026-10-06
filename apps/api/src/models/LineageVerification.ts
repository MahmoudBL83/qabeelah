import mongoose, { Schema, Document } from 'mongoose';

export type LineageStatus = 'unverified' | 'pending' | 'verified' | 'rejected';

export interface ILineageVerification extends Document {
  tenantId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  documents: string[];
  status: LineageStatus;
  notes?: string;
  reviewedBy?: string;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const LineageVerificationSchema: Schema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    documents: { type: [String], default: [] },
    status: {
      type: String,
      enum: ['unverified', 'pending', 'verified', 'rejected'],
      default: 'unverified',
      required: true,
    },
    notes: { type: String },
    reviewedBy: { type: String },
    reviewedAt: { type: Date },
  },
  { timestamps: true }
);

export const getLineageVerificationModel = (connection: mongoose.Connection) =>
  connection.models.LineageVerification || connection.model<ILineageVerification>('LineageVerification', LineageVerificationSchema);

export default mongoose.model<ILineageVerification>('LineageVerification', LineageVerificationSchema);
