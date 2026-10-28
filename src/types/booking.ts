/**
 * ReturnRide Domain Types - Booking Requests & Cancellations
 */

export type BookingType = 'WHOLE_CAR' | 'SEAT';

export type BookingStatus =
  | 'PENDING' // Awaiting driver review
  | 'ACCEPTED' // Confirmed by driver, consumes capacity
  | 'REJECTED' // Explicitly declined by driver
  | 'EXPIRED' // Driver did not respond before departure or TTL
  | 'CANCELLED_BY_PASSENGER' // Cancelled by customer
  | 'CANCELLED_BY_DRIVER' // Cancelled by driver after confirmation
  | 'REJECTED_AUTO_CONFLICT'; // Automatically rejected due to a conflicting accepted booking

export interface BookingRequest {
  id: string;
  rideId: string;
  passengerId: string;
  bookingType: BookingType;
  requestedSeats: number; // 1 for WHOLE_CAR (representing the car), or 1..N for SEAT
  totalPrice: number;
  dropoffStopName?: string; // Passenger's selected destination / intermediate drop-off stop
  status: BookingStatus;
  rejectionReason?: string;
  cancellationReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CancellationRecord {
  id: string;
  bookingId: string;
  cancelledBy: 'PASSENGER' | 'DRIVER';
  reason?: string;
  timestamp: string;
}
