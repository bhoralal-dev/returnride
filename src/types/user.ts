/**
 * ReturnRide Domain Types - User, DriverProfile & Vehicle
 */

export type UserRole = 'PASSENGER' | 'DRIVER' | 'ADMIN';

export type DriverVerificationStatus =
  | 'UNVERIFIED'
  | 'PENDING_REVIEW'
  | 'VERIFIED'
  | 'REJECTED';

export interface User {
  id: string;
  phoneNumber: string; // Primary identifier in Pakistan
  fullName: string;
  role: UserRole;
  avatarUrl?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface DriverProfile {
  id: string;
  userId: string;
  cnicMasked?: string; // e.g., "42101-*******-1" for privacy
  licenseNumber?: string;
  verificationStatus: DriverVerificationStatus;
  verifiedAt?: string;
  ratingAverage?: number;
  totalTripsCompleted?: number;
  createdAt: string;
  updatedAt?: string;
}

export interface Vehicle {
  id: string;
  driverId: string;
  makeModel: string; // e.g., "Toyota Corolla", "Suzuki Alto"
  registrationPlate: string; // e.g., "LEB-1234"
  capacity: number; // Max passenger seats (excluding driver)
  acAvailable: boolean;
  color?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}
