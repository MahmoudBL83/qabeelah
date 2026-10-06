export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  QABILA_ADMIN = 'QABILA_ADMIN',
  SUB_ADMIN = 'SUB_ADMIN',
  MEMBER = 'MEMBER',
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  tenantId?: string; // Optional for SUPER_ADMIN
  branchId?: string; // Optional, applies to SUB_ADMIN or MEMBER 
}

export interface Tenant {
  id: string;
  name: string;
  subdomain: string;
  customDomain?: string;
  coverImage?: string;
  isActive: boolean;
}

export interface Person {
  _id?: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  birthYear?: number | null;
  deathYear?: number | null;
  isLiving: boolean;
  parentId?: string; // Simplistic linkage for MVP
  branchId?: string;
  id?: string;
  bio?: string;
  imageSrc?: string;
  createdAt?: string;
}

export interface Event {
  id?: string;
  _id?: string;
  tenantId: string;
  title: string;
  description?: string;
  location?: string;
  googleMapsUrl?: string;
  mainImage?: string;
  images?: string[];
  eventDate: string;
  capacity?: number;
  registrationRequired?: boolean;
  registeredCount?: number;
  status?: 'UPCOMING' | 'ONGOING' | 'COMPLETED' | 'CANCELLED';
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}