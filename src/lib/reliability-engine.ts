/**
 * ReturnRide Repeat Cancellation Prevention & Reliability System
 *
 * Provides pure, deterministic tracking, scoring, graduated restriction logic,
 * and emergency appeals for both passengers and drivers across Pakistan.
 *
 * Invariants:
 * 1. Zero monetary penalties or fines (purely reputation & temporary cooling-off).
 * 2. Transparent & explainable scoring (no black-box penalization).
 * 3. Legitimate emergencies & approved appeals restore reliability points.
 * 4. System auto-rejections & driver cancellations never penalize innocent passengers.
 * 5. Idempotent cancellation evaluation prevents duplicate penalty deductions.
 */

import type {
  CancellationCategory,
  CancellationEvent,
  CancellationAppeal,
  CancellationTimingRisk,
  GraduatedRestrictionLevel,
  ReliabilityConfig,
  ReliabilityTier,
  UserReliabilityProfile,
  EmergencyReasonCategory,
} from '@/types/reliability';

export class ReliabilityEngineError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'ReliabilityEngineError';
    this.code = code;
  }
}

export const DEFAULT_RELIABILITY_CONFIG: ReliabilityConfig = {
  baselineScore: 100,
  standardCancelPenalty: 5,        // >= 24h prior
  moderateCancelPenalty: 10,       // 4h to 24h prior
  lastMinuteCancelPenalty: 20,     // < 4h prior
  driverRideCancelMultiplier: 1.5, // Driver cancelling ride with confirmed passengers disrupts more people
  completionRecoveryBonus: 2,      // +2 points per completed trip, capped at 100
  warningThreshold7Days: 2,        // 2 cancellations in 7 days triggers warning
  restrictionThreshold7Days: 3,    // 3 cancellations in 7 days triggers temporary restriction
  restrictionThreshold30Days: 5,   // 5 cancellations in 30 days triggers temporary restriction
  temporaryRestrictionHours: 24,   // 24-hour cooling off period
  manualReviewScoreFloor: 50,      // Below 50 triggers manual support review
};

/**
 * Calculates the exact hours remaining before departure.
 * Returns negative if cancelled after departure.
 */
export function calculateHoursBeforeDeparture(
  departureTimeIso: string,
  cancelledAtIso: string
): number {
  const departureMs = new Date(departureTimeIso).getTime();
  const cancelledMs = new Date(cancelledAtIso).getTime();
  if (Number.isNaN(departureMs) || Number.isNaN(cancelledMs)) {
    throw new ReliabilityEngineError(
      'Invalid ISO timestamp provided for departure or cancellation time.',
      'INVALID_TIMESTAMP'
    );
  }
  const diffHours = (departureMs - cancelledMs) / (1000 * 60 * 60);
  return Math.round(diffHours * 10) / 10;
}

/**
 * Evaluates timing risk category based on hours before departure.
 */
export function evaluateTimingRisk(hoursBeforeDeparture: number): CancellationTimingRisk {
  if (hoursBeforeDeparture < 0) return 'PAST_DEPARTURE';
  if (hoursBeforeDeparture < 4) return 'LAST_MINUTE';
  if (hoursBeforeDeparture < 24) return 'MODERATE';
  return 'STANDARD';
}

/**
 * Creates a structured CancellationEvent audit record with calculated timing metrics.
 */
export interface CreateCancellationEventParams {
  id: string;
  bookingId?: string;
  rideId: string;
  userId: string;
  userRole: 'PASSENGER' | 'DRIVER';
  category: CancellationCategory;
  reason: string;
  departureTime: string;
  cancelledAt?: string;
  isEmergency?: boolean;
  emergencyCategory?: EmergencyReasonCategory;
}

export function createCancellationEvent(
  params: CreateCancellationEventParams
): CancellationEvent {
  const {
    id,
    bookingId,
    rideId,
    userId,
    userRole,
    category,
    reason,
    departureTime,
    cancelledAt = new Date().toISOString(),
    isEmergency = false,
    emergencyCategory,
  } = params;

  if (!userId || !rideId) {
    throw new ReliabilityEngineError('userId and rideId are required.', 'MISSING_REQUIRED_FIELDS');
  }

  const hoursBeforeDeparture = calculateHoursBeforeDeparture(departureTime, cancelledAt);
  const timingRisk = evaluateTimingRisk(hoursBeforeDeparture);

  return {
    id,
    bookingId,
    rideId,
    userId,
    userRole,
    category,
    reason: reason.trim() || 'No reason provided',
    departureTime,
    cancelledAt,
    hoursBeforeDeparture,
    timingRisk,
    isEmergency,
    emergencyCategory,
  };
}

/**
 * Determines whether a cancellation event carries a reputation penalty.
 * System conflicts, expired requests, and approved appeals carry 0 penalty.
 */
