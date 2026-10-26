/**
 * ReturnRide Domain Types - Ride / Journey
 */

export type RideStatus =
  | 'DRAFT'
  | 'PUBLISHED'
  | 'FULL_CAR_BOOKED'
  | 'SEATS_FILLED'
  | 'DEPARTED'
  | 'COMPLETED'
  | 'CANCELLED';

/**
 * Ride booking mode preference:
 * - 'WHOLE_CAR': Driver only accepts whole-car reservations.
 * - 'SEATS': Driver only accepts individual seat reservations.
 * - 'WHOLE_CAR_OR_SEATS': Driver primarily offers the whole car,
 *   but permits individual seats if no whole car booking has taken place.
 *   Accepting either mode locks out the other.
 */
export type RideBookingMode = 'WHOLE_CAR' | 'SEATS' | 'WHOLE_CAR_OR_SEATS';

export interface Ride {
  id: string;
  driverId: string;
  vehicleId?: string;
  originLocationId: string;
  destinationLocationId: string;
  departureTime: string;
  bookingMode: RideBookingMode;
  capacity: number; // Total passenger seats available (1 - 10)
  bookedSeatsCount: number; // Count of confirmed/accepted passenger seats
  wholeCarPrice: number;
  seatPrice?: number; // Optional if bookingMode is WHOLE_CAR only
  status: RideStatus;
  autoReopenOnCancellation?: boolean; // When true, cancelling an accepted booking restores seats/availability
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
