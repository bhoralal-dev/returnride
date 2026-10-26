/**
 * ReturnRide Core Booking Engine (Pure TypeScript)
 *
 * ============================================================================
 * CONCURRENCY NOTICE FOR PRODUCTION ARCHITECTURE:
 * ============================================================================
 * This module is a pure, deterministic in-memory domain engine. It defines and
 * validates all booking rules, status transitions, and capacity invariants
 * without side-effects or external dependencies.
 *
 * IN-MEMORY LOGIC DOES NOT PREVENT CONCURRENT PRODUCTION RACE CONDITIONS.
 * In production, when multiple passengers or drivers perform actions simultaneously,
 * these invariants MUST be enforced atomically at the database level (e.g. Supabase /
 * PostgreSQL using stored procedures with `SELECT ... FOR UPDATE` row locks, or
 * SERIALIZABLE transaction isolation).
 * ============================================================================
 */

import type {
  BookingRequest,
  BookingStatus,
  BookingType,
  CancellationRecord,
  Ride,
  RideBookingMode,
  RideStatus,
} from '@/types';

export class BookingEngineError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'BookingEngineError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Validation Helpers
// ---------------------------------------------------------------------------

/**
 * Validates vehicle passenger capacity (excluding driver).
 * Must be an integer between 1 and 10 for standard intercity transit vehicles.
 */
export function validateRideCapacity(capacity: number): void {
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 10) {
    throw new BookingEngineError(
      `Ride capacity must be an integer between 1 and 10. Received: ${capacity}`,
      'INVALID_CAPACITY'
    );
  }
}

/**
 * Validates seat count requested for a booking.
 */
export function validateRequestedSeats(
  bookingType: BookingType,
  requestedSeats: number,
  rideCapacity: number
): void {
  if (!Number.isInteger(requestedSeats) || requestedSeats <= 0) {
    throw new BookingEngineError(
      `Requested seats must be a positive integer. Received: ${requestedSeats}`,
      'INVALID_SEAT_COUNT'
    );
  }

  if (bookingType === 'WHOLE_CAR') {
    if (requestedSeats !== 1 && requestedSeats !== rideCapacity) {
      throw new BookingEngineError(
        `Whole-car booking requestedSeats must be 1 (or match total ride capacity of ${rideCapacity}). Received: ${requestedSeats}`,
        'INVALID_WHOLE_CAR_SEAT_COUNT'
      );
    }
  } else if (bookingType === 'SEAT') {
    if (requestedSeats > rideCapacity) {
      throw new BookingEngineError(
        `Requested seats (${requestedSeats}) cannot exceed the total vehicle capacity of ${rideCapacity}.`,
        'SEATS_EXCEED_TOTAL_CAPACITY'
      );
    }
  }
}

/**
 * Calculates currently available passenger seats on a ride.
 * Only 'ACCEPTED' bookings consume capacity.
 * Pending, rejected, expired, and cancelled bookings consume 0 seats.
 */
export function calculateAvailableSeats(
  ride: Ride,
  confirmedBookings: BookingRequest[]
): number {
  validateRideCapacity(ride.capacity);

  // If the ride is already marked full-car booked or cancelled/completed, 0 seats
  if (
    ride.status === 'FULL_CAR_BOOKED' ||
    ride.status === 'CANCELLED' ||
    ride.status === 'COMPLETED' ||
    ride.status === 'DEPARTED'
  ) {
    return 0;
  }

  const activeConfirmed = confirmedBookings.filter(
    (b) => b.rideId === ride.id && b.status === 'ACCEPTED'
  );

  const hasWholeCar = activeConfirmed.some((b) => b.bookingType === 'WHOLE_CAR');
  if (hasWholeCar) {
    return 0;
  }

  const consumedSeats = activeConfirmed.reduce((sum, b) => sum + b.requestedSeats, 0);
  return Math.max(0, ride.capacity - consumedSeats);
}

// ---------------------------------------------------------------------------
// Ride Mode Switching
// ---------------------------------------------------------------------------

export interface SwitchRideBookingModeParams {
  ride: Ride;
  newMode: RideBookingMode;
  confirmedBookings?: BookingRequest[];
  pendingRequests?: BookingRequest[];
  timestamp?: string;
}

