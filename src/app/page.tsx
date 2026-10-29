'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  acceptBookingRequest,
  rejectBookingRequest,
  cancelConfirmedBooking,
  cancelRide,
  createBookingRequest,
  calculateAvailableSeats,
  BookingEngineError,
} from '@/lib/booking-engine';
import {
  evaluateUserReliability,
  checkUserActionEligibility,
  createCancellationEvent,
  submitEmergencyAppeal,
} from '@/lib/reliability-engine';
import type {
  CancellationEvent,
  CancellationAppeal,
  EmergencyReasonCategory,
} from '@/types/reliability';
import type {
  Ride,
  BookingRequest,
  BookingType,
  RideBookingMode,
  PassengerRideRequest,
  DriverOffer,
  DriverBadgeTier,
  TravelComfortAttributes,
} from '@/types';

interface City {
  id: string;
  name: string;
  province: string;
}

const NATIONWIDE_CITIES: City[] = [
  { id: 'loc-uk', name: 'Umerkot', province: 'Sindh' },
  { id: 'loc-khi', name: 'Karachi', province: 'Sindh' },
  { id: 'loc-hyd', name: 'Hyderabad', province: 'Sindh' },
  { id: 'loc-suk', name: 'Sukkur', province: 'Sindh' },
  { id: 'loc-mpk', name: 'Mirpur Khas', province: 'Sindh' },
  { id: 'loc-lhr', name: 'Lahore', province: 'Punjab' },
  { id: 'loc-isb', name: 'Islamabad / Rawalpindi', province: 'Federal / Punjab' },
  { id: 'loc-mul', name: 'Multan', province: 'Punjab' },
  { id: 'loc-fsd', name: 'Faisalabad', province: 'Punjab' },
  { id: 'loc-pes', name: 'Peshawar', province: 'KPK' },
  { id: 'loc-qta', name: 'Quetta', province: 'Balochistan' },
];

export type VerificationState = 'UNVERIFIED' | 'PENDING_REVIEW' | 'VERIFIED';

export interface AppUserProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'PASSENGER' | 'DRIVER';
  avatarUrl?: string;
  city?: string;
  emergencyContact?: string;
  // Driver specific fields
  vehicle?: {
    makeModel: string;
    plate: string;
    capacity: number;
    hasAc: boolean;
    color: string;
  };
  cnicNumber?: string;
  licenseNumber?: string;
  verificationStatus?: VerificationState;
  idDocumentUploaded?: boolean;
  licenseDocumentUploaded?: boolean;
  vehicleRegistrationUploaded?: boolean;
}

const INITIAL_DEMO_PASSENGER: AppUserProfile = {
  id: 'usr-ali',
  name: 'Muhammad Ali',
  email: 'ali@example.com',
  phone: '0301-2345678',
  role: 'PASSENGER',
  avatarUrl: '👨‍💼',
  city: 'Karachi',
  emergencyContact: '0300-1122334',
};

const INITIAL_DEMO_DRIVER: AppUserProfile = {
  id: 'driver-tariq',
  name: 'Tariq Khan',
  email: 'tariq.captain@example.com',
  phone: '0300-9876543',
  role: 'DRIVER',
  avatarUrl: '👨‍✈️',
  city: 'Umerkot',
  emergencyContact: '0302-9988776',
  vehicle: {
    makeModel: 'Toyota Corolla GLi',
    plate: 'LEB-4592',
    capacity: 4,
    hasAc: true,
    color: 'White',
  },
  cnicNumber: '44101-1234567-1',
  licenseNumber: 'DL-HYD-99812',
  verificationStatus: 'VERIFIED',
  idDocumentUploaded: true,
  licenseDocumentUploaded: true,
  vehicleRegistrationUploaded: true,
};

const INITIAL_RIDES: Ride[] = [
  {
    id: 'ride-101',
    driverId: 'driver-tariq',
    vehicleId: 'veh-corolla',
    originLocationId: 'loc-uk',
    destinationLocationId: 'loc-khi',
    departureTime: '2026-11-02T07:00:00Z',
    bookingMode: 'WHOLE_CAR_OR_SEATS',
    capacity: 4,
    bookedSeatsCount: 0,
    wholeCarPrice: 14000,
    seatPrice: 3500,
    status: 'PUBLISHED',
    autoReopenOnCancellation: true,
    notes: 'Toyota Corolla with chilled AC. Clean trunk space for luggage. Departure from Umerkot center.',
    driverTier: 'TOP_RATED_DRIVER',
    roundTripAllowed: true,
    roundTripWholeCarPrice: 23000, // Saves Rs. 5,000 for same-day or 2-day family return
    travelComfort: {
      acType: 'CHILLED_AC',
      maxInBack: 2,
      luggageCapacity: 'FULL_TRUNK',
      namazBreak: true,
      tollsIncluded: true,
      familyOnboard: true,
    },
    routeStops: [
      { id: 'stop-mpk', name: 'Mirpur Khas', distanceKm: 75, seatPrice: 900, wholeCarPrice: 3500 },
      { id: 'stop-tj', name: 'Tando Jam', distanceKm: 120, seatPrice: 1400, wholeCarPrice: 5500 },
      { id: 'stop-hyd', name: 'Hyderabad (Qasimabad / Latifabad)', distanceKm: 145, seatPrice: 1800, wholeCarPrice: 7200 },
      { id: 'stop-nb', name: 'Nooriabad / M-9 Toll', distanceKm: 225, seatPrice: 2600, wholeCarPrice: 10400 },
      { id: 'stop-khi', name: 'Karachi (Sohrab Goth / Cantt / Saddar)', distanceKm: 320, seatPrice: 3500, wholeCarPrice: 14000 },
    ],
    createdAt: '2026-10-26T10:00:00Z',
    updatedAt: '2026-10-26T10:00:00Z',
  },
  {
    id: 'ride-102',
    driverId: 'driver-aslam',
    vehicleId: 'veh-city',
    originLocationId: 'loc-khi',
    destinationLocationId: 'loc-hyd',
    departureTime: '2026-11-02T09:30:00Z',
    bookingMode: 'WHOLE_CAR_OR_SEATS',
    capacity: 4,
    bookedSeatsCount: 0,
    wholeCarPrice: 6000,
    seatPrice: 1500,
    status: 'PUBLISHED',
    autoReopenOnCancellation: true,
    notes: 'Honda City AC. Departure from Sohrab Goth / Toll Plaza.',
    driverTier: 'EXPERIENCED_DRIVER',
    isReturnDeal: true, // Khali Wapsi special bargain!
    travelComfort: {
      acType: 'CHILLED_AC',
      maxInBack: 2,
      luggageCapacity: 'MEDIUM_SUITCASE',
      tollsIncluded: true,
    },
    routeStops: [
      { id: 'stop-nb', name: 'Nooriabad / Super Highway', distanceKm: 85, seatPrice: 900, wholeCarPrice: 3500 },
      { id: 'stop-hyd', name: 'Hyderabad (City / Auto Bhan)', distanceKm: 160, seatPrice: 1500, wholeCarPrice: 6000 },
    ],
    createdAt: '2026-10-26T11:00:00Z',
    updatedAt: '2026-10-26T11:00:00Z',
  },
  {
    id: 'ride-103',
    driverId: 'driver-kamran',
    vehicleId: 'veh-yaris',
    originLocationId: 'loc-lhr',
    destinationLocationId: 'loc-isb',
    departureTime: '2026-11-02T08:00:00Z',
    bookingMode: 'WHOLE_CAR_OR_SEATS',
    capacity: 4,
    bookedSeatsCount: 0,
    wholeCarPrice: 16000,
    seatPrice: 4000,
    status: 'PUBLISHED',
    autoReopenOnCancellation: true,
    notes: 'Direct Motorway M2 travel. Toyota Yaris with chilled AC.',
    driverTier: 'TOP_RATED_DRIVER',
    roundTripAllowed: true,
    roundTripWholeCarPrice: 26000,
    travelComfort: {
      acType: 'CHILLED_AC',
      maxInBack: 2,
      luggageCapacity: 'FULL_TRUNK',
      namazBreak: true,
      tollsIncluded: true,
    },
    routeStops: [
      { id: 'stop-gwn', name: 'Gujranwala', distanceKm: 70, seatPrice: 1000, wholeCarPrice: 4000 },
      { id: 'stop-gjt', name: 'Gujrat', distanceKm: 120, seatPrice: 1600, wholeCarPrice: 6400 },
      { id: 'stop-jhl', name: 'Jhelum', distanceKm: 175, seatPrice: 2400, wholeCarPrice: 9600 },
      { id: 'stop-isb', name: 'Islamabad / Rawalpindi', distanceKm: 380, seatPrice: 4000, wholeCarPrice: 16000 },
    ],
    createdAt: '2026-10-26T12:00:00Z',
    updatedAt: '2026-10-26T12:00:00Z',
  },
  {
    id: 'ride-104',
    driverId: 'driver-farhan',
    vehicleId: 'veh-cultus',
    originLocationId: 'loc-pes',
    destinationLocationId: 'loc-isb',
    departureTime: '2026-11-02T14:00:00Z',
    bookingMode: 'SEATS',
    capacity: 3,
    bookedSeatsCount: 0,
    wholeCarPrice: 7500,
    seatPrice: 2500,
    status: 'PUBLISHED',
    autoReopenOnCancellation: true,
    notes: 'Motorway M1 express journey. Suzuki Cultus with comfortable seating.',
    driverTier: 'EXPERIENCED_DRIVER',
    travelComfort: {
      acType: 'NORMAL_AC',
      maxInBack: 2,
      ladiesOnlySeats: true, // Reserved for women passengers
      luggageCapacity: 'CABIN_ONLY',
    },
    routeStops: [
      { id: 'stop-mrd', name: 'Mardan Interchange', distanceKm: 60, seatPrice: 1000, wholeCarPrice: 3000 },
      { id: 'stop-swb', name: 'Swabi', distanceKm: 105, seatPrice: 1600, wholeCarPrice: 4800 },
      { id: 'stop-isb', name: 'Islamabad (I-8 / Faizabad)', distanceKm: 180, seatPrice: 2500, wholeCarPrice: 7500 },
    ],
    createdAt: '2026-10-26T13:00:00Z',
    updatedAt: '2026-10-26T13:00:00Z',
  },
  {
    id: 'ride-105',
    driverId: 'driver-bilal',
    vehicleId: 'veh-civic',
    originLocationId: 'loc-mul',
    destinationLocationId: 'loc-lhr',
    departureTime: '2026-11-02T16:30:00Z',
    bookingMode: 'WHOLE_CAR_OR_SEATS',
    capacity: 4,
    bookedSeatsCount: 0,
    wholeCarPrice: 14000,
    seatPrice: 3500,
    status: 'PUBLISHED',
    autoReopenOnCancellation: true,
    notes: 'Honda Civic. Comfortable motorway ride from Multan.',
    driverTier: 'TOP_RATED_DRIVER',
    travelComfort: {
      acType: 'CHILLED_AC',
      maxInBack: 2,
      luggageCapacity: 'FULL_TRUNK',
      namazBreak: true,
      tollsIncluded: true,
    },
    routeStops: [
      { id: 'stop-khw', name: 'Khanewal', distanceKm: 50, seatPrice: 800, wholeCarPrice: 3200 },
      { id: 'stop-shw', name: 'Sahiwal', distanceKm: 170, seatPrice: 1800, wholeCarPrice: 7200 },
      { id: 'stop-okr', name: 'Okara', distanceKm: 220, seatPrice: 2400, wholeCarPrice: 9600 },
      { id: 'stop-lhr', name: 'Lahore (Thokar Niaz Baig)', distanceKm: 340, seatPrice: 3500, wholeCarPrice: 14000 },
    ],
    createdAt: '2026-10-26T14:00:00Z',
    updatedAt: '2026-10-26T14:00:00Z',
  },
  {
    id: 'ride-106',
    driverId: 'driver-jameel',
    vehicleId: 'veh-corolla-gl',
    originLocationId: 'loc-suk',
    destinationLocationId: 'loc-khi',
    departureTime: '2026-11-02T20:00:00Z',
    bookingMode: 'WHOLE_CAR_OR_SEATS',
    capacity: 4,
    bookedSeatsCount: 0,
    wholeCarPrice: 18000,
    seatPrice: 4500,
    status: 'PUBLISHED',
    autoReopenOnCancellation: true,
    notes: 'Safe and smooth night travel via National Highway.',
    driverTier: 'EXPERIENCED_DRIVER',
    isReturnDeal: true, // Khali Wapsi special bargain!
    travelComfort: {
      acType: 'CHILLED_AC',
      maxInBack: 3,
      luggageCapacity: 'FULL_TRUNK',
      namazBreak: true,
    },
    routeStops: [
      { id: 'stop-khp', name: 'Khairpur / Ranipur', distanceKm: 60, seatPrice: 900, wholeCarPrice: 3600 },
      { id: 'stop-mro', name: 'Moro / Naushahro Feroze', distanceKm: 160, seatPrice: 1800, wholeCarPrice: 7200 },
      { id: 'stop-hyd2', name: 'Hyderabad (Hala Toll)', distanceKm: 330, seatPrice: 3200, wholeCarPrice: 12800 },
      { id: 'stop-khi2', name: 'Karachi (Toll Plaza / Sohrab Goth)', distanceKm: 480, seatPrice: 4500, wholeCarPrice: 18000 },
    ],
    createdAt: '2026-10-26T15:00:00Z',
    updatedAt: '2026-10-26T15:00:00Z',
  },
];

const INITIAL_PASSENGER_REQUESTS: PassengerRideRequest[] = [
  {
    id: 'req-sw-101',
    passengerId: 'usr-ali',
    passengerName: 'Muhammad Ali',
    passengerPhone: '0301-2345678',
    originLocationId: 'loc-mpk',
    destinationLocationId: 'loc-khi',
    originName: 'Mirpur Khas',
    destinationName: 'Karachi',
    travelDate: '2026-11-03',
    desiredTime: '08:30 AM',
    bookingType: 'WHOLE_CAR',
    seatsCount: 4,
    isFamilyTrip: true,
    luggageSize: 'FULL_TRUNK',
    acRequired: true,
    budgetPrice: 13000,
    isRoundTrip: false,
    status: 'OPEN',
    notes: 'Traveling with family (wife & 2 kids) for hospital appointment. Need polite driver & chilled AC.',
    offers: [
      {
        id: 'off-1',
        driverId: 'driver-tariq',
        driverName: 'Tariq Khan',
        driverPhone: '0300-9876543',
        driverRating: 4.9,
        driverTier: 'TOP_RATED_DRIVER',
        vehicleMakeModel: 'Toyota Corolla GLi',
        vehiclePlate: 'LEB-4592',
        offeredPrice: 13000,
        message: 'Family ride ready. Chilled AC, clean trunk space, doorstep pickup from Mirpur Khas.',
        createdAt: '2026-10-28T09:00:00Z',
      },
    ],
    createdAt: '2026-10-28T08:30:00Z',
  },
  {
    id: 'req-sw-102',
    passengerId: 'usr-fatima',
    passengerName: 'Dr. Fatima Zahra',
    passengerPhone: '0333-8877665',
    originLocationId: 'loc-hyd',
    destinationLocationId: 'loc-khi',
    originName: 'Hyderabad',
    destinationName: 'Karachi',
    travelDate: '2026-11-02',
    desiredTime: '10:00 AM',
    bookingType: 'SEAT',
    seatsCount: 2,
    isFamilyTrip: true,
    luggageSize: 'MEDIUM_SUITCASE',
    acRequired: true,
    budgetPrice: 3200,
    status: 'OPEN',
    notes: '2 female passengers. Prefer car with family or ladies-only back seats.',
    offers: [],
    createdAt: '2026-10-28T10:15:00Z',
  },
  {
    id: 'req-sw-103',
    passengerId: 'usr-bilal-p',
    passengerName: 'Bilal Ahmed',
    passengerPhone: '0321-4455667',
    originLocationId: 'loc-uk',
    destinationLocationId: 'loc-mpk',
    originName: 'Umerkot',
    destinationName: 'Mirpur Khas',
    travelDate: '2026-11-02',
    desiredTime: '07:00 AM',
    bookingType: 'SEAT',
    seatsCount: 1,
    isFamilyTrip: false,
    luggageSize: 'CABIN_ONLY',
    acRequired: true,
    budgetPrice: 900,
    status: 'OPEN',
    notes: 'University student commuting to Mirpur Khas campus. 1 small backpack.',
    offers: [],
    createdAt: '2026-10-28T11:00:00Z',
  },
];

