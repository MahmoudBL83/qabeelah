import mongoose, { Schema, Document } from 'mongoose';

export type JoinRequestStatus = 'pending' | 'approved' | 'rejected';

export interface IJoinRequest extends Document {
  tenantId: mongoose.Types.ObjectId;
  fullName: string;
  email: string;
  phone: string;
  relationship?: string;
  notes?: string;
  documents?: string[];
  status: JoinRequestStatus;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const JoinRequestSchema: Schema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    fullName: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, required: true },
    relationship: { type: String },
    notes: { type: String },
    documents: { type: [String], default: [] },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      required: true
    },
    reviewedAt: { type: Date }
  },
  { timestamps: true }
);

export const getJoinRequestModel = (connection: mongoose.Connection) =>
  connection.models.JoinRequest || connection.model<IJoinRequest>('JoinRequest', JoinRequestSchema);

export default mongoose.model<IJoinRequest>('JoinRequest', JoinRequestSchema);