export interface SwitchRideBookingModeResult {
  updatedRide: Ride;
  autoRejectedRequests: BookingRequest[];
}

/**
 * Allows a driver to change the ride's booking mode only if no confirmed
 * bookings currently exist on the ride.
 *
 * Incompatible pending requests (e.g. whole-car request when switching to seats,
 * or seat request when switching to whole-car) are automatically rejected.
 * Compatible requests remain PENDING. Requests are never auto-accepted.
 */
export function switchRideBookingMode(
  params: SwitchRideBookingModeParams
): SwitchRideBookingModeResult {
  const {
    ride,
    newMode,
    confirmedBookings = [],
    pendingRequests = [],
    timestamp = new Date().toISOString(),
  } = params;

  if (
    ride.status === 'CANCELLED' ||
    ride.status === 'COMPLETED' ||
    ride.status === 'DEPARTED'
  ) {
    throw new BookingEngineError(
      `Cannot change booking mode on a ${ride.status.toLowerCase()} ride.`,
      'RIDE_NOT_MODIFIABLE'
    );
  }

  const activeConfirmed = confirmedBookings.filter(
    (b) => b.rideId === ride.id && b.status === 'ACCEPTED'
  );

  if (activeConfirmed.length > 0 || ride.bookedSeatsCount > 0) {
    throw new BookingEngineError(
      'Cannot change ride booking mode while active confirmed bookings exist.',
      'MODE_SWITCH_CONFLICT'
    );
  }

  const autoRejectedRequests: BookingRequest[] = [];

  for (const pending of pendingRequests) {
    if (pending.rideId !== ride.id || pending.status !== 'PENDING') {
      continue;
    }

    const isIncompatible =
      (newMode === 'WHOLE_CAR' && pending.bookingType === 'SEAT') ||
      (newMode === 'SEATS' && pending.bookingType === 'WHOLE_CAR');

    if (isIncompatible) {
      autoRejectedRequests.push({
        ...pending,
        status: 'REJECTED_AUTO_CONFLICT',
        rejectionReason: `Driver switched ride booking mode to ${newMode}.`,
        updatedAt: timestamp,
      });
    }
  }

  const updatedRide: Ride = {
    ...ride,
    bookingMode: newMode,
    updatedAt: timestamp,
  };

  return {
    updatedRide,
    autoRejectedRequests,
  };
}

// ---------------------------------------------------------------------------
// Booking Request Submission Validation
// ---------------------------------------------------------------------------

export interface CreateBookingRequestParams {
  id: string;
  ride: Ride;
  passengerId: string;
  bookingType: BookingType;
  requestedSeats: number;
  totalPrice: number;
  confirmedBookings?: BookingRequest[];
  timestamp?: string;
}

/**
 * Validates and constructs a new PENDING booking request.
 * Pending requests do NOT decrement available capacity.
 */