export function isPenalizableCancellation(
  event: CancellationEvent,
  appeals: CancellationAppeal[] = []
): boolean {
  // Non-penalizable categories
  if (
    event.category === 'AUTO_CONFLICT_REJECT' ||
    event.category === 'SYSTEM_EXPIRED'
  ) {
    return false;
  }

  // If an emergency appeal for this event was APPROVED, do not penalize
  const matchingAppeal = appeals.find(
    (a) => a.cancellationEventId === event.id && a.status === 'APPROVED'
  );
  if (matchingAppeal) {
    return false;
  }

  return true;
}

/**
 * Calculates score deduction for a single cancellation event.
 */
export function calculateEventPenalty(
  event: CancellationEvent,
  config: ReliabilityConfig = DEFAULT_RELIABILITY_CONFIG,
  appeals: CancellationAppeal[] = []
): number {
  if (!isPenalizableCancellation(event, appeals)) {
    return 0;
  }

  let basePenalty: number;
  switch (event.timingRisk) {
    case 'PAST_DEPARTURE':
    case 'LAST_MINUTE':
      basePenalty = config.lastMinuteCancelPenalty;
      break;
    case 'MODERATE':
      basePenalty = config.moderateCancelPenalty;
      break;
    case 'STANDARD':
    default:
      basePenalty = config.standardCancelPenalty;
      break;
  }

  // Driver cancelling an entire ride has a higher disruption multiplier
  if (event.category === 'DRIVER_RIDE_CANCEL') {
    return Math.round(basePenalty * config.driverRideCancelMultiplier);
  }

  return basePenalty;
}

/**
 * Resolves score into a human-readable Tier.
 */
export function resolveReliabilityTier(score: number): ReliabilityTier {
  if (score >= 95) return 'EXCELLENT';
  if (score >= 80) return 'GOOD';
  if (score >= 65) return 'FAIR';
  if (score >= 50) return 'POOR';
  return 'RESTRICTED';
}

/**
 * Evaluates whether user is currently restricted, warned, or in normal standing.
 */
export interface EvaluateUserReliabilityParams {
  userId: string;
  userRole: 'PASSENGER' | 'DRIVER';
  totalCompletedRides: number;
  cancellationEvents: CancellationEvent[];
  appeals?: CancellationAppeal[];
  currentTimeIso?: string;
  config?: ReliabilityConfig;
}

export function evaluateUserReliability(
  params: EvaluateUserReliabilityParams
): UserReliabilityProfile {
  const {
    userId,
    userRole,
    totalCompletedRides,
    cancellationEvents,
    appeals = [],
    currentTimeIso = new Date().toISOString(),
    config = DEFAULT_RELIABILITY_CONFIG,
  } = params;

  const currentMs = new Date(currentTimeIso).getTime();
  const msIn7Days = 7 * 24 * 60 * 60 * 1000;
  const msIn30Days = 30 * 24 * 60 * 60 * 1000;

  // Filter events belonging to this user
  const userEvents = cancellationEvents.filter((e) => e.userId === userId);

  let totalPenalties = 0;
  let totalCancellations = 0;
  let lastMinuteCancellations = 0;
  let cancellationsInLast7Days = 0;
  let cancellationsInLast30Days = 0;

  for (const event of userEvents) {
    const isPenalizable = isPenalizableCancellation(event, appeals);
    if (!isPenalizable) continue;

    totalCancellations += 1;
    const penalty = calculateEventPenalty(event, config, appeals);
    totalPenalties += penalty;

    if (event.timingRisk === 'LAST_MINUTE' || event.timingRisk === 'PAST_DEPARTURE') {
      lastMinuteCancellations += 1;
    }

    const eventMs = new Date(event.cancelledAt).getTime();
    const ageMs = currentMs - eventMs;

    if (ageMs >= 0 && ageMs <= msIn7Days) {
      cancellationsInLast7Days += 1;
    }
    if (ageMs >= 0 && ageMs <= msIn30Days) {
      cancellationsInLast30Days += 1;
    }
  }

  // Recovery bonus earned from completed trips
  const recoveryBonus = totalCompletedRides * config.completionRecoveryBonus;

  // Raw score clamped between 0 and 100
  const rawScore = config.baselineScore - totalPenalties + recoveryBonus;
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));
  const tier = resolveReliabilityTier(score);

  // Active pending appeals count
  const activeAppealsCount = appeals.filter(
    (a) => a.userId === userId && a.status === 'SUBMITTED'
  ).length;

  // Graduated Restriction Logic
  let restrictionLevel: GraduatedRestrictionLevel = 'NORMAL';
  let restrictedUntil: string | undefined = undefined;
  let restrictionReason: string | undefined = undefined;

  // Level 3: Severe score drop or excessive repeated cancellations -> FLAGGED_FOR_MANUAL_REVIEW
  if (score < config.manualReviewScoreFloor || lastMinuteCancellations >= 3) {
    restrictionLevel = 'FLAGGED_FOR_MANUAL_REVIEW';
    restrictionReason =
      lastMinuteCancellations >= 3
        ? 'Multiple last-minute cancellations detected. Account flagged for manual support review.'
        : `Reliability score dropped to ${score}/100. Account under administrative review.`;
  }
  // Level 2: High short-term cancellations -> TEMPORARY_RESTRICTION
  else if (
    cancellationsInLast7Days >= config.restrictionThreshold7Days ||
    cancellationsInLast30Days >= config.restrictionThreshold30Days
  ) {
    restrictionLevel = 'TEMPORARY_RESTRICTION';
    const cooldownMs = config.temporaryRestrictionHours * 60 * 60 * 1000;
    restrictedUntil = new Date(currentMs + cooldownMs).toISOString();
    restrictionReason = `${cancellationsInLast7Days} cancellations within the past 7 days. Temporary ${config.temporaryRestrictionHours}-hour cooling off applied to preserve marketplace trust.`;
  }
  // Level 1: Approaching limit -> WARNING_ISSUED
  else if (
    cancellationsInLast7Days >= config.warningThreshold7Days ||
    score < 80
  ) {
    restrictionLevel = 'WARNING_ISSUED';
    restrictionReason =
      cancellationsInLast7Days >= config.warningThreshold7Days
        ? `You have made ${cancellationsInLast7Days} cancellations in the last 7 days. Please avoid cancelling to maintain your reliability score.`
        : `Your reliability score is ${score}/100. Complete upcoming rides to restore your score.`;
  }

  // Build transparent explanation
  const explanationParts = [
    `Reliability Score: ${score}/100 (${tier}).`,
    `${totalCompletedRides} completed journey(s).`,
    `${totalCancellations} total cancellation(s) (${lastMinuteCancellations} last-minute).`,
  ];
  if (activeAppealsCount > 0) {
    explanationParts.push(`${activeAppealsCount} emergency appeal(s) under review.`);
  }
  if (restrictionReason) {
    explanationParts.push(`Status: ${restrictionReason}`);
  }

  return {
    userId,
    userRole,
    score,
    tier,
    restrictionLevel,
    restrictedUntil,
    restrictionReason,
    totalCompletedRides,
    totalCancellations,
    lastMinuteCancellations,
    cancellationsInLast7Days,
    cancellationsInLast30Days,
    activeAppealsCount,
    explanation: explanationParts.join(' '),
    updatedAt: currentTimeIso,
  };
}

