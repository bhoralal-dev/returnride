import test from 'node:test';
import assert from 'node:assert';
import {
  BookingEngineError,
  validateRideCapacity,
  validateRequestedSeats,
  calculateAvailableSeats,
  createBookingRequest,
  acceptBookingRequest,
  rejectBookingRequest,
  cancelConfirmedBooking,
  cancelPendingBookingRequest,
  cancelRide,
  switchRideBookingMode,
} from './booking-engine.ts';
import type { Ride, BookingRequest } from '../types/index.ts';

// ---------------------------------------------------------------------------
// Test Helpers & Fixtures
// ---------------------------------------------------------------------------

function isBookingError(err: unknown, code: string): boolean {
  return err instanceof BookingEngineError && err.code === code;
}

function createMockRide(overrides: Partial<Ride> = {}): Ride {
  return {
    id: 'ride-100',
    driverId: 'driver-1',
    originLocationId: 'loc-origin',
    destinationLocationId: 'loc-dest',
    departureTime: '2026-11-01T08:00:00Z',
    bookingMode: 'WHOLE_CAR_OR_SEATS',
    capacity: 4,
    bookedSeatsCount: 0,
    wholeCarPrice: 12000,
    seatPrice: 3000,
    status: 'PUBLISHED',
    autoReopenOnCancellation: true,
    createdAt: '2026-10-25T10:00:00Z',
    updatedAt: '2026-10-25T10:00:00Z',
    ...overrides,
  };
}