function generateClientUniqueId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).substring(2, 8)}`;
}

export default function Home() {
  // Session & Auth state (null = not logged in, requires registration/login)
  const [currentUser, setCurrentUser] = useState<AppUserProfile | null>(null);
  const [isClientLoaded, setIsClientLoaded] = useState(false);

  // Auth screen state (Email OTP or Mobile SMS OTP)
  const [authView, setAuthView] = useState<'REGISTER' | 'VERIFY_OTP' | 'LOGIN'>('REGISTER');
  const [authRoleChoice, setAuthRoleChoice] = useState<'PASSENGER' | 'DRIVER'>('PASSENGER');
  const [regOtpMethod, setRegOtpMethod] = useState<'EMAIL' | 'SMS'>('EMAIL');
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regCity, setRegCity] = useState('Karachi');
  const [regEmergency, setRegEmergency] = useState('');
  const [regCarModel, setRegCarModel] = useState('Toyota Corolla (AC)');
  const [regCarPlate, setRegCarPlate] = useState('LEB-4592');
  const [regCarCapacity, setRegCarCapacity] = useState(4);
  const [regCarColor, setRegCarColor] = useState('White');
  const [regCarAc, setRegCarAc] = useState(true);
  const [regCnic, setRegCnic] = useState('');
  const [regLicense, setRegLicense] = useState('');

  // OTP Verification state
  const [regOtp, setRegOtp] = useState('');
  const [otpSessionToken, setOtpSessionToken] = useState('');
  const [pendingUser, setPendingUser] = useState<AppUserProfile | null>(null);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState(0);

  // Login state (Supports either Email or Mobile Number)
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [registeredUsers, setRegisteredUsers] = useState<AppUserProfile[]>([
    INITIAL_DEMO_PASSENGER,
    INITIAL_DEMO_DRIVER,
  ]);

  // Drop-off waypoint selection state for Seat bookings ('DEFAULT' resolves automatically to route destination)
  const [selectedDropoffStop, setSelectedDropoffStop] = useState<string>('DEFAULT');
  const [customDropoffStop, setCustomDropoffStop] = useState<string>('');

  // App Tabs: 'passenger' | 'all_listings' | 'sawari_board' | 'driver' | 'profile'
  const [activeTab, setActiveTab] = useState<'passenger' | 'all_listings' | 'sawari_board' | 'driver' | 'profile'>('passenger');

  // "Where To?" Quick Route Popup for Passengers
  const [showQuickRouteModal, setShowQuickRouteModal] = useState(false);

  // Main Rides & Bookings State
  const [rides, setRides] = useState<Ride[]>(INITIAL_RIDES);
  const [selectedRideId, setSelectedRideId] = useState<string>('ride-101');
  const [bookings, setBookings] = useState<BookingRequest[]>([]);

  // Passenger Requests ("Sawari Board" Reverse Marketplace)
  const [passengerRequests, setPassengerRequests] = useState<PassengerRideRequest[]>(INITIAL_PASSENGER_REQUESTS);
  const [sawariFilterCity, setSawariFilterCity] = useState<string>('ALL');
  const [sawariFilterType, setSawariFilterType] = useState<'ALL' | 'WHOLE_CAR' | 'SEAT'>('ALL');

  // Modal: Post New Sawari Request
  const [showPostRequestModal, setShowPostRequestModal] = useState(false);
  const [reqOrigin, setReqOrigin] = useState<string>('loc-mpk');
  const [reqDest, setReqDest] = useState<string>('loc-khi');
  const [reqDate, setReqDate] = useState<string>('2026-11-03');
  const [reqTime, setReqTime] = useState<string>('08:30 AM');
  const [reqBookingType, setReqBookingType] = useState<'WHOLE_CAR' | 'SEAT'>('WHOLE_CAR');
  const [reqSeatsCount, setReqSeatsCount] = useState<number>(4);
  const [reqIsFamily, setReqIsFamily] = useState<boolean>(true);
  const [reqLuggage, setReqLuggage] = useState<'CABIN_ONLY' | 'MEDIUM_SUITCASE' | 'FULL_TRUNK'>('FULL_TRUNK');
  const [reqAc, setReqAc] = useState<boolean>(true);
  const [reqBudget, setReqBudget] = useState<number>(13000);
  const [reqNotes, setReqNotes] = useState<string>('');
  const [reqIsRoundTrip, setReqIsRoundTrip] = useState<boolean>(false);
  const [reqReturnDate, setReqReturnDate] = useState<string>('2026-11-04');

  // Modal: Driver Send Custom Offer
  const [selectedReqForOffer, setSelectedReqForOffer] = useState<PassengerRideRequest | null>(null);
  const [offerPrice, setOfferPrice] = useState<number>(0);
  const [offerMessage, setOfferMessage] = useState<string>('');

  // Entire Car Round-Trip Booking Selection State
  const [isWholeCarRoundTrip, setIsWholeCarRoundTrip] = useState<boolean>(false);
  const [roundTripType, setRoundTripType] = useState<'SAME_DAY_WAIT' | 'MULTI_DAY'>('SAME_DAY_WAIT');
  const [returnTripDate, setReturnTripDate] = useState<string>('2026-11-03');
  const [returnTripTime, setReturnTripTime] = useState<string>('06:00 PM');

  // Filter tag for All Rides tab
  const [allRidesFilterTag, setAllRidesFilterTag] = useState<'ALL' | 'KHALI_WAPSI' | 'FAMILY' | 'MAX_2_BACK' | 'LADIES_ONLY'>('ALL');

  // Passenger Search State
  const [searchOrigin, setSearchOrigin] = useState<string>('loc-uk');
  const [searchDest, setSearchDest] = useState<string>('loc-khi');
  const [bookingType, setBookingType] = useState<BookingType>('WHOLE_CAR');
  const [seatsRequested, setSeatsRequested] = useState(1);

  // All Listings Shared Filter State
  const [filterOrigin, setFilterOrigin] = useState<string>('ALL');
  const [filterDest, setFilterDest] = useState<string>('ALL');
  const [filterTime, setFilterTime] = useState<'ALL' | 'MORNING' | 'AFTERNOON' | 'EVENING'>('ALL');
  const [filterMode, setFilterMode] = useState<'ALL' | 'WHOLE_CAR' | 'SEATS'>('ALL');

  // Driver Post Form State
  const [driverPostOrigin, setDriverPostOrigin] = useState<string>('loc-uk');
  const [driverPostDest, setDriverPostDest] = useState<string>('loc-khi');
  const [driverPostMode, setDriverPostMode] = useState<RideBookingMode>('WHOLE_CAR_OR_SEATS');
  const [driverPostCarPrice, setDriverPostCarPrice] = useState<number>(14000);
  const [driverPostSeatPrice, setDriverPostSeatPrice] = useState<number>(3500);
  const [driverPostTime, setDriverPostTime] = useState<string>('07:00 AM');
  const [driverPostNotes, setDriverPostNotes] = useState<string>('Clean AC car with luggage trunk.');
  const [driverPostRoundTripAllowed, setDriverPostRoundTripAllowed] = useState<boolean>(true);
  const [driverPostRoundTripPrice, setDriverPostRoundTripPrice] = useState<number>(23000);
  const [driverPostFamilyOnboard, setDriverPostFamilyOnboard] = useState<boolean>(false);
  const [driverPostLadiesOnly, setDriverPostLadiesOnly] = useState<boolean>(false);
  const [driverPostNamazBreak, setDriverPostNamazBreak] = useState<boolean>(true);
  const [driverPostTollsIncluded, setDriverPostTollsIncluded] = useState<boolean>(true);
  const [driverPostMaxInBack, setDriverPostMaxInBack] = useState<number>(2);
  const [driverPostLuggage, setDriverPostLuggage] = useState<'CABIN_ONLY' | 'MEDIUM_SUITCASE' | 'FULL_TRUNK'>('FULL_TRUNK');
  const [driverPostIsReturnDeal, setDriverPostIsReturnDeal] = useState<boolean>(false);

  // Repeat Cancellation & Reliability State
  const [cancellationEvents, setCancellationEvents] = useState<CancellationEvent[]>([]);
  const [appeals, setAppeals] = useState<CancellationAppeal[]>([]);
  const [showAppealModal, setShowAppealModal] = useState(false);
  const [appealCategory, setAppealCategory] = useState<EmergencyReasonCategory>('MEDICAL');
  const [appealStatement, setAppealStatement] = useState('');
  const [selectedEventForAppeal, setSelectedEventForAppeal] = useState<CancellationEvent | null>(null);

  // Notification Toast
  const [notification, setNotification] = useState<{
    type: 'success' | 'error' | 'info';
    title: string;
    message: string;
  } | null>({
    type: 'info',
    title: 'Apni Sawari (اپنی سواری)',
    message: 'Welcome to Apni Sawari - Pakistan’s Nationwide Intercity Ride Network.',
  });

  // Load state from localStorage on client mount (scheduled asynchronously to prevent sync effect re-renders)
  useEffect(() => {
    try {
      const savedUser = localStorage.getItem('returnride_user');
      const savedRegisteredUsers = localStorage.getItem('returnride_registered_users');
      const savedRides = localStorage.getItem('returnride_rides');
      const savedBookings = localStorage.getItem('returnride_bookings');
      const savedEvents = localStorage.getItem('returnride_canc_events');
      const savedAppeals = localStorage.getItem('returnride_appeals');
      const savedPassengerRequests = localStorage.getItem('apnisawari_passenger_requests');

      const timer = setTimeout(() => {
        if (savedUser) {
          const parsedUser = JSON.parse(savedUser);
          setCurrentUser(parsedUser);
          if (parsedUser.role === 'PASSENGER') {
            setShowQuickRouteModal(true);
          }
        }
        if (savedRegisteredUsers) {
          try {
            setRegisteredUsers(JSON.parse(savedRegisteredUsers));
          } catch {
            // Ignore
          }
        }
        if (savedRides) setRides(JSON.parse(savedRides));
        if (savedBookings) setBookings(JSON.parse(savedBookings));
        if (savedEvents) setCancellationEvents(JSON.parse(savedEvents));
        if (savedAppeals) setAppeals(JSON.parse(savedAppeals));
        if (savedPassengerRequests) {
          try {
            setPassengerRequests(JSON.parse(savedPassengerRequests));
          } catch {
            // Ignore
          }
        }
        setIsClientLoaded(true);
      }, 0);

      return () => clearTimeout(timer);
    } catch {
      const fallbackTimer = setTimeout(() => setIsClientLoaded(true), 0);
      return () => clearTimeout(fallbackTimer);
    }
  }, []);

  // Save state to localStorage
  useEffect(() => {
    if (!isClientLoaded) return;
    try {
      if (currentUser) {
        localStorage.setItem('returnride_user', JSON.stringify(currentUser));
      } else {
        localStorage.removeItem('returnride_user');
      }
      localStorage.setItem('returnride_registered_users', JSON.stringify(registeredUsers));
      localStorage.setItem('returnride_rides', JSON.stringify(rides));
      localStorage.setItem('returnride_bookings', JSON.stringify(bookings));
      localStorage.setItem('returnride_canc_events', JSON.stringify(cancellationEvents));
      localStorage.setItem('returnride_appeals', JSON.stringify(appeals));
      localStorage.setItem('apnisawari_passenger_requests', JSON.stringify(passengerRequests));
    } catch {
      // Ignore
    }
  }, [currentUser, registeredUsers, rides, bookings, cancellationEvents, appeals, passengerRequests, isClientLoaded]);

  // Current User Evaluated Reliability Profile
  const userReliability = useMemo(() => {
    if (!currentUser) return null;
    return evaluateUserReliability({
      userId: currentUser.id,
      userRole: currentUser.role,
      totalCompletedRides: currentUser.role === 'DRIVER' ? 4 : 2,
      cancellationEvents,
      appeals,
    });
  }, [currentUser, cancellationEvents, appeals]);

  // Web OTP API for SMS auto-fetch on mobile devices (Zero-tap OTP entry)
  useEffect(() => {
    if (authView !== 'VERIFY_OTP' || regOtpMethod !== 'SMS') return;
    if (typeof window === 'undefined' || !('OTPCredential' in window)) return;

    interface WebOTPCredential {
      code?: string;
      type?: string;
    }

    interface NavigatorWithCredentials {
      get: (options: unknown) => Promise<WebOTPCredential | null>;
    }

    const ac = new AbortController();
    try {
      const navCredentials = navigator.credentials as unknown as NavigatorWithCredentials;
      navCredentials
        .get({
          otp: { transport: ['sms'] },
          signal: ac.signal,
        })
        .then((credential: WebOTPCredential | null) => {
          if (credential && credential.code) {
            setRegOtp(credential.code);
          }
        })
        .catch(() => {
          // Ignore cancellation/browser rejection
        });
    } catch {
      // Ignore unsupported browser
    }

    return () => {
      ac.abort();
    };
  }, [authView, regOtpMethod]);

  // Resend Countdown Timer
  useEffect(() => {
    if (authView !== 'VERIFY_OTP' || otpCountdown <= 0) return;
    const timer = setInterval(() => {
      setOtpCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [authView, otpCountdown]);

  // Handle Registration Step 1: Dispatch REAL OTP (via Email or SMS)
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName.trim()) {
      alert('Please provide your Full Name.');
      return;
    }

    if (regOtpMethod === 'EMAIL') {
      if (!regEmail.trim() || !regEmail.includes('@') || !regEmail.includes('.')) {
        alert('Please enter a valid email address to receive your OTP.');
        return;
      }
    } else {
      const cleanPhone = regPhone.replace(/\D/g, '');
      if (!regPhone.trim() || cleanPhone.length < 10) {
        alert('Please enter a valid Pakistani mobile number (e.g. 0300-1234567) to receive your SMS OTP.');
        return;
      }
    }

    if (authRoleChoice === 'DRIVER' && (!regCnic.trim() || !regLicense.trim())) {
      alert('For security in Pakistan, drivers must provide CNIC and Driving License numbers.');
      return;
    }

    const assignedEmail =
      regEmail.trim().toLowerCase() ||
      `${regPhone.replace(/\D/g, '')}@returnride.local`;

    const newUser: AppUserProfile = {
      id: generateClientUniqueId('usr'),
      name: regName.trim(),
      email: assignedEmail,
      phone: regPhone.trim() || '0300-1234567',
      role: authRoleChoice,
      avatarUrl: authRoleChoice === 'DRIVER' ? '👨‍✈️' : '🧑',
      city: regCity,
      emergencyContact: regEmergency || '0300-1234567',
      vehicle:
        authRoleChoice === 'DRIVER'
          ? {
              makeModel: regCarModel,
              plate: regCarPlate,
              capacity: regCarCapacity,
              hasAc: regCarAc,
              color: regCarColor,
            }
          : undefined,
      cnicNumber: authRoleChoice === 'DRIVER' ? regCnic.trim() : undefined,
      licenseNumber: authRoleChoice === 'DRIVER' ? regLicense.trim() : undefined,
      verificationStatus: authRoleChoice === 'DRIVER' ? 'PENDING_REVIEW' : undefined,
      idDocumentUploaded: authRoleChoice === 'DRIVER',
      licenseDocumentUploaded: authRoleChoice === 'DRIVER',
      vehicleRegistrationUploaded: authRoleChoice === 'DRIVER',
    };

    setIsSendingOtp(true);

    try {
      if (regOtpMethod === 'EMAIL') {
        // Dispatch real email OTP via backend (personal Gmail / SMTP dispatcher)
        const res = await fetch('/api/auth/otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'send_email', email: newUser.email }),
        });
        const data = await res.json();
        if (!data.success) {
          alert(data.error || 'Failed to dispatch email verification code.');
          setIsSendingOtp(false);
          return;
        }

        if (data.token) {
          setOtpSessionToken(data.token);
        }

        setNotification({
          type: 'success',
          title: data.emailDispatched ? 'Email OTP Sent to Inbox' : 'Verification Code Prepared',
          message: data.message || `Verification code sent to ${newUser.email}. Please check your inbox and spam folder.`,
        });
      } else {
        // Dispatch SMS OTP via backend API
        const res = await fetch('/api/auth/otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'send_sms', phone: newUser.phone }),
        });
        const data = await res.json();
        if (!data.success) {
          alert(data.error || 'Failed to dispatch SMS OTP. Please check your mobile number.');
          setIsSendingOtp(false);
          return;
        }

        if (data.token) {
          setOtpSessionToken(data.token);
        }

        setNotification({
          type: 'success',
          title: 'SMS Dispatched',
          message: data.message || `Verification code sent via SMS to ${newUser.phone}.`,
        });
      }

      setPendingUser(newUser);
      setAuthView('VERIFY_OTP');
      setOtpCountdown(60);
      setRegOtp('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send OTP';
      alert(`Error sending OTP: ${msg}`);
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Handle Registration Step 2: Verify OTP
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regOtp.trim() || regOtp.trim().length !== 6) {
      alert('Please enter the 6-digit verification code.');
      return;
    }

    if (!pendingUser) {
      alert('Registration session expired. Please register again.');
      setAuthView('REGISTER');
      return;
    }

    setIsVerifyingOtp(true);

    try {
      if (regOtpMethod === 'EMAIL') {
        // Verify with backend email OTP store (passes cryptographic session token)
        const res = await fetch('/api/auth/otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'verify_email',
            email: pendingUser.email,
            code: regOtp.trim(),
            token: otpSessionToken,
          }),
        });
        const data = await res.json();
        if (!data.success) {
          alert(data.error || 'Invalid verification code. Please check your email and try again.');
          setIsVerifyingOtp(false);
          return;
        }
      } else {
        // Verify SMS OTP via backend API
        const res = await fetch('/api/auth/otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'verify_sms',
            phone: pendingUser.phone,
            code: regOtp.trim(),
            token: otpSessionToken,
          }),
        });
        const data = await res.json();
        if (!data.success) {
          alert(data.error || 'Invalid SMS verification code. Please check your messages and try again.');
          setIsVerifyingOtp(false);
          return;
        }
      }

      // Verification succeeded!
      const completedUser = pendingUser;
      setRegisteredUsers((prev) => {
        const filtered = prev.filter(
          (u) =>
            u.email.toLowerCase() !== completedUser.email.toLowerCase() &&
            u.phone !== completedUser.phone
        );
        return [...filtered, completedUser];
      });

      setCurrentUser(completedUser);
      setPendingUser(null);
      setRegOtp('');

      if (completedUser.role === 'PASSENGER') {
        setActiveTab('passenger');
        setShowQuickRouteModal(true); // Immediate "From/To" popup!
        setNotification({
          type: 'success',
          title: `Welcome, ${completedUser.name}!`,
          message: 'Where do you want to travel? Choose your departure and destination.',
        });
      } else {
        setActiveTab('driver');
        setNotification({
          type: 'info',
          title: 'Captain Account Verified & Activated',
          message: 'Your documents are registered. You can now list rides across Pakistan.',
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Verification failed';
      alert(`Verification error: ${msg}`);
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  // Resend OTP Helper
  const handleResendOtp = async () => {
    if (!pendingUser) return;
    if (otpCountdown > 0) return;

    setIsSendingOtp(true);
    try {
      if (regOtpMethod === 'EMAIL') {
        const res = await fetch('/api/auth/otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'send_email', email: pendingUser.email }),
        });
        const data = await res.json();
        if (data.token) {
          setOtpSessionToken(data.token);
        }
        setNotification({
          type: 'info',
          title: 'Fresh Email OTP Dispatched',
          message: data.message || `A fresh verification code was sent to ${pendingUser.email}.`,
        });
      } else {
        const res = await fetch('/api/auth/otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'send_sms', phone: pendingUser.phone }),
        });
        const data = await res.json();
        if (data.token) {
          setOtpSessionToken(data.token);
        }
        setNotification({
          type: 'info',
          title: 'New SMS OTP Dispatched',
          message: data.message || `A fresh verification code was sent to ${pendingUser.phone}.`,
        });
      }
      setOtpCountdown(60);
    } catch {
      alert('Failed to resend code. Please try again.');
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Handle Login: Supports Either Registered Email OR Mobile Number
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const query = loginIdentifier.trim().toLowerCase();
    if (!query) {
      alert('Please enter your registered email address or mobile number.');
      return;
    }

    const cleanPhone = query.replace(/[\s\-\(\)]/g, '');

    // Match in registeredUsers
    let matchedUser = registeredUsers.find(
      (u) =>
        u.email.toLowerCase() === query ||
        u.phone.replace(/[\s\-\(\)]/g, '') === cleanPhone
    );

    if (!matchedUser) {
      if (
        query === INITIAL_DEMO_DRIVER.email.toLowerCase() ||
        query.includes('driver') ||
        query.includes('captain') ||
        cleanPhone.includes('9876')
      ) {
        matchedUser = {
          ...INITIAL_DEMO_DRIVER,
          email: query.includes('@') ? query : INITIAL_DEMO_DRIVER.email,
          phone: query.includes('@') ? INITIAL_DEMO_DRIVER.phone : query,
        };
      } else {
        matchedUser = {
          ...INITIAL_DEMO_PASSENGER,
          name: query.includes('@')
            ? query.split('@')[0].replace(/[^a-zA-Z]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim() || 'Passenger'
            : 'Muhammad Ali',
          email: query.includes('@') ? query : `${cleanPhone}@returnride.local`,
          phone: query.includes('@') ? INITIAL_DEMO_PASSENGER.phone : query,
        };
      }
    }

    setCurrentUser(matchedUser);

    if (matchedUser.role === 'PASSENGER') {
      setActiveTab('passenger');
      setShowQuickRouteModal(true);
    } else {
      setActiveTab('driver');
    }

    setNotification({
      type: 'success',
      title: `Welcome Back, ${matchedUser.name}!`,
      message: `You are signed in via registered email (${matchedUser.email}).`,
    });
  };

  // Quick 1-tap demo logins
  const handleDemoLogin = (role: 'PASSENGER' | 'DRIVER') => {
    if (role === 'PASSENGER') {
      setCurrentUser(INITIAL_DEMO_PASSENGER);
      setActiveTab('passenger');
      setShowQuickRouteModal(true);
      setNotification({
        type: 'success',
        title: 'Demo Passenger Active',
        message: 'Signed in as Muhammad Ali (ali@example.com).',
      });
    } else {
      setCurrentUser(INITIAL_DEMO_DRIVER);
      setActiveTab('driver');
      setNotification({
        type: 'success',
        title: 'Demo Driver Active',
        message: 'Signed in as Captain Tariq Khan (tariq.captain@example.com).',
      });
    }
  };

  // Log out
  const handleLogout = () => {
    setCurrentUser(null);
    setNotification({
      type: 'info',
      title: 'Signed Out',
      message: 'You have been signed out. Please register or log in to continue.',
    });
  };

  // Passenger Quick "From & To" Popup Submit
  const handleQuickRouteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowQuickRouteModal(false);

    const match = rides.find(
      (r) => r.originLocationId === searchOrigin && r.destinationLocationId === searchDest
    );
    if (match) setSelectedRideId(match.id);

    setNotification({
      type: 'info',
      title: 'Routes Loaded',
      message: `Showing rides from ${
        NATIONWIDE_CITIES.find((c) => c.id === searchOrigin)?.name
      } to ${NATIONWIDE_CITIES.find((c) => c.id === searchDest)?.name}.`,
    });
  };

  // Active Ride Calculations
  const currentRide = rides.find((r) => r.id === selectedRideId) || rides[0];
  const rideBookings = bookings.filter((b) => b.rideId === currentRide.id);
  const availableSeats = calculateAvailableSeats(currentRide, rideBookings);

  const originName = NATIONWIDE_CITIES.find((c) => c.id === searchOrigin)?.name || 'Origin';
  const destName = NATIONWIDE_CITIES.find((c) => c.id === searchDest)?.name || 'Destination';

  // Matches either direct origin->destination or intermediate corridor drop-off stops
  const matchingRides = rides.filter((r) => {
    if (r.originLocationId === searchOrigin && r.destinationLocationId === searchDest) {
      return true;
    }
    if (
      r.originLocationId === searchOrigin &&
      r.routeStops?.some((s) => s.name.toLowerCase().includes(destName.toLowerCase()))
    ) {
      return true;
    }
    return false;
  });

  // Automatically determine effective drop-off waypoint for the current route
  const effectiveDropoffStop = useMemo(() => {
    if (selectedDropoffStop && selectedDropoffStop !== 'DEFAULT') {
      return selectedDropoffStop;
    }
    const matchingStop = currentRide?.routeStops?.find((s) =>
      s.name.toLowerCase().includes(destName.toLowerCase())
    );
    if (matchingStop) return matchingStop.name;
    if (currentRide?.routeStops && currentRide.routeStops.length > 0) {
      return currentRide.routeStops[currentRide.routeStops.length - 1].name;
    }
    return destName;
  }, [selectedDropoffStop, currentRide, destName]);

  // Shared All Listings Filter
  const filteredAllRides = useMemo(() => {
    return rides.filter((r) => {
      if (filterOrigin !== 'ALL' && r.originLocationId !== filterOrigin) return false;
      if (filterDest !== 'ALL' && r.destinationLocationId !== filterDest) return false;
      if (filterMode === 'WHOLE_CAR' && r.bookingMode === 'SEATS') return false;
      if (filterMode === 'SEATS' && r.bookingMode === 'WHOLE_CAR') return false;
      if (filterTime !== 'ALL') {
        const hour = new Date(r.departureTime).getUTCHours();
        if (filterTime === 'MORNING' && (hour < 5 || hour >= 12)) return false;
        if (filterTime === 'AFTERNOON' && (hour < 12 || hour >= 18)) return false;
        if (filterTime === 'EVENING' && (hour < 18 && hour >= 5)) return false;
      }
      // Cultural & Trust Filter Chips
      if (allRidesFilterTag === 'KHALI_WAPSI' && !r.isReturnDeal) return false;
      if (allRidesFilterTag === 'FAMILY' && !r.travelComfort?.familyOnboard) return false;
      if (allRidesFilterTag === 'MAX_2_BACK' && r.travelComfort?.maxInBack !== 2) return false;
      if (allRidesFilterTag === 'LADIES_ONLY' && !r.travelComfort?.ladiesOnlySeats) return false;
      return true;
    });
  }, [rides, filterOrigin, filterDest, filterTime, filterMode, allRidesFilterTag]);

  // Filtered Sawari Requests (Reverse Marketplace)
  const filteredPassengerRequests = useMemo(() => {
    return passengerRequests.filter((req) => {
      if (sawariFilterType === 'WHOLE_CAR' && req.bookingType !== 'WHOLE_CAR') return false;
      if (sawariFilterType === 'SEAT' && req.bookingType !== 'SEAT') return false;
      if (sawariFilterCity !== 'ALL') {
        const matchesOrigin =
          req.originLocationId === sawariFilterCity ||
          req.originName.toLowerCase().includes(sawariFilterCity.toLowerCase());
        const matchesDest =
          req.destinationLocationId === sawariFilterCity ||
          req.destinationName.toLowerCase().includes(sawariFilterCity.toLowerCase());
        if (!matchesOrigin && !matchesDest) return false;
      }
      return true;
    });
  }, [passengerRequests, sawariFilterCity, sawariFilterType]);

  // Find selected drop-off waypoint details (works for BOTH Entire Car and Single Seats)
  const activeMatchedStop = currentRide?.routeStops?.find(
    (s) => s.name === effectiveDropoffStop
  );
  const activeSeatUnitPrice = activeMatchedStop
    ? activeMatchedStop.seatPrice
    : currentRide?.seatPrice || 0;

  const activeWholeCarPrice = activeMatchedStop
    ? (activeMatchedStop.wholeCarPrice ||
       (currentRide?.seatPrice
         ? Math.round((activeMatchedStop.seatPrice / currentRide.seatPrice) * currentRide.wholeCarPrice)
         : currentRide.wholeCarPrice))
    : currentRide.wholeCarPrice;

  const roundTripWholePrice = currentRide.roundTripWholeCarPrice || Math.round(activeWholeCarPrice * 1.65);

  // Current price dynamically calculated for BOTH Entire Car (One-Way or Round-Trip) and Single Seats
  const currentPrice =
    bookingType === 'WHOLE_CAR'
      ? (isWholeCarRoundTrip ? roundTripWholePrice : activeWholeCarPrice)
      : activeSeatUnitPrice * seatsRequested;

  // Passenger Booking Request Handler
  const handleCreateRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    // Reliability Check Guard
    if (userReliability) {
      const eligibility = checkUserActionEligibility(userReliability);
      if (!eligibility.isAllowed) {
        setNotification({
          type: 'error',
          title: 'Booking Restricted',
          message:
            eligibility.rejectionReason ||
            'Your account is currently restricted from submitting new bookings due to repeat cancellations.',
        });
        return;
      }
    }

    try {
      const seatsToBook = bookingType === 'WHOLE_CAR' ? 1 : seatsRequested;
      let finalDropoff = destName;
      let price = currentPrice;

      if (effectiveDropoffStop === 'CUSTOM') {
        finalDropoff = customDropoffStop.trim() || `${destName} (En Route)`;
        price = bookingType === 'WHOLE_CAR'
          ? (isWholeCarRoundTrip ? roundTripWholePrice : activeWholeCarPrice)
          : activeSeatUnitPrice * seatsToBook;
      } else if (activeMatchedStop) {
        finalDropoff = activeMatchedStop.name;
        price = bookingType === 'WHOLE_CAR'
          ? (isWholeCarRoundTrip ? roundTripWholePrice : (activeMatchedStop.wholeCarPrice || activeWholeCarPrice))
          : activeMatchedStop.seatPrice * seatsToBook;
      } else {
        price = bookingType === 'WHOLE_CAR'
          ? (isWholeCarRoundTrip ? roundTripWholePrice : currentRide.wholeCarPrice)
          : (currentRide.seatPrice || 0) * seatsToBook;
      }

      const newRequest = createBookingRequest({
        id: generateClientUniqueId('req'),
        ride: currentRide,
        passengerId: `${currentUser.name} (Verified Sawari #${currentUser.id.slice(-4)})`,
        bookingType,
        requestedSeats: seatsToBook,
        totalPrice: price,
        dropoffStopName: finalDropoff,
        isRoundTrip: bookingType === 'WHOLE_CAR' ? isWholeCarRoundTrip : false,
        roundTripType: bookingType === 'WHOLE_CAR' && isWholeCarRoundTrip ? roundTripType : undefined,
        returnDepartureTime: bookingType === 'WHOLE_CAR' && isWholeCarRoundTrip ? `${returnTripDate}T${returnTripTime}` : undefined,
        confirmedBookings: rideBookings,
      });

      setBookings((prev) => [newRequest, ...prev]);
      setNotification({
        type: 'success',
        title: 'Booking Request Sent!',
        message: `Your request for ${bookingType === 'WHOLE_CAR' ? (isWholeCarRoundTrip ? 'Entire Car (Round-Trip)' : 'Entire Car (One-Way)') : `${seatsToBook} seat(s) to ${finalDropoff}`} was sent to the driver.`,
      });
    } catch (err: unknown) {
      if (err instanceof BookingEngineError) {
        setNotification({ type: 'error', title: 'Cannot Submit Request', message: err.message });
      }
    }
  };

  // Handle posting a new Sawari Request from Passenger
  const handlePostSawariRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    const oCity = NATIONWIDE_CITIES.find((c) => c.id === reqOrigin)?.name || 'Origin';
    const dCity = NATIONWIDE_CITIES.find((c) => c.id === reqDest)?.name || 'Destination';

    const newReq: PassengerRideRequest = {
      id: generateClientUniqueId('req-sw'),
      passengerId: currentUser.id,
      passengerName: currentUser.name,
      passengerPhone: currentUser.phone,
      originLocationId: reqOrigin,
      destinationLocationId: reqDest,
      originName: oCity,
      destinationName: dCity,
      travelDate: reqDate,
      desiredTime: reqTime,
      bookingType: reqBookingType,
      seatsCount: reqBookingType === 'WHOLE_CAR' ? 4 : reqSeatsCount,
      isFamilyTrip: reqIsFamily,
      luggageSize: reqLuggage,
      acRequired: reqAc,
      budgetPrice: Number(reqBudget),
      isRoundTrip: reqIsRoundTrip,
      returnDate: reqIsRoundTrip ? reqReturnDate : undefined,
      status: 'OPEN',
      notes: reqNotes.trim() || undefined,
      offers: [],
      createdAt: new Date().toISOString(),
    };

    setPassengerRequests((prev) => [newReq, ...prev]);
    setShowPostRequestModal(false);
    setActiveTab('sawari_board');
    setNotification({
      type: 'success',
      title: 'Sawari Request Listed on Board!',
      message: `Your request for ${oCity} ➔ ${dCity} is posted. Verified drivers in your area will review and send offers.`,
    });
  };

  // Open Driver Offer Modal
  const handleOpenOfferModal = (req: PassengerRideRequest) => {
    setSelectedReqForOffer(req);
    setOfferPrice(req.budgetPrice);
    setOfferMessage('Ready to drive. Chilled AC, sanitized vehicle, respectful service.');
  };

  // Submit Driver Offer
  const handleSubmitDriverOffer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReqForOffer || !currentUser) return;

    const newOffer: DriverOffer = {
      id: generateClientUniqueId('off'),
      driverId: currentUser.id,
      driverName: currentUser.name,
      driverPhone: currentUser.phone,
      driverRating: 4.9,
      driverTier: 'TOP_RATED_DRIVER',
      vehicleMakeModel: currentUser.vehicle?.makeModel || 'Toyota Corolla GLi',
      vehiclePlate: currentUser.vehicle?.plate || 'LEB-4592',
      offeredPrice: Number(offerPrice),
      message: offerMessage.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    setPassengerRequests((prev) =>
      prev.map((r) => {
        if (r.id === selectedReqForOffer.id) {
          return {
            ...r,
            offers: [...r.offers, newOffer],
          };
        }
        return r;
      })
    );

    setSelectedReqForOffer(null);
    setNotification({
      type: 'success',
      title: 'Offer Sent to Passenger!',
      message: `Your offer of Rs. ${Number(offerPrice).toLocaleString()} was delivered to ${selectedReqForOffer.passengerName}.`,
    });
  };

  // Accept Driver Offer (By Passenger)
  const handleAcceptDriverOffer = (req: PassengerRideRequest, offer: DriverOffer) => {
    setPassengerRequests((prev) =>
      prev.map((r) => {
        if (r.id === req.id) {
          return {
            ...r,
            status: 'ACCEPTED',
            acceptedOfferId: offer.id,
          };
        }
        return r;
      })
    );

    setNotification({
      type: 'success',
      title: 'Driver Confirmed!',
      message: `You accepted ${offer.driverName}'s offer for Rs. ${offer.offeredPrice.toLocaleString()}. Safe travels with Apni Sawari!`,
    });
  };

  // Driver Acceptance Handler
  const handleAcceptRequest = (request: BookingRequest) => {
    try {
      const targetRide = rides.find((r) => r.id === request.rideId);
      if (!targetRide) return;

      const currentRideBookings = bookings.filter((b) => b.rideId === targetRide.id);
      const otherPending = currentRideBookings.filter((b) => b.id !== request.id && b.status === 'PENDING');

      const result = acceptBookingRequest({
        ride: targetRide,
        requestToAccept: request,
        otherPendingRequests: otherPending,
        confirmedBookings: currentRideBookings,
      });

      setRides((prev) => prev.map((r) => (r.id === result.updatedRide.id ? result.updatedRide : r)));

      setBookings((prev) =>
        prev.map((b) => {
          if (b.id === result.acceptedRequest.id) return result.acceptedRequest;
          const autoRejected = result.autoRejectedRequests.find((r) => r.id === b.id);
          if (autoRejected) return autoRejected;
          return b;
        })
      );

      const conflictCount = result.autoRejectedRequests.length;
      setNotification({
        type: 'success',
        title: 'Booking Accepted!',
        message: `Accepted booking for ${request.passengerId}. ${
          conflictCount > 0 ? `${conflictCount} conflicting requests were auto-rejected.` : ''
        }`,
      });
    } catch (err: unknown) {
      if (err instanceof BookingEngineError) {
        setNotification({ type: 'error', title: 'Error', message: err.message });
      }
    }
  };

  // Driver Reject Handler
  const handleRejectRequest = (request: BookingRequest) => {
    try {
      const rejected = rejectBookingRequest(request, 'Driver declined request');
      setBookings((prev) => prev.map((b) => (b.id === request.id ? rejected : b)));
      setNotification({
        type: 'info',
        title: 'Request Declined',
        message: `Declined booking for ${request.passengerId}.`,
      });
    } catch (err: unknown) {
      if (err instanceof BookingEngineError) {
        setNotification({ type: 'error', title: 'Error', message: err.message });
      }
    }
  };

  // Driver or Passenger Cancel Booking Handler with Reliability Tracking
  const handleCancelBooking = (booking: BookingRequest) => {
    try {
      const targetRide = rides.find((r) => r.id === booking.rideId);
      if (!targetRide) return;

      const roleCancelling = currentUser?.role || 'DRIVER';

      const result = cancelConfirmedBooking({
        ride: targetRide,
        booking,
        cancelledBy: roleCancelling === 'PASSENGER' ? 'PASSENGER' : 'DRIVER',
        reason: 'User cancelled booking',
      });

      setRides((prev) => prev.map((r) => (r.id === result.updatedRide.id ? result.updatedRide : r)));
      setBookings((prev) => prev.map((b) => (b.id === booking.id ? result.updatedBooking : b)));

      // Record Cancellation Event in Reliability Engine
      if (currentUser) {
        const event = createCancellationEvent({
          id: generateClientUniqueId('canc'),
          bookingId: booking.id,
          rideId: targetRide.id,
          userId: currentUser.id,
          userRole: currentUser.role,
          category: roleCancelling === 'PASSENGER' ? 'PASSENGER_VOLUNTARY' : 'DRIVER_SEAT_CANCEL',
          reason: 'Booking cancellation',
          departureTime: targetRide.departureTime,
        });

        setCancellationEvents((prev) => [event, ...prev]);

        if (event.timingRisk === 'LAST_MINUTE') {
          setSelectedEventForAppeal(event);
          setNotification({
            type: 'error',
            title: 'Last-Minute Cancellation Recorded',
            message:
              'Cancelling within 4 hours of departure affects reliability scores. If this was a legitimate emergency (medical, breakdown), you can submit an appeal below.',
          });
        } else {
          setNotification({
            type: 'info',
            title: 'Booking Cancelled',
            message: 'The booking was cancelled and occupied seats released.',
          });
        }
      }
    } catch (err: unknown) {
      if (err instanceof BookingEngineError) {
        setNotification({ type: 'error', title: 'Error', message: err.message });
      }
    }
  };

  // Driver Cancel Published Ride Handler (Whole Trip Cancellation)
  const handleCancelPublishedRide = (rideToCancel: Ride) => {
    if (!currentUser) return;
    try {
      const result = cancelRide({
        ride: rideToCancel,
        driverId: currentUser.id,
        confirmedBookings: bookings,
        reason: 'Captain cancelled journey',
      });

      setRides((prev) => prev.map((r) => (r.id === result.updatedRide.id ? result.updatedRide : r)));
      setBookings((prev) =>
        prev.map((b) => {
          const cancelled = result.cancelledBookings.find((cb) => cb.id === b.id);
          if (cancelled) return cancelled;
          const autoRej = result.rejectedPendingRequests.find((ar) => ar.id === b.id);
          if (autoRej) return autoRej;
          return b;
        })
      );

      const event = createCancellationEvent({
        id: generateClientUniqueId('canc-ride'),
        rideId: rideToCancel.id,
        userId: currentUser.id,
        userRole: 'DRIVER',
        category: 'DRIVER_RIDE_CANCEL',
        reason: 'Captain cancelled published ride',
        departureTime: rideToCancel.departureTime,
      });

      setCancellationEvents((prev) => [event, ...prev]);

      setNotification({
        type: 'info',
        title: 'Ride Cancelled',
        message: 'Your published ride was cancelled. All confirmed passengers have been notified.',
      });
    } catch (err: unknown) {
      if (err instanceof BookingEngineError) {
        setNotification({ type: 'error', title: 'Cannot Cancel Ride', message: err.message });
      }
    }
  };

  // Submit Emergency Appeal Handler
  const handleEmergencyAppealSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEventForAppeal || !currentUser) return;

    try {
      const appeal = submitEmergencyAppeal({
        id: generateClientUniqueId('appeal'),
        cancellationEventId: selectedEventForAppeal.id,
        userId: currentUser.id,
        emergencyCategory: appealCategory,
        statement: appealStatement,
      });

      setAppeals((prev) => [appeal, ...prev]);
      setShowAppealModal(false);
      setAppealStatement('');
      setSelectedEventForAppeal(null);

      setNotification({
        type: 'success',
        title: 'Emergency Appeal Submitted',
        message: 'Your emergency appeal has been submitted for administrative review. Thank you.',
      });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Invalid appeal statement');
    }
  };

  // Driver Publish Ride Handler
  const handlePublishDriverRide = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    // Reliability Check Guard
    if (userReliability) {
      const eligibility = checkUserActionEligibility(userReliability);
      if (!eligibility.isAllowed) {
        setNotification({
          type: 'error',
          title: 'Publishing Restricted',
          message:
            eligibility.rejectionReason ||
            'Your account is temporarily restricted from publishing rides due to repeat cancellations.',
        });
        return;
      }
    }

    const newRide: Ride = {
      id: generateClientUniqueId('ride'),
      driverId: currentUser.id,
      vehicleId: generateClientUniqueId('veh'),
      originLocationId: driverPostOrigin,
      destinationLocationId: driverPostDest,
      departureTime: '2026-11-03T08:00:00Z',
      bookingMode: driverPostMode,
      capacity: currentUser.vehicle?.capacity || 4,
      bookedSeatsCount: 0,
      wholeCarPrice: Number(driverPostCarPrice),
      seatPrice: driverPostMode === 'WHOLE_CAR' ? undefined : Number(driverPostSeatPrice),
      status: 'PUBLISHED',
      autoReopenOnCancellation: true,
      notes: `${currentUser.vehicle?.makeModel || 'Toyota Corolla'} • Departs ${driverPostTime}. ${driverPostNotes}`,
      driverTier: 'TOP_RATED_DRIVER',
      isReturnDeal: driverPostIsReturnDeal,
      roundTripAllowed: driverPostRoundTripAllowed,
      roundTripWholeCarPrice: driverPostRoundTripAllowed ? Number(driverPostRoundTripPrice) : undefined,
      travelComfort: {
        acType: 'CHILLED_AC',
        maxInBack: driverPostMaxInBack,
        luggageCapacity: driverPostLuggage,
        namazBreak: driverPostNamazBreak,
        tollsIncluded: driverPostTollsIncluded,
        familyOnboard: driverPostFamilyOnboard,
        ladiesOnlySeats: driverPostLadiesOnly,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setRides((prev) => [newRide, ...prev]);
    setSelectedRideId(newRide.id);
    setSearchOrigin(driverPostOrigin);
    setSearchDest(driverPostDest);
    setActiveTab('all_listings');
    setNotification({
      type: 'success',
      title: 'Journey Published!',
      message: `Your ride from ${
        NATIONWIDE_CITIES.find((c) => c.id === driverPostOrigin)?.name
      } to ${NATIONWIDE_CITIES.find((c) => c.id === driverPostDest)?.name} is now listed!`,
    });
  };

  // Driver name helper
  const getDriverDisplayName = (driverId: string) => {
    if (currentUser && driverId === currentUser.id) return currentUser.name + ' (You)';
    switch (driverId) {
      case 'driver-tariq':
        return 'Driver Tariq Khan';
      case 'driver-aslam':
        return 'Driver Aslam Memon';
      case 'driver-kamran':
        return 'Driver Kamran Butt';
      case 'driver-farhan':
        return 'Driver Farhan Shinwari';
      case 'driver-bilal':
        return 'Driver Bilal Shah';
      case 'driver-jameel':
        return 'Driver Jameel Soomro';
      default:
        return 'Verified Driver';
    }
  };

  // =========================================================================
  // GATE SCREEN: IF USER IS NOT LOGGED IN / FIRST TIME VISITOR
  // =========================================================================
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-900 text-white font-sans antialiased flex flex-col justify-center items-center p-4">
        <div className="max-w-md w-full bg-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-700 space-y-6">
          {/* Logo Header */}
          <div className="text-center space-y-2">
            <span className="text-4xl block" role="img" aria-label="car">🚗</span>
            <h1 className="text-2xl font-black tracking-tight">Apni Sawari (اپنی سواری)</h1>
            <p className="text-xs text-emerald-400 font-bold uppercase tracking-wider">
              Nationwide Intercity Ride Network
            </p>
            <p className="text-xs text-slate-400">
              Trusted, affordable intercity travel across Pakistan. Reserve entire cars, single seats, or post your ride request on the Sawari Board.
            </p>
          </div>

          {/* Toggle: Register vs Login */}
          <div className="grid grid-cols-2 gap-2 bg-slate-900/80 p-1.5 rounded-2xl border border-slate-700">
            <button
              onClick={() => setAuthView('REGISTER')}
              className={`py-2 text-xs font-black rounded-xl transition ${
                authView === 'REGISTER' || authView === 'VERIFY_OTP'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              New Registration (OTP)
            </button>
            <button
              onClick={() => setAuthView('LOGIN')}
              className={`py-2 text-xs font-black rounded-xl transition ${
                authView === 'LOGIN'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Sign In (Instant Access)
            </button>
          </div>

          {/* STEP 1: REGISTRATION FORM */}
          {authView === 'REGISTER' && (
            <form onSubmit={handleRegister} className="space-y-4">
              {/* Role Picker: Passenger vs Driver */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-2">
                  Select Your Account Type:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAuthRoleChoice('PASSENGER')}
                    className={`p-3 rounded-2xl border-2 text-left transition flex flex-col justify-between ${
                      authRoleChoice === 'PASSENGER'
                        ? 'border-emerald-500 bg-emerald-950/40 shadow-xs'
                        : 'border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    <span className="text-xl">🙋‍♂️</span>
                    <span className="font-extrabold text-xs mt-1 block text-white">Sawari / Passenger</span>
                    <span className="text-[10px] text-slate-400">I need a ride / seats</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAuthRoleChoice('DRIVER')}
                    className={`p-3 rounded-2xl border-2 text-left transition flex flex-col justify-between ${
                      authRoleChoice === 'DRIVER'
                        ? 'border-emerald-500 bg-emerald-950/40 shadow-xs'
                        : 'border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    <span className="text-xl">🚘</span>
                    <span className="font-extrabold text-xs mt-1 block text-white">Driver (ڈرائیور)</span>
                    <span className="text-[10px] text-slate-400">I have a car to offer</span>
                  </button>
                </div>
              </div>

              {/* OTP Delivery Preference Selector */}
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1.5">
                  Receive 6-Digit OTP Via:
                </label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-slate-900/90 rounded-2xl border border-slate-700">
                  <button
                    type="button"
                    onClick={() => setRegOtpMethod('EMAIL')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      regOtpMethod === 'EMAIL'
                        ? 'bg-emerald-600 text-white shadow-xs font-extrabold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <span>📧</span>
                    <span>Email Inbox</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRegOtpMethod('SMS')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      regOtpMethod === 'SMS'
                        ? 'bg-emerald-600 text-white shadow-xs font-extrabold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <span>📱</span>
                    <span>Mobile SMS</span>
                  </button>
                </div>
              </div>

              {/* Personal Details */}
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">Your Full Name</label>
                  <input
                    type="text"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="e.g. Muhammad Ali"
                    required
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
                  />
                </div>

                {regOtpMethod === 'EMAIL' ? (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-bold text-slate-300">
                        Email Address (For Verification Code)
                      </label>
                      <span className="text-[10px] text-emerald-400 font-semibold">Direct Inbox Delivery</span>
                    </div>
                    <input
                      type="email"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="e.g. gotamjee@gmail.com"
                      required
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
                    />
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-bold text-slate-300">
                        Pakistani Mobile Number (For SMS OTP)
                      </label>
                      <span className="text-[10px] text-emerald-400 font-semibold">SIM Auto-Fetch Ready</span>
                    </div>
                    <input
                      type="tel"
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                      placeholder="0300-1234567"
                      required
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  {regOtpMethod === 'EMAIL' ? (
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">
                        Mobile Number
                      </label>
                      <input
                        type="tel"
                        value={regPhone}
                        onChange={(e) => setRegPhone(e.target.value)}
                        placeholder="0300-1234567"
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">
                        Email (Optional)
                      </label>
                      <input
                        type="email"
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        placeholder="user@example.com"
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">Your City</label>
                    <select
                      value={regCity}
                      onChange={(e) => setRegCity(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-medium"
                    >
                      {NATIONWIDE_CITIES.map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">
                    Emergency Contact Number (Family / Relative)
                  </label>
                  <input
                    type="tel"
                    value={regEmergency}
                    onChange={(e) => setRegEmergency(e.target.value)}
                    placeholder="0300-1122334"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500"
                  />
                </div>
              </div>

              {/* DRIVER MANDATORY VERIFICATION & SECURITY FIELDS */}
              {authRoleChoice === 'DRIVER' && (
                <div className="space-y-3 border-t border-slate-700 pt-3">
                  <div className="flex items-center gap-1.5 text-amber-400">
                    <span className="text-sm">🛡️</span>
                    <span className="text-[11px] font-bold uppercase tracking-wider">
                      Driver Security & Verification
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    To keep Pakistani passengers and families safe, CNIC and Driving License are verified for all drivers.
                  </p>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">CNIC Number</label>
                      <input
                        type="text"
                        value={regCnic}
                        onChange={(e) => setRegCnic(e.target.value)}
                        placeholder="44101-1234567-1"
                        required
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">Driving License No.</label>
                      <input
                        type="text"
                        value={regLicense}
                        onChange={(e) => setRegLicense(e.target.value)}
                        placeholder="DL-KHI-45920"
                        required
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 font-mono"
                      />
                    </div>
                  </div>

                  {/* Vehicle Information */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">Car Model</label>
                      <input
                        type="text"
                        value={regCarModel}
                        onChange={(e) => setRegCarModel(e.target.value)}
                        placeholder="e.g. Corolla (AC)"
                        required
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">License Plate</label>
                      <input
                        type="text"
                        value={regCarPlate}
                        onChange={(e) => setRegCarPlate(e.target.value)}
                        placeholder="LEB-4592"
                        required
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 uppercase font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">Seats</label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={regCarCapacity}
                        onChange={(e) => setRegCarCapacity(Number(e.target.value))}
                        required
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-2 text-xs text-white text-center font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">Color</label>
                      <input
                        type="text"
                        value={regCarColor}
                        onChange={(e) => setRegCarColor(e.target.value)}
                        placeholder="White"
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-2 text-xs text-white placeholder-slate-500"
                      />
                    </div>
                    <div className="flex items-center pt-5">
                      <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-300">
                        <input
                          type="checkbox"
                          checked={regCarAc}
                          onChange={(e) => setRegCarAc(e.target.checked)}
                          className="w-4 h-4 accent-emerald-500 rounded"
                        />
                        <span>AC Car</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* Submit Registration -> Dispatches REAL OTP */}
              <button
                type="submit"
                disabled={isSendingOtp}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 text-white font-black py-3.5 px-4 rounded-2xl shadow-lg transition text-xs uppercase tracking-wider cursor-pointer flex items-center justify-center gap-2"
              >
                {isSendingOtp ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>Dispatching Verification Code...</span>
                  </>
                ) : (
                  <span>
                    {regOtpMethod === 'EMAIL'
                      ? 'Send Verification Code via Email →'
                      : 'Send Verification Code via SMS →'}
                  </span>
                )}
              </button>
            </form>
          )}

          {/* STEP 2: OTP VERIFICATION FORM */}
          {authView === 'VERIFY_OTP' && (
            <div className="space-y-4">
              <div className="text-center space-y-1.5">
                <span className="text-3xl block">
                  {regOtpMethod === 'EMAIL' ? '📧' : '📱'}
                </span>
                <h2 className="text-base font-extrabold text-white">
                  {regOtpMethod === 'EMAIL' ? 'Check Your Email Inbox' : 'Check Your Mobile SMS'}
                </h2>
                <p className="text-xs text-slate-300">
                  {regOtpMethod === 'EMAIL'
                    ? 'A 6-digit verification code has been dispatched to:'
                    : 'A 6-digit verification code was sent via SMS to:'}
                </p>
                <div className="font-mono text-xs font-black text-emerald-400 bg-emerald-950/60 py-1.5 px-3 rounded-xl border border-emerald-800/80 inline-block">
                  {regOtpMethod === 'EMAIL'
                    ? pendingUser?.email || regEmail
                    : pendingUser?.phone || regPhone}
                </div>
                {regOtpMethod === 'EMAIL' ? (
                  <div className="space-y-1 pt-1">
                    <p className="text-[11px] text-slate-300">
                      Please check your <strong>Inbox</strong> and <strong>Spam/Junk</strong> folder.
                    </p>
                    <p className="text-[10px] text-emerald-400/80">
                      💡 Tip: For direct Gmail delivery, credentials are authenticated.
                    </p>
                  </div>
                ) : (
                  <p className="text-[11px] text-emerald-400/90 pt-1 flex items-center justify-center gap-1">
                    <span>⚡</span>
                    <span>SIM Auto-Fetch Active: Code will auto-fill from incoming SMS.</span>
                  </p>
                )}
              </div>

              <form onSubmit={handleVerifyOtp} className="space-y-3.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1.5 text-center">
                    Enter 6-Digit Verification Code
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={regOtp}
                    onChange={(e) => setRegOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="------"
                    autoFocus
                    required
                    className="w-full bg-slate-900 border-2 border-emerald-500/60 rounded-2xl px-3 py-3 text-center text-2xl font-mono font-black text-white tracking-widest placeholder-slate-700 focus:outline-none focus:border-emerald-400 shadow-inner"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isVerifyingOtp || regOtp.length !== 6}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 text-white font-black py-3.5 px-4 rounded-2xl shadow-lg transition text-xs uppercase tracking-wider cursor-pointer flex items-center justify-center gap-2"
                >
                  {isVerifyingOtp ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      <span>Verifying Code...</span>
                    </>
                  ) : (
                    <span>Verify &amp; Enter Apni Sawari</span>
                  )}
                </button>

                <div className="flex justify-between items-center pt-2 text-xs">
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={otpCountdown > 0 || isSendingOtp}
                    className="text-slate-400 hover:text-white underline cursor-pointer disabled:text-slate-600 disabled:no-underline"
                  >
                    {otpCountdown > 0 ? `Resend Code in ${otpCountdown}s` : 'Resend Code'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthView('REGISTER');
                      setRegOtp('');
                    }}
                    className="text-slate-400 hover:text-white underline cursor-pointer"
                  >
                    Edit Phone/Email
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* SIGN IN FORM (EMAIL OR MOBILE NUMBER) */}
          {authView === 'LOGIN' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  Enter Your Registered Email or Mobile Number:
                </label>
                <input
                  type="text"
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                  placeholder="e.g. gotamjee@gmail.com or 0300-1234567"
                  required
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-bold"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Instant passwordless access. Sign in using either your email address or mobile phone.
                </p>
              </div>

              <button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-3.5 px-4 rounded-2xl shadow-lg transition text-xs uppercase tracking-wider cursor-pointer"
              >
                Sign In to Apni Sawari
              </button>
            </form>
          )}

          {/* 1-Tap Demo Switchers */}
          <div className="pt-2 border-t border-slate-700/80 text-center space-y-2">
            <span className="text-[10px] text-slate-400 font-bold uppercase">
              Or Instant 1-Click Demo Accounts:
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleDemoLogin('PASSENGER')}
                className="bg-slate-700 hover:bg-slate-600 text-white py-2 px-3 rounded-xl text-xs font-bold transition flex flex-col items-center"
              >
                <span>🙋‍♂️ Demo Sawari</span>
                <span className="text-[10px] text-slate-400 font-normal">ali@example.com</span>
              </button>
              <button
                type="button"
                onClick={() => handleDemoLogin('DRIVER')}
                className="bg-slate-700 hover:bg-slate-600 text-white py-2 px-3 rounded-xl text-xs font-bold transition flex flex-col items-center"
              >
                <span>🚘 Demo Driver</span>
                <span className="text-[10px] text-slate-400 font-normal">tariq.captain@example.com</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // MAIN APP SCREEN (USER IS LOGGED IN)
  // =========================================================================
  const openSawariRequestsCount = passengerRequests.filter((r) => r.status === 'OPEN').length;
  const pendingDriverBookingsCount = bookings.filter((b) => b.status === 'PENDING').length;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 font-sans antialiased pb-24">
      {/* Top Header */}
      <header className="bg-emerald-800 text-white shadow-md sticky top-0 z-30">
        <div className="max-w-xl mx-auto px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl" role="img" aria-label="car">🚗</span>
            <div>
              <h1 className="text-xl font-black tracking-tight leading-none">Apni Sawari</h1>
              <p className="text-[10px] text-emerald-200 font-medium">اپنی سواری • Pakistan Intercity Network</p>
            </div>
          </div>

          {/* Profile Shortcut */}
          <button
            onClick={() => setActiveTab('profile')}
            className="text-xs bg-emerald-950/60 hover:bg-emerald-950 text-emerald-100 hover:text-white px-3 py-1.5 rounded-xl border border-emerald-600/50 transition font-bold flex items-center gap-1.5 shadow-xs"
          >
            <span>{currentUser.avatarUrl || (currentUser.role === 'DRIVER' ? '👨‍✈️' : '🧑')}</span>
            <span className="max-w-[70px] truncate sm:max-w-none">{currentUser.name}</span>
            {currentUser.role === 'DRIVER' && currentUser.verificationStatus === 'VERIFIED' && (
              <span className="text-amber-400 font-bold" title="Verified Driver">🛡️</span>
            )}
          </button>
        </div>

        {/* 5 Navigation Tabs */}
        <div className="max-w-xl mx-auto px-2 grid grid-cols-5 gap-1 pb-2">
          {/* Passenger Book Ride Tab */}
          <button
            onClick={() => {
              setActiveTab('passenger');
              setShowQuickRouteModal(true);
            }}
            className={`py-2 px-0.5 rounded-xl font-bold text-xs flex flex-col items-center justify-center gap-0.5 transition ${
              activeTab === 'passenger'
                ? 'bg-white text-emerald-900 shadow-md font-black'
                : 'bg-emerald-900/60 text-emerald-100 hover:bg-emerald-900'
            }`}
          >
            <span>🙋‍♂️</span>
            <span>Book</span>
          </button>

          {/* Shared All Listings Tab */}
          <button
            onClick={() => setActiveTab('all_listings')}
            className={`py-2 px-0.5 rounded-xl font-bold text-xs flex flex-col items-center justify-center gap-0.5 transition ${
              activeTab === 'all_listings'
                ? 'bg-white text-emerald-900 shadow-md font-black'
                : 'bg-emerald-900/60 text-emerald-100 hover:bg-emerald-900'
            }`}
          >
            <span>📋</span>
            <span>Rides ({rides.length})</span>
          </button>

          {/* Sawari Board (Reverse Marketplace) Tab */}
          <button
            onClick={() => setActiveTab('sawari_board')}
            className={`py-2 px-0.5 rounded-xl font-bold text-xs flex flex-col items-center justify-center gap-0.5 transition relative ${
              activeTab === 'sawari_board'
                ? 'bg-white text-emerald-900 shadow-md font-black'
                : 'bg-emerald-900/60 text-emerald-100 hover:bg-emerald-900'
            }`}
          >
            <div className="relative">
              <span>📢</span>
              {openSawariRequestsCount > 0 && (
                <span className="absolute -top-1 -right-2 w-3.5 h-3.5 bg-amber-400 text-slate-900 text-[9px] font-black rounded-full flex items-center justify-center">
                  {openSawariRequestsCount}
                </span>
              )}
            </div>
            <span>Board</span>
          </button>

          {/* Driver Portal Tab */}
          <button
            onClick={() => setActiveTab('driver')}
            className={`py-2 px-0.5 rounded-xl font-bold text-xs flex flex-col items-center justify-center gap-0.5 transition relative ${
              activeTab === 'driver'
                ? 'bg-white text-emerald-900 shadow-md font-black'
                : 'bg-emerald-900/60 text-emerald-100 hover:bg-emerald-900'
            }`}
          >
            <div className="relative">
              <span>🚘</span>
              {pendingDriverBookingsCount > 0 && (
                <span className="absolute -top-1 -right-2 w-3.5 h-3.5 bg-amber-400 text-slate-900 text-[9px] font-black rounded-full flex items-center justify-center">
                  {pendingDriverBookingsCount}
                </span>
              )}
            </div>
            <span>Driver</span>
          </button>

          {/* Profile & Verification Tab */}
          <button
            onClick={() => setActiveTab('profile')}
            className={`py-2 px-0.5 rounded-xl font-bold text-xs flex flex-col items-center justify-center gap-0.5 transition ${
              activeTab === 'profile'
                ? 'bg-white text-emerald-900 shadow-md font-black'
                : 'bg-emerald-900/60 text-emerald-100 hover:bg-emerald-900'
            }`}
          >
            <span>👤</span>
            <span>Profile</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-xl mx-auto px-4 pt-3.5 space-y-4">
        {/* Notification Alert */}
        {notification && (
          <div
            className={`p-3.5 rounded-2xl border flex items-start justify-between shadow-sm transition ${
              notification.type === 'success'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : notification.type === 'error'
                ? 'bg-rose-50 border-rose-300 text-rose-900'
                : 'bg-blue-50 border-blue-300 text-blue-900'
            }`}
          >
            <div className="flex gap-2">
              <span className="text-lg">
                {notification.type === 'success' ? '✅' : notification.type === 'error' ? '⚠️' : 'ℹ️'}
              </span>
              <div>
                <h4 className="text-sm font-bold">{notification.title}</h4>
                <p className="text-xs mt-0.5 opacity-90">{notification.message}</p>
              </div>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="text-slate-400 hover:text-slate-700 text-sm font-bold px-1.5"
            >
              ✕
            </button>
          </div>
        )}

        {/* Reliability Banner (Graduated Restrictions & Warnings) */}
        {userReliability && userReliability.restrictionLevel !== 'NORMAL' && (
          <div
            className={`p-3.5 rounded-2xl border flex items-start gap-2.5 shadow-xs ${
              userReliability.restrictionLevel === 'TEMPORARY_RESTRICTION'
                ? 'bg-rose-50 border-rose-300 text-rose-900'
                : 'bg-amber-50 border-amber-300 text-amber-900'
            }`}
          >
            <span className="text-xl">
              {userReliability.restrictionLevel === 'TEMPORARY_RESTRICTION' ? '⏳' : '⚠️'}
            </span>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-xs uppercase tracking-wider">
                  {userReliability.restrictionLevel === 'TEMPORARY_RESTRICTION'
                    ? 'Temporary Cooling-off Active'
                    : 'Reliability Warning'}
                </span>
                <span className="text-[11px] font-bold">
                  Score: {userReliability.score}/100 ({userReliability.tier})
                </span>
              </div>
              <p className="text-xs mt-0.5 leading-relaxed">
                {userReliability.restrictionReason}
              </p>
              {selectedEventForAppeal && (
                <button
                  type="button"
                  onClick={() => setShowAppealModal(true)}
                  className="mt-2 text-xs font-black text-white bg-slate-900 hover:bg-black px-3 py-1.5 rounded-xl transition cursor-pointer"
                >
                  Submit Emergency Appeal ➔
                </button>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 1: PASSENGER BOOKING VIEW */}
        {/* ========================================================================= */}
        {activeTab === 'passenger' && (
          <div className="space-y-4">
            {/* Quick Route Bar */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Your Journey Route
                </span>
                <button
                  onClick={() => setShowQuickRouteModal(true)}
                  className="text-xs text-emerald-700 font-extrabold hover:underline flex items-center gap-1"
                >
                  <span>✏️</span>
                  <span>Change From / To</span>
                </button>
              </div>

              <div
                onClick={() => setShowQuickRouteModal(true)}
                className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between cursor-pointer hover:bg-emerald-100/60 transition"
              >
                <div>
                  <span className="block text-[11px] font-semibold text-emerald-700 uppercase">From</span>
                  <span className="text-base font-extrabold text-slate-900">{originName}</span>
                </div>
                <div className="text-emerald-700 text-lg font-bold">➔</div>
                <div className="text-right">
                  <span className="block text-[11px] font-semibold text-emerald-700 uppercase">To</span>
                  <span className="text-base font-extrabold text-slate-900">{destName}</span>
                </div>
              </div>
            </div>

            {/* Matching Ride Card */}
            {matchingRides.length > 0 ? (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                {/* Driver Info Header */}
                <div className="p-4 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-emerald-100 border border-emerald-300 flex items-center justify-center text-xl font-bold text-emerald-800">
                        👨‍✈️
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-extrabold text-slate-900 text-base">
                            {getDriverDisplayName(currentRide.driverId)}
                          </span>
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5">
                            <span>🛡️</span>
                            <span>VERIFIED</span>
                          </span>
                          {currentRide.driverTier === 'TOP_RATED_DRIVER' ? (
                            <span className="text-[10px] bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded font-black">
                              ⭐ Top-Rated Driver
                            </span>
                          ) : currentRide.driverTier === 'EXPERIENCED_DRIVER' ? (
                            <span className="text-[10px] bg-blue-100 text-blue-900 px-1.5 py-0.5 rounded font-bold">
                              🚗 Experienced Driver
                            </span>
                          ) : (
                            <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-semibold">
                              🌱 Verified Driver
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 font-medium">{currentRide.notes}</p>
                      </div>
                    </div>

                    <div>
                      {currentRide.status === 'PUBLISHED' && (
                        <span className="text-xs font-extrabold px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-800 flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
                          Available
                        </span>
                      )}
                      {currentRide.status === 'FULL_CAR_BOOKED' && (
                        <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-purple-100 text-purple-800">
                          Full Car Booked
                        </span>
                      )}
                      {currentRide.status === 'SEATS_FILLED' && (
                        <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-amber-100 text-amber-800">
                          All Seats Filled
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Cultural & Travel Comfort Badges */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {currentRide.isReturnDeal && (
                      <span className="text-[10px] bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full font-black flex items-center gap-1 border border-rose-200">
                        <span>🏷️</span>
                        <span>Khali Wapsi Deal (Special Discount)</span>
                      </span>
                    )}
                    {currentRide.travelComfort?.familyOnboard && (
                      <span className="text-[10px] bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded-full font-black flex items-center gap-1 border border-emerald-300">
                        <span>👨‍👩‍👧</span>
                        <span>Family Onboard (Gharana Safar)</span>
                      </span>
                    )}
                    {currentRide.travelComfort?.ladiesOnlySeats && (
                      <span className="text-[10px] bg-purple-100 text-purple-900 px-2 py-0.5 rounded-full font-black flex items-center gap-1 border border-purple-200">
                        <span>🧕</span>
                        <span>Ladies Modesty Reserved</span>
                      </span>
                    )}
                    {currentRide.travelComfort?.acType === 'CHILLED_AC' && (
                      <span className="text-[10px] bg-cyan-100 text-cyan-900 px-2 py-0.5 rounded-full font-bold flex items-center gap-1 border border-cyan-200">
                        <span>❄️</span>
                        <span>Chilled AC</span>
                      </span>
                    )}
                    {currentRide.travelComfort?.maxInBack === 2 && (
                      <span className="text-[10px] bg-blue-100 text-blue-900 px-2 py-0.5 rounded-full font-bold flex items-center gap-1 border border-blue-200">
                        <span>🛋️</span>
                        <span>Max 2 in Back</span>
                      </span>
                    )}
                    {currentRide.travelComfort?.namazBreak && (
                      <span className="text-[10px] bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full font-bold flex items-center gap-1 border border-amber-200">
                        <span>🕌</span>
                        <span>15-Min Namaz &amp; Chai Break</span>
                      </span>
                    )}
                    {currentRide.travelComfort?.tollsIncluded && (
                      <span className="text-[10px] bg-slate-100 text-slate-800 px-2 py-0.5 rounded-full font-bold flex items-center gap-1 border border-slate-200">
                        <span>✅</span>
                        <span>Toll Plaza Included</span>
                      </span>
                    )}
                    {currentRide.travelComfort?.luggageCapacity === 'FULL_TRUNK' && (
                      <span className="text-[10px] bg-teal-100 text-teal-900 px-2 py-0.5 rounded-full font-bold flex items-center gap-1 border border-teal-200">
                        <span>🧳</span>
                        <span>Full Clean Trunk (No CNG Cylinder)</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Free Capacity Banner */}
                <div className="px-4 py-2 bg-slate-50 flex items-center justify-between border-b border-slate-100 text-xs">
                  <span className="text-slate-600 font-medium">Free Capacity:</span>
                  <span
                    className={`font-black text-sm ${
                      availableSeats > 0 ? 'text-emerald-700' : 'text-rose-600'
                    }`}
                  >
                    {availableSeats} of {currentRide.capacity} seats remaining
                  </span>
                </div>

                {/* Booking Options */}
                {currentRide.status === 'PUBLISHED' ? (
                  <form onSubmit={handleCreateRequest} className="p-4 space-y-4">
                    <div>
                      <span className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                        Select How You Want to Ride
                      </span>

                      <div className="grid grid-cols-1 gap-2.5">
                        {/* Whole Car Option */}
                        {currentRide.bookingMode !== 'SEATS' && (
                          <div className="space-y-2">
                            <label
                              className={`p-3.5 rounded-2xl border-2 cursor-pointer transition flex items-center justify-between ${
                                bookingType === 'WHOLE_CAR'
                                  ? 'border-emerald-600 bg-emerald-50/70 shadow-sm'
                                  : 'border-slate-200 hover:border-slate-300 bg-white'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <input
                                  type="radio"
                                  name="bookingType"
                                  value="WHOLE_CAR"
                                  checked={bookingType === 'WHOLE_CAR'}
                                  onChange={() => setBookingType('WHOLE_CAR')}
                                  className="w-5 h-5 accent-emerald-600"
                                />
                                <div>
                                  <div className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
                                    <span>🚗</span>
                                    <span>Entire Car (Poori Gaari)</span>
                                  </div>
                                  <p className="text-[11px] text-slate-500 mt-0.5">
                                    Private vehicle exclusively for you and your family.
                                  </p>
                                </div>
                              </div>

                              <div className="text-right">
                                <span className="block text-sm font-black text-emerald-800">
                                  Rs. {activeWholeCarPrice.toLocaleString()}
                                </span>
                                <span className="text-[10px] text-slate-500 font-semibold">One-Way Fare</span>
                              </div>
                            </label>

                            {/* ROUND TRIP TOGGLE & CONTROLS FOR ENTIRE CAR */}
                            {bookingType === 'WHOLE_CAR' && (
                              <div className="p-3.5 bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-300 rounded-2xl space-y-3 shadow-xs">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-black text-emerald-950 flex items-center gap-1.5">
                                    <span>🔄</span>
                                    <span>Need Return with Same Driver? (Wapsi Safar)</span>
                                  </span>
                                  <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={isWholeCarRoundTrip}
                                      onChange={(e) => setIsWholeCarRoundTrip(e.target.checked)}
                                      className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                                  </label>
                                </div>

                                {isWholeCarRoundTrip && (
                                  <div className="space-y-3 pt-1 border-t border-emerald-200">
                                    {/* Round trip package savings pill */}
                                    <div className="bg-emerald-700 text-white p-2.5 rounded-xl text-xs font-bold flex items-center justify-between shadow-xs">
                                      <span className="flex items-center gap-1">
                                        <span>🏷️</span>
                                        <span>Round-Trip Package Deal</span>
                                      </span>
                                      <span className="bg-emerald-950/60 px-2 py-0.5 rounded-md text-[11px] font-black text-amber-300">
                                        Total: Rs. {roundTripWholePrice.toLocaleString()} (Saves Rs. {(activeWholeCarPrice * 2 - roundTripWholePrice).toLocaleString()}!)
                                      </span>
                                    </div>

                                    {/* Same Day Wait vs Multi-Day */}
                                    <div>
                                      <span className="block text-[11px] font-bold text-slate-700 mb-1.5">
                                        Select Return Schedule:
                                      </span>
                                      <div className="grid grid-cols-2 gap-2">
                                        <button
                                          type="button"
                                          onClick={() => setRoundTripType('SAME_DAY_WAIT')}
                                          className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                                            roundTripType === 'SAME_DAY_WAIT'
                                              ? 'bg-emerald-700 text-white border-emerald-700 font-extrabold shadow-xs'
                                              : 'bg-white text-slate-800 border-emerald-200 font-semibold hover:bg-emerald-50'
                                          }`}
                                        >
                                          <span className="text-xs block">🕒 Same-Day Return</span>
                                          <span className="text-[10px] opacity-80 block mt-0.5">
                                            Driver waits for you (Hospital / Work / Shopping)
                                          </span>
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() => setRoundTripType('MULTI_DAY')}
                                          className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                                            roundTripType === 'MULTI_DAY'
                                              ? 'bg-emerald-700 text-white border-emerald-700 font-extrabold shadow-xs'
                                              : 'bg-white text-slate-800 border-emerald-200 font-semibold hover:bg-emerald-50'
                                          }`}
                                        >
                                          <span className="text-xs block">📅 Later Date Return</span>
                                          <span className="text-[10px] opacity-80 block mt-0.5">
                                            Return on a scheduled future date
                                          </span>
                                        </button>
                                      </div>
                                    </div>

                                    {/* Date & Time fields */}
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <label className="block text-[10px] font-bold text-slate-600 mb-1">
                                          Return Date:
                                        </label>
                                        <input
                                          type="date"
                                          value={returnTripDate}
                                          onChange={(e) => setReturnTripDate(e.target.value)}
                                          className="w-full bg-white border border-emerald-300 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-900"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-[10px] font-bold text-slate-600 mb-1">
                                          Expected Return Time:
                                        </label>
                                        <input
                                          type="text"
                                          value={returnTripTime}
                                          onChange={(e) => setReturnTripTime(e.target.value)}
                                          placeholder="06:00 PM"
                                          className="w-full bg-white border border-emerald-300 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-900"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Individual Seats Option */}
                        {currentRide.bookingMode !== 'WHOLE_CAR' && (
                          <label
                            className={`p-3.5 rounded-2xl border-2 cursor-pointer transition flex items-center justify-between ${
                              bookingType === 'SEAT'
                                ? 'border-emerald-600 bg-emerald-50/70 shadow-sm'
                                : 'border-slate-200 hover:border-slate-300 bg-white'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <input
                                type="radio"
                                name="bookingType"
                                value="SEAT"
                                checked={bookingType === 'SEAT'}
                                onChange={() => setBookingType('SEAT')}
                                className="w-5 h-5 accent-emerald-600"
                              />
                              <div>
                                <div className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
                                  <span>💺</span>
                                  <span>Single Seat(s) (Ek Ek Seat)</span>
                                </div>
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                  Share journey with others. Pay per seat.
                                </p>
                              </div>
                            </div>

                            <div className="text-right">
                              <span className="block text-sm font-black text-emerald-800">
                                Rs. {activeSeatUnitPrice.toLocaleString()}
                              </span>
                              <span className="text-[10px] text-slate-500 font-semibold">Per Seat</span>
                            </div>
                          </label>
                        )}
                      </div>

                      {/* Seat Count Stepper (Only for Seat Bookings) */}
                      {bookingType === 'SEAT' && (
                        <div className="pt-2">
                          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
                            <div>
                              <span className="text-xs font-black text-slate-800 block">How many seats do you need?</span>
                              <span className="text-[10px] text-slate-500">Max {availableSeats} seats available</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => setSeatsRequested((s) => Math.max(1, s - 1))}
                                className="w-9 h-9 rounded-xl bg-white border border-slate-300 font-black text-lg text-slate-700 hover:bg-slate-100 flex items-center justify-center shadow-xs cursor-pointer"
                              >
                                -
                              </button>
                              <span className="font-black text-lg w-5 text-center text-slate-900">
                                {seatsRequested}
                              </span>
                              <button
                                type="button"
                                onClick={() => setSeatsRequested((s) => Math.min(availableSeats, s + 1))}
                                className="w-9 h-9 rounded-xl bg-white border border-slate-300 font-black text-lg text-slate-700 hover:bg-slate-100 flex items-center justify-center shadow-xs cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Clickable Intermediate Route Drop-Off Cities (FOR BOTH FULL CAR AND SEATS) */}
                      <div className="pt-3">
                        <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                              <span>📍</span>
                              <span>Drop-Off City (Between {originName} and {destName}):</span>
                            </span>
                            <span className="text-[10px] text-emerald-800 font-bold bg-emerald-100/90 px-2 py-0.5 rounded-full">
                              Click City to Apply Lower Fare
                            </span>
                          </div>

                          <p className="text-[11px] text-slate-500 leading-normal">
                            Getting off before {destName}? <strong>Click any city along the corridor</strong>. The price adjusts proportionally for <strong>both Entire Car and Single Seats</strong>:
                          </p>

                          {/* Known Corridor Cities (Clickable Cards) */}
                          {currentRide.routeStops && currentRide.routeStops.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                              {currentRide.routeStops.map((stop) => {
                                const isSelected = effectiveDropoffStop === stop.name;
                                const stopWholeCarPrice =
                                  stop.wholeCarPrice ||
                                  Math.round((stop.seatPrice / (currentRide.seatPrice || 1)) * currentRide.wholeCarPrice);
                                const stopSeatPrice = stop.seatPrice;

                                return (
                                  <button
                                    type="button"
                                    key={stop.id}
                                    onClick={() => setSelectedDropoffStop(stop.name)}
                                    className={`p-3 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                                      isSelected
                                        ? 'border-emerald-600 bg-emerald-50/90 shadow-xs ring-2 ring-emerald-500/20'
                                        : 'border-slate-200 bg-white hover:border-emerald-300 hover:bg-slate-50/70'
                                    }`}
                                  >
                                    <div className="flex items-start justify-between gap-1 mb-1.5">
                                      <div className="flex items-center gap-1.5">
                                        <span
                                          className={`w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 ${
                                            isSelected
                                              ? 'bg-emerald-600 ring-2 ring-emerald-200'
                                              : 'border border-slate-400'
                                          }`}
                                        >
                                          {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white"></span>}
                                        </span>
                                        <span className="text-xs font-bold text-slate-900 leading-snug">
                                          {stop.name}
                                        </span>
                                      </div>
                                      {stop.distanceKm && (
                                        <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                                          {stop.distanceKm} km
                                        </span>
                                      )}
                                    </div>

                                    <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-slate-100">
                                      <span className="text-slate-500 text-[10px]">
                                        {bookingType === 'WHOLE_CAR' ? 'Entire Car' : 'Per Seat'}:
                                      </span>
                                      <span className="font-black text-emerald-800">
                                        Rs. {bookingType === 'WHOLE_CAR'
                                          ? stopWholeCarPrice.toLocaleString()
                                          : stopSeatPrice.toLocaleString()}
                                      </span>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {/* Custom Highway Stop Input */}
                          <div className="pt-2 border-t border-slate-200/80">
                            <label className="flex items-center gap-2 cursor-pointer mb-1.5">
                              <input
                                type="radio"
                                name="dropoffOption"
                                checked={effectiveDropoffStop === 'CUSTOM'}
                                onChange={() => setSelectedDropoffStop('CUSTOM')}
                                className="w-4 h-4 accent-emerald-600"
                              />
                              <span className="text-xs font-bold text-slate-800">
                                ✍️ Another Town or Interchange on Route:
                              </span>
                            </label>

                            {effectiveDropoffStop === 'CUSTOM' && (
                              <div className="space-y-1.5 pt-1">
                                <input
                                  type="text"
                                  value={customDropoffStop}
                                  onChange={(e) => setCustomDropoffStop(e.target.value)}
                                  placeholder="e.g. Tando Allahyar, Digri, Jhudo, Kotri, Thatta Toll..."
                                  autoFocus
                                  className="w-full bg-white border-2 border-emerald-500 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 placeholder-slate-400 focus:outline-none shadow-xs"
                                />
                                <p className="text-[10px] text-slate-500">
                                  Type your exact stop along the corridor so the captain knows where to drop you.
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Segment Summary & Direct Cash Guarantee */}
                    <div className="p-3.5 bg-emerald-50/90 rounded-2xl border border-emerald-200 space-y-1.5 text-emerald-950">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold flex items-center gap-1.5">
                          <span>🛣️</span> Journey Segment:
                        </span>
                        <span className="font-extrabold text-emerald-900 text-right">
                          {originName} ➔{' '}
                          {effectiveDropoffStop === 'CUSTOM'
                            ? customDropoffStop || `${destName} (En Route)`
                            : effectiveDropoffStop}{' '}
                          <span className="text-slate-600 font-semibold">
                            ({bookingType === 'WHOLE_CAR' ? (isWholeCarRoundTrip ? 'Entire Car • Round-Trip' : 'Entire Car • One-Way') : `${seatsRequested} Seat(s)`})
                          </span>
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs pt-1.5 border-t border-emerald-200">
                        <span className="font-bold flex items-center gap-1.5">
                          <span>💵</span> Cash Due to Driver on Boarding:
                        </span>
                        <span className="font-black text-emerald-800 text-base">
                          Rs. {currentPrice.toLocaleString()}{' '}
                          {bookingType === 'SEAT' && (
                            <span className="text-[11px] font-normal text-slate-600">
                              ({seatsRequested} seat{seatsRequested > 1 ? 's' : ''} @ Rs. {activeSeatUnitPrice.toLocaleString()})
                            </span>
                          )}
                          {bookingType === 'WHOLE_CAR' && isWholeCarRoundTrip && (
                            <span className="text-[11px] font-black text-emerald-700 block">
                              (Round-Trip Package • Same Driver)
                            </span>
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Submit Button */}
                    <button
                      type="submit"
                      disabled={availableSeats <= 0}
                      className="w-full bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 text-white font-black py-4 px-4 rounded-2xl shadow-md transition text-sm flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <span>
                        Send Booking Request (Rs. {currentPrice.toLocaleString()})
                      </span>
                      <span>➔</span>
                    </button>
                  </form>
                ) : (
                  <div className="p-6 text-center text-slate-500 bg-slate-50">
                    <p className="text-sm font-bold text-slate-700">This ride is currently unavailable</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 text-center space-y-3">
                <span className="text-3xl block">🔍</span>
                <h3 className="text-sm font-extrabold text-slate-900">
                  No direct ride found between {originName} and {destName}
                </h3>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  Browse all active nationwide rides, or post your ride request on the Sawari Board.
                </p>
                <div className="flex justify-center gap-2">
                  <button
                    onClick={() => setShowQuickRouteModal(true)}
                    className="bg-emerald-700 text-white font-bold text-xs py-2 px-4 rounded-xl transition cursor-pointer"
                  >
                    Change Route
                  </button>
                  <button
                    onClick={() => setActiveTab('sawari_board')}
                    className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-black text-xs py-2 px-4 rounded-xl transition cursor-pointer"
                  >
                    📢 Post on Sawari Board
                  </button>
                </div>
              </div>
            )}

            {/* Passenger My Bookings */}
            {bookings.length > 0 && (
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 space-y-3">
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                  <span>📋</span>
                  <span>My Booking Requests ({bookings.length})</span>
                </h3>

                <div className="space-y-2.5">
                  {bookings.map((b) => (
                    <div
                      key={b.id}
                      className={`p-3.5 rounded-xl border transition ${
                        b.status === 'ACCEPTED'
                          ? 'bg-emerald-50/80 border-emerald-300'
                          : b.status === 'PENDING'
                          ? 'bg-amber-50/80 border-amber-300'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-slate-900">
                            {b.bookingType === 'WHOLE_CAR'
                              ? b.isRoundTrip
                                ? '🚗 Full Car • Round-Trip'
                                : '🚗 Full Car Booking'
                              : `💺 ${b.requestedSeats} Seat(s)`}
                          </span>
                          {b.isRoundTrip && (
                            <span className="text-[10px] bg-amber-100 text-amber-900 font-bold px-1.5 py-0.2 rounded">
                              🔄 Return Journey Included
                            </span>
                          )}
                        </div>

                        <span
                          className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${
                            b.status === 'ACCEPTED'
                              ? 'bg-emerald-600 text-white'
                              : b.status === 'PENDING'
                              ? 'bg-amber-600 text-white'
                              : 'bg-rose-600 text-white'
                          }`}
                        >
                          {b.status === 'ACCEPTED' ? 'Confirmed' : b.status === 'PENDING' ? 'Waiting Driver' : b.status}
                        </span>
                      </div>

                      <div className="text-xs text-slate-600 mt-1 flex justify-between">
                        <span>Total: Rs. {b.totalPrice.toLocaleString()} (Cash)</span>
                        <span className="text-[10px] text-slate-400">ID: {b.id}</span>
                      </div>

                      {b.dropoffStopName && (
                        <div className="text-[11px] text-emerald-900 font-bold mt-1.5 bg-emerald-100/70 px-2 py-0.5 rounded-lg inline-flex items-center gap-1 border border-emerald-200">
                          <span>📍</span>
                          <span>Drop-off Destination: {b.dropoffStopName}</span>
                        </div>
                      )}

                      {/* In-App Protection & Boarding Checkpoint */}
                      {b.status === 'ACCEPTED' && (
                        <div className="mt-2.5 pt-2 border-t border-emerald-200 space-y-2">
                          <div className="bg-emerald-50 text-emerald-950 p-2.5 rounded-xl border border-emerald-300 text-xs flex items-start gap-2">
                            <span className="text-base">🛡️</span>
                            <div>
                              <div className="font-extrabold text-[11px] uppercase tracking-wide text-emerald-900">
                                Apni Sawari In-App Trip Protection Active
                              </div>
                              <p className="text-[11px] text-emerald-800 mt-0.5 leading-relaxed">
                                All trip coordination is protected inside Apni Sawari to secure your fare and reliability score. External contact numbers are masked for passenger &amp; driver safety.
                              </p>
                            </div>
                          </div>

                          <div className="bg-white p-2.5 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-700 flex items-center gap-1.5">
                              <span>📍</span> Boarding Checkpoint:
                            </span>
                            <span className="font-extrabold text-slate-900">Designated Terminal Hub</span>
                          </div>

                          <div className="bg-emerald-100/60 p-2.5 rounded-xl border border-emerald-200 flex items-center justify-between text-xs">
                            <span className="font-bold text-emerald-900 flex items-center gap-1.5">
                              <span>💵</span> Cash Due on Boarding:
                            </span>
                            <span className="font-extrabold text-emerald-800 text-sm">
                              Rs. {b.totalPrice.toLocaleString()} (Direct to Driver)
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: ALL RIDE LISTINGS (SHARED FOR BOTH DRIVER & USER) */}
        {/* ========================================================================= */}
        {activeTab === 'all_listings' && (
          <div className="space-y-4">
            {/* Filter Panel */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                  <span>🔍</span>
                  <span>Browse All Nationwide Listings</span>
                </h3>
                <button
                  onClick={() => {
                    setFilterOrigin('ALL');
                    setFilterDest('ALL');
                    setFilterTime('ALL');
                    setFilterMode('ALL');
                    setAllRidesFilterTag('ALL');
                  }}
                  className="text-[11px] text-emerald-700 font-bold hover:underline"
                >
                  Clear Filters
                </button>
              </div>

              {/* Cultural & Trust Filter Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
                <button
                  type="button"
                  onClick={() => setAllRidesFilterTag('ALL')}
                  className={`px-3 py-1.5 rounded-full font-bold whitespace-nowrap transition cursor-pointer ${
                    allRidesFilterTag === 'ALL'
                      ? 'bg-emerald-800 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  All Rides ({rides.length})
                </button>
                <button
                  type="button"
                  onClick={() => setAllRidesFilterTag('KHALI_WAPSI')}
                  className={`px-3 py-1.5 rounded-full font-bold whitespace-nowrap transition cursor-pointer ${
                    allRidesFilterTag === 'KHALI_WAPSI'
                      ? 'bg-rose-700 text-white shadow-xs'
                      : 'bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100'
                  }`}
                >
                  🏷️ Khali Wapsi Deals
                </button>
                <button
                  type="button"
                  onClick={() => setAllRidesFilterTag('FAMILY')}
                  className={`px-3 py-1.5 rounded-full font-bold whitespace-nowrap transition cursor-pointer ${
                    allRidesFilterTag === 'FAMILY'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'bg-emerald-50 text-emerald-900 border border-emerald-200 hover:bg-emerald-100'
                  }`}
                >
                  👨‍👩‍👧 Family Onboard
                </button>
                <button
                  type="button"
                  onClick={() => setAllRidesFilterTag('MAX_2_BACK')}
                  className={`px-3 py-1.5 rounded-full font-bold whitespace-nowrap transition cursor-pointer ${
                    allRidesFilterTag === 'MAX_2_BACK'
                      ? 'bg-blue-700 text-white shadow-xs'
                      : 'bg-blue-50 text-blue-900 border border-blue-200 hover:bg-blue-100'
                  }`}
                >
                  🛋️ Max 2 in Back
                </button>
                <button
                  type="button"
                  onClick={() => setAllRidesFilterTag('LADIES_ONLY')}
                  className={`px-3 py-1.5 rounded-full font-bold whitespace-nowrap transition cursor-pointer ${
                    allRidesFilterTag === 'LADIES_ONLY'
                      ? 'bg-purple-700 text-white shadow-xs'
                      : 'bg-purple-50 text-purple-900 border border-purple-200 hover:bg-purple-100'
                  }`}
                >
                  🧕 Ladies Only
                </button>
              </div>

              {/* City Filters */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">Departure City</label>
                  <select
                    value={filterOrigin}
                    onChange={(e) => setFilterOrigin(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="ALL">All Cities</option>
                    {NATIONWIDE_CITIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">Arrival City</label>
                  <select
                    value={filterDest}
                    onChange={(e) => setFilterDest(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="ALL">All Cities</option>
                    {NATIONWIDE_CITIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Time & Mode Filters */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">Time of Day</label>
                  <select
                    value={filterTime}
                    onChange={(e) => setFilterTime(e.target.value as 'ALL' | 'MORNING' | 'AFTERNOON' | 'EVENING')}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="ALL">Any Time</option>
                    <option value="MORNING">Morning (06:00 - 12:00)</option>
                    <option value="AFTERNOON">Afternoon (12:00 - 18:00)</option>
                    <option value="EVENING">Evening / Night (18:00+)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">Booking Mode</label>
                  <select
                    value={filterMode}
                    onChange={(e) => setFilterMode(e.target.value as 'ALL' | 'WHOLE_CAR' | 'SEATS')}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="ALL">All (Full Car or Seats)</option>
                    <option value="WHOLE_CAR">Whole Car Available</option>
                    <option value="SEATS">Single Seats Available</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Listings Stream */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-500 font-bold px-1">
                <span>Showing {filteredAllRides.length} Journey(s)</span>
                <span>All Across Pakistan</span>
              </div>

              {filteredAllRides.map((rideItem) => {
                const oCity = NATIONWIDE_CITIES.find((c) => c.id === rideItem.originLocationId)?.name || 'Origin';
                const dCity = NATIONWIDE_CITIES.find((c) => c.id === rideItem.destinationLocationId)?.name || 'Destination';
                const rBookings = bookings.filter((b) => b.rideId === rideItem.id);
                const freeSeats = calculateAvailableSeats(rideItem, rBookings);
                const timeFormatted = new Date(rideItem.departureTime).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true,
                });

                return (
                  <div
                    key={rideItem.id}
                    className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 hover:border-emerald-300 transition space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-black text-slate-900">{oCity}</span>
                        <span className="text-emerald-700 font-bold">➔</span>
                        <span className="text-base font-black text-slate-900">{dCity}</span>
                      </div>

                      <span
                        className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${
                          rideItem.status === 'PUBLISHED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-purple-100 text-purple-800'
                        }`}
                      >
                        {rideItem.status === 'PUBLISHED' ? `${freeSeats} Seats Free` : rideItem.status}
                      </span>
                    </div>

                    {/* Cultural & Trust Badges Row */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {rideItem.isReturnDeal && (
                        <span className="text-[10px] bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded-md border border-rose-200">
                          🏷️ Khali Wapsi Deal
                        </span>
                      )}
                      {rideItem.travelComfort?.familyOnboard && (
                        <span className="text-[10px] bg-emerald-100 text-emerald-900 font-bold px-2 py-0.5 rounded-md border border-emerald-200">
                          👨‍👩‍👧 Family Onboard
                        </span>
                      )}
                      {rideItem.travelComfort?.ladiesOnlySeats && (
                        <span className="text-[10px] bg-purple-100 text-purple-900 font-bold px-2 py-0.5 rounded-md border border-purple-200">
                          🧕 Ladies Only
                        </span>
                      )}
                      {rideItem.travelComfort?.acType === 'CHILLED_AC' && (
                        <span className="text-[10px] bg-cyan-100 text-cyan-900 font-semibold px-2 py-0.5 rounded-md">
                          ❄️ Chilled AC
                        </span>
                      )}
                      {rideItem.travelComfort?.maxInBack === 2 && (
                        <span className="text-[10px] bg-blue-100 text-blue-900 font-semibold px-2 py-0.5 rounded-md">
                          🛋️ Max 2 in Back
                        </span>
                      )}
                      {rideItem.travelComfort?.namazBreak && (
                        <span className="text-[10px] bg-amber-100 text-amber-900 font-semibold px-2 py-0.5 rounded-md">
                          🕌 Namaz Break
                        </span>
                      )}
                      {rideItem.roundTripAllowed && (
                        <span className="text-[10px] bg-teal-100 text-teal-900 font-bold px-2 py-0.5 rounded-md border border-teal-200">
                          🔄 Round-Trip Available
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500 border-y border-slate-100 py-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-800">{getDriverDisplayName(rideItem.driverId)}</span>
                          {rideItem.driverTier === 'TOP_RATED_DRIVER' && (
                            <span className="text-[10px] bg-amber-100 text-amber-800 px-1 py-0.2 rounded font-black">⭐ 4.9</span>
                          )}
                        </div>
                        <span className="block text-[11px] text-slate-400">Departure: {timeFormatted}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[11px] bg-slate-100 px-2 py-0.5 rounded-full font-semibold text-slate-600">
                          {rideItem.bookingMode === 'WHOLE_CAR'
                            ? '🚗 Full Car Only'
                            : rideItem.bookingMode === 'SEATS'
                            ? '💺 Seats Only'
                            : '🚗 Full Car or 💺 Seats'}
                        </span>
                      </div>
                    </div>

                    {rideItem.routeStops && rideItem.routeStops.length > 0 && (
                      <div className="py-1.5 text-[11px] text-slate-500 flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-slate-600">Stops:</span>
                        {rideItem.routeStops.slice(0, 3).map((st) => (
                          <span key={st.id} className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded-md text-[10px] font-semibold">
                            {st.name} (Rs. {st.seatPrice.toLocaleString()})
                          </span>
                        ))}
                        {rideItem.routeStops.length > 3 && (
                          <span className="text-[10px] text-slate-400">+{rideItem.routeStops.length - 3} more</span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1">
                      <div>
                        {rideItem.seatPrice && (
                          <span className="text-xs text-slate-500 font-medium block">
                            Per Seat: Rs. {rideItem.seatPrice.toLocaleString()}
                          </span>
                        )}
                        <span className="text-sm font-black text-emerald-800">
                          Full Car: Rs. {rideItem.wholeCarPrice.toLocaleString()}
                        </span>
                        {rideItem.roundTripAllowed && rideItem.roundTripWholeCarPrice && (
                          <span className="text-[10px] font-black text-teal-700 block">
                            Round-Trip Package: Rs. {rideItem.roundTripWholeCarPrice.toLocaleString()}
                          </span>
                        )}
                      </div>

                      {/* Select Action */}
                      <button
                        onClick={() => {
                          setSelectedRideId(rideItem.id);
                          setSearchOrigin(rideItem.originLocationId);
                          setSearchDest(rideItem.destinationLocationId);
                          setActiveTab('passenger');
                          setNotification({
                            type: 'info',
                            title: 'Ride Selected',
                            message: `Selected ${oCity} ➔ ${dCity}. Choose Full Car or Seats below.`,
                          });
                        }}
                        className="bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs py-2 px-3.5 rounded-xl transition shadow-xs flex items-center gap-1 cursor-pointer"
                      >
                        <span>Book This</span>
                        <span>➔</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: SAWARI REQUEST BOARD (سواری بورڈ) - REVERSE MARKETPLACE */}
        {/* ========================================================================= */}
        {activeTab === 'sawari_board' && (
          <div className="space-y-4">
            {/* Board Intro Header & Post CTA */}
            <div className="bg-gradient-to-br from-emerald-800 to-teal-900 text-white p-5 rounded-3xl shadow-md space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">📢</span>
                    <h2 className="text-lg font-black tracking-tight">Sawari Request Board</h2>
                  </div>
                  <p className="text-xs text-emerald-200 mt-0.5">
                    سواری بورڈ • مسافر اپنی ضرورت بتائیں، ڈرائیور رابطہ کریں
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowPostRequestModal(true)}
                  className="bg-amber-400 hover:bg-amber-300 text-slate-900 font-black text-xs py-2.5 px-3.5 rounded-2xl shadow-sm transition flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <span>➕</span>
                  <span>Post Sawari Request</span>
                </button>
              </div>

              <p className="text-xs text-emerald-100/90 leading-relaxed">
                Can&apos;t find a matching ride? <strong>Post where you need to travel</strong>. Verified drivers heading that way will submit competitive offers or accept at your budget fare.
              </p>

              {/* City & Type Filter Pills */}
              <div className="pt-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                <button
                  type="button"
                  onClick={() => setSawariFilterCity('ALL')}
                  className={`px-3 py-1.5 rounded-xl font-bold text-xs whitespace-nowrap transition cursor-pointer ${
                    sawariFilterCity === 'ALL'
                      ? 'bg-white text-emerald-950 font-black'
                      : 'bg-emerald-950/60 text-emerald-200 hover:bg-emerald-950'
                  }`}
                >
                  All Pakistan ({passengerRequests.length})
                </button>

                {currentUser?.city && (
                  <button
                    type="button"
                    onClick={() => setSawariFilterCity(currentUser.city || '')}
                    className={`px-3 py-1.5 rounded-xl font-bold text-xs whitespace-nowrap transition cursor-pointer ${
                      sawariFilterCity === currentUser.city
                        ? 'bg-white text-emerald-950 font-black'
                        : 'bg-emerald-950/60 text-emerald-200 hover:bg-emerald-950'
                    }`}
                  >
                    🟢 Near You ({currentUser.city})
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setSawariFilterType(sawariFilterType === 'WHOLE_CAR' ? 'ALL' : 'WHOLE_CAR')}
                  className={`px-3 py-1.5 rounded-xl font-bold text-xs whitespace-nowrap transition cursor-pointer ${
                    sawariFilterType === 'WHOLE_CAR'
                      ? 'bg-white text-emerald-950 font-black'
                      : 'bg-emerald-950/60 text-emerald-200 hover:bg-emerald-950'
                  }`}
                >
                  🚗 Full Car Only
                </button>

                <button
                  type="button"
                  onClick={() => setSawariFilterType(sawariFilterType === 'SEAT' ? 'ALL' : 'SEAT')}
                  className={`px-3 py-1.5 rounded-xl font-bold text-xs whitespace-nowrap transition cursor-pointer ${
                    sawariFilterType === 'SEAT'
                      ? 'bg-white text-emerald-950 font-black'
                      : 'bg-emerald-950/60 text-emerald-200 hover:bg-emerald-950'
                  }`}
                >
                  💺 Seats Only
                </button>
              </div>
            </div>

            {/* Stream of Passenger Requests */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-500 font-bold px-1">
                <span>Active Sawari Darkhwast ({filteredPassengerRequests.length})</span>
                <span>Open for Driver Offers</span>
              </div>

              {filteredPassengerRequests.length === 0 ? (
                <div className="bg-white p-8 rounded-3xl border border-slate-200 text-center space-y-3">
                  <span className="text-4xl block">📬</span>
                  <h4 className="text-sm font-extrabold text-slate-800">No requests found for this filter</h4>
                  <p className="text-xs text-slate-500 max-w-xs mx-auto">
                    Be the first to post a request or clear your filters to view requests from other cities.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowPostRequestModal(true)}
                    className="bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs py-2.5 px-4 rounded-xl transition cursor-pointer"
                  >
                    Post a Ride Request Now
                  </button>
                </div>
              ) : (
                filteredPassengerRequests.map((req) => {
                  const isOwner = currentUser?.id === req.passengerId;
                  const isDriver = currentUser?.role === 'DRIVER';

                  return (
                    <div
                      key={req.id}
                      className={`bg-white rounded-3xl p-5 border transition shadow-sm space-y-3.5 ${
                        req.status === 'ACCEPTED'
                          ? 'border-emerald-300 bg-emerald-50/40'
                          : 'border-slate-200 hover:border-emerald-300'
                      }`}
                    >
                      {/* Route & Status */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-base font-black text-slate-900">{req.originName}</span>
                          <span className="text-emerald-700 font-bold">➔</span>
                          <span className="text-base font-black text-slate-900">{req.destinationName}</span>
                        </div>

                        <span
                          className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase ${
                            req.status === 'ACCEPTED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {req.status === 'ACCEPTED' ? '✓ Driver Confirmed' : '🟢 Open for Offers'}
                        </span>
                      </div>

                      {/* Travel Date & Preference Tags */}
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                        <span className="bg-slate-100 text-slate-800 font-bold px-2 py-0.5 rounded-lg text-[11px] flex items-center gap-1">
                          <span>📅</span>
                          <span>{req.travelDate} ({req.desiredTime})</span>
                        </span>

                        <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold px-2 py-0.5 rounded-lg text-[11px]">
                          {req.bookingType === 'WHOLE_CAR' ? '🚗 Full Car Required' : `💺 ${req.seatsCount} Seat(s)`}
                        </span>

                        {req.isFamilyTrip && (
                          <span className="bg-purple-50 text-purple-800 border border-purple-200 font-bold px-2 py-0.5 rounded-lg text-[11px] flex items-center gap-1">
                            <span>👨‍👩‍👧</span>
                            <span>Family Trip (Gharana Safar)</span>
                          </span>
                        )}

                        {req.acRequired && (
                          <span className="bg-cyan-50 text-cyan-800 border border-cyan-200 font-bold px-2 py-0.5 rounded-lg text-[11px] flex items-center gap-1">
                            <span>❄️</span>
                            <span>AC Required</span>
                          </span>
                        )}

                        {req.isRoundTrip && (
                          <span className="bg-amber-50 text-amber-900 border border-amber-200 font-bold px-2 py-0.5 rounded-lg text-[11px] flex items-center gap-1">
                            <span>🔄</span>
                            <span>Round-Trip Wapsi Needed</span>
                          </span>
                        )}

                        <span className="bg-slate-50 text-slate-700 border border-slate-200 font-bold px-2 py-0.5 rounded-lg text-[11px] flex items-center gap-1">
                          <span>🧳</span>
                          <span>
                            {req.luggageSize === 'FULL_TRUNK'
                              ? 'Full Trunk'
                              : req.luggageSize === 'MEDIUM_SUITCASE'
                              ? '1 Suitcase'
                              : 'Cabin Only'}
                          </span>
                        </span>
                      </div>

                      {/* Requester Info & Special Instructions */}
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 text-xs text-slate-600 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-slate-800 flex items-center gap-1.5">
                            <span>🙋‍♂️</span>
                            <span>{req.passengerName}</span>
                          </span>
                          <span className="text-[10px] text-slate-400">
                            Req #{req.id.slice(-6)}
                          </span>
                        </div>
                        {req.notes && (
                          <p className="text-slate-600 italic text-[11px] pt-0.5">
                            &quot;{req.notes}&quot;
                          </p>
                        )}
                      </div>

                      {/* Budget and Actions Bar */}
                      <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                        <div>
                          <span className="block text-[10px] font-bold text-slate-400 uppercase">
                            Passenger Budget:
                          </span>
                          <span className="text-base font-black text-emerald-800">
                            Rs. {req.budgetPrice.toLocaleString()}
                          </span>
                          <span className="text-[10px] text-slate-500 font-medium ml-1">
                            (Direct Cash)
                          </span>
                        </div>

                        {/* Driver Action Buttons */}
                        {isDriver && req.status === 'OPEN' && (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const defaultOffer: DriverOffer = {
                                  id: generateClientUniqueId('off'),
                                  driverId: currentUser.id,
                                  driverName: currentUser.name,
                                  driverPhone: currentUser.phone,
                                  driverRating: 4.9,
                                  driverTier: 'TOP_RATED_DRIVER',
                                  vehicleMakeModel: currentUser.vehicle?.makeModel || 'Toyota Corolla GLi',
                                  vehiclePlate: currentUser.vehicle?.plate || 'LEB-4592',
                                  offeredPrice: req.budgetPrice,
                                  message: 'Accepted at your budget. Clean AC car ready for family.',
                                  createdAt: new Date().toISOString(),
                                };
                                setPassengerRequests((prev) =>
                                  prev.map((r) =>
                                    r.id === req.id ? { ...r, offers: [...r.offers, defaultOffer] } : r
                                  )
                                );
                                setNotification({
                                  type: 'success',
                                  title: 'Offer Sent at Passenger Budget!',
                                  message: `You offered Rs. ${req.budgetPrice.toLocaleString()} to ${req.passengerName}.`,
                                });
                              }}
                              className="bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs py-2 px-3 rounded-xl transition shadow-xs flex items-center gap-1 cursor-pointer"
                            >
                              <span>⚡</span>
                              <span>Accept Budget</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenOfferModal(req)}
                              className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-bold text-xs py-2 px-3 rounded-xl transition cursor-pointer"
                            >
                              Send Custom Offer
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Offers List (Visible to Passenger & Driver) */}
                      {req.offers.length > 0 && (
                        <div className="pt-2 border-t border-slate-100 space-y-2">
                          <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                            <span className="flex items-center gap-1">
                              <span>💬</span>
                              <span>Driver Offers Received ({req.offers.length})</span>
                            </span>
                          </div>

                          <div className="space-y-2">
                            {req.offers.map((offer) => {
                              const isAcceptedOffer = req.acceptedOfferId === offer.id;
                              return (
                                <div
                                  key={offer.id}
                                  className={`p-3 rounded-2xl border text-xs flex items-center justify-between ${
                                    isAcceptedOffer
                                      ? 'bg-emerald-100/70 border-emerald-400'
                                      : 'bg-slate-50 border-slate-200'
                                  }`}
                                >
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-black text-slate-900">{offer.driverName}</span>
                                      <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded">
                                        ⭐ {offer.driverRating || 4.9}
                                      </span>
                                      <span className="text-[10px] text-slate-500 font-semibold">
                                        {offer.vehicleMakeModel} ({offer.vehiclePlate})
                                      </span>
                                    </div>
                                    {offer.message && (
                                      <p className="text-[11px] text-slate-600 mt-0.5">
                                        &quot;{offer.message}&quot;
                                      </p>
                                    )}
                                  </div>

                                  <div className="text-right flex items-center gap-2.5">
                                    <div>
                                      <span className="block font-black text-sm text-emerald-800">
                                        Rs. {offer.offeredPrice.toLocaleString()}
                                      </span>
                                    </div>

                                    {/* Passenger can confirm this driver */}
                                    {isOwner && req.status === 'OPEN' && (
                                      <button
                                        type="button"
                                        onClick={() => handleAcceptDriverOffer(req, offer)}
                                        className="bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs py-2 px-3 rounded-xl transition shadow-xs cursor-pointer"
                                      >
                                        Confirm Driver
                                      </button>
                                    )}

                                    {isAcceptedOffer && (
                                      <span className="text-[10px] font-black bg-emerald-700 text-white px-2 py-1 rounded-lg">
                                        ✓ CONFIRMED
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: DRIVER PORTAL */}
        {/* ========================================================================= */}
        {activeTab === 'driver' && (
          <div className="space-y-4">
            {/* Driver Security & Verification Banner */}
            {currentUser.role === 'DRIVER' ? (
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-black text-slate-900">{currentUser.name}</h2>
                      {currentUser.verificationStatus === 'VERIFIED' ? (
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-black flex items-center gap-1">
                          <span>🛡️</span>
                          <span>VERIFIED DRIVER</span>
                        </span>
                      ) : (
                        <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-black flex items-center gap-1">
                          <span>⏳</span>
                          <span>DOCUMENTS UNDER REVIEW</span>
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      {currentUser.vehicle?.makeModel} ({currentUser.vehicle?.color}) • Plate:{' '}
                      {currentUser.vehicle?.plate} • {currentUser.vehicle?.capacity} Seats
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab('profile')}
                    className="text-xs text-emerald-700 font-extrabold hover:underline"
                  >
                    View Documents
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-amber-50 p-4 rounded-2xl border border-amber-200 text-amber-900 space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider">You are signed in as Sawari (Passenger)</h4>
                <p className="text-xs">
                  To list rides and earn as a driver, please register as a Driver or switch to demo driver account.
                </p>
                <button
                  onClick={() => {
                    handleDemoLogin('DRIVER');
                  }}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs py-2 px-3 rounded-xl transition"
                >
                  Switch to Driver Account
                </button>
              </div>
            )}

            {/* Nearby Sawari Darkhwast for this Driver */}
            {currentUser.role === 'DRIVER' && (
              <div className="bg-gradient-to-r from-amber-500/10 via-emerald-500/10 to-teal-500/10 p-4 rounded-3xl border border-emerald-300 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">📢</span>
                    <h3 className="text-sm font-black text-slate-900">
                      Nearby Sawari Requests in Your Area
                    </h3>
                  </div>
                  <button
                    onClick={() => setActiveTab('sawari_board')}
                    className="text-xs text-emerald-800 font-extrabold hover:underline"
                  >
                    Open Sawari Board ({openSawariRequestsCount}) ➔
                  </button>
                </div>
                <p className="text-xs text-slate-600">
                  Passengers actively seeking rides in or near {currentUser.city || 'your area'}. Accept directly at their budget or send custom offers:
                </p>

                <div className="space-y-2">
                  {passengerRequests
                    .filter((r) => r.status === 'OPEN')
                    .slice(0, 3)
                    .map((nearReq) => (
                      <div
                        key={nearReq.id}
                        className="p-3 bg-white rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-extrabold text-slate-900 flex items-center gap-1.5">
                            <span>{nearReq.originName} ➔ {nearReq.destinationName}</span>
                            {nearReq.isFamilyTrip && (
                              <span className="text-[10px] bg-purple-100 text-purple-900 px-1.5 py-0.2 rounded font-bold">
                                👨‍👩‍👧 Family
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-500">
                            {nearReq.travelDate} ({nearReq.desiredTime}) • Budget: <strong className="text-emerald-800 font-bold">Rs. {nearReq.budgetPrice.toLocaleString()}</strong> ({nearReq.bookingType === 'WHOLE_CAR' ? 'Full Car' : `${nearReq.seatsCount} Seats`})
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleOpenOfferModal(nearReq)}
                          className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs py-1.5 px-3 rounded-xl transition shadow-xs cursor-pointer shrink-0"
                        >
                          Send Offer
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Publish Ride Card */}
            {currentUser.role === 'DRIVER' && (
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 space-y-3">
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                  <span>➕</span>
                  <span>List a New Intercity Journey</span>
                </h3>

                <form onSubmit={handlePublishDriverRide} className="space-y-3 pt-1">
                  {/* From & To */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Departure (From)</label>
                      <select
                        value={driverPostOrigin}
                        onChange={(e) => setDriverPostOrigin(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-semibold"
                      >
                        {NATIONWIDE_CITIES.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Arrival (To)</label>
                      <select
                        value={driverPostDest}
                        onChange={(e) => setDriverPostDest(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-semibold"
                      >
                        {NATIONWIDE_CITIES.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Booking Option */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Booking Option Offered:
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setDriverPostMode('WHOLE_CAR_OR_SEATS')}
                        className={`py-2 px-1 text-center rounded-xl text-xs font-bold border transition ${
                          driverPostMode === 'WHOLE_CAR_OR_SEATS'
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        Both Options
                      </button>
                      <button
                        type="button"
                        onClick={() => setDriverPostMode('WHOLE_CAR')}
                        className={`py-2 px-1 text-center rounded-xl text-xs font-bold border transition ${
                          driverPostMode === 'WHOLE_CAR'
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        Full Car Only
                      </button>
                      <button
                        type="button"
                        onClick={() => setDriverPostMode('SEATS')}
                        className={`py-2 px-1 text-center rounded-xl text-xs font-bold border transition ${
                          driverPostMode === 'SEATS'
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        Seats Only
                      </button>
                    </div>
                  </div>

                  {/* Pricing Fields */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Whole Car Price (Rs.)</label>
                      <input
                        type="number"
                        value={driverPostCarPrice}
                        onChange={(e) => setDriverPostCarPrice(Number(e.target.value))}
                        required
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-semibold"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Price Per Seat (Rs.)</label>
                      <input
                        type="number"
                        value={driverPostSeatPrice}
                        onChange={(e) => setDriverPostSeatPrice(Number(e.target.value))}
                        disabled={driverPostMode === 'WHOLE_CAR'}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-semibold disabled:bg-slate-100 disabled:text-slate-400"
                      />
                    </div>
                  </div>

                  {/* Round Trip Package for Entire Car */}
                  {driverPostMode !== 'SEATS' && (
                    <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={driverPostRoundTripAllowed}
                            onChange={(e) => setDriverPostRoundTripAllowed(e.target.checked)}
                            className="w-4 h-4 accent-emerald-600 rounded"
                          />
                          <span>Allow Round-Trip Full Car (Same Driver Return)</span>
                        </label>
                      </div>

                      {driverPostRoundTripAllowed && (
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">
                            Discounted Round-Trip Full Car Package Fare (Rs.)
                          </label>
                          <input
                            type="number"
                            value={driverPostRoundTripPrice}
                            onChange={(e) => setDriverPostRoundTripPrice(Number(e.target.value))}
                            className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-semibold"
                          />
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            Typically discounted 30-40% compared to two separate trips (e.g. driver waits at destination).
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Trust & Comfort Toggles */}
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                    <span className="block text-[11px] font-extrabold uppercase text-slate-500">
                      Cultural &amp; Travel Comfort Badges:
                    </span>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <label className="flex items-center gap-1.5 cursor-pointer text-slate-700">
                        <input
                          type="checkbox"
                          checked={driverPostFamilyOnboard}
                          onChange={(e) => setDriverPostFamilyOnboard(e.target.checked)}
                          className="w-4 h-4 accent-emerald-600 rounded"
                        />
                        <span>👨‍👩‍👧 Family Traveling</span>
                      </label>

                      <label className="flex items-center gap-1.5 cursor-pointer text-slate-700">
                        <input
                          type="checkbox"
                          checked={driverPostLadiesOnly}
                          onChange={(e) => setDriverPostLadiesOnly(e.target.checked)}
                          className="w-4 h-4 accent-purple-600 rounded"
                        />
                        <span>🧕 Ladies Only Seats</span>
                      </label>

                      <label className="flex items-center gap-1.5 cursor-pointer text-slate-700">
                        <input
                          type="checkbox"
                          checked={driverPostNamazBreak}
                          onChange={(e) => setDriverPostNamazBreak(e.target.checked)}
                          className="w-4 h-4 accent-amber-600 rounded"
                        />
                        <span>🕌 15-Min Namaz Break</span>
                      </label>

                      <label className="flex items-center gap-1.5 cursor-pointer text-slate-700">
                        <input
                          type="checkbox"
                          checked={driverPostTollsIncluded}
                          onChange={(e) => setDriverPostTollsIncluded(e.target.checked)}
                          className="w-4 h-4 accent-emerald-600 rounded"
                        />
                        <span>✅ Tolls Included</span>
                      </label>

                      <label className="flex items-center gap-1.5 cursor-pointer text-slate-700">
                        <input
                          type="checkbox"
                          checked={driverPostIsReturnDeal}
                          onChange={(e) => setDriverPostIsReturnDeal(e.target.checked)}
                          className="w-4 h-4 accent-rose-600 rounded"
                        />
                        <span>🏷️ Khali Wapsi Deal</span>
                      </label>
                    </div>
                  </div>

                  {/* Time and Notes */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Departure Time</label>
                      <input
                        type="text"
                        value={driverPostTime}
                        onChange={(e) => setDriverPostTime(e.target.value)}
                        placeholder="07:00 AM"
                        required
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Trip Details & Route Notes</label>
                      <input
                        type="text"
                        value={driverPostNotes}
                        onChange={(e) => setDriverPostNotes(e.target.value)}
                        placeholder="Luggage space, AC"
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-semibold"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs py-3.5 rounded-xl shadow-xs transition cursor-pointer"
                  >
                    Publish Ride Online (Passengers Can Book)
                  </button>
                </form>
              </div>
            )}

            {/* My Active Published Journeys (With Cancel Option) */}
            {currentUser.role === 'DRIVER' && (
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 space-y-3">
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                  <span>🚗</span>
                  <span>My Listed Journeys ({rides.filter((r) => r.driverId === currentUser.id).length})</span>
                </h3>

                {rides.filter((r) => r.driverId === currentUser.id).length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No rides listed yet by your account.</p>
                ) : (
                  <div className="space-y-2.5">
                    {rides
                      .filter((r) => r.driverId === currentUser.id)
                      .map((myRide) => {
                        const oName = NATIONWIDE_CITIES.find((c) => c.id === myRide.originLocationId)?.name || 'Origin';
                        const dName = NATIONWIDE_CITIES.find((c) => c.id === myRide.destinationLocationId)?.name || 'Destination';
                        return (
                          <div
                            key={myRide.id}
                            className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between"
                          >
                            <div>
                              <div className="font-extrabold text-xs text-slate-900">
                                {oName} ➔ {dName}
                              </div>
                              <span className="text-[10px] text-slate-500 font-medium">
                                Status: {myRide.status} • Booked: {myRide.bookedSeatsCount}/{myRide.capacity} Seats
                              </span>
                            </div>

                            {myRide.status === 'PUBLISHED' && (
                              <button
                                type="button"
                                onClick={() => handleCancelPublishedRide(myRide)}
                                className="text-[11px] bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-2.5 py-1 rounded-lg font-bold transition cursor-pointer"
                              >
                                Cancel Ride
                              </button>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            )}

            {/* Incoming Requests Manager */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                  <span>📩</span>
                  <span>Passenger Booking Requests</span>
                </h3>
                <span className="text-[11px] text-slate-500">
                  {bookings.filter((b) => b.status === 'PENDING').length} awaiting response
                </span>
              </div>

              {bookings.length === 0 ? (
                <div className="text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-300 space-y-1">
                  <span className="text-2xl block">📬</span>
                  <p className="text-xs font-bold text-slate-700">No requests submitted yet</p>
                  <p className="text-[11px] text-slate-400">
                    Switch to &quot;Book a Ride&quot; tab to submit a request and test the flow.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {bookings.map((req) => (
                    <div
                      key={req.id}
                      className={`p-3.5 rounded-xl border transition ${
                        req.status === 'PENDING'
                          ? 'border-amber-300 bg-amber-50/50'
                          : req.status === 'ACCEPTED'
                          ? 'border-emerald-300 bg-emerald-50/50'
                          : 'border-slate-200 bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-extrabold text-slate-900 text-sm">{req.passengerId}</div>
                          <p className="text-xs text-slate-600 mt-0.5">
                            Wants:{' '}
                            <strong className="text-slate-800">
                              {req.bookingType === 'WHOLE_CAR'
                                ? req.isRoundTrip
                                  ? 'Entire Car (Round-Trip)'
                                  : 'Entire Car'
                                : `${req.requestedSeats} Seat(s)`}
                            </strong>{' '}
                            • <strong className="text-emerald-800">Rs. {req.totalPrice.toLocaleString()}</strong>
                          </p>
                          {req.dropoffStopName && (
                            <p className="text-[11px] text-emerald-800 font-bold mt-1 bg-emerald-100/70 px-2 py-0.5 rounded-md inline-block">
                              📍 Drop-Off: {req.dropoffStopName}
                            </p>
                          )}
                        </div>

                        <span
                          className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${
                            req.status === 'ACCEPTED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : req.status === 'PENDING'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {req.status}
                        </span>
                      </div>

                      {/* Driver Accept / Reject Controls */}
                      {req.status === 'PENDING' && (
                        <div className="mt-3 pt-2.5 border-t border-amber-200 flex gap-2">
                          <button
                            onClick={() => handleAcceptRequest(req)}
                            className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs py-2.5 rounded-xl shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <span>✓</span>
                            <span>ACCEPT REQUEST</span>
                          </button>
                          <button
                            onClick={() => handleRejectRequest(req)}
                            className="bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 font-bold text-xs py-2.5 px-3 rounded-xl transition cursor-pointer"
                          >
                            Decline
                          </button>
                        </div>
                      )}

                      {/* Cash to collect & Disintermediation Protection */}
                      {req.status === 'ACCEPTED' && (
                        <div className="mt-3 pt-2.5 border-t border-emerald-200 space-y-2">
                          <div className="bg-emerald-50 text-emerald-900 p-2 rounded-lg border border-emerald-200 text-[11px] flex items-center justify-between">
                            <span className="font-bold flex items-center gap-1">
                              <span>🛡️</span> Protected In-App Booking
                            </span>
                            <span className="font-extrabold text-emerald-800">
                              Cash to collect: Rs. {req.totalPrice.toLocaleString()}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-slate-500">
                            <span>Passenger boards at designated terminal hub</span>
                            <button
                              onClick={() => handleCancelBooking(req)}
                              className="font-bold text-rose-700 hover:text-rose-900 hover:underline cursor-pointer"
                            >
                              Cancel Booking
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 5: PROFILE & SECURITY (DEDICATED SECTION) */}
        {/* ========================================================================= */}
        {activeTab === 'profile' && (
          <div className="space-y-4">
            {/* User Profile Card */}
            <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200 space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-emerald-100 border-2 border-emerald-300 flex items-center justify-center text-3xl shadow-xs">
                  {currentUser.avatarUrl || '🧑'}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h2 className="text-lg font-black text-slate-900">{currentUser.name}</h2>
                    {currentUser.role === 'DRIVER' && currentUser.verificationStatus === 'VERIFIED' && (
                      <span className="text-amber-500 font-bold text-base" title="Verified Driver">🛡️</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 font-bold">
                    {currentUser.role === 'DRIVER' ? '🚘 Driver (ڈرائیور)' : '🙋‍♂️ Sawari / Passenger (سواری)'} • {currentUser.city || 'Pakistan'}
                  </p>
                  <p className="text-xs text-emerald-800 font-extrabold mt-0.5">
                    ✉️ {currentUser.email} • 📞 {currentUser.phone}
                  </p>
                </div>
              </div>

              {/* Safety & Emergency Contact Card */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-1">
                <span className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                  Emergency Safety Contact
                </span>
                <p className="text-xs font-bold text-slate-700">
                  Phone: {currentUser.emergencyContact || '0300-1122334'} (Family / Relative)
                </p>
              </div>

              {/* DRIVER DEDICATED VERIFICATION & SECURITY SECTION */}
              {currentUser.role === 'DRIVER' && (
                <div className="border-t border-slate-100 pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-base">🛡️</span>
                      <h3 className="text-sm font-black text-slate-900">Security & Document Verification</h3>
                    </div>

                    <span
                      className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase ${
                        currentUser.verificationStatus === 'VERIFIED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {currentUser.verificationStatus === 'VERIFIED' ? 'Verified Driver' : 'Under Review'}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-500">
                    Mandatory verification ensures safety for all passengers traveling intercity in Pakistan.
                  </p>

                  {/* Document Checklist Items */}
                  <div className="space-y-2">
                    {/* CNIC Card */}
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">🪪</span>
                        <div>
                          <span className="font-bold text-slate-800 block">CNIC (National ID Card)</span>
                          <span className="text-[11px] text-slate-500">{currentUser.cnicNumber || '44101-1234567-1'}</span>
                        </div>
                      </div>
                      <span className="text-xs text-emerald-700 font-extrabold">✓ Attached</span>
                    </div>

                    {/* Driving License */}
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">📄</span>
                        <div>
                          <span className="font-bold text-slate-800 block">Driving License</span>
                          <span className="text-[11px] text-slate-500">{currentUser.licenseNumber || 'DL-HYD-99812'}</span>
                        </div>
                      </div>
                      <span className="text-xs text-emerald-700 font-extrabold">✓ Attached</span>
                    </div>

                    {/* Vehicle Registration */}
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">🚘</span>
                        <div>
                          <span className="font-bold text-slate-800 block">Vehicle Registration Book</span>
                          <span className="text-[11px] text-slate-500">
                            {currentUser.vehicle?.makeModel} ({currentUser.vehicle?.plate})
                          </span>
                        </div>
                      </div>
                      <span className="text-xs text-emerald-700 font-extrabold">✓ Attached</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="border-t border-slate-100 pt-3 flex flex-col gap-2">
                <button
                  onClick={() => {
                    if (currentUser.role === 'PASSENGER') {
                      handleDemoLogin('DRIVER');
                    } else {
                      handleDemoLogin('PASSENGER');
                    }
                  }}
                  className="w-full bg-slate-900 hover:bg-black text-white font-bold text-xs py-3 rounded-xl transition text-center cursor-pointer"
                >
                  Switch Role to {currentUser.role === 'PASSENGER' ? '🚘 Driver (ڈرائیور)' : '🙋‍♂️ Sawari (سواری)'}
                </button>

                <button
                  onClick={handleLogout}
                  className="w-full bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs py-3 rounded-xl transition text-center cursor-pointer"
                >
                  Sign Out of Account
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL: PASSENGER "WHERE TO?" POPUP (ONLY FROM & TO) */}
        {/* ========================================================================= */}
        {showQuickRouteModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black text-slate-900 leading-tight">
                    Where are you traveling?
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Select your departure and arrival cities:
                  </p>
                </div>
                <button
                  onClick={() => setShowQuickRouteModal(false)}
                  className="text-slate-400 hover:text-slate-700 font-bold text-lg p-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleQuickRouteSubmit} className="space-y-3 pt-1">
                {/* From City */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    🟢 From (Leaving from):
                  </label>
                  <select
                    value={searchOrigin}
                    onChange={(e) => setSearchOrigin(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl px-3 py-3 text-sm font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
                  >
                    {NATIONWIDE_CITIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.province})
                      </option>
                    ))}
                  </select>
                </div>

                {/* To City */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    🔴 To (Going to):
                  </label>
                  <select
                    value={searchDest}
                    onChange={(e) => setSearchDest(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl px-3 py-3 text-sm font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
                  >
                    {NATIONWIDE_CITIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.province})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Quick 1-tap popular routes */}
                <div className="pt-1">
                  <span className="block text-[10px] text-slate-400 font-bold uppercase mb-1">
                    Popular Routes:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setSearchOrigin('loc-uk');
                        setSearchDest('loc-khi');
                        setSelectedDropoffStop('Karachi (Sohrab Goth / Cantt / Saddar)');
                      }}
                      className="text-[11px] bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 text-slate-700 px-2 py-1 rounded-lg font-bold transition cursor-pointer"
                    >
                      Umerkot ➔ Karachi
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchOrigin('loc-uk');
                        setSearchDest('loc-hyd');
                        setSelectedDropoffStop('Hyderabad (Qasimabad / Latifabad)');
                      }}
                      className="text-[11px] bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 text-slate-700 px-2 py-1 rounded-lg font-bold transition cursor-pointer"
                    >
                      Umerkot ➔ Hyderabad (Rs. 1,800)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchOrigin('loc-uk');
                        setSearchDest('loc-mpk');
                        setSelectedDropoffStop('Mirpur Khas');
                      }}
                      className="text-[11px] bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 text-slate-700 px-2 py-1 rounded-lg font-bold transition cursor-pointer"
                    >
                      Umerkot ➔ Mirpur Khas (Rs. 900)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchOrigin('loc-khi');
                        setSearchDest('loc-hyd');
                        setSelectedDropoffStop('Hyderabad (City / Auto Bhan)');
                      }}
                      className="text-[11px] bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 text-slate-700 px-2 py-1 rounded-lg font-bold transition cursor-pointer"
                    >
                      Karachi ➔ Hyderabad
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchOrigin('loc-lhr');
                        setSearchDest('loc-isb');
                        setSelectedDropoffStop('Islamabad / Rawalpindi');
                      }}
                      className="text-[11px] bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 text-slate-700 px-2 py-1 rounded-lg font-bold transition cursor-pointer"
                    >
                      Lahore ➔ Islamabad
                    </button>
                  </div>
                </div>

                {/* Search Button */}
                <button
                  type="submit"
                  className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-black py-4 px-4 rounded-2xl shadow-md transition text-sm flex items-center justify-center gap-2 cursor-pointer mt-2"
                >
                  <span>Show Matching Rides</span>
                  <span>➔</span>
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL: POST SAWARI REQUEST (ON SAWARI BOARD) */}
        {/* ========================================================================= */}
        {showPostRequestModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-lg font-black text-slate-900 leading-tight flex items-center gap-2">
                    <span>📢</span>
                    <span>Post a Sawari Request</span>
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    سواری کی درخواست پوسٹ کریں • ڈرائیور آپ کو آفر دیں گے
                  </p>
                </div>
                <button
                  onClick={() => setShowPostRequestModal(false)}
                  className="text-slate-400 hover:text-slate-700 font-bold text-lg p-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handlePostSawariRequest} className="space-y-3.5">
                {/* From & To Cities */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Departure City (From):
                    </label>
                    <select
                      value={reqOrigin}
                      onChange={(e) => setReqOrigin(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-900"
                    >
                      {NATIONWIDE_CITIES.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Destination City (To):
                    </label>
                    <select
                      value={reqDest}
                      onChange={(e) => setReqDest(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-900"
                    >
                      {NATIONWIDE_CITIES.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Date and Time */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Travel Date:
                    </label>
                    <input
                      type="date"
                      value={reqDate}
                      onChange={(e) => setReqDate(e.target.value)}
                      required
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Desired Time:
                    </label>
                    <input
                      type="text"
                      value={reqTime}
                      onChange={(e) => setReqTime(e.target.value)}
                      placeholder="e.g. 08:30 AM"
                      required
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-900"
                    />
                  </div>
                </div>

                {/* Booking Type: Whole Car vs Seats */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Ride Type Needed:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setReqBookingType('WHOLE_CAR')}
                      className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                        reqBookingType === 'WHOLE_CAR'
                          ? 'bg-emerald-700 text-white border-emerald-700 font-extrabold shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 font-semibold'
                      }`}
                    >
                      <span>🚗 Entire Car (Private)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setReqBookingType('SEAT')}
                      className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                        reqBookingType === 'SEAT'
                          ? 'bg-emerald-700 text-white border-emerald-700 font-extrabold shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 font-semibold'
                      }`}
                    >
                      <span>💺 Individual Seat(s)</span>
                    </button>
                  </div>
                </div>

                {/* If Seats, count */}
                {reqBookingType === 'SEAT' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Number of Seats:
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="6"
                      value={reqSeatsCount}
                      onChange={(e) => setReqSeatsCount(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-900"
                    />
                  </div>
                )}

                {/* Preferences Toggles: Family Trip, AC, Round-Trip */}
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                  <span className="block text-[11px] font-extrabold uppercase text-slate-500">
                    Preferences &amp; Modesty Requirements:
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <label className="flex items-center gap-1.5 cursor-pointer text-slate-800 font-bold">
                      <input
                        type="checkbox"
                        checked={reqIsFamily}
                        onChange={(e) => setReqIsFamily(e.target.checked)}
                        className="w-4 h-4 accent-purple-600 rounded"
                      />
                      <span>👨‍👩‍👧 Family Trip (Family Safar)</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer text-slate-800 font-bold">
                      <input
                        type="checkbox"
                        checked={reqAc}
                        onChange={(e) => setReqAc(e.target.checked)}
                        className="w-4 h-4 accent-cyan-600 rounded"
                      />
                      <span>❄️ AC Car Required</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer text-slate-800 font-bold">
                      <input
                        type="checkbox"
                        checked={reqIsRoundTrip}
                        onChange={(e) => setReqIsRoundTrip(e.target.checked)}
                        className="w-4 h-4 accent-amber-600 rounded"
                      />
                      <span>🔄 Round-Trip Return Wanted</span>
                    </label>
                  </div>

                  {reqIsRoundTrip && (
                    <div className="pt-2">
                      <label className="block text-[10px] font-bold text-slate-600 mb-1">
                        Return Date:
                      </label>
                      <input
                        type="date"
                        value={reqReturnDate}
                        onChange={(e) => setReqReturnDate(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-900"
                      />
                    </div>
                  )}
                </div>

                {/* Luggage Size */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Luggage Capacity Needed:
                  </label>
                  <select
                    value={reqLuggage}
                    onChange={(e) => setReqLuggage(e.target.value as 'CABIN_ONLY' | 'MEDIUM_SUITCASE' | 'FULL_TRUNK')}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-900"
                  >
                    <option value="CABIN_ONLY">🎒 Cabin Only (Handbag / Backpack)</option>
                    <option value="MEDIUM_SUITCASE">🧳 1-2 Medium Suitcases</option>
                    <option value="FULL_TRUNK">🚗 Full Trunk Required (No CNG Cylinder)</option>
                  </select>
                </div>

                {/* Budget Fare Input */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700">
                      Your Budget Offer (Rs.):
                    </label>
                    <span className="text-[10px] text-emerald-700 font-bold">
                      Cash to Driver
                    </span>
                  </div>
                  <input
                    type="number"
                    value={reqBudget}
                    onChange={(e) => setReqBudget(Number(e.target.value))}
                    required
                    className="w-full bg-slate-50 border-2 border-emerald-500 rounded-xl px-3 py-2.5 text-base font-black text-slate-900"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Suggested benchmark: Rs. 10,000 - 15,000 for whole car intercity trips. Drivers can counter-offer if needed.
                  </p>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Notes / Doorstep Pickup Landmark:
                  </label>
                  <textarea
                    rows={2}
                    value={reqNotes}
                    onChange={(e) => setReqNotes(e.target.value)}
                    placeholder="e.g. Traveling with family & patients for hospital appointment. Need polite driver."
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="flex gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowPostRequestModal(false)}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-3 rounded-xl transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs py-3 rounded-xl shadow-xs transition cursor-pointer"
                  >
                    Post Request on Board ➔
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL: DRIVER CUSTOM OFFER */}
        {/* ========================================================================= */}
        {selectedReqForOffer && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div>
                  <h3 className="text-base font-black text-slate-900 leading-tight">
                    Submit Offer to {selectedReqForOffer.passengerName}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {selectedReqForOffer.originName} ➔ {selectedReqForOffer.destinationName}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedReqForOffer(null)}
                  className="text-slate-400 hover:text-slate-700 font-bold text-lg p-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Passenger Budget:</span>
                  <span className="font-bold text-slate-900">Rs. {selectedReqForOffer.budgetPrice.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Type:</span>
                  <span className="font-bold text-slate-900">
                    {selectedReqForOffer.bookingType === 'WHOLE_CAR' ? 'Entire Car' : `${selectedReqForOffer.seatsCount} Seat(s)`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Travel Date:</span>
                  <span className="font-bold text-slate-900">{selectedReqForOffer.travelDate} ({selectedReqForOffer.desiredTime})</span>
                </div>
              </div>

              <form onSubmit={handleSubmitDriverOffer} className="space-y-3 pt-1">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Your Offered Price (Rs.):
                  </label>
                  <input
                    type="number"
                    value={offerPrice}
                    onChange={(e) => setOfferPrice(Number(e.target.value))}
                    required
                    className="w-full bg-white border-2 border-emerald-500 rounded-xl px-3 py-2 text-sm font-black text-slate-900"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Direct cash collected from passenger upon boarding.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Message to Passenger:
                  </label>
                  <textarea
                    rows={2}
                    value={offerMessage}
                    onChange={(e) => setOfferMessage(e.target.value)}
                    placeholder="e.g. Chilled AC, sanitized vehicle, respectful service, doorstep pickup."
                    className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="flex gap-2 pt-1 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setSelectedReqForOffer(null)}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-3 rounded-xl transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs py-3 rounded-xl shadow-xs transition cursor-pointer"
                  >
                    Send Offer ➔
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL: EMERGENCY CANCELLATION APPEAL */}
        {showAppealModal && selectedEventForAppeal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black text-slate-900 leading-tight">
                    Emergency Cancellation Appeal
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Submit verified emergency details to waive reliability penalties:
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAppealModal(false)}
                  className="text-slate-400 hover:text-slate-700 font-bold text-lg p-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleEmergencyAppealSubmit} className="space-y-3 pt-1">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Emergency Nature:
                  </label>
                  <select
                    value={appealCategory}
                    onChange={(e) => setAppealCategory(e.target.value as EmergencyReasonCategory)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold"
                  >
                    <option value="MEDICAL">Medical Emergency / Hospitalization</option>
                    <option value="VEHICLE_BREAKDOWN">Vehicle Breakdown / Mechanical Failure</option>
                    <option value="ROAD_BLOCK_WEATHER">Roadblock / Severe Weather / Highway Closure</option>
                    <option value="FAMILY_EMERGENCY">Urgent Family Bereavement / Emergency</option>
                    <option value="OTHER">Other Documented Emergency</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Explanation & Circumstances:
                  </label>
                  <textarea
                    rows={3}
                    value={appealStatement}
                    onChange={(e) => setAppealStatement(e.target.value)}
                    placeholder="Describe the emergency circumstances that prevented travel..."
                    required
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <span className="text-[10px] text-slate-400 block mt-1">
                    Approved appeals completely restore lost reliability points.
                  </span>
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAppealModal(false)}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-3 rounded-xl transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs py-3 rounded-xl shadow-xs transition cursor-pointer"
                  >
                    Submit Appeal
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Footer Legal & Operational Links */}
        <footer className="pt-6 border-t border-slate-200 text-center space-y-2">
          <div className="flex justify-center items-center gap-3 text-xs font-bold text-emerald-800">
            <Link href="/privacy" className="hover:underline">
              Privacy Policy
            </Link>
            <span>•</span>
            <Link href="/terms" className="hover:underline">
              Terms of Service
            </Link>
            <span>•</span>
            <a href="mailto:support@returnride.pk" className="hover:underline">
              Support Helpline
            </a>
          </div>
          <p className="text-[11px] text-slate-400">
            Apni Sawari (اپنی سواری) © 2026 • Pakistan Nationwide Intercity Ride Network • Direct Cash Pilot
          </p>
        </footer>
      </main>
    </div>
  );
}
