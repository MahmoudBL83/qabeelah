import mongoose, { Document, Schema } from 'mongoose';
import { MessageScope } from './Message';

export interface IConversationState extends Document {
  tenantId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  conversationKey: string;
  scope: MessageScope;
  targetUserId?: mongoose.Types.ObjectId;
  branchId?: string;
  lastReadAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ConversationStateSchema: Schema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    conversationKey: { type: String, required: true, index: true },
    scope: { type: String, enum: ['DIRECT', 'BRANCH', 'ANNOUNCEMENT'], required: true, index: true },
    targetUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    branchId: { type: String },
    lastReadAt: { type: Date },
  },
  { timestamps: true }
);

ConversationStateSchema.index({ tenantId: 1, userId: 1, conversationKey: 1 }, { unique: true });

export default mongoose.model<IConversationState>('ConversationState', ConversationStateSchema);