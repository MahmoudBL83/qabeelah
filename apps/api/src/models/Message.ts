import mongoose, { Document, Schema } from 'mongoose';

export type MessageScope = 'DIRECT' | 'BRANCH' | 'ANNOUNCEMENT';

export interface IMessage extends Document {
  tenantId: mongoose.Types.ObjectId;
  senderId: mongoose.Types.ObjectId;
  recipientUserId?: mongoose.Types.ObjectId;
  branchId?: string;
  scope: MessageScope;
  content: string;
  isHidden: boolean;
  moderationReason?: string;
  moderatedBy?: mongoose.Types.ObjectId;
  moderatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema: Schema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    recipientUserId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    branchId: { type: String, index: true },
    scope: {
      type: String,
      enum: ['DIRECT', 'BRANCH', 'ANNOUNCEMENT'],
      required: true,
      index: true,
    },
    content: { type: String, required: true, trim: true, maxlength: 2000 },
    isHidden: { type: Boolean, default: false, index: true },
    moderationReason: { type: String, maxlength: 300 },
    moderatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    moderatedAt: { type: Date },
  },
  { timestamps: true }
);

MessageSchema.index({ tenantId: 1, scope: 1, createdAt: -1 });
MessageSchema.index({ tenantId: 1, senderId: 1, recipientUserId: 1, createdAt: -1 });

export default mongoose.model<IMessage>('Message', MessageSchema);
