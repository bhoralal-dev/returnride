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

export interface RouteStop {
  id: string;
  name: string;
  distanceKm?: number;
  seatPrice: number; // Segment seat fare from origin to this intermediate stop
  wholeCarPrice?: number; // Segment whole-car fare from origin to this intermediate stop
}

export type DriverBadgeTier = 'NEW_DRIVER' | 'EXPERIENCED_DRIVER' | 'TOP_RATED_DRIVER';

export interface TravelComfortAttributes {
  acType?: 'CHILLED_AC' | 'NORMAL_AC';
  maxInBack?: number; // 2 or 3
  luggageCapacity?: 'CABIN_ONLY' | 'MEDIUM_SUITCASE' | 'FULL_TRUNK';
  namazBreak?: boolean; // 15-min highway prayer/tea rest stop
  tollsIncluded?: boolean; // Motorway / Super Highway Toll charges included
  familyOnboard?: boolean; // Driver is traveling with own family (High trust)
  ladiesOnlySeats?: boolean; // Reserved specifically for female passengers
}

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
  routeStops?: RouteStop[]; // Intermediate drop-off waypoints along the highway corridor
  isReturnDeal?: boolean; // Special "Khali Wapsi" discount badge
  travelComfort?: TravelComfortAttributes;
  driverTier?: DriverBadgeTier;
  roundTripAllowed?: boolean;
  roundTripWholeCarPrice?: number; // Discounted round-trip full car rate
  createdAt: string;
  updatedAt: string;
}
