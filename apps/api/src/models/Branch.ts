import mongoose, { Schema, Document } from 'mongoose';

export interface IBranch extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  parentId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const BranchSchema: Schema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    name: { type: String, required: true },
    parentId: { type: Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true }
);

// Add index to quickly find branches for a tenant
BranchSchema.index({ tenantId: 1 });

export default mongoose.model<IBranch>('Branch', BranchSchema);