export function createBookingRequest(
  params: CreateBookingRequestParams
): BookingRequest {
  const {
    id,
    ride,
    passengerId,
    bookingType,
    requestedSeats,
    totalPrice,
    confirmedBookings = [],
    timestamp = new Date().toISOString(),
  } = params;

  // 1. Ride lifecycle check
  if (ride.status === 'CANCELLED') {
    throw new BookingEngineError(
      'Cannot book a ride that has been cancelled.',
      'RIDE_CANCELLED'
    );
  }
  if (ride.status === 'COMPLETED' || ride.status === 'DEPARTED') {
    throw new BookingEngineError(
      'Cannot book a ride that has already departed or completed.',
      'RIDE_CLOSED'
    );
  }
  if (ride.status === 'FULL_CAR_BOOKED' || ride.status === 'SEATS_FILLED') {
    throw new BookingEngineError(
      'This ride has no remaining capacity.',
      'RIDE_FULL'
    );
  }

  // 2. Driver cannot book their own ride
  if (ride.driverId === passengerId) {
    throw new BookingEngineError(
      'Drivers cannot submit booking requests for their own rides.',
      'SELF_BOOKING_NOT_ALLOWED'
    );
  }

  // 3. Seat count validation
  validateRequestedSeats(bookingType, requestedSeats, ride.capacity);

  // 4. Mode compatibility
  if (ride.bookingMode === 'WHOLE_CAR' && bookingType === 'SEAT') {
    throw new BookingEngineError(
      'This ride is configured for whole-car booking only.',
      'MODE_INCOMPATIBLE'
    );
  }
  if (ride.bookingMode === 'SEATS' && bookingType === 'WHOLE_CAR') {
    throw new BookingEngineError(
      'This ride is configured for individual seat bookings only.',
      'MODE_INCOMPATIBLE'
    );
  }

  // 5. Check against current confirmed bookings
  const availableSeats = calculateAvailableSeats(ride, confirmedBookings);

  if (bookingType === 'WHOLE_CAR') {
    if (availableSeats < ride.capacity || ride.bookedSeatsCount > 0) {
      throw new BookingEngineError(
        'Whole-car booking is unavailable because individual seats are already confirmed.',
        'WHOLE_CAR_UNAVAILABLE'
      );
    }
  } else {
    if (requestedSeats > availableSeats) {
      throw new BookingEngineError(
        `Requested seats (${requestedSeats}) exceed currently available seats (${availableSeats}).`,
        'INSUFFICIENT_SEATS'
      );
    }
  }

  return {
    id,
    rideId: ride.id,
    passengerId,
    bookingType,
    requestedSeats,
    totalPrice,
    status: 'PENDING',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

// ---------------------------------------------------------------------------
// Driver Acceptance & Mutual-Exclusion Resolution
// ---------------------------------------------------------------------------

export interface AcceptBookingParams {
  ride: Ride;
  requestToAccept: BookingRequest;
  otherPendingRequests: BookingRequest[];
  confirmedBookings?: BookingRequest[];
  timestamp?: string;
}

export interface AcceptBookingResult {
  updatedRide: Ride;
  acceptedRequest: BookingRequest;
  autoRejectedRequests: BookingRequest[];
}

/**
 * Driver accepts a pending booking request.
 *
 * MUTUAL EXCLUSIVITY INVARIANTS:
 * 1. If WHOLE_CAR request is accepted:
 *    - All other pending requests (full-car or seat) are auto-rejected.
 *    - Ride status -> 'FULL_CAR_BOOKED'.
 *    - bookedSeatsCount -> ride.capacity.
 * 2. If SEAT request is accepted:
 *    - Any pending WHOLE_CAR request is auto-rejected (car is now partially occupied).
 *    - Any pending SEAT request exceeding newly remaining seats is auto-rejected.
 *    - If remaining seats reach 0, ride status -> 'SEATS_FILLED'.
 */
export function acceptBookingRequest(
  params: AcceptBookingParams
): AcceptBookingResult {
  const {
    ride,
    requestToAccept,
    otherPendingRequests,
    confirmedBookings = [],
    timestamp = new Date().toISOString(),
  } = params;

  // 1. Invariant: request must match ride
  if (requestToAccept.rideId !== ride.id) {
    throw new BookingEngineError(
      'Booking request does not belong to this ride.',
      'RIDE_MISMATCH'
    );
  }

  // 2. Invariant: status transition guard
  if (requestToAccept.status === 'ACCEPTED') {
    throw new BookingEngineError(
      'Cannot accept a booking that has already been accepted.',
      'ALREADY_ACCEPTED'
    );
  }
  if (requestToAccept.status !== 'PENDING') {
    throw new BookingEngineError(
      `Cannot accept a booking with status '${requestToAccept.status}'. Only PENDING requests can be accepted.`,
      'INVALID_STATUS_TRANSITION'
    );
  }

  // 3. Invariant: ride lifecycle state
  if (ride.status === 'CANCELLED' || ride.status === 'COMPLETED' || ride.status === 'DEPARTED') {
    throw new BookingEngineError(
      `Cannot accept bookings for a ${ride.status.toLowerCase()} ride.`,
      'RIDE_INACTIVE'
    );
  }

  // Calculate live available seats based on existing confirmed bookings
  const availableSeats = calculateAvailableSeats(ride, confirmedBookings);

  // 4. Handle WHOLE_CAR acceptance
  if (requestToAccept.bookingType === 'WHOLE_CAR') {
    if (availableSeats < ride.capacity || ride.bookedSeatsCount > 0) {
      throw new BookingEngineError(
        'Cannot accept whole-car booking: individual seats are already confirmed for this ride.',
        'WHOLE_CAR_CONFLICT'
      );
    }

    const acceptedRequest: BookingRequest = {
      ...requestToAccept,
      status: 'ACCEPTED',
      updatedAt: timestamp,
    };

    const updatedRide: Ride = {
      ...ride,
      bookedSeatsCount: ride.capacity,
      status: 'FULL_CAR_BOOKED',
      updatedAt: timestamp,
    };

    // Auto-reject ALL other pending requests for this ride
    const autoRejectedRequests: BookingRequest[] = otherPendingRequests
      .filter((r) => r.rideId === ride.id && r.id !== requestToAccept.id && r.status === 'PENDING')
      .map((r) => ({
        ...r,
        status: 'REJECTED_AUTO_CONFLICT',
        rejectionReason: 'Whole-car booking was accepted for this ride.',
        updatedAt: timestamp,
      }));

    return {
      updatedRide,
      acceptedRequest,
      autoRejectedRequests,
    };
  }

  // 5. Handle SEAT acceptance
  if (requestToAccept.requestedSeats > availableSeats) {
    throw new BookingEngineError(
      `Cannot accept booking: requested ${requestToAccept.requestedSeats} seats, but only ${availableSeats} available.`,
      'CAPACITY_EXCEEDED'
    );
  }

  const newBookedSeatsCount = ride.bookedSeatsCount + requestToAccept.requestedSeats;
  const newAvailableSeats = ride.capacity - newBookedSeatsCount;

  const newRideStatus: RideStatus =
    newBookedSeatsCount >= ride.capacity ? 'SEATS_FILLED' : 'PUBLISHED';

  const acceptedRequest: BookingRequest = {
    ...requestToAccept,
    status: 'ACCEPTED',
    updatedAt: timestamp,
  };

  const updatedRide: Ride = {
    ...ride,
    bookedSeatsCount: newBookedSeatsCount,
    status: newRideStatus,
    updatedAt: timestamp,
  };

  // Auto-reject conflicting pending requests:
  // - Any WHOLE_CAR request is immediately invalid (car is partially booked).
  // - Any SEAT request asking for more seats than remain available is invalid.
  const autoRejectedRequests: BookingRequest[] = [];

  for (const pending of otherPendingRequests) {
    if (pending.rideId !== ride.id || pending.id === requestToAccept.id || pending.status !== 'PENDING') {
      continue;
    }

    if (pending.bookingType === 'WHOLE_CAR') {
      autoRejectedRequests.push({
        ...pending,
        status: 'REJECTED_AUTO_CONFLICT',
        rejectionReason: 'Partial seat booking was accepted; whole car is no longer available.',
        updatedAt: timestamp,
      });
    } else if (pending.requestedSeats > newAvailableSeats) {
      autoRejectedRequests.push({
        ...pending,
        status: 'REJECTED_AUTO_CONFLICT',
        rejectionReason: `Requested ${pending.requestedSeats} seats, but only ${newAvailableSeats} remain after another booking was accepted.`,
        updatedAt: timestamp,
      });
    }
  }

  return {
    updatedRide,
    acceptedRequest,
    autoRejectedRequests,
  };
}

// ---------------------------------------------------------------------------
// Driver Rejection
// ---------------------------------------------------------------------------

/**
 * Driver explicitly rejects a pending booking request.
 * Does not affect ride capacity.
 */
export function rejectBookingRequest(
  request: BookingRequest,
  reason = 'Declined by driver',
  timestamp = new Date().toISOString()
): BookingRequest {
  if (request.status !== 'PENDING') {
    throw new BookingEngineError(
      `Cannot reject a booking with status '${request.status}'. Only PENDING requests can be rejected.`,
      'INVALID_STATUS_TRANSITION'
    );
  }

  return {
    ...request,
    status: 'REJECTED',
    rejectionReason: reason,
    updatedAt: timestamp,
  };
}

// ---------------------------------------------------------------------------
// Cancellation Management
// ---------------------------------------------------------------------------

export interface CancelBookingParams {
  ride: Ride;
  booking: BookingRequest;
  cancelledBy: 'PASSENGER' | 'DRIVER';
  reason?: string;
  cancellationRecordId?: string;
  timestamp?: string;
}

export interface CancelBookingResult {
  updatedRide: Ride;
  updatedBooking: BookingRequest;
  cancellationRecord: CancellationRecord;
}

/**
 * Cancels a confirmed (ACCEPTED) booking.
 * Releases the occupied capacity and updates the ride status.
 *
 * Invariants:
 * - Only 'PUBLISHED', 'FULL_CAR_BOOKED', and 'SEATS_FILLED' rides allow cancellations.
 * - 'DRAFT', 'DEPARTED', 'COMPLETED', and 'CANCELLED' rides throw RIDE_INACTIVE.
 * - Only 'ACCEPTED' bookings can be cancelled.
 *
 * If `ride.autoReopenOnCancellation` is true (default), the ride reverts to
 * 'PUBLISHED' status if it was previously 'FULL_CAR_BOOKED' or 'SEATS_FILLED'.
 */
export function cancelConfirmedBooking(
  params: CancelBookingParams
): CancelBookingResult {
  const {
    ride,
    booking,
    cancelledBy,
    reason = 'No reason provided',
    cancellationRecordId,
    timestamp = new Date().toISOString(),
  } = params;

  const CANCELLABLE_RIDE_STATUSES: RideStatus[] = [
    'PUBLISHED',
    'FULL_CAR_BOOKED',
    'SEATS_FILLED',
  ];

  if (!CANCELLABLE_RIDE_STATUSES.includes(ride.status)) {
    throw new BookingEngineError(
      `Cannot cancel bookings for a ride with status '${ride.status}'. Only active, pre-departure rides allow booking cancellations.`,
      'RIDE_INACTIVE'
    );
  }

  if (booking.rideId !== ride.id) {
    throw new BookingEngineError(
      'Booking does not belong to the specified ride.',
      'RIDE_MISMATCH'
    );
  }

  if (booking.status !== 'ACCEPTED') {
    throw new BookingEngineError(
      `Only ACCEPTED bookings can be cancelled via cancelConfirmedBooking. Current status: '${booking.status}'`,
      'INVALID_STATUS_TRANSITION'
    );
  }

  const nextBookingStatus: BookingStatus =
    cancelledBy === 'PASSENGER' ? 'CANCELLED_BY_PASSENGER' : 'CANCELLED_BY_DRIVER';

  const updatedBooking: BookingRequest = {
    ...booking,
    status: nextBookingStatus,
    cancellationReason: reason,
    updatedAt: timestamp,
  };

  const cancellationRecord: CancellationRecord = {
    id: cancellationRecordId || `canc-${booking.id}-${timestamp}`,
    bookingId: booking.id,
    cancelledBy,
    reason,
    timestamp,
  };

  // Calculate restored capacity
  let newBookedSeats: number;
  if (booking.bookingType === 'WHOLE_CAR') {
    newBookedSeats = 0;
  } else {
    newBookedSeats = Math.max(0, ride.bookedSeatsCount - booking.requestedSeats);
  }

  // Handle availability reopening
  const shouldReopen = ride.autoReopenOnCancellation !== false;
  let newRideStatus: RideStatus = ride.status;

  if (shouldReopen) {
    if (ride.status === 'FULL_CAR_BOOKED' || ride.status === 'SEATS_FILLED') {
      newRideStatus = 'PUBLISHED';
    }
  }

  const updatedRide: Ride = {
    ...ride,
    bookedSeatsCount: newBookedSeats,
    status: newRideStatus,
    updatedAt: timestamp,
  };

  return {
    updatedRide,
    updatedBooking,
    cancellationRecord,
  };
}

export interface CancelRideParams {
  ride: Ride;
  driverId: string;
  reason?: string;
  confirmedBookings?: BookingRequest[];
  pendingRequests?: BookingRequest[];
  cancellationRecordIdGenerator?: (bookingId: string) => string;
  timestamp?: string;
}

export interface CancelRideResult {
  updatedRide: Ride;
  cancelledBookings: BookingRequest[];
  rejectedPendingRequests: BookingRequest[];
  cancellationRecords: CancellationRecord[];
}

/**
 * Driver cancels an entire ride.
 *
 * Invariants:
 * 1. Requires authorized driver ID (driverId === ride.driverId).
 * 2. Rejects duplicate cancellation ('CANCELLED'), completed ('COMPLETED'), or departed ('DEPARTED') rides.
 * 3. Sets ride status to 'CANCELLED' and bookedSeatsCount to 0.
 * 4. Transitions all confirmed ('ACCEPTED') bookings for this ride to 'CANCELLED_BY_DRIVER'.
 * 5. Generates a CancellationRecord for each confirmed booking.
 * 6. Transitions all pending ('PENDING') requests for this ride to 'REJECTED_AUTO_CONFLICT'.
 * 7. Does not mutate input objects; returns explicit updated objects.
 * 8. Ignores bookings/requests belonging to other rides.
 */
export function cancelRide(params: CancelRideParams): CancelRideResult {
  const {
    ride,
    driverId,
    reason = 'Ride cancelled by driver',
    confirmedBookings = [],
    pendingRequests = [],
    cancellationRecordIdGenerator,
    timestamp = new Date().toISOString(),
  } = params;

  // 1. Driver authorization check
  if (driverId !== ride.driverId) {
    throw new BookingEngineError(
      'Only the assigned driver can cancel this ride.',
      'UNAUTHORIZED_DRIVER'
    );
  }

  // 2. Lifecycle guards
  if (ride.status === 'CANCELLED') {
    throw new BookingEngineError(
      'This ride has already been cancelled.',
      'ALREADY_CANCELLED'
    );
  }
  if (ride.status === 'COMPLETED') {
    throw new BookingEngineError(
      'Cannot cancel a ride that has already been completed.',
      'RIDE_ALREADY_COMPLETED'
    );
  }
  if (ride.status === 'DEPARTED') {
    throw new BookingEngineError(
      'Cannot cancel a ride that has already departed.',
      'RIDE_ALREADY_DEPARTED'
    );
  }

  const updatedRide: Ride = {
    ...ride,
    status: 'CANCELLED',
    bookedSeatsCount: 0,
    updatedAt: timestamp,
  };

  // 3. Transition confirmed bookings for this ride to CANCELLED_BY_DRIVER
  const thisRideConfirmed = confirmedBookings.filter(
    (b) => b.rideId === ride.id && b.status === 'ACCEPTED'
  );

  const cancelledBookings: BookingRequest[] = thisRideConfirmed.map((b) => ({
    ...b,
    status: 'CANCELLED_BY_DRIVER',
    cancellationReason: reason,
    updatedAt: timestamp,
  }));

  const cancellationRecords: CancellationRecord[] = thisRideConfirmed.map((b) => ({
    id: cancellationRecordIdGenerator
      ? cancellationRecordIdGenerator(b.id)
      : `canc-${b.id}-${timestamp}`,
    bookingId: b.id,
    cancelledBy: 'DRIVER',
    reason,
    timestamp,
  }));

  // 4. Reject pending requests for this ride
  const thisRidePending = pendingRequests.filter(
    (r) => r.rideId === ride.id && r.status === 'PENDING'
  );

  const rejectedPendingRequests: BookingRequest[] = thisRidePending.map((r) => ({
    ...r,
    status: 'REJECTED_AUTO_CONFLICT',
    rejectionReason: `Ride cancelled by driver: ${reason}`,
    updatedAt: timestamp,
  }));

  return {
    updatedRide,
    cancelledBookings,
    rejectedPendingRequests,
    cancellationRecords,
  };
}

/**
 * Passenger cancels a PENDING booking request before driver responds.
 * Does not affect ride capacity because pending requests do not consume seats.
 */
export function cancelPendingBookingRequest(
  request: BookingRequest,
  reason = 'Cancelled by passenger',
  timestamp = new Date().toISOString()
): BookingRequest {
  if (request.status !== 'PENDING') {
    throw new BookingEngineError(
      `Cannot cancel request with status '${request.status}' as pending.`,
      'INVALID_STATUS_TRANSITION'
    );
  }

  return {
    ...request,
    status: 'CANCELLED_BY_PASSENGER',
    cancellationReason: reason,
    updatedAt: timestamp,
  };
}
