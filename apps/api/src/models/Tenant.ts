import mongoose, { Schema, Document } from 'mongoose';

export interface ITenant extends Document {
  name: string;
  arabicName?: string;
  subdomain: string;
  customDomain?: string;
  domainVerified?: boolean;
  domainVerificationToken?: string;
  coverImage?: string;
  isActive: boolean;
  dbName?: string;
  dbConnectionUri?: string;
  dbIsolationMode?: 'shared' | 'dedicated';
  dbStatus?: 'pending' | 'ready' | 'failed';
  dbLastHealthAt?: Date;
  dbMigratedAt?: Date;
  allowedIps?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const TenantSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    arabicName: { type: String, trim: true },
    subdomain: { type: String, required: true, unique: true, lowercase: true, trim: true },
    customDomain: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    domainVerified: { type: Boolean, default: false },
    domainVerificationToken: { type: String },
    coverImage: { type: String },
    isActive: { type: Boolean, default: true },
    dbName: { type: String, trim: true },
    dbConnectionUri: { type: String, trim: true, select: false },
    dbIsolationMode: { type: String, enum: ['shared', 'dedicated'], default: 'shared' },
    dbStatus: { type: String, enum: ['pending', 'ready', 'failed'], default: 'pending' },
    dbLastHealthAt: { type: Date },
    dbMigratedAt: { type: Date },
    allowedIps: { type: [String], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model<ITenant>('Tenant', TenantSchema);
