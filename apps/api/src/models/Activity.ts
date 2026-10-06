import mongoose, { Schema, Document } from 'mongoose';

export enum ActivityType {
  MEMBER_JOINED = 'MEMBER_JOINED',
  MEMBER_APPROVED = 'MEMBER_APPROVED',
  MEMBER_REJECTED = 'MEMBER_REJECTED',
  EVENT_CREATED = 'EVENT_CREATED',
  EVENT_UPDATED = 'EVENT_UPDATED',
  EVENT_REGISTERED = 'EVENT_REGISTERED',
  EVENT_UNREGISTERED = 'EVENT_UNREGISTERED',
  ADMIN_CREATED = 'ADMIN_CREATED',
  PROFILE_UPDATED = 'PROFILE_UPDATED',
  EMAIL_SENT = 'EMAIL_SENT',
  EMAIL_FAILED = 'EMAIL_FAILED',
  LINEAGE_VERIFIED = 'LINEAGE_VERIFIED',
  MODERATION_ACTION = 'MODERATION_ACTION',
  SECURITY_EVENT = 'SECURITY_EVENT',
}

export interface IActivity extends Document {
  tenantId: mongoose.Types.ObjectId;
  type: ActivityType;
  userId: mongoose.Types.ObjectId;
  relatedEntityId?: mongoose.Types.ObjectId; // Event ID, JoinRequest ID, etc.
  relatedEntityType?: string; // 'Event', 'JoinRequest', 'User'
  description?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

const ActivitySchema: Schema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    type: {
      type: String,
      enum: Object.values(ActivityType),
      required: true
    },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    relatedEntityId: { type: Schema.Types.ObjectId },
    relatedEntityType: { type: String },
    description: { type: String },
    metadata: { type: Schema.Types.Mixed }
  },
  { timestamps: true }
);

// Index for efficient querying by tenant and date
ActivitySchema.index({ tenantId: 1, createdAt: -1 });
ActivitySchema.index({ tenantId: 1, userId: 1, createdAt: -1 });

export default mongoose.model<IActivity>('Activity', ActivitySchema);
