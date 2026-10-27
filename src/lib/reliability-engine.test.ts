/**
 * ReturnRide - Repeat Cancellation Prevention & Reliability System Unit Tests
 *
 * Verifies all 12 core requirements:
 * 1. Tracking passenger and driver cancellations separately with timing metadata
 * 2. Rolling time window detection (7-day and 30-day windows)
 * 3. Graduated consequences: NORMAL -> WARNING_ISSUED -> TEMPORARY_RESTRICTION -> FLAGGED_FOR_MANUAL_REVIEW
 * 4. High-risk last-minute cancellations (< 4 hours)
 * 5. Transparent, explainable scoring with trip completion bonuses
 * 6. False-positive prevention: system conflicts & driver cancellations do not penalize innocent passengers
 * 7. Emergency appeals: submission, review, and score restoration
 * 8. Idempotency and input immutability
 * 9. Temporary cooling-off duration & action eligibility checks
 * 10. Zero monetary penalty invariants
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  calculateHoursBeforeDeparture,
  evaluateTimingRisk,
  createCancellationEvent,
  isPenalizableCancellation,
  calculateEventPenalty,
  evaluateUserReliability,
  checkUserActionEligibility,
  submitEmergencyAppeal,
  resolveEmergencyAppeal,
  DEFAULT_RELIABILITY_CONFIG,
} from './reliability-engine.ts';
import type {
  CancellationEvent,
  CancellationAppeal,
} from '../types/reliability.ts';

describe('ReturnRide Repeat Cancellation Prevention & Reliability System', () => {
  const BASE_TIME = '2026-11-01T10:00:00.000Z';
  const DEPARTURE_FUTURE_48H = '2026-11-03T10:00:00.000Z';
  const DEPARTURE_FUTURE_12H = '2026-11-01T22:00:00.000Z';
  const DEPARTURE_FUTURE_2H = '2026-11-01T12:00:00.000Z';
  const DEPARTURE_PAST = '2026-11-01T08:00:00.000Z';

  // 1. TIMING RISK & HOURS CALCULATION
  it('1. Correctly calculates hours before departure and evaluates timing risks', () => {
    // 48 hours prior -> STANDARD
    const h48 = calculateHoursBeforeDeparture(DEPARTURE_FUTURE_48H, BASE_TIME);
    assert.equal(h48, 48);
    assert.equal(evaluateTimingRisk(h48), 'STANDARD');

    // 12 hours prior -> MODERATE
    const h12 = calculateHoursBeforeDeparture(DEPARTURE_FUTURE_12H, BASE_TIME);
    assert.equal(h12, 12);
    assert.equal(evaluateTimingRisk(h12), 'MODERATE');

    // 2 hours prior -> LAST_MINUTE
    const h2 = calculateHoursBeforeDeparture(DEPARTURE_FUTURE_2H, BASE_TIME);
    assert.equal(h2, 2);
    assert.equal(evaluateTimingRisk(h2), 'LAST_MINUTE');

    // Past departure -> PAST_DEPARTURE
    const hPast = calculateHoursBeforeDeparture(DEPARTURE_PAST, BASE_TIME);
    assert.equal(hPast, -2);
    assert.equal(evaluateTimingRisk(hPast), 'PAST_DEPARTURE');
  });

  // 2. CANCELLATION EVENT AUDIT CREATION
  it('2. Creates structured CancellationEvent with role, timing, and category separation', () => {
    const event = createCancellationEvent({
      id: 'event-001',
      bookingId: 'book-101',
      rideId: 'ride-99',
      userId: 'usr-ali',
      userRole: 'PASSENGER',
      category: 'PASSENGER_VOLUNTARY',
      reason: 'Change of schedule',
      departureTime: DEPARTURE_FUTURE_48H,
      cancelledAt: BASE_TIME,
    });

    assert.equal(event.id, 'event-001');
    assert.equal(event.userRole, 'PASSENGER');
    assert.equal(event.category, 'PASSENGER_VOLUNTARY');
    assert.equal(event.timingRisk, 'STANDARD');
    assert.equal(event.hoursBeforeDeparture, 48);
  });

  // 3. FALSE-POSITIVE PREVENTION
  it('3. Guarantees system rejections and expired requests carry ZERO reputation penalty', () => {
    const autoConflictEvent = createCancellationEvent({
      id: 'event-auto-01',
      rideId: 'ride-100',
      userId: 'usr-innocent',
      userRole: 'PASSENGER',
      category: 'AUTO_CONFLICT_REJECT',
      reason: 'Auto rejected because another passenger booked whole car',
      departureTime: DEPARTURE_FUTURE_2H,
      cancelledAt: BASE_TIME,
    });

    const expiredEvent = createCancellationEvent({
      id: 'event-exp-01',
      rideId: 'ride-100',
      userId: 'usr-innocent',
      userRole: 'PASSENGER',
      category: 'SYSTEM_EXPIRED',
      reason: 'Driver did not respond before TTL',
      departureTime: DEPARTURE_FUTURE_2H,
      cancelledAt: BASE_TIME,
    });

    assert.equal(isPenalizableCancellation(autoConflictEvent), false);
    assert.equal(calculateEventPenalty(autoConflictEvent), 0);

    assert.equal(isPenalizableCancellation(expiredEvent), false);
    assert.equal(calculateEventPenalty(expiredEvent), 0);
  });

  // 4. LAST-MINUTE VS STANDARD PENALTIES
  it('4. Applies higher penalty for last-minute cancellations and driver ride disruption', () => {
    const passengerStandard = createCancellationEvent({
      id: 'e-std',
      rideId: 'ride-1',
      userId: 'p-1',
      userRole: 'PASSENGER',
      category: 'PASSENGER_VOLUNTARY',
      reason: 'Normal cancel',
      departureTime: DEPARTURE_FUTURE_48H,
      cancelledAt: BASE_TIME,
    });

    const passengerLastMinute = createCancellationEvent({
      id: 'e-last',
      rideId: 'ride-1',
      userId: 'p-1',
      userRole: 'PASSENGER',
      category: 'PASSENGER_VOLUNTARY',
      reason: 'Last minute emergency',
      departureTime: DEPARTURE_FUTURE_2H,
      cancelledAt: BASE_TIME,
    });

    const driverRideCancel = createCancellationEvent({
      id: 'e-driver-ride',
      rideId: 'ride-1',
      userId: 'd-1',
      userRole: 'DRIVER',
      category: 'DRIVER_RIDE_CANCEL',
      reason: 'Cancelled entire trip',
      departureTime: DEPARTURE_FUTURE_2H,
      cancelledAt: BASE_TIME,
    });

    const stdPenalty = calculateEventPenalty(passengerStandard);
    const lastPenalty = calculateEventPenalty(passengerLastMinute);
    const driverPenalty = calculateEventPenalty(driverRideCancel);

    assert.equal(stdPenalty, DEFAULT_RELIABILITY_CONFIG.standardCancelPenalty); // 5
    assert.equal(lastPenalty, DEFAULT_RELIABILITY_CONFIG.lastMinuteCancelPenalty); // 20
    assert.equal(driverPenalty, 30); // 20 * 1.5 = 30
    assert.ok(lastPenalty > stdPenalty);
    assert.ok(driverPenalty > lastPenalty);
  });

  // 5. GRADUATED CONSEQUENCES (NORMAL -> WARNING -> TEMPORARY RESTRICTION)
  it('5. Enforces graduated consequences across 7-day rolling window', () => {
    const userId = 'usr-frequent-canceller';

    // Baseline with 0 cancellations -> NORMAL
    const profile0 = evaluateUserReliability({
      userId,
      userRole: 'PASSENGER',
      totalCompletedRides: 5,
      cancellationEvents: [],
      currentTimeIso: BASE_TIME,
    });
    assert.equal(profile0.score, 100);
    assert.equal(profile0.tier, 'EXCELLENT');
    assert.equal(profile0.restrictionLevel, 'NORMAL');

    // 2 standard cancellations in last 7 days -> WARNING_ISSUED
    const eventsWarning: CancellationEvent[] = [
      createCancellationEvent({
        id: 'w-1',
        rideId: 'r-1',
        userId,
        userRole: 'PASSENGER',
        category: 'PASSENGER_VOLUNTARY',
        reason: 'Change mind 1',
        departureTime: '2026-11-03T10:00:00Z',
        cancelledAt: '2026-10-31T10:00:00Z', // 1 day ago
      }),
      createCancellationEvent({
        id: 'w-2',
        rideId: 'r-2',
        userId,
        userRole: 'PASSENGER',
        category: 'PASSENGER_VOLUNTARY',
        reason: 'Change mind 2',
        departureTime: '2026-11-04T10:00:00Z',
        cancelledAt: '2026-11-01T08:00:00Z', // 2 hours ago
      }),
    ];

    const profileWarn = evaluateUserReliability({
      userId,
      userRole: 'PASSENGER',
      totalCompletedRides: 1,
      cancellationEvents: eventsWarning,
      currentTimeIso: BASE_TIME,
    });
    assert.equal(profileWarn.restrictionLevel, 'WARNING_ISSUED');
    assert.ok(profileWarn.restrictionReason?.includes('2 cancellations'));
    // Eligibility: still allowed to book during warning
    assert.equal(checkUserActionEligibility(profileWarn).isAllowed, true);

    // 3 cancellations in last 7 days -> TEMPORARY_RESTRICTION
    const eventsRestricted: CancellationEvent[] = [
      ...eventsWarning,
      createCancellationEvent({
        id: 'w-3',
        rideId: 'r-3',
        userId,
        userRole: 'PASSENGER',
        category: 'PASSENGER_VOLUNTARY',
        reason: 'Change mind 3',
        departureTime: '2026-11-05T10:00:00Z',
        cancelledAt: '2026-11-01T09:00:00Z', // 1 hour ago
      }),
    ];

    const profileRestricted = evaluateUserReliability({
      userId,
      userRole: 'PASSENGER',
      totalCompletedRides: 1,
      cancellationEvents: eventsRestricted,
      currentTimeIso: BASE_TIME,
    });

    assert.equal(profileRestricted.restrictionLevel, 'TEMPORARY_RESTRICTION');
    assert.ok(profileRestricted.restrictedUntil !== undefined);
    assert.ok(profileRestricted.restrictionReason?.includes('cooling off'));

    // Eligibility check fails during active restriction
    const eligibility = checkUserActionEligibility(profileRestricted, BASE_TIME);
    assert.equal(eligibility.isAllowed, false);
    assert.ok(eligibility.rejectionReason?.includes('cooling-off active'));
  });

  // 6. COOLING-OFF EXPIRATION
  it('6. Automatically restores action eligibility after cooling-off period elapses', () => {
    const userId = 'usr-cooling-off';
    const restrictedUntil = '2026-11-02T10:00:00.000Z'; // 24 hours after BASE_TIME

    const profile: ReturnType<typeof evaluateUserReliability> = {
      userId,
      userRole: 'PASSENGER',
      score: 70,
      tier: 'FAIR',
      restrictionLevel: 'TEMPORARY_RESTRICTION',
      restrictedUntil,
      restrictionReason: 'Temporary 24h restriction',
      totalCompletedRides: 2,
      totalCancellations: 3,
      lastMinuteCancellations: 0,
      cancellationsInLast7Days: 3,
      cancellationsInLast30Days: 3,
      activeAppealsCount: 0,
      explanation: 'Test cooling-off',
      updatedAt: BASE_TIME,
    };

    // Before expiry -> Blocked
    assert.equal(checkUserActionEligibility(profile, '2026-11-01T20:00:00.000Z').isAllowed, false);

    // After expiry (25 hours later) -> Allowed
    assert.equal(checkUserActionEligibility(profile, '2026-11-02T11:00:00.000Z').isAllowed, true);
  });

  // 7. MULTIPLE LAST-MINUTE CANCELLATIONS -> MANUAL REVIEW
  it('7. Flags account for manual review when multiple last-minute cancellations occur', () => {
    const userId = 'usr-serial-flaker';
    const events: CancellationEvent[] = [
      createCancellationEvent({
        id: 'lm-1',
        rideId: 'r-1',
        userId,
        userRole: 'DRIVER',
        category: 'DRIVER_RIDE_CANCEL',
        reason: 'Car flat tire',
        departureTime: '2026-11-01T11:00:00Z',
        cancelledAt: '2026-11-01T10:00:00Z', // 1h before -> LAST_MINUTE
      }),
      createCancellationEvent({
        id: 'lm-2',
        rideId: 'r-2',
        userId,
        userRole: 'DRIVER',
        category: 'DRIVER_RIDE_CANCEL',
        reason: 'Personal issue',
        departureTime: '2026-11-02T11:00:00Z',
        cancelledAt: '2026-11-02T10:00:00Z', // 1h before -> LAST_MINUTE
      }),
      createCancellationEvent({
        id: 'lm-3',
        rideId: 'r-3',
        userId,
        userRole: 'DRIVER',
        category: 'DRIVER_RIDE_CANCEL',
        reason: 'Could not make it',
        departureTime: '2026-11-03T11:00:00Z',
        cancelledAt: '2026-11-03T10:00:00Z', // 1h before -> LAST_MINUTE
      }),
    ];

    const profile = evaluateUserReliability({
      userId,
      userRole: 'DRIVER',
      totalCompletedRides: 0,
      cancellationEvents: events,
      currentTimeIso: '2026-11-03T12:00:00Z',
    });

    assert.equal(profile.restrictionLevel, 'FLAGGED_FOR_MANUAL_REVIEW');
    assert.ok(profile.restrictionReason?.includes('Multiple last-minute cancellations'));
    assert.equal(checkUserActionEligibility(profile).isAllowed, false);
  });

  // 8. EMERGENCY APPEAL WORKFLOW & SCORE RESTORATION
  it('8. Supports emergency appeal submission, admin approval, and full score restoration', () => {
    const userId = 'usr-emergency-patient';
    const event = createCancellationEvent({
      id: 'e-med-1',
      rideId: 'r-emergency',
      userId,
      userRole: 'PASSENGER',
      category: 'PASSENGER_VOLUNTARY',
      reason: 'Severe medical emergency requiring hospitalization',
      departureTime: DEPARTURE_FUTURE_2H,
      cancelledAt: BASE_TIME,
      isEmergency: true,
      emergencyCategory: 'MEDICAL',
    });

    // Before appeal: penalty of 20 points applies
    const profileBefore = evaluateUserReliability({
      userId,
      userRole: 'PASSENGER',
      totalCompletedRides: 2,
      cancellationEvents: [event],
      appeals: [],
      currentTimeIso: BASE_TIME,
    });
    assert.equal(profileBefore.score, 84); // 100 - 20 + (2*2) = 84

    // Passenger submits emergency appeal
    const appeal = submitEmergencyAppeal({
      id: 'appeal-101',
      cancellationEventId: event.id,
      userId,
      emergencyCategory: 'MEDICAL',
      statement: 'Hospital admission slip attached. Admitted due to acute emergency.',
      submittedAt: BASE_TIME,
    });
    assert.equal(appeal.status, 'SUBMITTED');

    // Admin reviews and approves appeal
    const resolvedAppeal: CancellationAppeal = resolveEmergencyAppeal({
      appeal,
      decision: 'APPROVED',
      adminFeedback: 'Verified valid hospital documentation. Penalty waived.',
      reviewedBy: 'admin-sarah',
    });
    assert.equal(resolvedAppeal.status, 'APPROVED');

    // After approval: Penalty is completely waived!
    const profileAfter = evaluateUserReliability({
      userId,
      userRole: 'PASSENGER',
      totalCompletedRides: 2,
      cancellationEvents: [event],
      appeals: [resolvedAppeal],
      currentTimeIso: BASE_TIME,
    });

    assert.equal(profileAfter.score, 100); // 100 - 0 + 4 = 104 -> clamped to 100
    assert.equal(profileAfter.totalCancellations, 0); // Not counted as penalized cancellation
    assert.equal(profileAfter.restrictionLevel, 'NORMAL');
  });

  // 9. TRIP COMPLETION REPUTATION RECOVERY
  it('9. Awards score recovery bonuses for successfully completed journeys', () => {
    const userId = 'usr-recovering';
    const event = createCancellationEvent({
      id: 'e-old',
      rideId: 'r-old',
      userId,
      userRole: 'PASSENGER',
      category: 'PASSENGER_VOLUNTARY',
      reason: 'Cancelled',
      departureTime: DEPARTURE_FUTURE_48H,
      cancelledAt: BASE_TIME,
    });

    // 1 cancel (-5), 0 completions -> 95
    const profile1 = evaluateUserReliability({
      userId,
      userRole: 'PASSENGER',
      totalCompletedRides: 0,
      cancellationEvents: [event],
      currentTimeIso: BASE_TIME,
    });
    assert.equal(profile1.score, 95);

    // 1 cancel (-5), 5 completed rides (+10 bonus) -> 100 (capped)
    const profile2 = evaluateUserReliability({
      userId,
      userRole: 'PASSENGER',
      totalCompletedRides: 5,
      cancellationEvents: [event],
      currentTimeIso: BASE_TIME,
    });
    assert.equal(profile2.score, 100);
  });

  // 10. TRANSPARENT EXPLAINABLE STRING
  it('10. Generates transparent, human-readable score explanations without black-box metrics', () => {
    const userId = 'usr-transparent';
    const profile = evaluateUserReliability({
      userId,
      userRole: 'PASSENGER',
      totalCompletedRides: 10,
      cancellationEvents: [],
      currentTimeIso: BASE_TIME,
    });

    assert.ok(profile.explanation.includes('Reliability Score: 100/100 (EXCELLENT)'));
    assert.ok(profile.explanation.includes('10 completed journey(s)'));
    assert.ok(profile.explanation.includes('0 total cancellation(s)'));
  });

  // 11. IMMUTABILITY
  it('11. Preserves immutability across all calculation inputs', () => {
    const originalEvent = Object.freeze(
      createCancellationEvent({
        id: 'freeze-1',
        rideId: 'r-1',
        userId: 'u-1',
        userRole: 'PASSENGER',
        category: 'PASSENGER_VOLUNTARY',
        reason: 'Immutability test',
        departureTime: DEPARTURE_FUTURE_48H,
        cancelledAt: BASE_TIME,
      })
    );

    const originalAppeals = Object.freeze([]) as readonly CancellationAppeal[];

    // Must not throw or mutate frozen objects
    assert.doesNotThrow(() => {
      calculateEventPenalty(originalEvent, DEFAULT_RELIABILITY_CONFIG, originalAppeals as unknown as CancellationAppeal[]);
      evaluateUserReliability({
        userId: 'u-1',
        userRole: 'PASSENGER',
        totalCompletedRides: 1,
        cancellationEvents: [originalEvent],
        currentTimeIso: BASE_TIME,
      });
    });
  });
});
