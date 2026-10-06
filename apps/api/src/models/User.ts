import mongoose, { Schema, Document } from 'mongoose';
import { UserRole } from '../types/shared';

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  sessionVersion?: number;
  tenantId?: mongoose.Types.ObjectId;
  branchId?: mongoose.Types.ObjectId;
  phone?: string;
  avatarUrl?: string;
  bio?: string;
  location?: string;
  createdAt: Date;
  updatedAt: Date;
  emailVerified?: boolean;
  emailVerificationToken?: string;
  emailVerificationExpiry?: number;
  passwordResetToken?: string;
  passwordResetExpiry?: number;
  emailPreferences?: {
    emailNotifications: boolean;
    eventReminders: boolean;
    announcements: boolean;
  };
  pushTokens?: Array<{
    token: string;
    provider?: string;
    createdAt?: Date;
  }>;
  webPushSubscriptions?: Array<{
    endpoint: string;
    expirationTime?: number | null;
    keys: {
      p256dh: string;
      auth: string;
    };
    createdAt?: Date;
  }>;
}

const UserSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { 
      type: String, 
      enum: Object.values(UserRole), 
      default: UserRole.MEMBER,
      required: true 
    },
    sessionVersion: { type: Number, default: 0 },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant' },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
    phone: { type: String },
    avatarUrl: { type: String },
    bio: { type: String },
    location: { type: String },
    emailVerified: { type: Boolean, default: false },
    emailVerificationToken: { type: String },
    emailVerificationExpiry: { type: Number },
    passwordResetToken: { type: String },
    passwordResetExpiry: { type: Number },
    emailPreferences: {
      emailNotifications: { type: Boolean, default: true },
      eventReminders: { type: Boolean, default: true },
      announcements: { type: Boolean, default: true },
    },
    pushTokens: [
      {
        token: { type: String },
        provider: { type: String, default: 'expo' },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    webPushSubscriptions: [
      {
        endpoint: { type: String, required: true },
        expirationTime: { type: Number, default: null },
        keys: {
          p256dh: { type: String, required: true },
          auth: { type: String, required: true },
        },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model<IUser>('User', UserSchema);
