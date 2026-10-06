import mongoose, { Schema, Document } from 'mongoose';

export interface IEvent extends Document {
  tenantId: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  location?: string;
  googleMapsUrl?: string;
  mainImage?: string;
  images?: string[];
  eventDate: Date;
  capacity?: number;
  registrationRequired?: boolean;
  registeredCount?: number;
  registeredUsers?: string[];
  status?: 'UPCOMING' | 'ONGOING' | 'COMPLETED' | 'CANCELLED';
  reminderSentAt?: Date;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export const EventSchema: Schema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    title: { type: String, required: true },
    description: { type: String },
    location: { type: String },
    googleMapsUrl: { type: String },
    mainImage: { type: String },
    images: { type: [String], default: [] },
    eventDate: { type: Date, required: true },
    capacity: { type: Number },
    registrationRequired: { type: Boolean, default: false },
    registeredCount: { type: Number, default: 0 },
    registeredUsers: { type: [String], default: [] },
    status: { 
      type: String, 
      enum: ['UPCOMING', 'ONGOING', 'COMPLETED', 'CANCELLED'],
      default: 'UPCOMING'
    },
    reminderSentAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

export const getEventModel = (connection: mongoose.Connection) =>
  connection.models.Event || connection.model<IEvent>('Event', EventSchema);

export default mongoose.model<IEvent>('Event', EventSchema);