function createMockRequest(
  ride: Ride,
  overrides: Partial<BookingRequest> = {}
): BookingRequest {
  return {
    id: 'req-1',
    rideId: ride.id,
    passengerId: 'passenger-1',
    bookingType: 'SEAT',
    requestedSeats: 1,
    totalPrice: 3000,
    status: 'PENDING',
    createdAt: '2026-10-25T10:05:00Z',
    updatedAt: '2026-10-25T10:05:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

test('1. Valid full-car booking acceptance', () => {
  const ride = createMockRide();
  const request = createMockRequest(ride, {
    id: 'req-whole',
    bookingType: 'WHOLE_CAR',
    requestedSeats: 1,
    totalPrice: 12000,
  });

  const result = acceptBookingRequest({
    ride,
    requestToAccept: request,
    otherPendingRequests: [],
  });

  assert.strictEqual(result.acceptedRequest.status, 'ACCEPTED');
  assert.strictEqual(result.updatedRide.status, 'FULL_CAR_BOOKED');
  assert.strictEqual(result.updatedRide.bookedSeatsCount, 4);
  assert.strictEqual(calculateAvailableSeats(result.updatedRide, [result.acceptedRequest]), 0);
});

test('2. Full-car and seat-booking conflicts', () => {
  const ride = createMockRide();

  // Scenario A: Full-car booking accepted first -> auto-rejects pending seat request
  const wholeCarReq = createMockRequest(ride, {
    id: 'req-whole',
    bookingType: 'WHOLE_CAR',
    requestedSeats: 1,
  });
  const seatReq = createMockRequest(ride, {
    id: 'req-seat',
    passengerId: 'passenger-2',
    bookingType: 'SEAT',
    requestedSeats: 2,
  });

  const resultA = acceptBookingRequest({
    ride,
    requestToAccept: wholeCarReq,
    otherPendingRequests: [seatReq],
  });

  assert.strictEqual(resultA.acceptedRequest.status, 'ACCEPTED');
  assert.strictEqual(resultA.autoRejectedRequests.length, 1);
  assert.strictEqual(resultA.autoRejectedRequests[0].id, 'req-seat');
  assert.strictEqual(resultA.autoRejectedRequests[0].status, 'REJECTED_AUTO_CONFLICT');

  // Scenario B: Seat booking accepted first -> auto-rejects pending whole-car request
  const rideB = createMockRide();
  const resultB = acceptBookingRequest({
    ride: rideB,
    requestToAccept: seatReq,
    otherPendingRequests: [wholeCarReq],
  });

  assert.strictEqual(resultB.acceptedRequest.status, 'ACCEPTED');
  assert.strictEqual(resultB.updatedRide.bookedSeatsCount, 2);
  assert.strictEqual(resultB.autoRejectedRequests.length, 1);
  assert.strictEqual(resultB.autoRejectedRequests[0].id, 'req-whole');
  assert.strictEqual(resultB.autoRejectedRequests[0].status, 'REJECTED_AUTO_CONFLICT');

  // Attempting to submit a new whole car request when seats are booked fails
  assert.throws(
    () =>
      createBookingRequest({
        id: 'req-whole-late',
        ride: resultB.updatedRide,
        passengerId: 'passenger-3',
        bookingType: 'WHOLE_CAR',
        requestedSeats: 1,
        totalPrice: 12000,
        confirmedBookings: [resultB.acceptedRequest],
      }),
    (err: unknown) => isBookingError(err, 'WHOLE_CAR_UNAVAILABLE')
  );
});

test('3. Multiple seat bookings within capacity', () => {
  let ride = createMockRide({ capacity: 4 });
  const confirmed: BookingRequest[] = [];

  // Booking 1: 2 seats
  const req1 = createMockRequest(ride, { id: 'r1', requestedSeats: 2 });
  const res1 = acceptBookingRequest({ ride, requestToAccept: req1, otherPendingRequests: [] });
  ride = res1.updatedRide;
  confirmed.push(res1.acceptedRequest);
  assert.strictEqual(ride.bookedSeatsCount, 2);
  assert.strictEqual(ride.status, 'PUBLISHED');

  // Booking 2: 1 seat
  const req2 = createMockRequest(ride, { id: 'r2', requestedSeats: 1 });
  const res2 = acceptBookingRequest({ ride, requestToAccept: req2, otherPendingRequests: [], confirmedBookings: confirmed });
  ride = res2.updatedRide;
  confirmed.push(res2.acceptedRequest);
  assert.strictEqual(ride.bookedSeatsCount, 3);
  assert.strictEqual(ride.status, 'PUBLISHED');

  // Booking 3: 1 seat (fills the vehicle)
  const req3 = createMockRequest(ride, { id: 'r3', requestedSeats: 1 });
  const res3 = acceptBookingRequest({ ride, requestToAccept: req3, otherPendingRequests: [], confirmedBookings: confirmed });
  ride = res3.updatedRide;
  confirmed.push(res3.acceptedRequest);
  assert.strictEqual(ride.bookedSeatsCount, 4);
  assert.strictEqual(ride.status, 'SEATS_FILLED');
  assert.strictEqual(calculateAvailableSeats(ride, confirmed), 0);
});

test('4. Requests that would exceed capacity', () => {
  const ride = createMockRide({ capacity: 4, bookedSeatsCount: 3 });

  // 1 seat remaining; requesting 2 seats should throw CAPACITY_EXCEEDED
  const overReq = createMockRequest(ride, { id: 'over', requestedSeats: 2 });

  assert.throws(
    () =>
      acceptBookingRequest({
        ride,
        requestToAccept: overReq,
        otherPendingRequests: [],
        confirmedBookings: [
          createMockRequest(ride, { id: 'existing', requestedSeats: 3, status: 'ACCEPTED' }),
        ],
      }),
    (err: unknown) => isBookingError(err, 'CAPACITY_EXCEEDED')
  );
});

test('5. Rejected and cancelled requests', () => {
  const ride = createMockRide({ capacity: 4 });

  // Explicit rejection
  const req = createMockRequest(ride, { id: 'req-rej', requestedSeats: 2 });
  const rejected = rejectBookingRequest(req, 'Vehicle luggage space full');
  assert.strictEqual(rejected.status, 'REJECTED');
  assert.strictEqual(rejected.rejectionReason, 'Vehicle luggage space full');

  // Pending cancellation by passenger
  const pendingReq = createMockRequest(ride, { id: 'req-pend', requestedSeats: 2 });
  const cancelledPend = cancelPendingBookingRequest(pendingReq, 'Plans changed');
  assert.strictEqual(cancelledPend.status, 'CANCELLED_BY_PASSENGER');

  // Repeated cancellation on pending request fails
  assert.throws(
    () => cancelPendingBookingRequest(cancelledPend),
    (err: unknown) => isBookingError(err, 'INVALID_STATUS_TRANSITION')
  );

  // Cancellation of confirmed seat booking restores partial capacity
  const confirmedReq = createMockRequest(ride, { id: 'req-conf', requestedSeats: 2, status: 'ACCEPTED' });
  const rideWithBooking = { ...ride, bookedSeatsCount: 3 };
  const cancelResult = cancelConfirmedBooking({
    ride: rideWithBooking,
    booking: confirmedReq,
    cancelledBy: 'PASSENGER',
    reason: 'Emergency cancellation',
  });

  assert.strictEqual(cancelResult.updatedBooking.status, 'CANCELLED_BY_PASSENGER');
  assert.strictEqual(cancelResult.updatedRide.bookedSeatsCount, 1);
  assert.strictEqual(cancelResult.updatedRide.status, 'PUBLISHED');

  // Cancellation of confirmed whole-car booking restores full capacity
  const wholeCarBooking = createMockRequest(ride, { id: 'req-wc', bookingType: 'WHOLE_CAR', status: 'ACCEPTED' });
  const fullRide = { ...ride, status: 'FULL_CAR_BOOKED' as const, bookedSeatsCount: 4 };
  const cancelWholeResult = cancelConfirmedBooking({
    ride: fullRide,
    booking: wholeCarBooking,
    cancelledBy: 'DRIVER',
    reason: 'Vehicle breakdown',
  });
  assert.strictEqual(cancelWholeResult.updatedBooking.status, 'CANCELLED_BY_DRIVER');
  assert.strictEqual(cancelWholeResult.updatedRide.bookedSeatsCount, 0);
  assert.strictEqual(cancelWholeResult.updatedRide.status, 'PUBLISHED');

  // Reopen policy: when autoReopenOnCancellation === false, status remains closed
  const closedRide = { ...fullRide, autoReopenOnCancellation: false };
  const cancelClosedResult = cancelConfirmedBooking({
    ride: closedRide,
    booking: wholeCarBooking,
    cancelledBy: 'PASSENGER',
  });
  assert.strictEqual(cancelClosedResult.updatedRide.status, 'FULL_CAR_BOOKED');
  assert.strictEqual(cancelClosedResult.updatedRide.bookedSeatsCount, 0);

  // Repeated cancellation on confirmed booking fails
  assert.throws(
    () =>
      cancelConfirmedBooking({
        ride: cancelResult.updatedRide,
        booking: cancelResult.updatedBooking,
        cancelledBy: 'PASSENGER',
      }),
    (err: unknown) => isBookingError(err, 'INVALID_STATUS_TRANSITION')
  );
});

test('6. Invalid seat counts and capacities', () => {
  assert.throws(() => validateRideCapacity(0), (err: unknown) => isBookingError(err, 'INVALID_CAPACITY'));
  assert.throws(() => validateRideCapacity(11), (err: unknown) => isBookingError(err, 'INVALID_CAPACITY'));
  assert.throws(() => validateRideCapacity(3.5), (err: unknown) => isBookingError(err, 'INVALID_CAPACITY'));

  assert.throws(() => validateRequestedSeats('SEAT', 0, 4), (err: unknown) => isBookingError(err, 'INVALID_SEAT_COUNT'));
  assert.throws(() => validateRequestedSeats('SEAT', -1, 4), (err: unknown) => isBookingError(err, 'INVALID_SEAT_COUNT'));
  assert.throws(() => validateRequestedSeats('SEAT', 5, 4), (err: unknown) => isBookingError(err, 'SEATS_EXCEED_TOTAL_CAPACITY'));
  assert.throws(() => validateRequestedSeats('WHOLE_CAR', 2, 4), (err: unknown) => isBookingError(err, 'INVALID_WHOLE_CAR_SEAT_COUNT'));
});

test('7. Duplicate acceptance and invalid status transitions', () => {
  const ride = createMockRide();
  const alreadyAccepted = createMockRequest(ride, { status: 'ACCEPTED' });

  assert.throws(
    () =>
      acceptBookingRequest({
        ride,
        requestToAccept: alreadyAccepted,
        otherPendingRequests: [],
      }),
    (err: unknown) => isBookingError(err, 'ALREADY_ACCEPTED')
  );

  const alreadyRejected = createMockRequest(ride, { status: 'REJECTED' });
  assert.throws(
    () =>
      acceptBookingRequest({
        ride,
        requestToAccept: alreadyRejected,
        otherPendingRequests: [],
      }),
    (err: unknown) => isBookingError(err, 'INVALID_STATUS_TRANSITION')
  );
});

test('8. Cancelled/completed rides reject new bookings and acceptance', () => {
  const cancelledRide = createMockRide({ status: 'CANCELLED' });

  assert.throws(
    () =>
      createBookingRequest({
        id: 'new-req',
        ride: cancelledRide,
        passengerId: 'p1',
        bookingType: 'SEAT',
        requestedSeats: 1,
        totalPrice: 3000,
      }),
    (err: unknown) => isBookingError(err, 'RIDE_CANCELLED')
  );

  const pendingReq = createMockRequest(cancelledRide, { status: 'PENDING' });
  assert.throws(
    () =>
      acceptBookingRequest({
        ride: cancelledRide,
        requestToAccept: pendingReq,
        otherPendingRequests: [],
      }),
    (err: unknown) => isBookingError(err, 'RIDE_INACTIVE')
  );
});

test('9. Two competing requests attempting to reserve remaining capacity', () => {
  // Ride has 4 total capacity, with 2 seats already booked (2 seats remaining)
  const ride = createMockRide({ capacity: 4, bookedSeatsCount: 2 });
  const confirmedSoFar = [
    createMockRequest(ride, { id: 'c1', requestedSeats: 2, status: 'ACCEPTED' }),
  ];

  // Passenger A requests 2 seats (would fill the car)
  const reqA = createMockRequest(ride, { id: 'req-A', passengerId: 'p-A', requestedSeats: 2 });

  // Passenger B also requests 2 seats (competing for the same 2 seats)
  const reqB = createMockRequest(ride, { id: 'req-B', passengerId: 'p-B', requestedSeats: 2 });

  // Driver accepts Passenger A first
  const result = acceptBookingRequest({
    ride,
    requestToAccept: reqA,
    otherPendingRequests: [reqB],
    confirmedBookings: confirmedSoFar,
  });

  // Verification:
  // 1. Passenger A is accepted
  assert.strictEqual(result.acceptedRequest.status, 'ACCEPTED');
  // 2. Ride is now filled (4/4 seats)
  assert.strictEqual(result.updatedRide.bookedSeatsCount, 4);
  assert.strictEqual(result.updatedRide.status, 'SEATS_FILLED');
  // 3. Competing Passenger B request is automatically rejected due to capacity exhaustion
  assert.strictEqual(result.autoRejectedRequests.length, 1);
  assert.strictEqual(result.autoRejectedRequests[0].id, 'req-B');
  assert.strictEqual(result.autoRejectedRequests[0].status, 'REJECTED_AUTO_CONFLICT');
  assert.match(result.autoRejectedRequests[0].rejectionReason || '', /remain after another booking was accepted/);
});

test('10. Ride mode switching invariants & incompatible pending requests', () => {
  const ride = createMockRide({ bookingMode: 'WHOLE_CAR_OR_SEATS' });

  const pendingSeat = createMockRequest(ride, { id: 'p-seat', bookingType: 'SEAT', status: 'PENDING' });
  const pendingWhole = createMockRequest(ride, { id: 'p-whole', bookingType: 'WHOLE_CAR', status: 'PENDING' });

  // Switching to WHOLE_CAR rejects pending SEAT requests, preserves compatible WHOLE_CAR requests
  const resultWhole = switchRideBookingMode({
    ride,
    newMode: 'WHOLE_CAR',
    confirmedBookings: [],
    pendingRequests: [pendingSeat, pendingWhole],
  });
  assert.strictEqual(resultWhole.updatedRide.bookingMode, 'WHOLE_CAR');
  assert.strictEqual(resultWhole.autoRejectedRequests.length, 1);
  assert.strictEqual(resultWhole.autoRejectedRequests[0].id, 'p-seat');
  assert.strictEqual(resultWhole.autoRejectedRequests[0].status, 'REJECTED_AUTO_CONFLICT');

  // Switching to SEATS rejects pending WHOLE_CAR requests, preserves compatible SEAT requests
  const resultSeats = switchRideBookingMode({
    ride,
    newMode: 'SEATS',
    confirmedBookings: [],
    pendingRequests: [pendingSeat, pendingWhole],
  });
  assert.strictEqual(resultSeats.updatedRide.bookingMode, 'SEATS');
  assert.strictEqual(resultSeats.autoRejectedRequests.length, 1);
  assert.strictEqual(resultSeats.autoRejectedRequests[0].id, 'p-whole');
  assert.strictEqual(resultSeats.autoRejectedRequests[0].status, 'REJECTED_AUTO_CONFLICT');

  // Disallowed when confirmed bookings exist
  const rideWithBooking = { ...ride, bookedSeatsCount: 2 };
  assert.throws(
    () => switchRideBookingMode({ ride: rideWithBooking, newMode: 'WHOLE_CAR', confirmedBookings: [] }),
    (err: unknown) => isBookingError(err, 'MODE_SWITCH_CONFLICT')
  );

  // Disallowed on cancelled or completed rides
  const cancelledRide = { ...ride, status: 'CANCELLED' as const };
  assert.throws(
    () => switchRideBookingMode({ ride: cancelledRide, newMode: 'SEATS' }),
    (err: unknown) => isBookingError(err, 'RIDE_NOT_MODIFIABLE')
  );
});

test('11. cancelConfirmedBooking rejects inactive ride states', () => {
  const baseRide = createMockRide();
  const confirmedBooking = createMockRequest(baseRide, { id: 'b1', status: 'ACCEPTED' });

  // CANCELLED ride
  assert.throws(
    () => cancelConfirmedBooking({ ride: { ...baseRide, status: 'CANCELLED' }, booking: confirmedBooking, cancelledBy: 'PASSENGER' }),
    (err: unknown) => isBookingError(err, 'RIDE_INACTIVE')
  );

  // COMPLETED ride
  assert.throws(
    () => cancelConfirmedBooking({ ride: { ...baseRide, status: 'COMPLETED' }, booking: confirmedBooking, cancelledBy: 'PASSENGER' }),
    (err: unknown) => isBookingError(err, 'RIDE_INACTIVE')
  );

  // DEPARTED ride
  assert.throws(
    () => cancelConfirmedBooking({ ride: { ...baseRide, status: 'DEPARTED' }, booking: confirmedBooking, cancelledBy: 'PASSENGER' }),
    (err: unknown) => isBookingError(err, 'RIDE_INACTIVE')
  );

  // DRAFT ride
  assert.throws(
    () => cancelConfirmedBooking({ ride: { ...baseRide, status: 'DRAFT' }, booking: confirmedBooking, cancelledBy: 'PASSENGER' }),
    (err: unknown) => isBookingError(err, 'RIDE_INACTIVE')
  );
});

test('12. cancelRide behavior and lifecycle invariants', () => {
  const ride = createMockRide({ driverId: 'driver-1', bookedSeatsCount: 3, status: 'PUBLISHED' });
  const confirmed1 = createMockRequest(ride, { id: 'c1', requestedSeats: 2, status: 'ACCEPTED' });
  const confirmed2 = createMockRequest(ride, { id: 'c2', requestedSeats: 1, status: 'ACCEPTED' });
  const pending1 = createMockRequest(ride, { id: 'p1', requestedSeats: 1, status: 'PENDING' });
  const otherRideBooking = createMockRequest(ride, { id: 'other', rideId: 'ride-999', status: 'ACCEPTED' });

  // Successful ride cancellation by authorized driver
  const result = cancelRide({
    ride,
    driverId: 'driver-1',
    reason: 'Road closure on highway',
    confirmedBookings: [confirmed1, confirmed2, otherRideBooking],
    pendingRequests: [pending1],
    timestamp: '2026-10-26T12:00:00Z',
  });

  // Ride becomes CANCELLED with 0 booked seats
  assert.strictEqual(result.updatedRide.status, 'CANCELLED');
  assert.strictEqual(result.updatedRide.bookedSeatsCount, 0);

  // All confirmed bookings for this ride become CANCELLED_BY_DRIVER
  assert.strictEqual(result.cancelledBookings.length, 2);
  assert.strictEqual(result.cancelledBookings[0].status, 'CANCELLED_BY_DRIVER');
  assert.strictEqual(result.cancelledBookings[0].cancellationReason, 'Road closure on highway');
  assert.strictEqual(result.cancelledBookings[1].status, 'CANCELLED_BY_DRIVER');

  // Cancellation records generated for confirmed bookings
  assert.strictEqual(result.cancellationRecords.length, 2);
  assert.strictEqual(result.cancellationRecords[0].bookingId, 'c1');
  assert.strictEqual(result.cancellationRecords[0].cancelledBy, 'DRIVER');

  // Pending requests become REJECTED_AUTO_CONFLICT
  assert.strictEqual(result.rejectedPendingRequests.length, 1);
  assert.strictEqual(result.rejectedPendingRequests[0].id, 'p1');
  assert.strictEqual(result.rejectedPendingRequests[0].status, 'REJECTED_AUTO_CONFLICT');

  // Unauthorized cancellation rejected
  assert.throws(
    () => cancelRide({ ride, driverId: 'imposter-driver', reason: 'Attempted hack' }),
    (err: unknown) => isBookingError(err, 'UNAUTHORIZED_DRIVER')
  );

  // Duplicate cancellation rejected
  const alreadyCancelled = { ...ride, status: 'CANCELLED' as const };
  assert.throws(
    () => cancelRide({ ride: alreadyCancelled, driverId: 'driver-1' }),
    (err: unknown) => isBookingError(err, 'ALREADY_CANCELLED')
  );

  // Completed or departed ride rejected
  assert.throws(
    () => cancelRide({ ride: { ...ride, status: 'COMPLETED' }, driverId: 'driver-1' }),
    (err: unknown) => isBookingError(err, 'RIDE_ALREADY_COMPLETED')
  );
  assert.throws(
    () => cancelRide({ ride: { ...ride, status: 'DEPARTED' }, driverId: 'driver-1' }),
    (err: unknown) => isBookingError(err, 'RIDE_ALREADY_DEPARTED')
  );
});

test('13. Immutability of inputs across all operations', () => {
  const originalRide = createMockRide({ bookedSeatsCount: 2, status: 'PUBLISHED' });
  const rideClone = JSON.stringify(originalRide);

  const originalBooking = createMockRequest(originalRide, { id: 'b-imm', status: 'ACCEPTED', requestedSeats: 2 });
  const bookingClone = JSON.stringify(originalBooking);

  // cancelConfirmedBooking
  cancelConfirmedBooking({ ride: originalRide, booking: originalBooking, cancelledBy: 'PASSENGER' });
  assert.strictEqual(JSON.stringify(originalRide), rideClone, 'Ride input must not be mutated in-place');
  assert.strictEqual(JSON.stringify(originalBooking), bookingClone, 'Booking input must not be mutated in-place');

  // cancelRide
  cancelRide({ ride: originalRide, driverId: 'driver-1', confirmedBookings: [originalBooking], pendingRequests: [] });
  assert.strictEqual(JSON.stringify(originalRide), rideClone, 'Ride input must not be mutated in cancelRide');
  assert.strictEqual(JSON.stringify(originalBooking), bookingClone, 'Booking input must not be mutated in cancelRide');

  // switchRideBookingMode
  const emptyRide = createMockRide({ bookedSeatsCount: 0 });
  const emptyRideClone = JSON.stringify(emptyRide);
  switchRideBookingMode({ ride: emptyRide, newMode: 'SEATS' });
  assert.strictEqual(JSON.stringify(emptyRide), emptyRideClone, 'Ride input must not be mutated in switchRideBookingMode');
});