/**
 * Checks whether a user is currently barred from creating new bookings or publishing rides.
 */
export function checkUserActionEligibility(
  profile: UserReliabilityProfile,
  currentTimeIso: string = new Date().toISOString()
): { isAllowed: boolean; rejectionReason?: string } {
  if (profile.restrictionLevel === 'FLAGGED_FOR_MANUAL_REVIEW') {
    return {
      isAllowed: false,
      rejectionReason:
        profile.restrictionReason ||
        'Account is temporarily under manual review due to repeated cancellations. Please submit an appeal or contact support.',
    };
  }

  if (profile.restrictionLevel === 'TEMPORARY_RESTRICTION') {
    if (profile.restrictedUntil) {
      const nowMs = new Date(currentTimeIso).getTime();
      const untilMs = new Date(profile.restrictedUntil).getTime();
      if (nowMs < untilMs) {
        const remainingHours = Math.ceil((untilMs - nowMs) / (1000 * 60 * 60));
        return {
          isAllowed: false,
          rejectionReason: `Temporary cooling-off active for ${remainingHours} more hour(s). New bookings or listings are restricted following repeated cancellations.`,
        };
      }
    }
  }

  return { isAllowed: true };
}

/**
 * Submits an Emergency Appeal for a cancellation event.
 */
export function submitEmergencyAppeal(params: {
  id: string;
  cancellationEventId: string;
  userId: string;
  emergencyCategory: EmergencyReasonCategory;
  statement: string;
  submittedAt?: string;
}): CancellationAppeal {
  const {
    id,
    cancellationEventId,
    userId,
    emergencyCategory,
    statement,
    submittedAt = new Date().toISOString(),
  } = params;

  if (!statement.trim() || statement.trim().length < 10) {
    throw new ReliabilityEngineError(
      'Please provide an explanation of at least 10 characters for your emergency appeal.',
      'INVALID_APPEAL_STATEMENT'
    );
  }

  return {
    id,
    cancellationEventId,
    userId,
    emergencyCategory,
    statement: statement.trim(),
    status: 'SUBMITTED',
    submittedAt,
  };
}

/**
 * Resolves an emergency appeal (Admin decision).
 */
export function resolveEmergencyAppeal(params: {
  appeal: CancellationAppeal;
  decision: 'APPROVED' | 'REJECTED';
  adminFeedback: string;
  reviewedBy: string;
  reviewedAt?: string;
}): CancellationAppeal {
  const {
    appeal,
    decision,
    adminFeedback,
    reviewedBy,
    reviewedAt = new Date().toISOString(),
  } = params;

  if (appeal.status !== 'SUBMITTED') {
    throw new ReliabilityEngineError(
      `Appeal is already resolved with status: ${appeal.status}`,
      'APPEAL_ALREADY_RESOLVED'
    );
  }

  return {
    ...appeal,
    status: decision,
    adminFeedback: adminFeedback.trim(),
    reviewedBy,
    reviewedAt,
  };
}
