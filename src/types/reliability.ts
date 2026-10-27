/**
 * ReturnRide Domain Types - Repeat Cancellation Prevention & Reliability System
 */

export type CancellationCategory =
  | 'PASSENGER_VOLUNTARY'     // Passenger voluntarily cancelled confirmed booking
  | 'DRIVER_SEAT_CANCEL'       // Driver cancelled a specific passenger's seat booking
  | 'DRIVER_RIDE_CANCEL'       // Driver cancelled their entire published ride
  | 'AUTO_CONFLICT_REJECT'     // System auto-rejected due to conflicting accepted booking (0 penalty)
  | 'SYSTEM_EXPIRED'           // Request expired without driver response (0 penalty)
  | 'FORCE_ADMIN';             // Admin moderation action

export type ReliabilityTier =
  | 'EXCELLENT'   // 95 - 100: Top tier, trusted traveler / captain
  | 'GOOD'        // 80 - 94: Standard good standing
  | 'FAIR'        // 65 - 79: Warning threshold, needs improvement
  | 'POOR'        // 50 - 64: High cancellation rate, temporary restrictions apply
  | 'RESTRICTED'; // Below 50: Flagged for manual review

export type GraduatedRestrictionLevel =
  | 'NORMAL'                        // Full access, no restrictions
  | 'WARNING_ISSUED'                // Educational warning banner shown, no blocking
  | 'TEMPORARY_RESTRICTION'         // Cooldown active, cannot create new bookings or publish rides
  | 'FLAGGED_FOR_MANUAL_REVIEW';    // Manual support review required before next action

export type CancellationTimingRisk =
  | 'STANDARD'       // >= 24 hours before departure
  | 'MODERATE'       // Between 4 and 24 hours before departure
  | 'LAST_MINUTE'    // < 4 hours before departure
  | 'PAST_DEPARTURE'; // At or after scheduled departure time

export type EmergencyReasonCategory =
  | 'MEDICAL'
  | 'VEHICLE_BREAKDOWN'
  | 'ROAD_BLOCK_WEATHER'
  | 'FAMILY_EMERGENCY'
  | 'OTHER';

export interface CancellationEvent {
  id: string;
  bookingId?: string;
  rideId: string;
  userId: string;
  userRole: 'PASSENGER' | 'DRIVER';
  category: CancellationCategory;
  reason: string;
  departureTime: string;
  cancelledAt: string;
  hoursBeforeDeparture: number;
  timingRisk: CancellationTimingRisk;
  isEmergency: boolean;
  emergencyCategory?: EmergencyReasonCategory;
  appealId?: string;
}

export interface CancellationAppeal {
  id: string;
  cancellationEventId: string;
  userId: string;
  emergencyCategory: EmergencyReasonCategory;
  statement: string;
  status: 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  adminFeedback?: string;
}

export interface UserReliabilityProfile {
  userId: string;
  userRole: 'PASSENGER' | 'DRIVER';
  score: number; // 0 to 100
  tier: ReliabilityTier;
  restrictionLevel: GraduatedRestrictionLevel;
  restrictedUntil?: string;
  restrictionReason?: string;
  totalCompletedRides: number;
  totalCancellations: number;
  lastMinuteCancellations: number;
  cancellationsInLast7Days: number;
  cancellationsInLast30Days: number;
  activeAppealsCount: number;
  explanation: string;
  updatedAt: string;
}

export interface ReliabilityConfig {
  /** Baseline starting score for all accounts */
  baselineScore: number;
  /** Score deduction for standard cancellation (>= 24h before departure) */
  standardCancelPenalty: number;
  /** Score deduction for moderate cancellation (4h - 24h before departure) */
  moderateCancelPenalty: number;
  /** Score deduction for last-minute cancellation (< 4h before departure) */
  lastMinuteCancelPenalty: number;
  /** Extra penalty multiplier when a driver cancels an entire ride with confirmed bookings */
  driverRideCancelMultiplier: number;
  /** Score bonus gained per completed ride to support reputation recovery */
  completionRecoveryBonus: number;
  /** 7-day rolling window cancellation count threshold to trigger WARNING */
  warningThreshold7Days: number;
  /** 7-day rolling window cancellation count threshold to trigger TEMPORARY_RESTRICTION */
  restrictionThreshold7Days: number;
  /** 30-day rolling window cancellation count threshold to trigger TEMPORARY_RESTRICTION */
  restrictionThreshold30Days: number;
  /** Duration in hours for temporary cooling-off restriction */
  temporaryRestrictionHours: number;
  /** Score below which manual review is triggered */
  manualReviewScoreFloor: number;
}
