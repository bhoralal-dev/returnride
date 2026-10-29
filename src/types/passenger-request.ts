/**
 * Apni Sawari - Passenger Ride Request ("Sawari Board") Domain Types
 */

export type PassengerRequestStatus = 'OPEN' | 'ACCEPTED' | 'FULFILLED' | 'CANCELLED';

export interface DriverOffer {
  id: string;
  driverId: string;
  driverName: string;
  driverPhone: string;
  driverRating?: number;
  driverTier?: 'NEW_DRIVER' | 'EXPERIENCED_DRIVER' | 'TOP_RATED_DRIVER';
  vehicleMakeModel: string;
  vehiclePlate: string;
  offeredPrice: number;
  message?: string;
  createdAt: string;
}

export interface PassengerRideRequest {
  id: string;
  passengerId: string;
  passengerName: string;
  passengerPhone: string;
  originLocationId: string;
  destinationLocationId: string;
  originName: string;
  destinationName: string;
  travelDate: string;
  desiredTime: string;
  bookingType: 'WHOLE_CAR' | 'SEAT';
  seatsCount: number;
  isFamilyTrip: boolean;
  luggageSize: 'CABIN_ONLY' | 'MEDIUM_SUITCASE' | 'FULL_TRUNK';
  acRequired: boolean;
  budgetPrice: number;
  isRoundTrip?: boolean;
  returnDate?: string;
  status: PassengerRequestStatus;
  offers: DriverOffer[];
  acceptedOfferId?: string;
  notes?: string;
  createdAt: string;
}
