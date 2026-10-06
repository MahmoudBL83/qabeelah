import mongoose, { Schema, Document } from 'mongoose';

export interface IPerson extends Document {
  tenantId: mongoose.Types.ObjectId;
  firstName: string;
  lastName: string;
  birthYear?: number;
  deathYear?: number;
  isLiving: boolean;
  parentId?: mongoose.Types.ObjectId;
  branchId?: mongoose.Types.ObjectId;
  bio?: string;
  imageSrc?: string;
  spouseIds?: mongoose.Types.ObjectId[];
  partnerships?: Array<{ personId: mongoose.Types.ObjectId; type?: string }>;
  createdAt: Date;
  updatedAt: Date;
}

export const PersonSchema: Schema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    birthYear: { type: Number },
    deathYear: { type: Number },
    isLiving: { type: Boolean, default: true },
    parentId: { type: Schema.Types.ObjectId, ref: 'Person' },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
    bio: { type: String },
    imageSrc: { type: String },
    spouseIds: [{ type: Schema.Types.ObjectId, ref: 'Person' }],
    partnerships: [
      {
        personId: { type: Schema.Types.ObjectId, ref: 'Person' },
        type: { type: String }
      }
    ]
  },
  { timestamps: true }
);

export const getPersonModel = (connection: mongoose.Connection) =>
  connection.models.Person || connection.model<IPerson>('Person', PersonSchema);

export default mongoose.model<IPerson>('Person', PersonSchema);
