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
  vehicle?: {
    makeModel: string;
    plate: string;
    capacity: number;
    hasAc: boolean;
    color: string;
    imageUrl?: string;
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
  name: 'Driver Tariq Khan',
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
    roundTripWholeCarPrice: 23000,
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
    isReturnDeal: true,
    travelComfort: {
      acType: 'CHILLED_AC',
      maxInBack: 2,
      luggageCapacity: 'MEDIUM_SUITCASE',
      tollsIncluded: true,
      familyOnboard: true,
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
      ladiesOnlySeats: true,
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
    isReturnDeal: true,
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
        driverName: 'Driver Tariq Khan',
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
  // Session & User Profile State (Universal User Model like BlaBlaCar/Poparide)
  const [currentUser, setCurrentUser] = useState<AppUserProfile | null>(INITIAL_DEMO_PASSENGER);
  const [isClientLoaded, setIsClientLoaded] = useState(false);

  // Registered Users Registry
  const [registeredUsers, setRegisteredUsers] = useState<AppUserProfile[]>([
    INITIAL_DEMO_PASSENGER,
    INITIAL_DEMO_DRIVER,
  ]);

  // Main Navigation View: 'find_ride' | 'sawari_board' | 'my_trips' | 'how_it_works'
  const [activeNav, setActiveNav] = useState<'find_ride' | 'sawari_board' | 'my_trips' | 'how_it_works'>('find_ride');

  // Rides & Reverse Marketplace Requests
  const [rides, setRides] = useState<Ride[]>(INITIAL_RIDES);
  const [passengerRequests, setPassengerRequests] = useState<PassengerRideRequest[]>(INITIAL_PASSENGER_REQUESTS);
  const [bookings, setBookings] = useState<BookingRequest[]>([]);

  // Horizontal Search Capsule State (Exact Poparide & BlaBlaCar style)
  const [searchOrigin, setSearchOrigin] = useState<string>('loc-uk');
  const [searchDest, setSearchDest] = useState<string>('loc-khi');
  const [searchDate, setSearchDate] = useState<string>('Today');
  const [searchSeatsCount, setSearchSeatsCount] = useState<number>(1);
  const [hasSearched, setHasSearched] = useState<boolean>(true);

  // Date Strip Carousel & Filter Chips
  const [selectedDateTab, setSelectedDateTab] = useState<'ALL' | 'TODAY' | 'TOMORROW' | 'WEEKEND'>('ALL');
  const [activeTagFilter, setActiveTagFilter] = useState<'ALL' | 'KHALI_WAPSI' | 'FAMILY' | 'MAX_2_BACK' | 'LADIES_ONLY'>('ALL');

  // Modals
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [selectedRideForBooking, setSelectedRideForBooking] = useState<Ride | null>(null);

  // Booking details in modal
  const [bookingModeChoice, setBookingModeChoice] = useState<BookingType>('SEAT');
  const [bookingSeatsCount, setBookingSeatsCount] = useState<number>(1);
  const [bookingSelectedDropoff, setBookingSelectedDropoff] = useState<string>('DEFAULT');
  const [bookingIsRoundTrip, setBookingIsRoundTrip] = useState<boolean>(false);
  const [bookingRoundTripType, setBookingRoundTripType] = useState<'SAME_DAY_WAIT' | 'MULTI_DAY'>('SAME_DAY_WAIT');
  const [bookingReturnDate, setBookingReturnDate] = useState<string>('2026-11-03');

  // Offer a Ride Modal (Universal Flow - handles vehicle setup on the fly if user hasn't registered car yet!)
  const [showOfferRideModal, setShowOfferRideModal] = useState(false);
  const [offerStep, setOfferStep] = useState<'VEHICLE_SETUP' | 'TRIP_DETAILS'>('TRIP_DETAILS');

  // Offer a Ride: Vehicle Setup fields
  const [offerCarModel, setOfferCarModel] = useState('Toyota Corolla GLi');
  const [offerCarPlate, setOfferCarPlate] = useState('LEB-4592');
  const [offerCarCapacity, setOfferCarCapacity] = useState(4);
  const [offerCarColor, setOfferCarColor] = useState('White');
  const [offerCarAc, setOfferCarAc] = useState(true);
  const [offerCarPhotoUrl, setOfferCarPhotoUrl] = useState('');

  // Offer a Ride: Trip Details fields
  const [postOrigin, setPostOrigin] = useState('loc-uk');
  const [postDest, setPostDest] = useState('loc-khi');
  const [postMode, setPostMode] = useState<RideBookingMode>('WHOLE_CAR_OR_SEATS');
  const [postSeatPrice, setPostSeatPrice] = useState(3500);
  const [postCarPrice, setPostCarPrice] = useState(14000);
  const [postTime, setPostTime] = useState('07:00 AM');
  const [postDate, setPostDate] = useState('2026-11-03');
  const [postNotes, setPostNotes] = useState('Clean AC car. Luggage trunk available.');
  const [postAllowRoundTrip, setPostAllowRoundTrip] = useState(true);
  const [postRoundTripPrice, setPostRoundTripPrice] = useState(23000);
  const [postIsReturnDeal, setPostIsReturnDeal] = useState(false);
  const [postFamilyOnboard, setPostFamilyOnboard] = useState(false);
  const [postLadiesOnly, setPostLadiesOnly] = useState(false);
  const [postNamazBreak, setPostNamazBreak] = useState(true);
  const [postTollsIncluded, setPostTollsIncluded] = useState(true);

  // Post Sawari Request Modal (Reverse Marketplace)
  const [showPostRequestModal, setShowPostRequestModal] = useState(false);
  const [reqOrigin, setReqOrigin] = useState('loc-mpk');
  const [reqDest, setReqDest] = useState('loc-khi');
  const [reqDate, setReqDate] = useState('2026-11-03');
  const [reqTime, setReqTime] = useState('08:30 AM');
  const [reqBookingType, setReqBookingType] = useState<'WHOLE_CAR' | 'SEAT'>('WHOLE_CAR');
  const [reqSeats, setReqSeats] = useState(4);
  const [reqBudget, setReqBudget] = useState(13000);
  const [reqIsFamily, setReqIsFamily] = useState(true);
  const [reqAc, setReqAc] = useState(true);
  const [reqLuggage, setReqLuggage] = useState<'CABIN_ONLY' | 'MEDIUM_SUITCASE' | 'FULL_TRUNK'>('FULL_TRUNK');
  const [reqNotes, setReqNotes] = useState('');

  // Driver Custom Counter-Offer Modal
  const [selectedReqForOffer, setSelectedReqForOffer] = useState<PassengerRideRequest | null>(null);
  const [offerPriceInput, setOfferPriceInput] = useState<number>(0);
  const [offerMsgInput, setOfferMsgInput] = useState<string>('');

  // User Profile Modal & Edit fields
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileCity, setProfileCity] = useState('Karachi');
  const [profileEmergency, setProfileEmergency] = useState('');
  const [profileAvatarUrl, setProfileAvatarUrl] = useState('');
  const [profileCarModel, setProfileCarModel] = useState('');
  const [profileCarPlate, setProfileCarPlate] = useState('');
  const [profileCarCapacity, setProfileCarCapacity] = useState(4);
  const [profileCarColor, setProfileCarColor] = useState('White');
  const [profileCarAc, setProfileCarAc] = useState(true);
  const [profileCarPhotoUrl, setProfileCarPhotoUrl] = useState('');
  const [profileCnic, setProfileCnic] = useState('');
  const [profileLicense, setProfileLicense] = useState('');

  // Auth Dialog fields
  const [authView, setAuthView] = useState<'LOGIN' | 'REGISTER' | 'VERIFY_OTP'>('LOGIN');
  const [authLoginId, setAuthLoginId] = useState('');
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regCity, setRegCity] = useState('Karachi');
  const [regOtpMethod, setRegOtpMethod] = useState<'EMAIL' | 'SMS'>('EMAIL');
  const [regOtp, setRegOtp] = useState('');
  const [otpSessionToken, setOtpSessionToken] = useState('');
  const [pendingUser, setPendingUser] = useState<AppUserProfile | null>(null);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState(0);

  // Reliability & Appeals
  const [cancellationEvents, setCancellationEvents] = useState<CancellationEvent[]>([]);
  const [appeals, setAppeals] = useState<CancellationAppeal[]>([]);
  const [showAppealModal, setShowAppealModal] = useState(false);
  const [appealCategory, setAppealCategory] = useState<EmergencyReasonCategory>('MEDICAL');
  const [appealStatement, setAppealStatement] = useState('');
  const [selectedEventForAppeal, setSelectedEventForAppeal] = useState<CancellationEvent | null>(null);

  // Toast Notification
  const [notification, setNotification] = useState<{
    type: 'success' | 'error' | 'info';
    title: string;
    message: string;
  } | null>(null);

  // Load from localStorage
  useEffect(() => {
    try {
      const savedUser = localStorage.getItem('returnride_user');
      const savedRegistered = localStorage.getItem('returnride_registered_users');
      const savedRides = localStorage.getItem('returnride_rides');
      const savedBookings = localStorage.getItem('returnride_bookings');
      const savedPassengerRequests = localStorage.getItem('apnisawari_passenger_requests');

      if (savedUser) {
        try {
          setCurrentUser(JSON.parse(savedUser));
        } catch {
          // ignore
        }
      }
      if (savedRegistered) {
        try {
          setRegisteredUsers(JSON.parse(savedRegistered));
        } catch {
          // ignore
        }
      }
      if (savedRides) {
        try {
          setRides(JSON.parse(savedRides));
        } catch {
          // ignore
        }
      }
      if (savedBookings) {
        try {
          setBookings(JSON.parse(savedBookings));
        } catch {
          // ignore
        }
      }
      if (savedPassengerRequests) {
        try {
          setPassengerRequests(JSON.parse(savedPassengerRequests));
        } catch {
          // ignore
        }
      }
      setIsClientLoaded(true);
    } catch {
      setIsClientLoaded(true);
    }
  }, []);

  // Save to localStorage
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
      localStorage.setItem('apnisawari_passenger_requests', JSON.stringify(passengerRequests));
    } catch {
      // ignore
    }
  }, [currentUser, registeredUsers, rides, bookings, passengerRequests, isClientLoaded]);

  // Sync profile editing fields when current user changes
  useEffect(() => {
    if (currentUser) {
      setProfileName(currentUser.name || '');
      setProfilePhone(currentUser.phone || '');
      setProfileCity(currentUser.city || 'Karachi');
      setProfileEmergency(currentUser.emergencyContact || '');
      setProfileAvatarUrl(currentUser.avatarUrl || '');
      setProfileCnic(currentUser.cnicNumber || '');
      setProfileLicense(currentUser.licenseNumber || '');
      if (currentUser.vehicle) {
        setProfileCarModel(currentUser.vehicle.makeModel || '');
        setProfileCarPlate(currentUser.vehicle.plate || '');
        setProfileCarCapacity(currentUser.vehicle.capacity || 4);
        setProfileCarColor(currentUser.vehicle.color || 'White');
        setProfileCarAc(currentUser.vehicle.hasAc ?? true);
        setProfileCarPhotoUrl(currentUser.vehicle.imageUrl || '');
      }
    }
  }, [currentUser]);

  // Reliability score (computed after mount in useEffect to prevent Next.js prerender date impurity)
  const [userReliability, setUserReliability] = useState<ReturnType<typeof evaluateUserReliability> | null>(null);

  useEffect(() => {
    if (!currentUser) {
      setUserReliability(null);
      return;
    }
    const score = evaluateUserReliability({
      userId: currentUser.id,
      userRole: currentUser.role,
      totalCompletedRides: currentUser.vehicle ? 4 : 2,
      cancellationEvents,
      appeals,
    });
    setUserReliability(score);
  }, [currentUser, cancellationEvents, appeals]);

  // City Name Helpers
  const originCityName = NATIONWIDE_CITIES.find((c) => c.id === searchOrigin)?.name || 'Origin';
  const destCityName = NATIONWIDE_CITIES.find((c) => c.id === searchDest)?.name || 'Destination';

  // Filtered Rides matching Search Bar & Filters
  const matchingRides = useMemo(() => {
    return rides.filter((r) => {
      // Route matching
      if (hasSearched) {
        const directMatch = r.originLocationId === searchOrigin && r.destinationLocationId === searchDest;
        const stopMatch =
          r.originLocationId === searchOrigin &&
          r.routeStops?.some((s) => s.name.toLowerCase().includes(destCityName.toLowerCase()));
        if (!directMatch && !stopMatch) return false;
      }

      // Tag Filter
      if (activeTagFilter === 'KHALI_WAPSI' && !r.isReturnDeal) return false;
      if (activeTagFilter === 'FAMILY' && !r.travelComfort?.familyOnboard) return false;
      if (activeTagFilter === 'MAX_2_BACK' && r.travelComfort?.maxInBack !== 2) return false;
      if (activeTagFilter === 'LADIES_ONLY' && !r.travelComfort?.ladiesOnlySeats) return false;

      return true;
    });
  }, [rides, searchOrigin, searchDest, destCityName, hasSearched, activeTagFilter]);

  // Swapping Cities in Search Bar
  const handleSwapCities = () => {
    const temp = searchOrigin;
    setSearchOrigin(searchDest);
    setSearchDest(temp);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setHasSearched(true);
    setActiveNav('find_ride');
  };

  // Driver Display Name Helper
  const getDriverDisplayName = (driverId: string) => {
    if (currentUser && driverId === currentUser.id) return `${currentUser.name} (You)`;
    const matched = registeredUsers.find((u) => u.id === driverId);
    if (matched) return matched.name;
    if (driverId === 'driver-tariq') return 'Driver Tariq Khan';
    if (driverId === 'driver-aslam') return 'Driver Aslam Sheikh';
    if (driverId === 'driver-kamran') return 'Driver Kamran Shah';
    if (driverId === 'driver-farhan') return 'Driver Farhan Ali';
    if (driverId === 'driver-bilal') return 'Driver Bilal Rasheed';
    if (driverId === 'driver-jameel') return 'Driver Jameel Memon';
    return 'Verified Driver';
  };

  // Open Offer a Ride (Universal Flow)
  const handleOpenOfferRide = () => {
    if (!currentUser) {
      setAuthView('LOGIN');
      setShowAuthModal(true);
      return;
    }
    // If user has not yet set up their vehicle:
    if (!currentUser.vehicle || !currentUser.vehicle.makeModel) {
      setOfferStep('VEHICLE_SETUP');
    } else {
      setOfferStep('TRIP_DETAILS');
    }
    setShowOfferRideModal(true);
  };

  // Save vehicle and proceed to trip listing
  const handleSaveVehicleAndProceed = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    const updatedUser: AppUserProfile = {
      ...currentUser,
      role: 'DRIVER',
      vehicle: {
        makeModel: offerCarModel.trim() || 'Toyota Corolla GLi',
        plate: offerCarPlate.trim() || 'LEB-4592',
        capacity: Number(offerCarCapacity) || 4,
        hasAc: offerCarAc,
        color: offerCarColor.trim() || 'White',
        imageUrl: offerCarPhotoUrl || undefined,
      },
      verificationStatus: 'VERIFIED',
    };

    setCurrentUser(updatedUser);
    setRegisteredUsers((prev) => prev.map((u) => (u.id === updatedUser.id ? updatedUser : u)));
    setOfferStep('TRIP_DETAILS');
    setNotification({
      type: 'success',
      title: 'Vehicle Setup Complete!',
      message: 'Now set your departure time and pricing to list your trip.',
    });
  };

  // Publish a journey
  const handlePublishJourney = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    const oCity = NATIONWIDE_CITIES.find((c) => c.id === postOrigin)?.name || 'Origin';
    const dCity = NATIONWIDE_CITIES.find((c) => c.id === postDest)?.name || 'Destination';

    const newRide: Ride = {
      id: generateClientUniqueId('ride'),
      driverId: currentUser.id,
      vehicleId: generateClientUniqueId('veh'),
      originLocationId: postOrigin,
      destinationLocationId: postDest,
      departureTime: '2026-11-03T08:00:00Z',
      bookingMode: postMode,
      capacity: currentUser.vehicle?.capacity || 4,
      bookedSeatsCount: 0,
      wholeCarPrice: Number(postCarPrice),
      seatPrice: postMode === 'WHOLE_CAR' ? undefined : Number(postSeatPrice),
      status: 'PUBLISHED',
      autoReopenOnCancellation: true,
      notes: `${currentUser.vehicle?.makeModel || 'Car'} • Departs ${postTime}. ${postNotes}`,
      driverTier: 'TOP_RATED_DRIVER',
      isReturnDeal: postIsReturnDeal,
      roundTripAllowed: postAllowRoundTrip,
      roundTripWholeCarPrice: postAllowRoundTrip ? Number(postRoundTripPrice) : undefined,
      travelComfort: {
        acType: 'CHILLED_AC',
        maxInBack: 2,
        luggageCapacity: 'FULL_TRUNK',
        namazBreak: postNamazBreak,
        tollsIncluded: postTollsIncluded,
        familyOnboard: postFamilyOnboard,
        ladiesOnlySeats: postLadiesOnly,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setRides((prev) => [newRide, ...prev]);
    setShowOfferRideModal(false);
    setActiveNav('my_trips');
    setNotification({
      type: 'success',
      title: 'Ride Published Successfully!',
      message: `Your trip from ${oCity} to ${dCity} is now live on the Apni Sawari network.`,
    });
  };

  // Open Booking Modal for a ride
  const handleOpenBooking = (ride: Ride) => {
    if (!currentUser) {
      setAuthView('LOGIN');
      setShowAuthModal(true);
      return;
    }
    setSelectedRideForBooking(ride);
    setBookingModeChoice(ride.bookingMode === 'WHOLE_CAR' ? 'WHOLE_CAR' : 'SEAT');
    setBookingSeatsCount(1);
    setBookingSelectedDropoff('DEFAULT');
    setBookingIsRoundTrip(false);
    setShowBookingModal(true);
  };

  // Confirm Booking
  const handleConfirmBooking = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRideForBooking || !currentUser) return;

    try {
      const seatsToBook = bookingModeChoice === 'WHOLE_CAR' ? 1 : bookingSeatsCount;
      const oName = NATIONWIDE_CITIES.find((c) => c.id === selectedRideForBooking.originLocationId)?.name || 'Origin';
      const dName = NATIONWIDE_CITIES.find((c) => c.id === selectedRideForBooking.destinationLocationId)?.name || 'Destination';

      let dropoffName = dName;
      let calculatedPrice =
        bookingModeChoice === 'WHOLE_CAR'
          ? (bookingIsRoundTrip ? (selectedRideForBooking.roundTripWholeCarPrice || Math.round(selectedRideForBooking.wholeCarPrice * 1.65)) : selectedRideForBooking.wholeCarPrice)
          : (selectedRideForBooking.seatPrice || 3500) * seatsToBook;

      if (bookingSelectedDropoff !== 'DEFAULT') {
        const matchingStop = selectedRideForBooking.routeStops?.find((s) => s.name === bookingSelectedDropoff);
        if (matchingStop) {
          dropoffName = matchingStop.name;
          const stopWholePrice = matchingStop.wholeCarPrice || selectedRideForBooking.wholeCarPrice;
          const stopSeatPrice = matchingStop.seatPrice || selectedRideForBooking.seatPrice || 3500;
          calculatedPrice =
            bookingModeChoice === 'WHOLE_CAR'
              ? (bookingIsRoundTrip ? (selectedRideForBooking.roundTripWholeCarPrice || Math.round(stopWholePrice * 1.65)) : stopWholePrice)
              : stopSeatPrice * seatsToBook;
        }
      }

      const rideBookings = bookings.filter((b) => b.rideId === selectedRideForBooking.id);

      const newBooking = createBookingRequest({
        id: generateClientUniqueId('req'),
        ride: selectedRideForBooking,
        passengerId: `${currentUser.name} (#${currentUser.id.slice(-4)})`,
        bookingType: bookingModeChoice,
        requestedSeats: seatsToBook,
        totalPrice: calculatedPrice,
        dropoffStopName: dropoffName,
        isRoundTrip: bookingModeChoice === 'WHOLE_CAR' ? bookingIsRoundTrip : false,
        roundTripType: bookingModeChoice === 'WHOLE_CAR' && bookingIsRoundTrip ? bookingRoundTripType : undefined,
        returnDepartureTime: bookingModeChoice === 'WHOLE_CAR' && bookingIsRoundTrip ? `${bookingReturnDate}T06:00:00Z` : undefined,
        confirmedBookings: rideBookings,
      });

      setBookings((prev) => [newBooking, ...prev]);
      setShowBookingModal(false);
      setActiveNav('my_trips');
      setNotification({
        type: 'success',
        title: 'Booking Request Submitted!',
        message: `Your booking for ${oName} ➔ ${dropoffName} has been sent to the driver for confirmation.`,
      });
    } catch (err: unknown) {
      if (err instanceof BookingEngineError) {
        setNotification({ type: 'error', title: 'Cannot Complete Booking', message: err.message });
      }
    }
  };

  // Accept / Decline Passenger Booking Request (For driver)
  const handleAcceptBooking = (booking: BookingRequest) => {
    try {
      const targetRide = rides.find((r) => r.id === booking.rideId);
      if (!targetRide) return;

      const currentRideBookings = bookings.filter((b) => b.rideId === targetRide.id);
      const otherPending = currentRideBookings.filter((b) => b.id !== booking.id && b.status === 'PENDING');

      const result = acceptBookingRequest({
        ride: targetRide,
        requestToAccept: booking,
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

      setNotification({
        type: 'success',
        title: 'Booking Confirmed!',
        message: `You accepted booking for ${booking.passengerId}. Cash due: Rs. ${booking.totalPrice.toLocaleString()}.`,
      });
    } catch (err: unknown) {
      if (err instanceof BookingEngineError) {
        setNotification({ type: 'error', title: 'Cannot Accept Request', message: err.message });
      }
    }
  };

  const handleRejectBooking = (booking: BookingRequest) => {
    const rejected = rejectBookingRequest(booking, 'Driver cannot accommodate requested seats.');
    setBookings((prev) => prev.map((b) => (b.id === rejected.id ? rejected : b)));
    setNotification({
      type: 'info',
      title: 'Booking Declined',
      message: 'The passenger booking request has been declined.',
    });
  };

  // Cancel Booking
  const handleCancelBooking = (booking: BookingRequest) => {
    try {
      const targetRide = rides.find((r) => r.id === booking.rideId);
      if (!targetRide) return;

      const result = cancelConfirmedBooking({
        ride: targetRide,
        booking,
        cancelledBy: 'PASSENGER',
        reason: 'Schedule changed',
      });
      setRides((prev) => prev.map((r) => (r.id === result.updatedRide.id ? result.updatedRide : r)));
      setBookings((prev) => prev.map((b) => (b.id === result.updatedBooking.id ? result.updatedBooking : b)));

      setNotification({
        type: 'info',
        title: 'Booking Cancelled',
        message: 'Your booking has been cancelled.',
      });
    } catch (err: unknown) {
      if (err instanceof BookingEngineError) {
        setNotification({ type: 'error', title: 'Cancellation Error', message: err.message });
      }
    }
  };

  // Post on Sawari Request Board
  const handlePostSawariRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      setAuthView('LOGIN');
      setShowAuthModal(true);
      return;
    }

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
      seatsCount: reqBookingType === 'WHOLE_CAR' ? 4 : Number(reqSeats),
      isFamilyTrip: reqIsFamily,
      luggageSize: reqLuggage,
      acRequired: reqAc,
      budgetPrice: Number(reqBudget),
      status: 'OPEN',
      notes: reqNotes.trim() || undefined,
      offers: [],
      createdAt: new Date().toISOString(),
    };

    setPassengerRequests((prev) => [newReq, ...prev]);
    setShowPostRequestModal(false);
    setActiveNav('sawari_board');
    setNotification({
      type: 'success',
      title: 'Darkhwast Listed on Board!',
      message: `Your travel request for ${oCity} ➔ ${dCity} is posted. Verified drivers will send offers.`,
    });
  };

  // Driver Accept Budget on Sawari Board
  const handleDriverAcceptBudget = (req: PassengerRideRequest) => {
    if (!currentUser) {
      setAuthView('LOGIN');
      setShowAuthModal(true);
      return;
    }
    if (!currentUser.vehicle || !currentUser.vehicle.makeModel) {
      handleOpenOfferRide();
      return;
    }

    const defaultOffer: DriverOffer = {
      id: generateClientUniqueId('off'),
      driverId: currentUser.id,
      driverName: currentUser.name,
      driverPhone: currentUser.phone,
      driverRating: 4.9,
      driverTier: 'TOP_RATED_DRIVER',
      vehicleMakeModel: currentUser.vehicle.makeModel,
      vehiclePlate: currentUser.vehicle.plate,
      offeredPrice: req.budgetPrice,
      message: 'Accepted at your exact budget fare. Chilled AC car ready.',
      createdAt: new Date().toISOString(),
    };

    setPassengerRequests((prev) =>
      prev.map((r) => (r.id === req.id ? { ...r, offers: [...r.offers, defaultOffer] } : r))
    );

    setNotification({
      type: 'success',
      title: 'Offer Sent at Passenger Budget!',
      message: `Your offer of Rs. ${req.budgetPrice.toLocaleString()} was delivered to ${req.passengerName}.`,
    });
  };

  // Driver Submit Custom Counter-Offer
  const handleOpenCustomOfferModal = (req: PassengerRideRequest) => {
    if (!currentUser) {
      setAuthView('LOGIN');
      setShowAuthModal(true);
      return;
    }
    if (!currentUser.vehicle || !currentUser.vehicle.makeModel) {
      handleOpenOfferRide();
      return;
    }
    setSelectedReqForOffer(req);
    setOfferPriceInput(req.budgetPrice);
    setOfferMsgInput('Clean AC car, polite driver, luggage space guaranteed.');
  };

  const handleSubmitCustomOffer = (e: React.FormEvent) => {
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
      offeredPrice: Number(offerPriceInput),
      message: offerMsgInput.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    setPassengerRequests((prev) =>
      prev.map((r) => (r.id === selectedReqForOffer.id ? { ...r, offers: [...r.offers, newOffer] } : r))
    );

    setSelectedReqForOffer(null);
    setNotification({
      type: 'success',
      title: 'Custom Offer Sent!',
      message: `Your offer of Rs. ${Number(offerPriceInput).toLocaleString()} was delivered to ${selectedReqForOffer.passengerName}.`,
    });
  };

  // Passenger Accept Driver Offer
  const handleAcceptDriverOffer = (req: PassengerRideRequest, offer: DriverOffer) => {
    setPassengerRequests((prev) =>
      prev.map((r) => (r.id === req.id ? { ...r, status: 'ACCEPTED', acceptedOfferId: offer.id } : r))
    );
    setNotification({
      type: 'success',
      title: 'Driver Confirmed!',
      message: `You confirmed ${offer.driverName}'s offer for Rs. ${offer.offeredPrice.toLocaleString()}. Safe travels!`,
    });
  };

  // Passenger Cancel Own Request
  const handleCancelSawariRequest = (requestId: string) => {
    setPassengerRequests((prev) => prev.filter((r) => r.id !== requestId));
    setNotification({
      type: 'info',
      title: 'Request Cancelled',
      message: 'Your travel darkhwast has been removed from the board.',
    });
  };

  // Profile Image Upload
  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2.5 * 1024 * 1024) {
      setNotification({ type: 'error', title: 'Image Too Large', message: 'Please select an image under 2.5MB.' });
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = reader.result as string;
      setProfileAvatarUrl(res);
      setCurrentUser((prev) => (prev ? { ...prev, avatarUrl: res } : null));
    };
    reader.readAsDataURL(file);
  };

  // Save Profile
  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    const updated: AppUserProfile = {
      ...currentUser,
      name: profileName.trim() || currentUser.name,
      phone: profilePhone.trim() || currentUser.phone,
      city: profileCity || currentUser.city,
      emergencyContact: profileEmergency.trim() || currentUser.emergencyContact,
      avatarUrl: profileAvatarUrl || currentUser.avatarUrl,
      cnicNumber: profileCnic.trim() || currentUser.cnicNumber,
      licenseNumber: profileLicense.trim() || currentUser.licenseNumber,
      vehicle: profileCarModel
        ? {
            makeModel: profileCarModel.trim(),
            plate: profileCarPlate.trim() || 'LEB-4592',
            capacity: Number(profileCarCapacity) || 4,
            hasAc: profileCarAc,
            color: profileCarColor.trim() || 'White',
            imageUrl: profileCarPhotoUrl || undefined,
          }
        : currentUser.vehicle,
    };

    setCurrentUser(updated);
    setRegisteredUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    setShowProfileModal(false);
    setNotification({
      type: 'success',
      title: 'Profile Updated!',
      message: 'Your personal information, photo, and preferences have been saved.',
    });
  };

  // Demo Logins
  const handleDemoLogin = (role: 'PASSENGER' | 'DRIVER') => {
    if (role === 'PASSENGER') {
      setCurrentUser(INITIAL_DEMO_PASSENGER);
      setNotification({ type: 'success', title: 'Demo User Active', message: 'Signed in as Muhammad Ali (Sawari).' });
    } else {
      setCurrentUser(INITIAL_DEMO_DRIVER);
      setNotification({ type: 'success', title: 'Demo Driver Active', message: 'Signed in as Driver Tariq Khan.' });
    }
    setShowAuthModal(false);
  };

  // Logout
  const handleLogout = () => {
    setCurrentUser(null);
    setShowProfileModal(false);
    setNotification({ type: 'info', title: 'Signed Out', message: 'You have been signed out of Apni Sawari.' });
  };

  const openSawariRequestsCount = passengerRequests.filter((r) => r.status === 'OPEN').length;
  const myOfferedRides = rides.filter((r) => r.driverId === currentUser?.id);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased flex flex-col">
      {/* ========================================================================= */}
      {/* 1. TOP HEADER (POPIRIDE & BLABLACAR UNIFIED STYLE) */}
      {/* ========================================================================= */}
      <header className="bg-white border-b border-slate-200/90 sticky top-0 z-40 shadow-2xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Brand Logo & Tagline */}
          <div className="flex items-center gap-6">
            <div
              onClick={() => {
                setActiveNav('find_ride');
                setHasSearched(false);
              }}
              className="flex items-center gap-2.5 cursor-pointer group"
            >
              <span className="text-2xl" role="img" aria-label="car">🚗</span>
              <div>
                <span className="text-xl font-black tracking-tight text-emerald-800 group-hover:text-emerald-700 transition leading-none block">
                  Apni Sawari
                </span>
                <span className="text-[10px] text-slate-500 font-bold block">
                  اپنی سواری • Pakistan Carpool Network
                </span>
              </div>
            </div>

            {/* Navigation Links */}
            <nav className="hidden md:flex items-center gap-1 text-xs font-bold text-slate-600">
              <button
                type="button"
                onClick={() => {
                  setActiveNav('find_ride');
                  setHasSearched(false);
                }}
                className={`px-3.5 py-2 rounded-xl transition cursor-pointer ${
                  activeNav === 'find_ride'
                    ? 'text-emerald-800 bg-emerald-50 font-black'
                    : 'hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                🔍 Find a Ride
              </button>
              <button
                type="button"
                onClick={() => setActiveNav('sawari_board')}
                className={`px-3.5 py-2 rounded-xl transition cursor-pointer relative ${
                  activeNav === 'sawari_board'
                    ? 'text-emerald-800 bg-emerald-50 font-black'
                    : 'hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                📢 Sawari Board
                {openSawariRequestsCount > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.2 bg-amber-400 text-slate-900 text-[10px] font-black rounded-full">
                    {openSawariRequestsCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveNav('how_it_works')}
                className={`px-3.5 py-2 rounded-xl transition cursor-pointer ${
                  activeNav === 'how_it_works'
                    ? 'text-emerald-800 bg-emerald-50 font-black'
                    : 'hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                ℹ️ How It Works
              </button>
            </nav>
          </div>

          {/* Right Action Controls */}
          <div className="flex items-center gap-2.5">
            {/* "+ Offer a Ride" Button (BlaBlaCar style pill) */}
            <button
              type="button"
              onClick={handleOpenOfferRide}
              className="border-2 border-emerald-600 hover:bg-emerald-50 text-emerald-800 font-extrabold text-xs px-4 py-2 rounded-full transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <span className="text-sm font-black">+</span>
              <span>Offer a Ride</span>
            </button>

            {/* My Trips */}
            {currentUser && (
              <button
                type="button"
                onClick={() => setActiveNav('my_trips')}
                className={`text-xs font-bold px-3 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer ${
                  activeNav === 'my_trips'
                    ? 'bg-emerald-50 text-emerald-800 font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>🎟️</span>
                <span className="hidden sm:inline">My Trips</span>
                {bookings.length > 0 && (
                  <span className="w-4 h-4 bg-emerald-600 text-white rounded-full text-[10px] flex items-center justify-center font-bold">
                    {bookings.length}
                  </span>
                )}
              </button>
            )}

            {/* User Profile Pill or Sign In */}
            {currentUser ? (
              <button
                type="button"
                onClick={() => setShowProfileModal(true)}
                className="flex items-center gap-2 p-1 pl-1 pr-3 bg-slate-100 hover:bg-slate-200 rounded-full border border-slate-200 transition cursor-pointer"
              >
                {currentUser.avatarUrl && (currentUser.avatarUrl.startsWith('data:image') || currentUser.avatarUrl.startsWith('http')) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={currentUser.avatarUrl} alt="Avatar" className="w-7 h-7 rounded-full object-cover" />
                ) : (
                  <span className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center text-sm">
                    {currentUser.avatarUrl || '🧑'}
                  </span>
                )}
                <span className="text-xs font-bold text-slate-800 max-w-[85px] truncate hidden sm:inline">
                  {currentUser.name}
                </span>
                <span className="text-emerald-600 text-xs font-bold" title="Verified Member">✓</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setAuthView('LOGIN');
                  setShowAuthModal(true);
                }}
                className="bg-slate-900 hover:bg-black text-white text-xs font-black px-4 py-2 rounded-full transition cursor-pointer"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Notification Toast Alert */}
      {notification && (
        <div className="max-w-4xl mx-auto px-4 mt-3 w-full">
          <div
            className={`p-3.5 rounded-2xl border flex items-start justify-between shadow-xs transition ${
              notification.type === 'success'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : notification.type === 'error'
                ? 'bg-rose-50 border-rose-300 text-rose-900'
                : 'bg-blue-50 border-blue-300 text-blue-900'
            }`}
          >
            <div className="flex gap-2.5">
              <span className="text-lg">
                {notification.type === 'success' ? '✅' : notification.type === 'error' ? '⚠️' : 'ℹ️'}
              </span>
              <div>
                <h4 className="text-xs font-bold">{notification.title}</h4>
                <p className="text-[11px] mt-0.5 opacity-90">{notification.message}</p>
              </div>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="text-slate-400 hover:text-slate-700 text-xs font-bold px-1"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. HERO SEARCH CAPSULE (POPARIDE & BLABLACAR FLOATING WIDGET) */}
      {/* ========================================================================= */}
      {activeNav === 'find_ride' && (
        <section className="bg-gradient-to-b from-emerald-50/70 via-slate-50 to-slate-50 pt-8 pb-10 border-b border-slate-200/60">
          <div className="max-w-5xl mx-auto px-4 text-center space-y-2 mb-6">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Pakistan&apos;s Intercity Carpool &amp; Return Ride Network
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 font-medium max-w-xl mx-auto">
              اپنی سواری • Share travel costs, reserve single seats or entire cars with verified drivers.
            </p>
          </div>

          {/* Floating Horizontal Search Capsule */}
          <div className="max-w-4xl mx-auto px-4">
            <form
              onSubmit={handleSearchSubmit}
              className="bg-white shadow-xl shadow-slate-200/70 rounded-3xl md:rounded-full border border-slate-200 p-2 flex flex-col md:flex-row items-center gap-1.5"
            >
              {/* Leaving From */}
              <div className="flex-1 w-full px-4 py-2 flex items-center gap-2 hover:bg-slate-50 rounded-2xl md:rounded-full transition">
                <span className="text-base text-emerald-700">🟢</span>
                <div className="w-full text-left">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Leaving From
                  </label>
                  <select
                    value={searchOrigin}
                    onChange={(e) => setSearchOrigin(e.target.value)}
                    className="w-full bg-transparent text-sm font-extrabold text-slate-900 focus:outline-none cursor-pointer"
                  >
                    {NATIONWIDE_CITIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.province})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Swap Button */}
              <button
                type="button"
                onClick={handleSwapCities}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center shrink-0 transition cursor-pointer"
                title="Swap Departure and Destination"
              >
                ⇄
              </button>

              {/* Going To */}
              <div className="flex-1 w-full px-4 py-2 flex items-center gap-2 hover:bg-slate-50 rounded-2xl md:rounded-full transition border-t md:border-t-0 md:border-l border-slate-200">
                <span className="text-base text-rose-600">🔴</span>
                <div className="w-full text-left">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Going To
                  </label>
                  <select
                    value={searchDest}
                    onChange={(e) => setSearchDest(e.target.value)}
                    className="w-full bg-transparent text-sm font-extrabold text-slate-900 focus:outline-none cursor-pointer"
                  >
                    {NATIONWIDE_CITIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.province})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Date */}
              <div className="w-full md:w-32 px-4 py-2 flex items-center gap-2 hover:bg-slate-50 rounded-2xl md:rounded-full transition border-t md:border-t-0 md:border-l border-slate-200 text-left">
                <span className="text-base text-blue-600">📅</span>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Date
                  </label>
                  <span className="text-xs font-black text-slate-900 block truncate">Today</span>
                </div>
              </div>

              {/* Search Button */}
              <button
                type="submit"
                className="w-full md:w-auto bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs px-7 py-3.5 rounded-2xl md:rounded-full shadow-sm transition flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
              >
                <span>Find a Ride</span>
              </button>
            </form>

            {/* Popular Route Shortcuts */}
            <div className="mt-4 flex items-center justify-center flex-wrap gap-1.5 text-xs">
              <span className="text-[11px] text-slate-400 font-bold uppercase mr-1">Popular Routes:</span>
              <button
                type="button"
                onClick={() => {
                  setSearchOrigin('loc-uk');
                  setSearchDest('loc-khi');
                  setHasSearched(true);
                }}
                className="px-3 py-1 bg-white hover:bg-emerald-50 hover:text-emerald-800 text-slate-700 rounded-full border border-slate-200 transition font-bold cursor-pointer"
              >
                Umerkot ➔ Karachi
              </button>
              <button
                type="button"
                onClick={() => {
                  setSearchOrigin('loc-khi');
                  setSearchDest('loc-hyd');
                  setHasSearched(true);
                }}
                className="px-3 py-1 bg-white hover:bg-emerald-50 hover:text-emerald-800 text-slate-700 rounded-full border border-slate-200 transition font-bold cursor-pointer"
              >
                Karachi ➔ Hyderabad
              </button>
              <button
                type="button"
                onClick={() => {
                  setSearchOrigin('loc-lhr');
                  setSearchDest('loc-isb');
                  setHasSearched(true);
                }}
                className="px-3 py-1 bg-white hover:bg-emerald-50 hover:text-emerald-800 text-slate-700 rounded-full border border-slate-200 transition font-bold cursor-pointer"
              >
                Lahore ➔ Islamabad
              </button>
              <button
                type="button"
                onClick={() => {
                  setSearchOrigin('loc-mul');
                  setSearchDest('loc-lhr');
                  setHasSearched(true);
                }}
                className="px-3 py-1 bg-white hover:bg-emerald-50 hover:text-emerald-800 text-slate-700 rounded-full border border-slate-200 transition font-bold cursor-pointer"
              >
                Multan ➔ Lahore
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* 3. MAIN CONTENT CONTAINER */}
      {/* ========================================================================= */}
      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-6 w-full space-y-6">
        {/* VIEW 1: FIND A RIDE (BLABLACAR / POPARIDE FEED) */}
        {activeNav === 'find_ride' && (
          <div className="space-y-5">
            {/* Filter Chips Bar */}
            <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
                <button
                  type="button"
                  onClick={() => setActiveTagFilter('ALL')}
                  className={`px-3 py-1.5 rounded-full font-bold transition whitespace-nowrap cursor-pointer ${
                    activeTagFilter === 'ALL'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  All Rides ({matchingRides.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTagFilter('KHALI_WAPSI')}
                  className={`px-3 py-1.5 rounded-full font-bold transition whitespace-nowrap cursor-pointer ${
                    activeTagFilter === 'KHALI_WAPSI'
                      ? 'bg-rose-700 text-white shadow-xs'
                      : 'bg-white text-rose-700 border border-rose-200 hover:bg-rose-50'
                  }`}
                >
                  🏷️ Khali Wapsi Deals
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTagFilter('FAMILY')}
                  className={`px-3 py-1.5 rounded-full font-bold transition whitespace-nowrap cursor-pointer ${
                    activeTagFilter === 'FAMILY'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'bg-white text-emerald-800 border border-emerald-200 hover:bg-emerald-50'
                  }`}
                >
                  👨‍👩‍👧 Family Friendly
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTagFilter('MAX_2_BACK')}
                  className={`px-3 py-1.5 rounded-full font-bold transition whitespace-nowrap cursor-pointer ${
                    activeTagFilter === 'MAX_2_BACK'
                      ? 'bg-blue-700 text-white shadow-xs'
                      : 'bg-white text-blue-800 border border-blue-200 hover:bg-blue-50'
                  }`}
                >
                  🛋️ Max 2 in Back
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTagFilter('LADIES_ONLY')}
                  className={`px-3 py-1.5 rounded-full font-bold transition whitespace-nowrap cursor-pointer ${
                    activeTagFilter === 'LADIES_ONLY'
                      ? 'bg-purple-700 text-white shadow-xs'
                      : 'bg-white text-purple-800 border border-purple-200 hover:bg-purple-50'
                  }`}
                >
                  🧕 Ladies Modesty
                </button>
              </div>

              {/* Sawari Board Link Callout */}
              <button
                type="button"
                onClick={() => setActiveNav('sawari_board')}
                className="text-xs text-emerald-800 font-extrabold hover:underline flex items-center gap-1"
              >
                <span>📢 Can&apos;t find a ride? Post on Sawari Board ({openSawariRequestsCount}) ➔</span>
              </button>
            </div>

            {/* Results Header */}
            <div className="flex items-center justify-between text-xs text-slate-500 font-bold border-b border-slate-200 pb-2">
              <span>
                {hasSearched ? `Available Rides from ${originCityName} to ${destCityName}` : 'All Nationwide Scheduled Journeys'}
              </span>
              <span>{matchingRides.length} ride(s) found</span>
            </div>

            {/* Ride Cards List (Poparide / BlaBlaCar horizontal style) */}
            {matchingRides.length === 0 ? (
              <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center space-y-3">
                <span className="text-3xl block">🚗</span>
                <h3 className="text-base font-black text-slate-800">No matching rides found for this route</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Don&apos;t worry! You can post a travel request on the Sawari Board, and verified drivers will offer you custom quotes.
                </p>
                <div className="pt-2 flex justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setReqOrigin(searchOrigin);
                      setReqDest(searchDest);
                      setShowPostRequestModal(true);
                    }}
                    className="bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs py-2.5 px-4 rounded-xl transition cursor-pointer"
                  >
                    Post Request on Sawari Board
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHasSearched(false);
                      setActiveTagFilter('ALL');
                    }}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-2.5 px-4 rounded-xl transition cursor-pointer"
                  >
                    View All Nationwide Rides
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3.5">
                {matchingRides.map((ride) => {
                  const oCity = NATIONWIDE_CITIES.find((c) => c.id === ride.originLocationId)?.name || 'Origin';
                  const dCity = NATIONWIDE_CITIES.find((c) => c.id === ride.destinationLocationId)?.name || 'Destination';
                  const rBookings = bookings.filter((b) => b.rideId === ride.id);
                  const seatsLeft = calculateAvailableSeats(ride, rBookings);

                  return (
                    <div
                      key={ride.id}
                      className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-2xs hover:shadow-md transition p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      {/* Left: Driver Avatar & Rating */}
                      <div className="flex items-center gap-3.5 shrink-0">
                        <div className="w-12 h-12 rounded-full bg-emerald-100 border border-emerald-300 flex items-center justify-center text-xl shrink-0 shadow-2xs">
                          {ride.driverId === 'driver-tariq' ? '👨‍✈️' : '🚗'}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-black text-slate-900 text-sm">
                              {getDriverDisplayName(ride.driverId)}
                            </span>
                            <span className="text-emerald-700 text-xs font-bold" title="Verified Driver">✓</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold mt-0.5">
                            <span className="text-amber-500 font-bold">★ 4.9</span>
                            <span>•</span>
                            <span>140+ trips</span>
                          </div>
                          <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                            Toyota Corolla GLi (White)
                          </p>
                        </div>
                      </div>

                      {/* Center: Route Timeline, Stops, and Comfort Badges */}
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2.5">
                          <span className="font-black text-slate-900 text-sm sm:text-base">
                            07:00 AM <strong className="font-extrabold text-slate-800">{oCity}</strong>
                          </span>
                          <span className="text-slate-400 text-xs font-bold">➔</span>
                          <span className="font-black text-slate-900 text-sm sm:text-base">
                            11:30 AM <strong className="font-extrabold text-slate-800">{dCity}</strong>
                          </span>
                        </div>

                        {/* Corridor Stops */}
                        {ride.routeStops && ride.routeStops.length > 0 && (
                          <p className="text-[11px] text-slate-500 font-medium">
                            Via: {ride.routeStops.map((s) => s.name).join(' • ')}
                          </p>
                        )}

                        {/* Badges */}
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {ride.isReturnDeal && (
                            <span className="text-[10px] bg-rose-50 text-rose-800 border border-rose-200 font-black px-2 py-0.5 rounded-md">
                              🏷️ Khali Wapsi Deal
                            </span>
                          )}
                          {ride.travelComfort?.familyOnboard && (
                            <span className="text-[10px] bg-emerald-50 text-emerald-900 border border-emerald-200 font-bold px-2 py-0.5 rounded-md">
                              👨‍👩‍👧 Family Onboard
                            </span>
                          )}
                          {ride.travelComfort?.acType === 'CHILLED_AC' && (
                            <span className="text-[10px] bg-cyan-50 text-cyan-900 border border-cyan-200 font-bold px-2 py-0.5 rounded-md">
                              ❄️ Chilled AC
                            </span>
                          )}
                          {ride.travelComfort?.namazBreak && (
                            <span className="text-[10px] bg-amber-50 text-amber-900 border border-amber-200 font-bold px-2 py-0.5 rounded-md">
                              🕌 Namaz Break
                            </span>
                          )}
                          {ride.travelComfort?.tollsIncluded && (
                            <span className="text-[10px] bg-slate-100 text-slate-700 border border-slate-200 font-bold px-2 py-0.5 rounded-md">
                              ✅ Tolls Included
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right: Price & Booking Action */}
                      <div className="shrink-0 flex md:flex-col items-center md:items-end justify-between md:justify-center gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
                        <div className="text-left md:text-right">
                          <div className="text-lg sm:text-xl font-black text-slate-900">
                            Rs. {ride.seatPrice ? ride.seatPrice.toLocaleString() : ride.wholeCarPrice.toLocaleString()}
                            <span className="text-xs text-slate-500 font-medium">
                              {' '}{ride.seatPrice ? '/ seat' : ' (Car)'}
                            </span>
                          </div>
                          <span className="text-[11px] font-bold text-emerald-700 block">
                            ⚡ {seatsLeft} seat(s) remaining
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleOpenBooking(ride)}
                          className="bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs px-5 py-2.5 rounded-xl shadow-xs transition flex items-center gap-1 cursor-pointer"
                        >
                          <span>Book Ride</span>
                          <span>➔</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* VIEW 2: SAWARI REQUEST BOARD (REVERSE MARKETPLACE) */}
        {activeNav === 'sawari_board' && (
          <div className="space-y-5">
            {/* Board Banner */}
            <div className="bg-gradient-to-r from-emerald-800 to-teal-900 text-white p-5 sm:p-6 rounded-3xl shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">📢</span>
                  <h2 className="text-lg font-black tracking-tight">Sawari Request Board (سواری بورڈ)</h2>
                </div>
                <p className="text-xs text-emerald-200 mt-1 max-w-xl">
                  Can&apos;t find a scheduled ride? Post where and when you need to travel. Verified drivers heading that way will submit custom offers or accept at your budget fare.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowPostRequestModal(true)}
                className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs py-3 px-4 rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <span>➕</span>
                <span>Post Travel Request</span>
              </button>
            </div>

            {/* Requests Feed */}
            <div className="space-y-3.5">
              <div className="flex items-center justify-between text-xs text-slate-500 font-bold px-1">
                <span>Active Passenger Requests ({passengerRequests.length})</span>
                <span>Open for Driver Quotes</span>
              </div>

              {passengerRequests.length === 0 ? (
                <div className="bg-white p-8 rounded-3xl border border-slate-200 text-center space-y-2">
                  <span className="text-3xl block">📬</span>
                  <h4 className="text-sm font-bold text-slate-800">No open requests right now</h4>
                  <p className="text-xs text-slate-500">Be the first to list your travel need on the board!</p>
                </div>
              ) : (
                passengerRequests.map((req) => {
                  const isOwner = currentUser?.id === req.passengerId;
                  const canOffer = currentUser && currentUser.vehicle; // Any user with vehicle can offer!

                  return (
                    <div
                      key={req.id}
                      className={`bg-white rounded-3xl p-5 border transition shadow-2xs space-y-3.5 ${
                        req.status === 'ACCEPTED' ? 'border-emerald-300 bg-emerald-50/30' : 'border-slate-200'
                      }`}
                    >
                      {/* Route & Badges */}
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-base font-black text-slate-900">{req.originName}</span>
                          <span className="text-emerald-700 font-bold">➔</span>
                          <span className="text-base font-black text-slate-900">{req.destinationName}</span>
                          {isOwner && (
                            <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 font-extrabold text-[10px] px-2 py-0.5 rounded-full">
                              🏷️ Your Listing
                            </span>
                          )}
                        </div>

                        <span
                          className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase ${
                            req.status === 'ACCEPTED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {req.status === 'ACCEPTED' ? '✓ Driver Confirmed' : '🟢 Open for Quotes'}
                        </span>
                      </div>

                      {/* Travel Details Tags */}
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                        <span className="bg-slate-100 text-slate-800 font-bold px-2 py-0.5 rounded-lg text-[11px] flex items-center gap-1">
                          <span>📅</span>
                          <span>{req.travelDate} ({req.desiredTime})</span>
                        </span>

                        <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold px-2 py-0.5 rounded-lg text-[11px]">
                          {req.bookingType === 'WHOLE_CAR' ? '🚗 Full Car' : `💺 ${req.seatsCount} Seat(s)`}
                        </span>

                        {req.isFamilyTrip && (
                          <span className="bg-purple-50 text-purple-800 border border-purple-200 font-bold px-2 py-0.5 rounded-lg text-[11px]">
                            👨‍👩‍👧 Family Trip
                          </span>
                        )}

                        {req.acRequired && (
                          <span className="bg-cyan-50 text-cyan-800 border border-cyan-200 font-bold px-2 py-0.5 rounded-lg text-[11px]">
                            ❄️ AC Required
                          </span>
                        )}
                      </div>

                      {/* Requester note */}
                      {req.notes && (
                        <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100 italic">
                          &quot;{req.notes}&quot;
                        </p>
                      )}

                      {/* Budget and Actions Bar */}
                      <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                        <div>
                          <span className="block text-[10px] font-bold text-slate-400 uppercase">
                            Passenger Budget:
                          </span>
                          <span className="text-base font-black text-emerald-800">
                            Rs. {req.budgetPrice.toLocaleString()}
                          </span>
                          <span className="text-[10px] text-slate-500 font-medium ml-1">(Direct Cash)</span>
                        </div>

                        {/* Actions (Point 2: Users cannot accept their own request; drivers act only on others' requests) */}
                        {isOwner ? (
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-slate-500 font-medium">
                              {req.offers.length === 0
                                ? '⏳ Awaiting Driver Offers'
                                : `💬 ${req.offers.length} Offer(s) Received`}
                            </span>
                            {req.status === 'OPEN' && (
                              <button
                                type="button"
                                onClick={() => handleCancelSawariRequest(req.id)}
                                className="text-xs text-rose-600 hover:text-rose-800 font-bold bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200 cursor-pointer"
                              >
                                Cancel Request
                              </button>
                            )}
                          </div>
                        ) : req.status === 'OPEN' ? (
                          <div className="flex items-center gap-2">
                            {req.offers.some((o) => o.driverId === currentUser?.id) ? (
                              <span className="text-xs font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-3 py-1.5 rounded-xl">
                                ✓ Offer Already Submitted
                              </span>
                            ) : canOffer ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleDriverAcceptBudget(req)}
                                  className="bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs py-2 px-3 rounded-xl transition shadow-xs flex items-center gap-1 cursor-pointer"
                                >
                                  <span>⚡</span>
                                  <span>Accept Budget</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenCustomOfferModal(req)}
                                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-bold text-xs py-2 px-3 rounded-xl transition cursor-pointer"
                                >
                                  Send Custom Offer
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={handleOpenOfferRide}
                                className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs py-1.5 px-3 rounded-xl transition shadow-xs cursor-pointer"
                              >
                                Offer Ride on this Request
                              </button>
                            )}
                          </div>
                        ) : null}
                      </div>

                      {/* Offers List */}
                      {req.offers.length > 0 && (
                        <div className="pt-2 border-t border-slate-100 space-y-2">
                          <span className="text-xs font-bold text-slate-600 block">
                            Driver Offers Received ({req.offers.length}):
                          </span>
                          <div className="space-y-2">
                            {req.offers.map((offer) => {
                              const isAccepted = req.acceptedOfferId === offer.id;
                              return (
                                <div
                                  key={offer.id}
                                  className={`p-3 rounded-2xl border text-xs flex items-center justify-between ${
                                    isAccepted ? 'bg-emerald-100/70 border-emerald-400' : 'bg-slate-50 border-slate-200'
                                  }`}
                                >
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-black text-slate-900">{offer.driverName}</span>
                                      <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded">
                                        ⭐ {offer.driverRating || 4.9}
                                      </span>
                                      <span className="text-[10px] text-slate-500 font-semibold">
                                        {offer.vehicleMakeModel}
                                      </span>
                                    </div>
                                    {offer.message && (
                                      <p className="text-[11px] text-slate-600 mt-0.5">&quot;{offer.message}&quot;</p>
                                    )}
                                  </div>

                                  <div className="text-right flex items-center gap-2.5">
                                    <span className="font-black text-sm text-emerald-800">
                                      Rs. {offer.offeredPrice.toLocaleString()}
                                    </span>

                                    {isOwner && req.status === 'OPEN' && (
                                      <button
                                        type="button"
                                        onClick={() => handleAcceptDriverOffer(req, offer)}
                                        className="bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs py-2 px-3 rounded-xl transition cursor-pointer"
                                      >
                                        Confirm Driver
                                      </button>
                                    )}

                                    {isAccepted && (
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

        {/* VIEW 3: MY TRIPS & OFFERINGS */}
        {activeNav === 'my_trips' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-900">My Trips &amp; Bookings</h2>
                <p className="text-xs text-slate-500">
                  Track your booked journeys, boarding checkpoints, or manage passenger requests for rides you offered.
                </p>
              </div>

              <button
                type="button"
                onClick={handleOpenOfferRide}
                className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs py-2 px-3.5 rounded-xl transition cursor-pointer"
              >
                + Offer New Ride
              </button>
            </div>

            {/* SECTION A: BOOKINGS AS PASSENGER */}
            <div className="space-y-3">
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-1.5">
                <span>🎟️</span>
                <span>Rides You Booked ({bookings.length})</span>
              </h3>

              {bookings.length === 0 ? (
                <div className="bg-white p-6 rounded-3xl border border-slate-200 text-center space-y-2">
                  <span className="text-3xl block">🎫</span>
                  <p className="text-xs font-bold text-slate-700">No active bookings</p>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveNav('find_ride');
                      setHasSearched(false);
                    }}
                    className="text-xs text-emerald-700 font-black hover:underline"
                  >
                    Find a Ride Now ➔
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {bookings.map((b) => (
                    <div
                      key={b.id}
                      className={`bg-white p-5 rounded-3xl border transition shadow-2xs space-y-3 ${
                        b.status === 'ACCEPTED'
                          ? 'border-emerald-300'
                          : b.status === 'PENDING'
                          ? 'border-amber-300'
                          : 'border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-black text-slate-900">
                          {b.bookingType === 'WHOLE_CAR'
                            ? b.isRoundTrip
                              ? '🚗 Entire Car (Round-Trip)'
                              : '🚗 Entire Car Booking'
                            : `💺 ${b.requestedSeats} Seat(s)`}
                        </span>

                        <span
                          className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase ${
                            b.status === 'ACCEPTED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : b.status === 'PENDING'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {b.status === 'ACCEPTED' ? '✓ Confirmed by Driver' : b.status === 'PENDING' ? '⏳ Waiting Driver' : b.status}
                        </span>
                      </div>

                      <div className="text-xs text-slate-600 flex justify-between items-center bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">Fare Due:</span>
                          <span className="font-extrabold text-sm text-emerald-900">
                            Rs. {b.totalPrice.toLocaleString()} (Cash)
                          </span>
                        </div>
                        {b.dropoffStopName && (
                          <span className="text-[11px] font-bold text-slate-700">
                            📍 Dropoff: {b.dropoffStopName}
                          </span>
                        )}
                      </div>

                      {/* Boarding Info if accepted */}
                      {b.status === 'ACCEPTED' && (
                        <div className="bg-emerald-50 text-emerald-950 p-3 rounded-2xl border border-emerald-300 text-xs space-y-1">
                          <span className="font-bold block">🛡️ In-App Protected Journey</span>
                          <p className="text-[11px] text-emerald-800">
                            Boarding Point: Designated Terminal Hub. Pay Rs. {b.totalPrice.toLocaleString()} directly to the driver upon boarding.
                          </p>
                        </div>
                      )}

                      {(b.status === 'PENDING' || b.status === 'ACCEPTED') && (
                        <div className="flex justify-end pt-1">
                          <button
                            type="button"
                            onClick={() => handleCancelBooking(b)}
                            className="text-xs text-rose-600 hover:text-rose-800 font-bold hover:underline cursor-pointer"
                          >
                            Cancel Booking
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* SECTION B: RIDES OFFERED AS DRIVER */}
            {currentUser?.vehicle && (
              <div className="space-y-3 pt-4 border-t border-slate-200">
                <h3 className="text-sm font-black text-slate-800 flex items-center gap-1.5">
                  <span>🚗</span>
                  <span>Journeys You Offered ({myOfferedRides.length})</span>
                </h3>

                {myOfferedRides.length === 0 ? (
                  <div className="bg-white p-6 rounded-3xl border border-slate-200 text-center space-y-2">
                    <span className="text-3xl block">🛣️</span>
                    <p className="text-xs font-bold text-slate-700">You haven&apos;t listed any rides yet</p>
                    <button
                      type="button"
                      onClick={handleOpenOfferRide}
                      className="text-xs text-emerald-700 font-black hover:underline"
                    >
                      Offer a Ride Now ➔
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {myOfferedRides.map((ride) => {
                      const oName = NATIONWIDE_CITIES.find((c) => c.id === ride.originLocationId)?.name || 'Origin';
                      const dName = NATIONWIDE_CITIES.find((c) => c.id === ride.destinationLocationId)?.name || 'Destination';
                      const rideRequests = bookings.filter((b) => b.rideId === ride.id && b.status === 'PENDING');

                      return (
                        <div key={ride.id} className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="font-black text-sm text-slate-900">
                              {oName} ➔ {dName}
                            </span>
                            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full">
                              Active Listing
                            </span>
                          </div>

                          <div className="text-xs text-slate-500">
                            Whole Car: Rs. {ride.wholeCarPrice.toLocaleString()} • Seat: Rs. {ride.seatPrice?.toLocaleString()} • Booked: {ride.bookedSeatsCount}/{ride.capacity}
                          </div>

                          {/* Incoming passenger requests for this ride */}
                          {rideRequests.length > 0 && (
                            <div className="pt-2 border-t border-slate-100 space-y-2">
                              <span className="text-xs font-bold text-amber-900">
                                📩 Pending Booking Requests ({rideRequests.length}):
                              </span>
                              {rideRequests.map((req) => (
                                <div
                                  key={req.id}
                                  className="bg-amber-50/70 p-3 rounded-2xl border border-amber-200 flex items-center justify-between text-xs"
                                >
                                  <div>
                                    <span className="font-bold text-slate-900 block">{req.passengerId}</span>
                                    <span className="text-[11px] text-slate-600">
                                      {req.bookingType === 'WHOLE_CAR' ? 'Full Car' : `${req.requestedSeats} Seat(s)`} • Rs. {req.totalPrice.toLocaleString()}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleAcceptBooking(req)}
                                      className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs py-1.5 px-3 rounded-xl transition cursor-pointer"
                                    >
                                      Accept
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleRejectBooking(req)}
                                      className="bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 font-bold text-xs py-1.5 px-2.5 rounded-xl transition cursor-pointer"
                                    >
                                      Decline
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* VIEW 4: HOW IT WORKS (POPARIDE/BLABLACAR TRUST SECTION) */}
        {activeNav === 'how_it_works' && (
          <div className="space-y-6 max-w-4xl mx-auto">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-black text-slate-900">How Apni Sawari Works</h2>
              <p className="text-xs sm:text-sm text-slate-600 max-w-md mx-auto">
                Safe, simple, and affordable intercity carpooling for everyone across Pakistan.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-6 rounded-3xl border border-slate-200 text-center space-y-2 shadow-2xs">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-800 text-xl font-black flex items-center justify-center mx-auto">
                  1
                </div>
                <h3 className="font-black text-sm text-slate-900">Find or Request a Ride</h3>
                <p className="text-xs text-slate-500">
                  Search scheduled intercity trips or post your custom travel requirements on the Sawari Board.
                </p>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-slate-200 text-center space-y-2 shadow-2xs">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-800 text-xl font-black flex items-center justify-center mx-auto">
                  2
                </div>
                <h3 className="font-black text-sm text-slate-900">Travel with Verified Drivers</h3>
                <p className="text-xs text-slate-500">
                  All drivers are verified with CNIC, driving license, and vehicle registration book for family safety.
                </p>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-slate-200 text-center space-y-2 shadow-2xs">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-800 text-xl font-black flex items-center justify-center mx-auto">
                  3
                </div>
                <h3 className="font-black text-sm text-slate-900">Pay Direct Cash on Boarding</h3>
                <p className="text-xs text-slate-500">
                  No advance payments or commission charges. Settle the agreed fare directly with your driver in cash.
                </p>
              </div>
            </div>

            <div className="bg-emerald-50 rounded-3xl p-6 border border-emerald-200 text-center space-y-3">
              <h3 className="font-black text-base text-emerald-950">Have an Empty Car Heading Out?</h3>
              <p className="text-xs text-emerald-800 max-w-md mx-auto">
                Cover your fuel and motorway toll costs by taking friendly passengers on your regular or empty return trips.
              </p>
              <button
                type="button"
                onClick={handleOpenOfferRide}
                className="bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs py-3 px-6 rounded-full transition shadow-xs cursor-pointer inline-flex items-center gap-1.5"
              >
                <span>+ Offer a Ride Now</span>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* ========================================================================= */}
      {/* 4. MODALS & POPUPS */}
      {/* ========================================================================= */}

      {/* MODAL 1: BOOKING CONFIRMATION DRAWER */}
      {showBookingModal && selectedRideForBooking && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900">Reserve Your Ride</h3>
                <p className="text-xs text-slate-500">
                  {getDriverDisplayName(selectedRideForBooking.driverId)} • Toyota Corolla
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowBookingModal(false)}
                className="text-slate-400 hover:text-slate-700 font-bold text-lg p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmBooking} className="space-y-4">
              {/* Mode Toggle: Entire Car vs Seats */}
              {selectedRideForBooking.bookingMode === 'WHOLE_CAR_OR_SEATS' && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Select Booking Option:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setBookingModeChoice('SEAT')}
                      className={`p-2.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                        bookingModeChoice === 'SEAT'
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-950 font-black'
                          : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >
                      💺 Book by Seat (Rs. {selectedRideForBooking.seatPrice?.toLocaleString()})
                    </button>
                    <button
                      type="button"
                      onClick={() => setBookingModeChoice('WHOLE_CAR')}
                      className={`p-2.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                        bookingModeChoice === 'WHOLE_CAR'
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-950 font-black'
                          : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >
                      🚗 Full Car (Rs. {selectedRideForBooking.wholeCarPrice.toLocaleString()})
                    </button>
                  </div>
                </div>
              )}

              {/* Seat Count (if by seat) */}
              {bookingModeChoice === 'SEAT' && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Number of Seats Needed:
                  </label>
                  <div className="flex items-center gap-3">
                    {[1, 2, 3, 4].map((cnt) => (
                      <button
                        key={cnt}
                        type="button"
                        onClick={() => setBookingSeatsCount(cnt)}
                        className={`w-10 h-10 rounded-xl text-xs font-black transition cursor-pointer ${
                          bookingSeatsCount === cnt
                            ? 'bg-emerald-700 text-white'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {cnt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Round Trip for Whole Car */}
              {bookingModeChoice === 'WHOLE_CAR' && selectedRideForBooking.roundTripAllowed && (
                <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200 space-y-2 text-xs">
                  <label className="font-bold text-emerald-950 flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bookingIsRoundTrip}
                      onChange={(e) => setBookingIsRoundTrip(e.target.checked)}
                      className="w-4 h-4 accent-emerald-600 rounded"
                    />
                    <span>Include Round-Trip Return (اسی دن واپسی شامل کریں)</span>
                  </label>
                  {bookingIsRoundTrip && (
                    <p className="text-[11px] text-emerald-800">
                      Package deal: Rs. {selectedRideForBooking.roundTripWholeCarPrice?.toLocaleString()} (Saves 20% compared to two one-way rides!).
                    </p>
                  )}
                </div>
              )}

              {/* Drop-off Stop */}
              {selectedRideForBooking.routeStops && selectedRideForBooking.routeStops.length > 0 && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Select Drop-off Destination:
                  </label>
                  <select
                    value={bookingSelectedDropoff}
                    onChange={(e) => setBookingSelectedDropoff(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
                  >
                    <option value="DEFAULT">Final Destination (Route End)</option>
                    {selectedRideForBooking.routeStops.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name} (Rs. {bookingModeChoice === 'WHOLE_CAR' ? s.wholeCarPrice : s.seatPrice})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="submit"
                className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs py-3.5 rounded-2xl shadow-sm transition uppercase tracking-wider cursor-pointer"
              >
                Send Booking Request to Driver
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: OFFER A RIDE (UNIVERSAL FLOW - NO SEPARATE DRIVER MODE) */}
      {showOfferRideModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  {offerStep === 'VEHICLE_SETUP' ? 'Setup Your Vehicle' : 'Publish Your Journey'}
                </h3>
                <p className="text-xs text-slate-500">
                  {offerStep === 'VEHICLE_SETUP'
                    ? 'Enter vehicle details once to start offering rides'
                    : 'List your seats or full car for verified passengers'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowOfferRideModal(false)}
                className="text-slate-400 hover:text-slate-700 font-bold text-lg p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {offerStep === 'VEHICLE_SETUP' ? (
              <form onSubmit={handleSaveVehicleAndProceed} className="space-y-3.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Car Make &amp; Model</label>
                  <input
                    type="text"
                    value={offerCarModel}
                    onChange={(e) => setOfferCarModel(e.target.value)}
                    placeholder="e.g. Toyota Corolla GLi / Honda City"
                    required
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Plate Number</label>
                    <input
                      type="text"
                      value={offerCarPlate}
                      onChange={(e) => setOfferCarPlate(e.target.value)}
                      placeholder="LEB-4592"
                      required
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold uppercase font-mono focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Color</label>
                    <input
                      type="text"
                      value={offerCarColor}
                      onChange={(e) => setOfferCarColor(e.target.value)}
                      placeholder="White, Silver"
                      required
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={offerCarAc}
                      onChange={(e) => setOfferCarAc(e.target.checked)}
                      className="w-4 h-4 accent-emerald-600 rounded"
                    />
                    <span>Working Chilled AC Installed</span>
                  </label>
                </div>

                <button
                  type="submit"
                  className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs py-3.5 rounded-2xl shadow-sm transition uppercase tracking-wider cursor-pointer"
                >
                  Continue to Journey Details ➔
                </button>
              </form>
            ) : (
              <form onSubmit={handlePublishJourney} className="space-y-3.5">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">From</label>
                    <select
                      value={postOrigin}
                      onChange={(e) => setPostOrigin(e.target.value)}
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
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">To</label>
                    <select
                      value={postDest}
                      onChange={(e) => setPostDest(e.target.value)}
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

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Per Seat Price (Rs.)</label>
                    <input
                      type="number"
                      value={postSeatPrice}
                      onChange={(e) => setPostSeatPrice(Number(e.target.value))}
                      required
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Whole Car Price (Rs.)</label>
                    <input
                      type="number"
                      value={postCarPrice}
                      onChange={(e) => setPostCarPrice(Number(e.target.value))}
                      required
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-semibold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Departure Time</label>
                    <input
                      type="text"
                      value={postTime}
                      onChange={(e) => setPostTime(e.target.value)}
                      placeholder="07:00 AM"
                      required
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Departure Date</label>
                    <input
                      type="date"
                      value={postDate}
                      onChange={(e) => setPostDate(e.target.value)}
                      required
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-semibold"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer text-slate-700">
                    <input
                      type="checkbox"
                      checked={postIsReturnDeal}
                      onChange={(e) => setPostIsReturnDeal(e.target.checked)}
                      className="w-4 h-4 accent-rose-600 rounded"
                    />
                    <span>🏷️ Khali Wapsi Deal</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-slate-700">
                    <input
                      type="checkbox"
                      checked={postNamazBreak}
                      onChange={(e) => setPostNamazBreak(e.target.checked)}
                      className="w-4 h-4 accent-amber-600 rounded"
                    />
                    <span>🕌 Namaz Break</span>
                  </label>
                </div>

                <button
                  type="submit"
                  className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs py-3.5 rounded-2xl shadow-sm transition uppercase tracking-wider cursor-pointer"
                >
                  Publish Ride Online
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL 3: POST SAWARI REQUEST MODAL */}
      {showPostRequestModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900">Post on Sawari Request Board</h3>
                <p className="text-xs text-slate-500">Drivers will review your request and send direct offers</p>
              </div>
              <button
                type="button"
                onClick={() => setShowPostRequestModal(false)}
                className="text-slate-400 hover:text-slate-700 font-bold text-lg p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handlePostSawariRequest} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Departure City</label>
                  <select
                    value={reqOrigin}
                    onChange={(e) => setReqOrigin(e.target.value)}
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
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Arrival City</label>
                  <select
                    value={reqDest}
                    onChange={(e) => setReqDest(e.target.value)}
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

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Option</label>
                  <select
                    value={reqBookingType}
                    onChange={(e) => setReqBookingType(e.target.value as 'WHOLE_CAR' | 'SEAT')}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-semibold"
                  >
                    <option value="WHOLE_CAR">🚗 Full Car</option>
                    <option value="SEAT">💺 Single Seats</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Your Budget Fare (Rs.)</label>
                  <input
                    type="number"
                    value={reqBudget}
                    onChange={(e) => setReqBudget(Number(e.target.value))}
                    required
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Travel Date</label>
                  <input
                    type="date"
                    value={reqDate}
                    onChange={(e) => setReqDate(e.target.value)}
                    required
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Preferred Time</label>
                  <input
                    type="text"
                    value={reqTime}
                    onChange={(e) => setReqTime(e.target.value)}
                    placeholder="08:30 AM"
                    required
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Notes / Special Needs</label>
                <input
                  type="text"
                  value={reqNotes}
                  onChange={(e) => setReqNotes(e.target.value)}
                  placeholder="Traveling with family, need polite driver, etc."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-semibold"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs py-3.5 rounded-2xl shadow-sm transition uppercase tracking-wider cursor-pointer"
              >
                Post Request on Board
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: DRIVER COUNTER-OFFER MODAL */}
      {selectedReqForOffer && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div>
                <h3 className="text-base font-black text-slate-900 leading-tight">
                  Offer to {selectedReqForOffer.passengerName}
                </h3>
                <p className="text-xs text-slate-500">
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

            <form onSubmit={handleSubmitCustomOffer} className="space-y-3 pt-1">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Your Offered Fare (Rs.):
                </label>
                <input
                  type="number"
                  value={offerPriceInput}
                  onChange={(e) => setOfferPriceInput(Number(e.target.value))}
                  required
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm font-black text-emerald-900"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Note to Passenger:
                </label>
                <textarea
                  value={offerMsgInput}
                  onChange={(e) => setOfferMsgInput(e.target.value)}
                  rows={3}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-700"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs py-3 rounded-xl transition cursor-pointer"
              >
                Submit Offer
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: USER PROFILE & VEHICLE MODAL */}
      {showProfileModal && currentUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900">Your Profile &amp; Settings</h3>
                <p className="text-xs text-slate-500">Manage photo, phone, and vehicle information</p>
              </div>
              <button
                type="button"
                onClick={() => setShowProfileModal(false)}
                className="text-slate-400 hover:text-slate-700 font-bold text-lg p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              {/* Avatar Photo */}
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded-full bg-emerald-100 border-2 border-emerald-400 flex items-center justify-center text-3xl shrink-0 overflow-hidden shadow-xs">
                  {profileAvatarUrl && (profileAvatarUrl.startsWith('data:image') || profileAvatarUrl.startsWith('http')) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profileAvatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span>{profileAvatarUrl || '🧑'}</span>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs py-1.5 px-3 rounded-xl transition cursor-pointer inline-flex items-center gap-1 shadow-xs">
                    <span>📷</span>
                    <span>Upload Photo</span>
                    <input type="file" accept="image/*" onChange={handleAvatarFileChange} className="hidden" />
                  </label>
                  <p className="text-[10px] text-slate-400">Choose a picture from your device</p>
                </div>
              </div>

              {/* Personal Details */}
              <div className="space-y-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    required
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Phone Number</label>
                    <input
                      type="tel"
                      value={profilePhone}
                      onChange={(e) => setProfilePhone(e.target.value)}
                      required
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Home City</label>
                    <select
                      value={profileCity}
                      onChange={(e) => setProfileCity(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-semibold"
                    >
                      {NATIONWIDE_CITIES.map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Vehicle Section */}
              <div className="pt-3 border-t border-slate-100 space-y-2">
                <span className="block text-xs font-black uppercase tracking-wider text-slate-600">
                  Vehicle Details (To Offer Rides)
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Car Model</label>
                    <input
                      type="text"
                      value={profileCarModel}
                      onChange={(e) => setProfileCarModel(e.target.value)}
                      placeholder="Toyota Corolla GLi"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Plate Number</label>
                    <input
                      type="text"
                      value={profileCarPlate}
                      onChange={(e) => setProfileCarPlate(e.target.value)}
                      placeholder="LEB-4592"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-semibold uppercase font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <button
                  type="submit"
                  className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs py-3 rounded-xl transition cursor-pointer"
                >
                  Save Profile
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs py-3 px-4 rounded-xl transition cursor-pointer"
                >
                  Sign Out
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 6: AUTH & SIGN IN MODAL */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900">Welcome to Apni Sawari</h3>
                <p className="text-xs text-slate-500">Sign in to book rides or offer trips</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAuthModal(false)}
                className="text-slate-400 hover:text-slate-700 font-bold text-lg p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider text-center">
                Instant 1-Click Access:
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleDemoLogin('PASSENGER')}
                  className="p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-center transition cursor-pointer"
                >
                  <span className="text-xl block">🙋‍♂️</span>
                  <span className="text-xs font-black text-slate-900 block mt-1">Muhammad Ali</span>
                  <span className="text-[10px] text-slate-400">Verified Passenger</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDemoLogin('DRIVER')}
                  className="p-3 rounded-2xl bg-emerald-50 hover:bg-emerald-100/60 border border-emerald-200 text-center transition cursor-pointer"
                >
                  <span className="text-xl block">👨‍✈️</span>
                  <span className="text-xs font-black text-emerald-950 block mt-1">Tariq Khan</span>
                  <span className="text-[10px] text-emerald-700 font-bold">Verified Driver</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. FOOTER */}
      {/* ========================================================================= */}
      <footer className="bg-slate-900 text-white mt-auto border-t border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="text-lg">🚗</span>
            <span className="font-black text-white text-sm">Apni Sawari</span>
            <span>•</span>
            <span>Pakistan&apos;s Intercity Carpool &amp; Return Ride Network</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/terms" className="hover:text-white transition">Terms of Service</Link>
            <Link href="/privacy" className="hover:text-white transition">Privacy Policy</Link>
            <span>Direct Support: gotamjee@gmail.com</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
