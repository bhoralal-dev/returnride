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
    imageUrl: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=600&q=80',
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
    bookedSeatsCount: 1,
    wholeCarPrice: 14000,
    seatPrice: 3500,
    status: 'PUBLISHED',
    autoReopenOnCancellation: true,
    notes: 'Toyota Corolla GLi with chilled AC. Clean trunk space for luggage. Departure from Umerkot center.',
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
    departureTime: '2026-11-02T16:30:00Z',
    bookingMode: 'SEATS',
    capacity: 3,
    bookedSeatsCount: 1,
    wholeCarPrice: 7000,
    seatPrice: 1800,
    status: 'PUBLISHED',
    autoReopenOnCancellation: true,
    isReturnDeal: true,
    notes: 'Honda City • Returning to Hyderabad after office meeting. 2 seats in back only for full comfort.',
    driverTier: 'EXPERIENCED_DRIVER',
    roundTripAllowed: false,
    travelComfort: {
      acType: 'NORMAL_AC',
      maxInBack: 2,
      luggageCapacity: 'MEDIUM_SUITCASE',
      namazBreak: true,
      tollsIncluded: true,
    },
    routeStops: [
      { id: 'stop-nb2', name: 'Nooriabad Rest Area', distanceKm: 85, seatPrice: 900, wholeCarPrice: 3600 },
      { id: 'stop-hyd-bypass', name: 'Hyderabad Central Bypass', distanceKm: 160, seatPrice: 1800, wholeCarPrice: 7000 },
    ],
    createdAt: '2026-10-26T11:00:00Z',
    updatedAt: '2026-10-26T11:00:00Z',
  },
  {
    id: 'ride-103',
    driverId: 'driver-imran',
    vehicleId: 'veh-yaris',
    originLocationId: 'loc-lhr',
    destinationLocationId: 'loc-isb',
    departureTime: '2026-11-03T06:00:00Z',
    bookingMode: 'WHOLE_CAR_OR_SEATS',
    capacity: 4,
    bookedSeatsCount: 0,
    wholeCarPrice: 16000,
    seatPrice: 4000,
    status: 'PUBLISHED',
    autoReopenOnCancellation: true,
    notes: 'Toyota Yaris ATIV • M-2 Motorway direct. Family traveling with us. Non-smoking ride.',
    driverTier: 'TOP_RATED_DRIVER',
    roundTripAllowed: true,
    roundTripWholeCarPrice: 28000,
    travelComfort: {
      acType: 'CHILLED_AC',
      maxInBack: 2,
      luggageCapacity: 'FULL_TRUNK',
      namazBreak: true,
      tollsIncluded: true,
      familyOnboard: true,
    },
    routeStops: [
      { id: 'stop-bhera', name: 'Bhera Service Area (Motorway)', distanceKm: 190, seatPrice: 2200, wholeCarPrice: 9000 },
      { id: 'stop-sukkur-isb', name: 'Islamabad Faizabad / Zero Point', distanceKm: 375, seatPrice: 4000, wholeCarPrice: 16000 },
    ],
    createdAt: '2026-10-26T12:00:00Z',
    updatedAt: '2026-10-26T12:00:00Z',
  },
  {
    id: 'ride-104',
    driverId: 'driver-shahid',
    vehicleId: 'veh-brv',
    originLocationId: 'loc-mul',
    destinationLocationId: 'loc-lhr',
    departureTime: '2026-11-03T09:00:00Z',
    bookingMode: 'SEATS',
    capacity: 5,
    bookedSeatsCount: 0,
    wholeCarPrice: 15000,
    seatPrice: 3000,
    status: 'PUBLISHED',
    autoReopenOnCancellation: true,
    isReturnDeal: true,
    notes: 'Honda BR-V 7-Seater. Spacious legroom, large luggage space. Chilled dual AC.',
    driverTier: 'TOP_RATED_DRIVER',
    roundTripAllowed: false,
    travelComfort: {
      acType: 'CHILLED_AC',
      maxInBack: 3,
      luggageCapacity: 'FULL_TRUNK',
      namazBreak: true,
      tollsIncluded: true,
    },
    createdAt: '2026-10-27T08:00:00Z',
    updatedAt: '2026-10-27T08:00:00Z',
  },
];

const INITIAL_PASSENGER_REQUESTS: PassengerRideRequest[] = [
  {
    id: 'req-sawari-01',
    passengerId: 'usr-khalid',
    passengerName: 'Dr. Khalid Hussain',
    passengerPhone: '0300-1234567',
    originLocationId: 'loc-mpk',
    destinationLocationId: 'loc-khi',
    originName: 'Mirpur Khas',
    destinationName: 'Karachi',
    travelDate: '2026-11-03',
    desiredTime: '08:00 AM',
    bookingType: 'WHOLE_CAR',
    seatsCount: 4,
    budgetPrice: 13000,
    isFamilyTrip: true,
    acRequired: true,
    luggageSize: 'FULL_TRUNK',
    notes: 'Traveling with family (wife and 2 kids). Need clean, reliable AC car from Mirpur Khas to Karachi.',
    status: 'OPEN',
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
        offeredPrice: 13500,
        message: 'Can pick up directly from your doorstep in Mirpur Khas. Clean family car with AC.',
        createdAt: '2026-10-29T09:15:00Z',
      },
    ],
    createdAt: '2026-10-29T08:30:00Z',
  },
  {
    id: 'req-sawari-02',
    passengerId: 'usr-fatima',
    passengerName: 'Fatima & Mother',
    passengerPhone: '0302-7654321',
    originLocationId: 'loc-uk',
    destinationLocationId: 'loc-hyd',
    originName: 'Umerkot',
    destinationName: 'Hyderabad',
    travelDate: '2026-11-03',
    desiredTime: '10:00 AM',
    bookingType: 'SEAT',
    seatsCount: 2,
    budgetPrice: 3200,
    isFamilyTrip: true,
    acRequired: true,
    luggageSize: 'MEDIUM_SUITCASE',
    notes: 'Two ladies traveling to Hyderabad for medical appointment. Respectful, non-smoking driver preferred.',
    status: 'OPEN',
    offers: [],
    createdAt: '2026-10-29T09:00:00Z',
  },
];

const INITIAL_BOOKINGS: BookingRequest[] = [
  {
    id: 'req-zubair-1',
    rideId: 'ride-101',
    passengerId: 'Zubair Ahmed (#9182)',
    bookingType: 'SEAT',
    requestedSeats: 2,
    totalPrice: 7000,
    status: 'PENDING',
    dropoffStopName: 'Karachi (Sohrab Goth / Cantt / Saddar)',
    isRoundTrip: false,
    createdAt: '2026-10-29T10:00:00Z',
    updatedAt: '2026-10-29T10:00:00Z',
  },
  {
    id: 'req-ali-1',
    rideId: 'ride-102',
    passengerId: 'Muhammad Ali (#usr-ali)',
    bookingType: 'SEAT',
    requestedSeats: 1,
    totalPrice: 1800,
    status: 'ACCEPTED',
    dropoffStopName: 'Hyderabad Central Bypass',
    isRoundTrip: false,
    createdAt: '2026-10-29T09:30:00Z',
    updatedAt: '2026-10-29T09:45:00Z',
  },
];

function generateClientUniqueId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).substring(2, 8)}`;
}

export default function Home() {
  // Session & User Profile State
  const [currentUser, setCurrentUser] = useState<AppUserProfile | null>(INITIAL_DEMO_PASSENGER);
  const [isClientLoaded, setIsClientLoaded] = useState(false);

  // Registered Users Registry
  const [registeredUsers, setRegisteredUsers] = useState<AppUserProfile[]>([
    INITIAL_DEMO_PASSENGER,
    INITIAL_DEMO_DRIVER,
  ]);

  // Main Portal Mode: 'PASSENGER' (Finding/Booking Rides) vs 'DRIVER' (Driver Dashboard & Controls)
  const [portalMode, setPortalMode] = useState<'PASSENGER' | 'DRIVER'>('PASSENGER');

  // Passenger Navigation View: 'find_ride' | 'sawari_board' | 'my_bookings' | 'how_it_works'
  const [activePassengerNav, setActivePassengerNav] = useState<'find_ride' | 'sawari_board' | 'my_bookings' | 'how_it_works'>('find_ride');

  // Driver Navigation View: 'driver_trips' | 'driver_leads' | 'driver_vehicle'
  const [activeDriverNav, setActiveDriverNav] = useState<'driver_trips' | 'driver_leads' | 'driver_vehicle'>('driver_trips');

  // Core Data Stores
  const [rides, setRides] = useState<Ride[]>(INITIAL_RIDES);
  const [passengerRequests, setPassengerRequests] = useState<PassengerRideRequest[]>(INITIAL_PASSENGER_REQUESTS);
  const [bookings, setBookings] = useState<BookingRequest[]>(INITIAL_BOOKINGS);

  // Horizontal Search Capsule State
  const [searchOrigin, setSearchOrigin] = useState<string>('loc-uk');
  const [searchDest, setSearchDest] = useState<string>('loc-khi');
  const [searchDate, setSearchDate] = useState<string>('Today');
  const [searchSeatsCount, setSearchSeatsCount] = useState<number>(1);
  const [hasSearched, setHasSearched] = useState<boolean>(true);

  // Filter Chips
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

  // Offer a Ride Modal (For publishing a trip)
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

  // Post Sawari Request Modal (Passenger Request Board)
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

  // Driver Custom Offer Modal
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

  // Notification Toast
  const [notification, setNotification] = useState<{
    type: 'success' | 'error' | 'info';
    title: string;
    message: string;
  } | null>(null);

  // Reliability Engine State
  const [cancellationEvents, setCancellationEvents] = useState<CancellationEvent[]>([]);
  const [appeals, setAppeals] = useState<CancellationAppeal[]>([]);

  // Auth Dialog View State
  const [authView, setAuthView] = useState<'LOGIN' | 'OTP' | 'REGISTER'>('LOGIN');
  const [authEmail, setAuthEmail] = useState('');
  const [authOtp, setAuthOtp] = useState('');
  const [otpToken, setOtpToken] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    setIsClientLoaded(true);
  }, []);

  // Sync profile form when currentUser changes
  useEffect(() => {
    if (currentUser) {
      setProfileName(currentUser.name);
      setProfilePhone(currentUser.phone);
      setProfileCity(currentUser.city || 'Karachi');
      setProfileEmergency(currentUser.emergencyContact || '');
      setProfileAvatarUrl(currentUser.avatarUrl || '');
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

  // Filter rides matching search criteria
  const matchingRides = useMemo(() => {
    return rides.filter((r) => {
      if (r.status === 'CANCELLED' || r.status === 'COMPLETED') return false;

      // Origin and destination match
      if (searchOrigin && r.originLocationId !== searchOrigin) return false;
      if (searchDest && r.destinationLocationId !== searchDest) return false;

      // Tag filters
      if (activeTagFilter === 'KHALI_WAPSI' && !r.isReturnDeal) return false;
      if (activeTagFilter === 'FAMILY' && !r.travelComfort?.familyOnboard) return false;
      if (activeTagFilter === 'MAX_2_BACK' && (r.travelComfort?.maxInBack ?? 3) > 2) return false;
      if (activeTagFilter === 'LADIES_ONLY' && !r.travelComfort?.ladiesOnlySeats) return false;

      return true;
    });
  }, [rides, searchOrigin, searchDest, activeTagFilter]);

  // Driver metrics & listings
  const myDriverRides = useMemo(() => {
    return rides.filter((r) => r.driverId === currentUser?.id);
  }, [rides, currentUser]);

  const driverPendingBookings = useMemo(() => {
    return bookings.filter((b) => {
      const match = myDriverRides.some((r) => r.id === b.rideId);
      return match && b.status === 'PENDING';
    });
  }, [bookings, myDriverRides]);

  const driverConfirmedBookings = useMemo(() => {
    return bookings.filter((b) => {
      const match = myDriverRides.some((r) => r.id === b.rideId);
      return match && b.status === 'ACCEPTED';
    });
  }, [bookings, myDriverRides]);

  const driverTotalCashDue = useMemo(() => {
    return driverConfirmedBookings.reduce((sum, b) => sum + b.totalPrice, 0);
  }, [driverConfirmedBookings]);

  // Passenger Bookings (STRICTLY for passenger's own trips)
  const myPassengerBookings = useMemo(() => {
    if (!currentUser) return [];
    return bookings.filter((b) => {
      return (
        b.passengerId.includes(currentUser.name) ||
        b.passengerId.includes(currentUser.id)
      );
    });
  }, [bookings, currentUser]);

  // Handle Search Submission
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setHasSearched(true);
  };

  const handleSwapCities = () => {
    const temp = searchOrigin;
    setSearchOrigin(searchDest);
    setSearchDest(temp);
  };

  // Switch to Driver Panel handler
  const handleSwitchToDriverPanel = () => {
    if (!currentUser) {
      setAuthView('LOGIN');
      setShowAuthModal(true);
      return;
    }

    if (!currentUser.vehicle) {
      // Prompt vehicle setup or switch to demo driver
      setOfferStep('VEHICLE_SETUP');
      setShowOfferRideModal(true);
      return;
    }

    setPortalMode('DRIVER');
    setActiveDriverNav('driver_trips');
    setNotification({
      type: 'info',
      title: 'Driver Control Hub',
      message: `Switched to Driver Panel. Managing listings as ${currentUser.name}.`,
    });
  };

  // Switch to Passenger View handler
  const handleSwitchToPassengerView = () => {
    setPortalMode('PASSENGER');
    setActivePassengerNav('find_ride');
    setNotification({
      type: 'info',
      title: 'Passenger Portal',
      message: 'Switched to Passenger View. Search and book verified rides across Pakistan.',
    });
  };

  // Open Offer a Ride Modal
  const handleOpenOfferRide = () => {
    if (!currentUser) {
      setAuthView('LOGIN');
      setShowAuthModal(true);
      return;
    }

    if (!currentUser.vehicle) {
      setOfferStep('VEHICLE_SETUP');
    } else {
      setOfferStep('TRIP_DETAILS');
    }
    setShowOfferRideModal(true);
  };

  // Save Vehicle
  const handleSaveVehicleSetup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    const updatedUser: AppUserProfile = {
      ...currentUser,
      role: 'DRIVER',
      vehicle: {
        makeModel: offerCarModel,
        plate: offerCarPlate,
        capacity: Number(offerCarCapacity),
        color: offerCarColor,
        hasAc: offerCarAc,
        imageUrl: offerCarPhotoUrl || 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=600&q=80',
      },
    };

    setCurrentUser(updatedUser);
    setRegisteredUsers((prev) => prev.map((u) => (u.id === updatedUser.id ? updatedUser : u)));
    setOfferStep('TRIP_DETAILS');
    setNotification({
      type: 'success',
      title: 'Vehicle Registered!',
      message: `${offerCarModel} (${offerCarPlate}) linked to your account. Enter journey details to publish.`,
    });
  };

  // Publish Ride
  const handlePublishRide = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !currentUser.vehicle) return;

    const newRide: Ride = {
      id: generateClientUniqueId('ride'),
      driverId: currentUser.id,
      vehicleId: generateClientUniqueId('veh'),
      originLocationId: postOrigin,
      destinationLocationId: postDest,
      departureTime: `${postDate}T07:00:00Z`,
      bookingMode: postMode,
      capacity: currentUser.vehicle.capacity || 4,
      bookedSeatsCount: 0,
      wholeCarPrice: Number(postCarPrice),
      seatPrice: Number(postSeatPrice),
      status: 'PUBLISHED',
      autoReopenOnCancellation: true,
      isReturnDeal: postIsReturnDeal,
      notes: postNotes,
      driverTier: 'TOP_RATED_DRIVER',
      roundTripAllowed: postAllowRoundTrip,
      roundTripWholeCarPrice: postAllowRoundTrip ? Number(postRoundTripPrice) : undefined,
      travelComfort: {
        acType: currentUser.vehicle.hasAc ? 'CHILLED_AC' : undefined,
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
    setPortalMode('DRIVER');
    setActiveDriverNav('driver_trips');

    const oName = NATIONWIDE_CITIES.find((c) => c.id === postOrigin)?.name || 'Origin';
    const dName = NATIONWIDE_CITIES.find((c) => c.id === postDest)?.name || 'Destination';

    setNotification({
      type: 'success',
      title: 'Ride Published Successfully!',
      message: `Your journey from ${oName} to ${dName} is now live on Apni Sawari.`,
    });
  };

  // Open Booking Modal for Ride
  const handleSelectRideForBooking = (ride: Ride) => {
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

  // Confirm Passenger Booking
  const handleConfirmBooking = () => {
    if (!currentUser || !selectedRideForBooking) return;

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
        passengerId: `${currentUser.name} (#${currentUser.id})`,
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
      setPortalMode('PASSENGER');
      setActivePassengerNav('my_bookings');
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

  // Accept Passenger Booking Request (Driver Action)
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

  // Reject Booking Request (Driver Action)
  const handleRejectBooking = (booking: BookingRequest) => {
    const rejected = rejectBookingRequest(booking, 'Driver cannot accommodate requested seats.');
    setBookings((prev) => prev.map((b) => (b.id === rejected.id ? rejected : b)));
    setNotification({
      type: 'info',
      title: 'Booking Declined',
      message: 'The passenger booking request has been declined.',
    });
  };

  // Cancel Booking (Passenger Action)
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

  // Post Sawari Request on Board
  const handlePostSawariRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    const oCity = NATIONWIDE_CITIES.find((c) => c.id === reqOrigin)?.name || 'Origin';
    const dCity = NATIONWIDE_CITIES.find((c) => c.id === reqDest)?.name || 'Destination';

    const newReq: PassengerRideRequest = {
      id: generateClientUniqueId('req-sawari'),
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
      budgetPrice: Number(reqBudget),
      isFamilyTrip: reqIsFamily,
      acRequired: reqAc,
      luggageSize: reqLuggage,
      notes: reqNotes,
      status: 'OPEN',
      offers: [],
      createdAt: new Date().toISOString(),
    };

    setPassengerRequests((prev) => [newReq, ...prev]);
    setShowPostRequestModal(false);
    setNotification({
      type: 'success',
      title: 'Ride Request Broadcasted!',
      message: 'Your request is visible to drivers heading this way. You will see their offers below.',
    });
  };

  const handleCancelSawariRequest = (requestId: string) => {
    setPassengerRequests((prev) => prev.filter((r) => r.id !== requestId));
    setNotification({
      type: 'info',
      title: 'Request Cancelled',
      message: 'Your ride request has been removed from the Sawari Board.',
    });
  };

  // Driver accepts passenger budget directly
  const handleDriverAcceptBudget = (req: PassengerRideRequest) => {
    if (!currentUser || !currentUser.vehicle) {
      setOfferStep('VEHICLE_SETUP');
      setShowOfferRideModal(true);
      return;
    }

    const newOffer: DriverOffer = {
      id: generateClientUniqueId('off'),
      driverId: currentUser.id,
      driverName: currentUser.name,
      driverPhone: currentUser.phone,
      driverRating: 4.9,
      driverTier: 'TOP_RATED_DRIVER',
      vehicleMakeModel: currentUser.vehicle.makeModel,
      vehiclePlate: currentUser.vehicle.plate,
      offeredPrice: req.budgetPrice,
      message: `I accept your budget of Rs. ${req.budgetPrice.toLocaleString()}. Ready to take you in my ${currentUser.vehicle.makeModel}.`,
      createdAt: new Date().toISOString(),
    };

    setPassengerRequests((prev) =>
      prev.map((r) => (r.id === req.id ? { ...r, offers: [...r.offers, newOffer] } : r))
    );

    setNotification({
      type: 'success',
      title: 'Offer Sent to Passenger!',
      message: `You accepted Dr./Passenger's budget. The passenger has been notified to confirm.`,
    });
  };

  // Driver sends custom counter-offer
  const handleOpenCustomOfferModal = (req: PassengerRideRequest) => {
    if (!currentUser || !currentUser.vehicle) {
      setOfferStep('VEHICLE_SETUP');
      setShowOfferRideModal(true);
      return;
    }
    setSelectedReqForOffer(req);
    setOfferPriceInput(req.budgetPrice);
    setOfferMsgInput('');
  };

  const handleSubmitCustomOffer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !currentUser.vehicle || !selectedReqForOffer) return;

    const newOffer: DriverOffer = {
      id: generateClientUniqueId('off'),
      driverId: currentUser.id,
      driverName: currentUser.name,
      driverPhone: currentUser.phone,
      driverRating: 4.9,
      driverTier: 'TOP_RATED_DRIVER',
      vehicleMakeModel: currentUser.vehicle.makeModel,
      vehiclePlate: currentUser.vehicle.plate,
      offeredPrice: Number(offerPriceInput),
      message: offerMsgInput || `Clean AC ride in ${currentUser.vehicle.makeModel}. Direct route.`,
      createdAt: new Date().toISOString(),
    };

    setPassengerRequests((prev) =>
      prev.map((r) => (r.id === selectedReqForOffer.id ? { ...r, offers: [...r.offers, newOffer] } : r))
    );

    setSelectedReqForOffer(null);
    setNotification({
      type: 'success',
      title: 'Counter-Offer Submitted!',
      message: `Your quote of Rs. ${Number(offerPriceInput).toLocaleString()} has been sent to the passenger.`,
    });
  };

  // Passenger confirms a driver offer
  const handleAcceptDriverOffer = (req: PassengerRideRequest, offer: DriverOffer) => {
    setPassengerRequests((prev) =>
      prev.map((r) => (r.id === req.id ? { ...r, status: 'ACCEPTED', acceptedOfferId: offer.id } : r))
    );

    setNotification({
      type: 'success',
      title: 'Driver Confirmed!',
      message: `You confirmed ${offer.driverName} (${offer.vehicleMakeModel}) for Rs. ${offer.offeredPrice.toLocaleString()}. Driver will contact you shortly.`,
    });
  };

  // Profile Update
  const handleUpdateProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    const updated: AppUserProfile = {
      ...currentUser,
      name: profileName,
      phone: profilePhone,
      city: profileCity,
      emergencyContact: profileEmergency,
      avatarUrl: profileAvatarUrl,
      vehicle: currentUser.vehicle
        ? {
            ...currentUser.vehicle,
            makeModel: profileCarModel,
            plate: profileCarPlate,
            capacity: Number(profileCarCapacity),
            color: profileCarColor,
            hasAc: profileCarAc,
            imageUrl: profileCarPhotoUrl || currentUser.vehicle.imageUrl,
          }
        : undefined,
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

  // Demo Switcher
  const handleDemoLogin = (role: 'PASSENGER' | 'DRIVER') => {
    if (role === 'PASSENGER') {
      setCurrentUser(INITIAL_DEMO_PASSENGER);
      setPortalMode('PASSENGER');
      setActivePassengerNav('find_ride');
      setNotification({
        type: 'success',
        title: 'Passenger Portal Active',
        message: 'Signed in as Muhammad Ali. You can now search and book rides.',
      });
    } else {
      setCurrentUser(INITIAL_DEMO_DRIVER);
      setPortalMode('DRIVER');
      setActiveDriverNav('driver_trips');
      setNotification({
        type: 'success',
        title: 'Driver Control Hub Active',
        message: 'Signed in as Driver Tariq Khan. Managing rides and passenger requests.',
      });
    }
    setShowAuthModal(false);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setShowProfileModal(false);
    setPortalMode('PASSENGER');
    setNotification({ type: 'info', title: 'Signed Out', message: 'You have been signed out of Apni Sawari.' });
  };

  const openSawariRequestsCount = passengerRequests.filter((r) => r.status === 'OPEN').length;

  if (!isClientLoaded) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-400">Loading Apni Sawari...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50/60 text-slate-800 flex flex-col font-sans antialiased selection:bg-emerald-100 selection:text-emerald-900">
      {/* ========================================================================= */}
      {/* 1. MINIMALIST TOP APP BAR */}
      {/* ========================================================================= */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-2xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Brand Logo */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (portalMode === 'DRIVER') {
                  setActiveDriverNav('driver_trips');
                } else {
                  setActivePassengerNav('find_ride');
                  setHasSearched(false);
                }
              }}
              className="flex items-center gap-2 cursor-pointer text-left group"
            >
              <span className="w-9 h-9 rounded-xl bg-emerald-700 text-white flex items-center justify-center text-lg font-black shadow-xs group-hover:bg-emerald-800 transition">
                🚗
              </span>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-base font-black tracking-tight text-slate-900 group-hover:text-emerald-800 transition">
                    Apni Sawari
                  </span>
                  <span className="text-[10px] font-extrabold text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                    {portalMode === 'DRIVER' ? 'DRIVER PANEL' : 'CARPOOL'}
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 font-medium block">
                  اپنی سواری • Pakistan Nationwide Intercity
                </span>
              </div>
            </button>
          </div>

          {/* Center Navigation Links - Switch based on Portal Mode */}
          {portalMode === 'PASSENGER' ? (
            <nav className="hidden md:flex items-center gap-1 text-xs font-bold text-slate-600">
              <button
                type="button"
                onClick={() => {
                  setActivePassengerNav('find_ride');
                  setHasSearched(false);
                }}
                className={`px-3.5 py-2 rounded-xl transition cursor-pointer ${
                  activePassengerNav === 'find_ride'
                    ? 'text-emerald-900 bg-emerald-50 font-black'
                    : 'hover:text-slate-900 hover:bg-slate-100/60'
                }`}
              >
                🔍 Find a Ride
              </button>

              <button
                type="button"
                onClick={() => setActivePassengerNav('sawari_board')}
                className={`px-3.5 py-2 rounded-xl transition cursor-pointer relative ${
                  activePassengerNav === 'sawari_board'
                    ? 'text-emerald-900 bg-emerald-50 font-black'
                    : 'hover:text-slate-900 hover:bg-slate-100/60'
                }`}
              >
                📢 Sawari Board
                {openSawariRequestsCount > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.2 bg-emerald-600 text-white text-[10px] font-black rounded-full">
                    {openSawariRequestsCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActivePassengerNav('my_bookings')}
                className={`px-3.5 py-2 rounded-xl transition cursor-pointer relative ${
                  activePassengerNav === 'my_bookings'
                    ? 'text-emerald-900 bg-emerald-50 font-black'
                    : 'hover:text-slate-900 hover:bg-slate-100/60'
                }`}
              >
                🎟️ My Bookings
                {myPassengerBookings.length > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.2 bg-emerald-700 text-white text-[10px] font-black rounded-full">
                    {myPassengerBookings.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActivePassengerNav('how_it_works')}
                className={`px-3.5 py-2 rounded-xl transition cursor-pointer ${
                  activePassengerNav === 'how_it_works'
                    ? 'text-emerald-900 bg-emerald-50 font-black'
                    : 'hover:text-slate-900 hover:bg-slate-100/60'
                }`}
              >
                ℹ️ How It Works
              </button>
            </nav>
          ) : (
            /* DRIVER NAVIGATION BAR */
            <nav className="hidden md:flex items-center gap-1 text-xs font-bold text-slate-600">
              <button
                type="button"
                onClick={() => setActiveDriverNav('driver_trips')}
                className={`px-3.5 py-2 rounded-xl transition cursor-pointer relative ${
                  activeDriverNav === 'driver_trips'
                    ? 'text-emerald-900 bg-emerald-50 font-black'
                    : 'hover:text-slate-900 hover:bg-slate-100/60'
                }`}
              >
                📋 Trips &amp; Bookings
                {driverPendingBookings.length > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.2 bg-amber-500 text-white text-[10px] font-black rounded-full">
                    {driverPendingBookings.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveDriverNav('driver_leads')}
                className={`px-3.5 py-2 rounded-xl transition cursor-pointer relative ${
                  activeDriverNav === 'driver_leads'
                    ? 'text-emerald-900 bg-emerald-50 font-black'
                    : 'hover:text-slate-900 hover:bg-slate-100/60'
                }`}
              >
                📢 Sawari Leads ({openSawariRequestsCount})
              </button>

              <button
                type="button"
                onClick={() => setActiveDriverNav('driver_vehicle')}
                className={`px-3.5 py-2 rounded-xl transition cursor-pointer ${
                  activeDriverNav === 'driver_vehicle'
                    ? 'text-emerald-900 bg-emerald-50 font-black'
                    : 'hover:text-slate-900 hover:bg-slate-100/60'
                }`}
              >
                🚙 My Vehicle
              </button>
            </nav>
          )}

          {/* Right Action Controls */}
          <div className="flex items-center gap-2">
            {/* Mode Switcher Button */}
            {portalMode === 'PASSENGER' ? (
              <button
                type="button"
                onClick={handleSwitchToDriverPanel}
                className="bg-slate-900 hover:bg-black text-white font-bold text-xs px-3.5 py-2 rounded-full transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                title="Open Driver Control Dashboard"
              >
                <span className="text-xs">🚗</span>
                <span className="hidden sm:inline">Driver Panel</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSwitchToPassengerView}
                className="bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold text-xs px-3.5 py-2 rounded-full transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                title="Return to Passenger Portal"
              >
                <span>←</span>
                <span>Passenger View</span>
              </button>
            )}

            {/* Offer a Ride / Post Trip Button */}
            <button
              type="button"
              onClick={handleOpenOfferRide}
              className="border border-emerald-600 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs px-3.5 py-2 rounded-full transition flex items-center gap-1 shadow-2xs cursor-pointer"
            >
              <span>+</span>
              <span className="hidden sm:inline">Offer a Ride</span>
            </button>

            {/* User Profile Pill or Sign In */}
            {currentUser ? (
              <button
                type="button"
                onClick={() => setShowProfileModal(true)}
                className="flex items-center gap-1.5 p-1 pl-1.5 pr-2.5 bg-slate-100 hover:bg-slate-200 rounded-full border border-slate-200 transition cursor-pointer"
                title="Account Settings"
              >
                <span className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-xs">
                  {currentUser.avatarUrl || '🧑'}
                </span>
                <span className="text-xs font-bold text-slate-800 max-w-[80px] truncate hidden sm:inline">
                  {currentUser.name}
                </span>
                <span className="text-emerald-600 text-[11px] font-black">✓</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setAuthView('LOGIN');
                  setShowAuthModal(true);
                }}
                className="bg-slate-900 hover:bg-black text-white text-xs font-bold px-3.5 py-2 rounded-full transition cursor-pointer"
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
              <span className="text-base">
                {notification.type === 'success' ? '✅' : notification.type === 'error' ? '⚠️' : 'ℹ️'}
              </span>
              <div>
                <h4 className="text-xs font-bold">{notification.title}</h4>
                <p className="text-[11px] mt-0.5 opacity-90">{notification.message}</p>
              </div>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="text-slate-400 hover:text-slate-700 text-xs font-bold px-1 cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. MAIN APPLICATION WORKSPACE */}
      {/* ========================================================================= */}
      {portalMode === 'PASSENGER' ? (
        /* ========================================================================= */
        /* A. PASSENGER PORTAL (FIND & BOOK RIDES, SAWARI BOARD, MY BOOKINGS)         */
        /* ========================================================================= */
        <div className="flex-1 flex flex-col">
          {/* Passenger Hero & Floating Horizontal Search Capsule */}
          {activePassengerNav === 'find_ride' && (
            <section className="bg-gradient-to-b from-white via-slate-50 to-slate-50/60 pt-8 pb-10 border-b border-slate-200/70">
              <div className="max-w-4xl mx-auto px-4 text-center space-y-1.5 mb-6">
                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                  Your Pick of Verified Rides at Low Prices
                </h1>
                <p className="text-xs sm:text-sm text-slate-600 font-medium max-w-lg mx-auto">
                  اپنی سواری • Reserve single seats or book the entire car with verified drivers across Pakistan.
                </p>
              </div>

              {/* Floating Horizontal Search Capsule (BlaBlaCar & Poparide Style) */}
              <div className="max-w-4xl mx-auto px-4">
                <form
                  onSubmit={handleSearchSubmit}
                  className="bg-white shadow-lg shadow-slate-200/60 rounded-3xl md:rounded-full border border-slate-200 p-2 flex flex-col md:flex-row items-center gap-1.5"
                >
                  {/* Leaving From */}
                  <div className="flex-1 w-full px-4 py-2 flex items-center gap-2 hover:bg-slate-50 rounded-2xl md:rounded-full transition">
                    <span className="text-sm">🟢</span>
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
                    <span className="text-sm">🔴</span>
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
                    <span className="text-sm">📅</span>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Date
                      </label>
                      <span className="text-xs font-black text-slate-900 block truncate">Today</span>
                    </div>
                  </div>

                  {/* Search CTA */}
                  <button
                    type="submit"
                    className="w-full md:w-auto bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs px-6 py-3.5 rounded-2xl md:rounded-full shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <span>Find a Ride</span>
                  </button>
                </form>

                {/* Popular Route Shortcuts */}
                <div className="mt-3.5 flex items-center justify-center flex-wrap gap-1.5 text-xs">
                  <span className="text-[11px] text-slate-400 font-bold uppercase mr-1">Popular:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchOrigin('loc-uk');
                      setSearchDest('loc-khi');
                      setHasSearched(true);
                    }}
                    className="px-3 py-1 bg-white hover:bg-emerald-50 hover:text-emerald-900 text-slate-700 rounded-full border border-slate-200 transition font-bold cursor-pointer"
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
                    className="px-3 py-1 bg-white hover:bg-emerald-50 hover:text-emerald-900 text-slate-700 rounded-full border border-slate-200 transition font-bold cursor-pointer"
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
                    className="px-3 py-1 bg-white hover:bg-emerald-50 hover:text-emerald-900 text-slate-700 rounded-full border border-slate-200 transition font-bold cursor-pointer"
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
                    className="px-3 py-1 bg-white hover:bg-emerald-50 hover:text-emerald-900 text-slate-700 rounded-full border border-slate-200 transition font-bold cursor-pointer"
                  >
                    Multan ➔ Lahore
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* Passenger Body Container */}
          <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-6 w-full space-y-6">
            {/* VIEW 1: FIND A RIDE (HORIZONTAL RIDE CARDS) */}
            {activePassengerNav === 'find_ride' && (
              <div className="space-y-4">
                {/* Filter Chips Bar */}
                <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                    <button
                      type="button"
                      onClick={() => setActiveTagFilter('ALL')}
                      className={`px-3 py-1.5 rounded-full font-bold transition whitespace-nowrap cursor-pointer ${
                        activeTagFilter === 'ALL'
                          ? 'bg-slate-900 text-white'
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
                          ? 'bg-rose-700 text-white'
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
                          ? 'bg-emerald-700 text-white'
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
                          ? 'bg-blue-700 text-white'
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
                          ? 'bg-purple-700 text-white'
                          : 'bg-white text-purple-800 border border-purple-200 hover:bg-purple-50'
                      }`}
                    >
                      🧕 Ladies Modesty
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setActivePassengerNav('sawari_board')}
                    className="text-xs text-emerald-700 hover:text-emerald-900 font-black flex items-center gap-1 cursor-pointer"
                  >
                    <span>Can&apos;t find a ride? Post on Sawari Board</span>
                    <span>➔</span>
                  </button>
                </div>

                {/* Ride Results Feed */}
                <div className="space-y-3">
                  {matchingRides.length === 0 ? (
                    <div className="bg-white p-8 rounded-3xl border border-slate-200 text-center space-y-3 shadow-2xs">
                      <span className="text-3xl block">🚗</span>
                      <h3 className="text-base font-black text-slate-800">
                        No direct scheduled rides found for this route
                      </h3>
                      <p className="text-xs text-slate-500 max-w-md mx-auto">
                        Post your request on the Sawari Board and verified drivers traveling along this route will send you direct quotes.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setReqOrigin(searchOrigin);
                          setReqDest(searchDest);
                          setShowPostRequestModal(true);
                        }}
                        className="bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs px-5 py-2.5 rounded-full transition shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <span>📢 Post on Sawari Board</span>
                      </button>
                    </div>
                  ) : (
                    matchingRides.map((ride) => {
                      const oName = NATIONWIDE_CITIES.find((c) => c.id === ride.originLocationId)?.name || 'Origin';
                      const dName = NATIONWIDE_CITIES.find((c) => c.id === ride.destinationLocationId)?.name || 'Destination';
                      const rideBookings = bookings.filter((b) => b.rideId === ride.id);
                      const availableSeats = calculateAvailableSeats(ride, rideBookings);
                      const isFull = availableSeats <= 0;

                      return (
                        <div
                          key={ride.id}
                          className="bg-white rounded-2xl border border-slate-200/90 hover:border-slate-300 p-4 sm:p-5 transition shadow-2xs hover:shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                        >
                          {/* Left Column: Driver Info & Photo */}
                          <div className="flex items-center gap-3 shrink-0">
                            <div className="relative">
                              <span className="w-12 h-12 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-xl">
                                👨‍✈️
                              </span>
                              <span
                                className="absolute -bottom-1 -right-1 bg-emerald-600 text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-bold"
                                title="Verified Driver"
                              >
                                ✓
                              </span>
                            </div>

                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-extrabold text-sm text-slate-900">Driver Tariq Khan</span>
                                <span className="text-[10px] font-black text-amber-900 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                                  ★ 4.9
                                </span>
                              </div>
                              <span className="text-[11px] text-slate-500 font-medium block">
                                Toyota Corolla GLi • White
                              </span>
                            </div>
                          </div>

                          {/* Center Column: Route & Travel Comfort Tags */}
                          <div className="flex-1 space-y-2">
                            {/* Schedule Timeline */}
                            <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                              <span>07:00 AM</span>
                              <span className="text-slate-400 font-normal">({oName})</span>
                              <span className="text-slate-300">────────➔</span>
                              <span>11:30 AM</span>
                              <span className="text-slate-400 font-normal">({dName})</span>
                            </div>

                            {/* Waypoint Dropoffs */}
                            {ride.routeStops && ride.routeStops.length > 0 && (
                              <p className="text-[11px] text-slate-500 font-medium">
                                En-route stops:{' '}
                                {ride.routeStops.map((s) => s.name).join(' • ')}
                              </p>
                            )}

                            {/* Comfort Tags */}
                            <div className="flex items-center flex-wrap gap-1 text-[11px]">
                              {ride.travelComfort?.acType === 'CHILLED_AC' && (
                                <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-semibold">
                                  ❄️ Chilled AC
                                </span>
                              )}
                              {ride.travelComfort?.familyOnboard && (
                                <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-md font-semibold">
                                  👨‍👩‍👧 Family Onboard
                                </span>
                              )}
                              {ride.travelComfort?.maxInBack === 2 && (
                                <span className="bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded-md font-semibold">
                                  🛋️ Max 2 in Back
                                </span>
                              )}
                              {ride.travelComfort?.tollsIncluded && (
                                <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-semibold">
                                  ✅ Tolls Included
                                </span>
                              )}
                              {ride.isReturnDeal && (
                                <span className="bg-rose-50 text-rose-800 border border-rose-200 px-2 py-0.5 rounded-md font-bold">
                                  🏷️ Khali Wapsi Deal
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Right Column: Pricing & Book CTA */}
                          <div className="w-full md:w-auto flex md:flex-col items-center md:items-end justify-between md:justify-center shrink-0 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100 gap-2">
                            <div className="text-left md:text-right">
                              <span className="text-xs text-slate-400 font-bold block">Per Seat</span>
                              <div className="flex items-baseline gap-1">
                                <span className="text-xl font-black text-slate-900">
                                  Rs. {ride.seatPrice?.toLocaleString()}
                                </span>
                              </div>
                              <span className="text-[11px] font-bold text-emerald-700 block">
                                {isFull ? 'Sold Out' : `${availableSeats} of ${ride.capacity} seats left`}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleSelectRideForBooking(ride)}
                              disabled={isFull}
                              className={`px-5 py-2.5 rounded-full font-bold text-xs transition cursor-pointer shadow-xs ${
                                isFull
                                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                  : 'bg-emerald-700 hover:bg-emerald-800 text-white'
                              }`}
                            >
                              {isFull ? 'Fully Booked' : 'Book Seat'}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* VIEW 2: SAWARI BOARD (PASSENGER REVERSE MARKETPLACE) */}
            {activePassengerNav === 'sawari_board' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2 bg-white p-5 rounded-2xl border border-slate-200">
                  <div>
                    <h2 className="text-base font-black text-slate-900">Sawari Request Board</h2>
                    <p className="text-xs text-slate-500">
                      Cannot find a ride matching your schedule? Broadcast your itinerary and drivers will submit offers.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowPostRequestModal(true)}
                    className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs px-4 py-2 rounded-full transition shadow-xs cursor-pointer flex items-center gap-1.5"
                  >
                    <span>+</span>
                    <span>Post Ride Request</span>
                  </button>
                </div>

                {/* Request Cards Feed */}
                <div className="space-y-3">
                  {passengerRequests.map((req) => {
                    const oName = NATIONWIDE_CITIES.find((c) => c.id === req.originLocationId)?.name || 'Origin';
                    const dName = NATIONWIDE_CITIES.find((c) => c.id === req.destinationLocationId)?.name || 'Destination';
                    const isOwner = currentUser?.id === req.passengerId;

                    return (
                      <div
                        key={req.id}
                        className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-3 shadow-2xs"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2.5">
                            <span className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-base">
                              {req.isFamilyTrip ? '👨‍👩‍👧' : '🧑'}
                            </span>
                            <div>
                              <span className="font-extrabold text-sm text-slate-900 block">
                                {oName} ➔ {dName}
                              </span>
                              <span className="text-[11px] text-slate-500 font-medium">
                                Requested by {req.passengerName}
                              </span>
                            </div>
                          </div>

                          <span
                            className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase ${
                              req.status === 'ACCEPTED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {req.status === 'ACCEPTED' ? '✓ Driver Confirmed' : '🟢 Open for Bids'}
                          </span>
                        </div>

                        {/* Travel tags */}
                        <div className="flex flex-wrap items-center gap-1 text-[11px]">
                          <span className="bg-slate-100 text-slate-700 font-medium px-2 py-0.5 rounded-md">
                            📅 {req.travelDate} ({req.desiredTime})
                          </span>
                          <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold px-2 py-0.5 rounded-md">
                            {req.bookingType === 'WHOLE_CAR' ? '🚗 Full Car' : `💺 ${req.seatsCount} Seats`}
                          </span>
                          {req.isFamilyTrip && (
                            <span className="bg-purple-50 text-purple-800 border border-purple-200 font-semibold px-2 py-0.5 rounded-md">
                              👨‍👩‍👧 Family Trip
                            </span>
                          )}
                          {req.acRequired && (
                            <span className="bg-slate-100 text-slate-700 font-medium px-2 py-0.5 rounded-md">
                              ❄️ AC Required
                            </span>
                          )}
                        </div>

                        {req.notes && (
                          <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100 italic">
                            &quot;{req.notes}&quot;
                          </p>
                        )}

                        {/* Budget & Actions Bar */}
                        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase block">
                              Passenger Budget:
                            </span>
                            <span className="text-base font-black text-emerald-800">
                              Rs. {req.budgetPrice.toLocaleString()}
                            </span>
                            <span className="text-[10px] text-slate-400 font-medium ml-1">(Direct Cash)</span>
                          </div>

                          {/* Action Guard: User cannot accept own listing */}
                          {isOwner ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-500 font-medium">
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
                          ) : (
                            <span className="text-xs font-semibold text-slate-500">
                              {req.offers.length} Driver Quote(s)
                            </span>
                          )}
                        </div>

                        {/* Received Offers Section for Passenger Owner */}
                        {isOwner && req.offers.length > 0 && (
                          <div className="pt-2 border-t border-slate-100 space-y-2">
                            <span className="text-xs font-bold text-slate-700 block">
                              Offers from Drivers ({req.offers.length}):
                            </span>
                            <div className="space-y-1.5">
                              {req.offers.map((offer) => (
                                <div
                                  key={offer.id}
                                  className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs"
                                >
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-extrabold text-slate-900">{offer.driverName}</span>
                                      <span className="text-[10px] bg-amber-100 text-amber-900 font-bold px-1 rounded">
                                        ★ {offer.driverRating}
                                      </span>
                                      <span className="text-[10px] text-slate-500 font-medium">
                                        {offer.vehicleMakeModel}
                                      </span>
                                    </div>
                                    {offer.message && (
                                      <p className="text-[11px] text-slate-600 mt-0.5">&quot;{offer.message}&quot;</p>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <span className="font-black text-sm text-emerald-800">
                                      Rs. {offer.offeredPrice.toLocaleString()}
                                    </span>
                                    {req.status === 'OPEN' && (
                                      <button
                                        type="button"
                                        onClick={() => handleAcceptDriverOffer(req, offer)}
                                        className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs py-1.5 px-3 rounded-lg transition cursor-pointer"
                                      >
                                        Accept Offer
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* VIEW 3: MY BOOKINGS (STRICTLY PASSENGER'S BOOKED RIDES) */}
            {activePassengerNav === 'my_bookings' && (
              <div className="space-y-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200">
                  <h2 className="text-base font-black text-slate-900">My Bookings &amp; Tickets</h2>
                  <p className="text-xs text-slate-500">
                    Track your reserved seats, boarding terminal points, and direct cash payments due to drivers.
                  </p>
                </div>

                {myPassengerBookings.length === 0 ? (
                  <div className="bg-white p-8 rounded-3xl border border-slate-200 text-center space-y-2 shadow-2xs">
                    <span className="text-3xl block">🎫</span>
                    <h3 className="text-sm font-black text-slate-800">No active bookings yet</h3>
                    <p className="text-xs text-slate-500">
                      You haven&apos;t booked any rides. Search for scheduled trips across Pakistan.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setActivePassengerNav('find_ride');
                        setHasSearched(false);
                      }}
                      className="text-xs text-emerald-700 font-black hover:underline cursor-pointer"
                    >
                      Find a Ride Now ➔
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {myPassengerBookings.map((b) => {
                      const targetRide = rides.find((r) => r.id === b.rideId);
                      const oName = targetRide ? NATIONWIDE_CITIES.find((c) => c.id === targetRide.originLocationId)?.name : 'Origin';
                      const dName = targetRide ? NATIONWIDE_CITIES.find((c) => c.id === targetRide.destinationLocationId)?.name : 'Destination';

                      return (
                        <div
                          key={b.id}
                          className={`bg-white p-5 rounded-2xl border transition shadow-2xs space-y-3 ${
                            b.status === 'ACCEPTED'
                              ? 'border-emerald-300'
                              : b.status === 'PENDING'
                              ? 'border-amber-300'
                              : 'border-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-sm font-black text-slate-900 block">
                                {oName} ➔ {dName}
                              </span>
                              <span className="text-xs text-slate-500 font-medium">
                                {b.bookingType === 'WHOLE_CAR'
                                  ? b.isRoundTrip
                                    ? '🚗 Full Car (Round-Trip Wait & Return)'
                                    : '🚗 Full Car Reservation'
                                  : `💺 ${b.requestedSeats} Seat(s)`}
                              </span>
                            </div>

                            <span
                              className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase ${
                                b.status === 'ACCEPTED'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : b.status === 'PENDING'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {b.status === 'ACCEPTED' ? '✓ Confirmed by Driver' : b.status === 'PENDING' ? '⏳ Waiting Driver Approval' : b.status}
                            </span>
                          </div>

                          <div className="text-xs text-slate-600 flex justify-between items-center bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                            <div>
                              <span className="text-slate-400 block text-[10px] uppercase font-bold">Fare Due:</span>
                              <span className="font-extrabold text-sm text-emerald-900">
                                Rs. {b.totalPrice.toLocaleString()} (Cash upon boarding)
                              </span>
                            </div>
                            {b.dropoffStopName && (
                              <span className="text-[11px] font-bold text-slate-700">
                                📍 Dropoff: {b.dropoffStopName}
                              </span>
                            )}
                          </div>

                          {b.status === 'ACCEPTED' && (
                            <div className="bg-emerald-50 text-emerald-950 p-3 rounded-xl border border-emerald-200 text-xs space-y-0.5">
                              <span className="font-bold block">🛡️ Verified Carpool Safety Check</span>
                              <p className="text-[11px] text-emerald-800">
                                Show your verification code to the driver upon boarding. Pay exact cash of Rs. {b.totalPrice.toLocaleString()}.
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
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* VIEW 4: HOW IT WORKS */}
            {activePassengerNav === 'how_it_works' && (
              <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 space-y-6">
                <div className="text-center max-w-xl mx-auto space-y-1">
                  <h2 className="text-xl font-black text-slate-900">How Apni Sawari Works</h2>
                  <p className="text-xs text-slate-500">
                    A safe, verified carpool network connecting passengers and car owners traveling between cities in Pakistan.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-4">
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                    <span className="w-8 h-8 rounded-full bg-emerald-700 text-white font-black text-xs flex items-center justify-center">
                      1
                    </span>
                    <h3 className="font-bold text-xs text-slate-900">Find or Request</h3>
                    <p className="text-[11px] text-slate-600">
                      Search direct scheduled rides or post your custom trip request on the Sawari Board.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                    <span className="w-8 h-8 rounded-full bg-emerald-700 text-white font-black text-xs flex items-center justify-center">
                      2
                    </span>
                    <h3 className="font-bold text-xs text-slate-900">Instant Seat or Full Car</h3>
                    <p className="text-[11px] text-slate-600">
                      Reserve single seats to split fuel costs, or book the entire car with round-trip waiting.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                    <span className="w-8 h-8 rounded-full bg-emerald-700 text-white font-black text-xs flex items-center justify-center">
                      3
                    </span>
                    <h3 className="font-bold text-xs text-slate-900">Verified Profiles</h3>
                    <p className="text-[11px] text-slate-600">
                      Drivers are vetted with CNIC and driving licenses. Ratings and reviews keep travel secure.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                    <span className="w-8 h-8 rounded-full bg-emerald-700 text-white font-black text-xs flex items-center justify-center">
                      4
                    </span>
                    <h3 className="font-bold text-xs text-slate-900">Direct Cash Settlement</h3>
                    <p className="text-[11px] text-slate-600">
                      No commission deductions from passengers. Pay direct cash to the driver upon boarding.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      ) : (
        /* ========================================================================= */
        /* B. DEDICATED DRIVER CONTROL DASHBOARD (SEPARATED FROM PASSENGER UI)        */
        /* ========================================================================= */
        <div className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 py-6 w-full space-y-6">
          {/* Driver Top Banner & Quick KPI Bar */}
          <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-sm space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-950/60 px-2.5 py-1 rounded-md border border-emerald-800">
                  Captain Control Hub
                </span>
                <h1 className="text-xl sm:text-2xl font-black mt-2">
                  Welcome back, {currentUser?.name || 'Captain'}
                </h1>
                <p className="text-xs text-slate-400">
                  Vehicle: {currentUser?.vehicle?.makeModel} ({currentUser?.vehicle?.plate}) • City: {currentUser?.city}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenOfferRide}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs px-4 py-2.5 rounded-full transition shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <span>+</span>
                  <span>Publish New Journey</span>
                </button>
              </div>
            </div>

            {/* 4 Metric KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-slate-800">
              <div className="bg-slate-800/80 p-3.5 rounded-2xl border border-slate-700/60">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Active Listings</span>
                <span className="text-xl font-black text-white">{myDriverRides.length}</span>
                <span className="text-[10px] text-emerald-400 font-semibold block mt-0.5">Live on Search</span>
              </div>

              <div className="bg-slate-800/80 p-3.5 rounded-2xl border border-slate-700/60">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Pending Requests</span>
                <span className="text-xl font-black text-amber-400">{driverPendingBookings.length}</span>
                <span className="text-[10px] text-slate-400 font-semibold block mt-0.5">Awaiting your approval</span>
              </div>

              <div className="bg-slate-800/80 p-3.5 rounded-2xl border border-slate-700/60">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Cash to Collect</span>
                <span className="text-xl font-black text-emerald-400">
                  Rs. {driverTotalCashDue.toLocaleString()}
                </span>
                <span className="text-[10px] text-slate-400 font-semibold block mt-0.5">From confirmed passengers</span>
              </div>

              <div className="bg-slate-800/80 p-3.5 rounded-2xl border border-slate-700/60">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Driver Reliability</span>
                <span className="text-xl font-black text-white">98% ★ 4.9</span>
                <span className="text-[10px] text-emerald-400 font-semibold block mt-0.5">Top-Rated Captain</span>
              </div>
            </div>
          </div>

          {/* Sub-navigation Tabs for Driver */}
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xs font-bold">
            <button
              type="button"
              onClick={() => setActiveDriverNav('driver_trips')}
              className={`px-4 py-2 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
                activeDriverNav === 'driver_trips'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <span>📋</span>
              <span>Trips &amp; Passenger Requests</span>
              {driverPendingBookings.length > 0 && (
                <span className="px-1.5 py-0.2 bg-amber-500 text-white text-[10px] font-black rounded-full">
                  {driverPendingBookings.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveDriverNav('driver_leads')}
              className={`px-4 py-2 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
                activeDriverNav === 'driver_leads'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <span>📢</span>
              <span>Sawari Board Leads ({openSawariRequestsCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveDriverNav('driver_vehicle')}
              className={`px-4 py-2 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
                activeDriverNav === 'driver_vehicle'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <span>🚙</span>
              <span>My Vehicle &amp; Settings</span>
            </button>
          </div>

          {/* DRIVER SUB-VIEW 1: TRIPS & INCOMING PASSENGER REQUESTS */}
          {activeDriverNav === 'driver_trips' && (
            <div className="space-y-6">
              {/* Priority Callout: Incoming Booking Requests Queue */}
              {driverPendingBookings.length > 0 && (
                <div className="bg-amber-50/80 border border-amber-300 p-5 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">📩</span>
                      <h3 className="text-sm font-black text-amber-950">
                        Incoming Passenger Booking Requests ({driverPendingBookings.length})
                      </h3>
                    </div>
                    <span className="text-[11px] font-bold text-amber-800">Review to reserve seats</span>
                  </div>

                  <div className="space-y-2">
                    {driverPendingBookings.map((req) => (
                      <div
                        key={req.id}
                        className="bg-white p-4 rounded-xl border border-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-sm text-slate-900">{req.passengerId}</span>
                            <span className="text-[10px] font-black bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                              {req.bookingType === 'WHOLE_CAR' ? 'Entire Car' : `${req.requestedSeats} Seat(s)`}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600">
                            Dropoff: <span className="font-bold">{req.dropoffStopName || 'Destination'}</span> • Cash due upon boarding:{' '}
                            <span className="font-black text-emerald-800">Rs. {req.totalPrice.toLocaleString()}</span>
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleAcceptBooking(req)}
                            className="bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs py-2 px-4 rounded-lg transition cursor-pointer shadow-xs"
                          >
                            ✓ Accept Booking
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRejectBooking(req)}
                            className="bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 font-bold text-xs py-2 px-3 rounded-lg transition cursor-pointer"
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Driver's Listed Journeys */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-900">Your Active Scheduled Journeys</h3>
                  <button
                    type="button"
                    onClick={handleOpenOfferRide}
                    className="text-xs text-emerald-700 hover:text-emerald-900 font-bold cursor-pointer"
                  >
                    + Publish Another Trip
                  </button>
                </div>

                {myDriverRides.length === 0 ? (
                  <div className="bg-white p-8 rounded-3xl border border-slate-200 text-center space-y-2">
                    <span className="text-3xl block">🛣️</span>
                    <h4 className="text-sm font-bold text-slate-800">You have no active rides listed</h4>
                    <p className="text-xs text-slate-500">
                      Publish a journey between cities to start receiving booking requests and share fuel expenses.
                    </p>
                    <button
                      type="button"
                      onClick={handleOpenOfferRide}
                      className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs px-4 py-2 rounded-full transition shadow-xs cursor-pointer inline-block mt-2"
                    >
                      Offer a Ride Now
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {myDriverRides.map((ride) => {
                      const oName = NATIONWIDE_CITIES.find((c) => c.id === ride.originLocationId)?.name || 'Origin';
                      const dName = NATIONWIDE_CITIES.find((c) => c.id === ride.destinationLocationId)?.name || 'Destination';
                      const rideBookings = bookings.filter((b) => b.rideId === ride.id);
                      const availableSeats = calculateAvailableSeats(ride, rideBookings);

                      return (
                        <div
                          key={ride.id}
                          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3"
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-black text-base text-slate-900">
                                  {oName} ➔ {dName}
                                </span>
                                <span className="text-[10px] font-black bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                                  Active Listing
                                </span>
                              </div>
                              <span className="text-xs text-slate-500 font-medium">
                                Departure: 07:00 AM • Vehicle: Toyota Corolla GLi ({currentUser?.vehicle?.plate})
                              </span>
                            </div>

                            <div className="text-right">
                              <span className="text-xs text-slate-400 font-bold block">Capacity</span>
                              <span className="text-sm font-black text-slate-900">
                                {ride.capacity - availableSeats}/{ride.capacity} Seats Filled
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs">
                            <div>
                              <span className="text-[10px] text-slate-400 uppercase font-bold block">Single Seat Fare:</span>
                              <span className="font-extrabold text-slate-800">Rs. {ride.seatPrice?.toLocaleString()}</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 uppercase font-bold block">Whole Car Deal:</span>
                              <span className="font-extrabold text-slate-800">Rs. {ride.wholeCarPrice.toLocaleString()}</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 uppercase font-bold block">Round-Trip Rate:</span>
                              <span className="font-extrabold text-slate-800">
                                {ride.roundTripWholeCarPrice ? `Rs. ${ride.roundTripWholeCarPrice.toLocaleString()}` : 'Not offered'}
                              </span>
                            </div>
                          </div>

                          {ride.routeStops && ride.routeStops.length > 0 && (
                            <p className="text-[11px] text-slate-500 font-medium">
                              Corridor Dropoffs: {ride.routeStops.map((s) => s.name).join(' ➔ ')}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* DRIVER SUB-VIEW 2: SAWARI BOARD LEADS */}
          {activeDriverNav === 'driver_leads' && (
            <div className="space-y-4">
              <div className="bg-white p-5 rounded-2xl border border-slate-200">
                <h3 className="text-base font-black text-slate-900">Live Passenger Ride Requests (Leads)</h3>
                <p className="text-xs text-slate-500">
                  Passengers seeking rides along nationwide routes. You can accept their budget directly or send a custom quote.
                </p>
              </div>

              <div className="space-y-3">
                {passengerRequests.map((req) => {
                  const oName = NATIONWIDE_CITIES.find((c) => c.id === req.originLocationId)?.name || 'Origin';
                  const dName = NATIONWIDE_CITIES.find((c) => c.id === req.destinationLocationId)?.name || 'Destination';
                  const alreadyOffered = req.offers.some((o) => o.driverId === currentUser?.id);

                  return (
                    <div
                      key={req.id}
                      className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-lg">
                            {req.isFamilyTrip ? '👨‍👩‍👧' : '🧑'}
                          </span>
                          <div>
                            <span className="font-black text-base text-slate-900 block">
                              {oName} ➔ {dName}
                            </span>
                            <span className="text-xs text-slate-500 font-medium">
                              Passenger: {req.passengerName} • Date: {req.travelDate} ({req.desiredTime})
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-[10px] font-bold text-slate-400 uppercase block">Passenger Budget</span>
                          <span className="text-lg font-black text-emerald-800">
                            Rs. {req.budgetPrice.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-xs">
                        <span className="bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded">
                          {req.bookingType === 'WHOLE_CAR' ? '🚗 Full Car Required' : `💺 ${req.seatsCount} Seats`}
                        </span>
                        {req.isFamilyTrip && (
                          <span className="bg-purple-50 text-purple-800 font-bold px-2 py-0.5 rounded border border-purple-200">
                            👨‍👩‍👧 Family Onboard
                          </span>
                        )}
                        {req.acRequired && (
                          <span className="bg-slate-100 text-slate-700 font-medium px-2 py-0.5 rounded">
                            ❄️ AC Required
                          </span>
                        )}
                      </div>

                      {req.notes && (
                        <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100 italic">
                          &quot;{req.notes}&quot;
                        </p>
                      )}

                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                        {alreadyOffered ? (
                          <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
                            ✓ Your Quote Has Been Sent
                          </span>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => handleDriverAcceptBudget(req)}
                              className="bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs py-2 px-3.5 rounded-xl transition cursor-pointer shadow-xs"
                            >
                              ⚡ Accept Budget (Rs. {req.budgetPrice.toLocaleString()})
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenCustomOfferModal(req)}
                              className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs py-2 px-3 rounded-xl transition cursor-pointer"
                            >
                              Send Counter-Offer
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* DRIVER SUB-VIEW 3: VEHICLE & SETTINGS */}
          {activeDriverNav === 'driver_vehicle' && (
            <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 space-y-6">
              <div>
                <h3 className="text-base font-black text-slate-900">Vehicle Specifications &amp; Driver Details</h3>
                <p className="text-xs text-slate-500">
                  Keep your vehicle information and emergency contacts accurate for passenger safety.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Registered Vehicle</span>
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-extrabold text-sm text-slate-900">{currentUser?.vehicle?.makeModel}</h4>
                      <p className="text-xs text-slate-500">Number Plate: {currentUser?.vehicle?.plate}</p>
                    </div>
                    <span className="text-xs font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                      {currentUser?.vehicle?.capacity} Passengers
                    </span>
                  </div>
                  <div className="text-xs text-slate-600 flex items-center gap-3 pt-2">
                    <span>❄️ AC: {currentUser?.vehicle?.hasAc ? 'Yes (Chilled)' : 'No'}</span>
                    <span>🎨 Color: {currentUser?.vehicle?.color}</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Driver Verification</span>
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-extrabold text-sm text-slate-900">{currentUser?.name}</h4>
                      <p className="text-xs text-slate-500">License: DL-HYD-99812 • Verified CNIC</p>
                    </div>
                    <span className="text-xs font-bold bg-emerald-600 text-white px-2 py-0.5 rounded-full">
                      ✓ VERIFIED
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 pt-2">
                    Emergency Contact: {currentUser?.emergencyContact || '0300-1122334'}
                  </p>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowProfileModal(true)}
                  className="bg-slate-900 hover:bg-black text-white font-bold text-xs px-5 py-2.5 rounded-full transition cursor-pointer"
                >
                  Edit Vehicle or Upload Photo
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. MODALS (BOOKING, OFFER RIDE, SAWARI REQUEST, PROFILE, AUTH)             */}
      {/* ========================================================================= */}

      {/* MODAL 1: PASSENGER BOOKING DIALOG */}
      {showBookingModal && selectedRideForBooking && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 border border-slate-200 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900">Confirm Your Booking</h3>
                <p className="text-xs text-slate-500">
                  {NATIONWIDE_CITIES.find((c) => c.id === selectedRideForBooking.originLocationId)?.name} ➔{' '}
                  {NATIONWIDE_CITIES.find((c) => c.id === selectedRideForBooking.destinationLocationId)?.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowBookingModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Mode: Seats vs Whole Car */}
            <div className="grid grid-cols-2 gap-2 text-xs font-bold">
              <button
                type="button"
                onClick={() => setBookingModeChoice('SEAT')}
                className={`p-3 rounded-2xl border text-center transition cursor-pointer ${
                  bookingModeChoice === 'SEAT'
                    ? 'bg-emerald-50 border-emerald-600 text-emerald-950 font-black'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="block text-base mb-0.5">💺</span>
                <span>Individual Seats</span>
                <span className="block text-[11px] text-slate-500 mt-0.5">
                  Rs. {selectedRideForBooking.seatPrice?.toLocaleString()} / seat
                </span>
              </button>

              <button
                type="button"
                onClick={() => setBookingModeChoice('WHOLE_CAR')}
                className={`p-3 rounded-2xl border text-center transition cursor-pointer ${
                  bookingModeChoice === 'WHOLE_CAR'
                    ? 'bg-emerald-50 border-emerald-600 text-emerald-950 font-black'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="block text-base mb-0.5">🚗</span>
                <span>Entire Car (Private)</span>
                <span className="block text-[11px] text-slate-500 mt-0.5">
                  Rs. {selectedRideForBooking.wholeCarPrice.toLocaleString()} full car
                </span>
              </button>
            </div>

            {/* Seats count if SEAT */}
            {bookingModeChoice === 'SEAT' && (
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">How many seats?</label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setBookingSeatsCount(num)}
                      className={`flex-1 py-2 rounded-xl border text-xs font-bold transition cursor-pointer ${
                        bookingSeatsCount === num
                          ? 'bg-emerald-700 text-white border-emerald-700'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {num} {num === 1 ? 'Seat' : 'Seats'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Dropoff checkpoint selection */}
            {selectedRideForBooking.routeStops && selectedRideForBooking.routeStops.length > 0 && (
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Select Dropoff Stop</label>
                <select
                  value={bookingSelectedDropoff}
                  onChange={(e) => setBookingSelectedDropoff(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none"
                >
                  <option value="DEFAULT">
                    Final Destination:{' '}
                    {NATIONWIDE_CITIES.find((c) => c.id === selectedRideForBooking.destinationLocationId)?.name}
                  </option>
                  {selectedRideForBooking.routeStops.map((stop) => (
                    <option key={stop.id} value={stop.name}>
                      {stop.name} (Rs. {bookingModeChoice === 'WHOLE_CAR' ? stop.wholeCarPrice?.toLocaleString() : stop.seatPrice?.toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Round trip toggle if whole car */}
            {bookingModeChoice === 'WHOLE_CAR' && selectedRideForBooking.roundTripAllowed && (
              <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200 space-y-2">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-xs font-bold text-emerald-950">
                    🔄 Need Round-Trip? (Same Driver Waits &amp; Returns)
                  </span>
                  <input
                    type="checkbox"
                    checked={bookingIsRoundTrip}
                    onChange={(e) => setBookingIsRoundTrip(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded"
                  />
                </label>
                {bookingIsRoundTrip && (
                  <p className="text-[11px] text-emerald-800">
                    Round-Trip Package: Rs. {(selectedRideForBooking.roundTripWholeCarPrice || Math.round(selectedRideForBooking.wholeCarPrice * 1.65)).toLocaleString()} (Includes driver waiting &amp; return).
                  </p>
                )}
              </div>
            )}

            {/* Total Due & Confirm CTA */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Payable</span>
                <span className="text-lg font-black text-emerald-800">
                  Rs.{' '}
                  {bookingModeChoice === 'WHOLE_CAR'
                    ? (bookingIsRoundTrip ? (selectedRideForBooking.roundTripWholeCarPrice || Math.round(selectedRideForBooking.wholeCarPrice * 1.65)) : selectedRideForBooking.wholeCarPrice).toLocaleString()
                    : ((selectedRideForBooking.seatPrice || 3500) * bookingSeatsCount).toLocaleString()}
                </span>
                <span className="text-[10px] text-slate-400 font-medium ml-1 block">(Direct Cash)</span>
              </div>

              <button
                type="button"
                onClick={handleConfirmBooking}
                className="bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs px-6 py-3 rounded-full transition shadow-xs cursor-pointer"
              >
                Send Request to Driver
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: OFFER A RIDE / TRIP SETUP */}
      {showOfferRideModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 border border-slate-200 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  {offerStep === 'VEHICLE_SETUP' ? 'Step 1: Set Up Your Vehicle' : 'Step 2: Enter Trip Itinerary'}
                </h3>
                <p className="text-xs text-slate-500">
                  {offerStep === 'VEHICLE_SETUP'
                    ? 'Register your car specifications to start offering rides'
                    : 'Publish your departure date, fare rates, and travel amenities'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowOfferRideModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {offerStep === 'VEHICLE_SETUP' ? (
              <form onSubmit={handleSaveVehicleSetup} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Vehicle Make &amp; Model</label>
                  <input
                    type="text"
                    required
                    value={offerCarModel}
                    onChange={(e) => setOfferCarModel(e.target.value)}
                    placeholder="e.g. Toyota Corolla GLi / Honda City"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Registration Plate</label>
                    <input
                      type="text"
                      required
                      value={offerCarPlate}
                      onChange={(e) => setOfferCarPlate(e.target.value)}
                      placeholder="e.g. LEB-4592"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Passenger Capacity</label>
                    <select
                      value={offerCarCapacity}
                      onChange={(e) => setOfferCarCapacity(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none"
                    >
                      <option value={3}>3 Seats (Very Comfortable)</option>
                      <option value={4}>4 Seats (Standard Sedan)</option>
                      <option value={6}>6 Seats (BR-V / APV)</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-xs font-bold text-slate-800">❄️ Working Air Conditioning (AC)</span>
                  <input
                    type="checkbox"
                    checked={offerCarAc}
                    onChange={(e) => setOfferCarAc(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs py-3 rounded-full transition shadow-xs cursor-pointer mt-2"
                >
                  Save Car &amp; Continue ➔
                </button>
              </form>
            ) : (
              <form onSubmit={handlePublishRide} className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Departure City</label>
                    <select
                      value={postOrigin}
                      onChange={(e) => setPostOrigin(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none"
                    >
                      {NATIONWIDE_CITIES.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Destination City</label>
                    <select
                      value={postDest}
                      onChange={(e) => setPostDest(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none"
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
                    <label className="block text-xs font-bold text-slate-700 mb-1">Seat Price (PKR)</label>
                    <input
                      type="number"
                      required
                      value={postSeatPrice}
                      onChange={(e) => setPostSeatPrice(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Entire Car Price (PKR)</label>
                    <input
                      type="number"
                      required
                      value={postCarPrice}
                      onChange={(e) => setPostCarPrice(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer text-xs font-bold">
                    <input
                      type="checkbox"
                      checked={postIsReturnDeal}
                      onChange={(e) => setPostIsReturnDeal(e.target.checked)}
                      className="w-4 h-4 text-emerald-600 rounded"
                    />
                    <span>🏷️ Khali Wapsi Deal</span>
                  </label>
                  <label className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer text-xs font-bold">
                    <input
                      type="checkbox"
                      checked={postFamilyOnboard}
                      onChange={(e) => setPostFamilyOnboard(e.target.checked)}
                      className="w-4 h-4 text-emerald-600 rounded"
                    />
                    <span>👨‍👩‍👧 Family Friendly</span>
                  </label>
                </div>

                <button
                  type="submit"
                  className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs py-3 rounded-full transition shadow-xs cursor-pointer mt-2"
                >
                  Publish Ride on Apni Sawari ➔
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL 3: POST ON SAWARI BOARD (PASSENGER) */}
      {showPostRequestModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 border border-slate-200 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900">Post Ride Request</h3>
                <p className="text-xs text-slate-500">
                  Broadcast your itinerary so drivers heading along this corridor can offer you a ride.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPostRequestModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handlePostSawariRequest} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">From</label>
                  <select
                    value={reqOrigin}
                    onChange={(e) => setReqOrigin(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none"
                  >
                    {NATIONWIDE_CITIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">To</label>
                  <select
                    value={reqDest}
                    onChange={(e) => setReqDest(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none"
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
                  <label className="block text-xs font-bold text-slate-700 mb-1">Your Target Budget (PKR)</label>
                  <input
                    type="number"
                    required
                    value={reqBudget}
                    onChange={(e) => setReqBudget(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Ride Type</label>
                  <select
                    value={reqBookingType}
                    onChange={(e) => setReqBookingType(e.target.value as 'WHOLE_CAR' | 'SEAT')}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none"
                  >
                    <option value="WHOLE_CAR">🚗 Full Car (Private)</option>
                    <option value="SEAT">💺 Individual Seats</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Notes for Drivers</label>
                <textarea
                  rows={2}
                  value={reqNotes}
                  onChange={(e) => setReqNotes(e.target.value)}
                  placeholder="e.g. Traveling with family, need clean AC car, luggage space..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs py-3 rounded-full transition shadow-xs cursor-pointer mt-2"
              >
                Broadcast to Drivers ➔
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: DRIVER COUNTER-OFFER MODAL */}
      {selectedReqForOffer && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 border border-slate-200 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900">Send Offer to Passenger</h3>
                <p className="text-xs text-slate-500">
                  Passenger budget: Rs. {selectedReqForOffer.budgetPrice.toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReqForOffer(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitCustomOffer} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Your Offered Price (PKR)</label>
                <input
                  type="number"
                  required
                  value={offerPriceInput}
                  onChange={(e) => setOfferPriceInput(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Message to Passenger</label>
                <textarea
                  rows={2}
                  value={offerMsgInput}
                  onChange={(e) => setOfferMsgInput(e.target.value)}
                  placeholder="e.g. Can pick you up directly from your doorstep in Mirpurkhas..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs py-3 rounded-full transition shadow-xs cursor-pointer mt-2"
              >
                Submit Offer ➔
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: USER PROFILE & CAR MODAL */}
      {showProfileModal && currentUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 border border-slate-200 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900">Profile &amp; Settings</h3>
                <p className="text-xs text-slate-500">Manage your contact information, photo, and vehicle</p>
              </div>
              <button
                type="button"
                onClick={() => setShowProfileModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateProfile} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number</label>
                  <input
                    type="text"
                    required
                    value={profilePhone}
                    onChange={(e) => setProfilePhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">City</label>
                <input
                  type="text"
                  value={profileCity}
                  onChange={(e) => setProfileCity(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none"
                />
              </div>

              {currentUser.vehicle && (
                <div className="pt-2 border-t border-slate-100 space-y-2">
                  <span className="text-xs font-black text-slate-900 block">Vehicle Specifications</span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Car Model</label>
                      <input
                        type="text"
                        value={profileCarModel}
                        onChange={(e) => setProfileCarModel(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Number Plate</label>
                      <input
                        type="text"
                        value={profileCarPlate}
                        onChange={(e) => setProfileCarPlate(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="text-xs text-rose-600 hover:text-rose-800 font-bold cursor-pointer"
                >
                  Sign Out
                </button>

                <button
                  type="submit"
                  className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs px-5 py-2.5 rounded-full transition shadow-xs cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 6: AUTH & DEMO SWITCHER DIALOG */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 border border-slate-200 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900">Sign In to Apni Sawari</h3>
                <p className="text-xs text-slate-500">Fast 1-click test accounts or email sign in</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAuthModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Instant Demo Profiles:
              </span>

              <button
                type="button"
                onClick={() => handleDemoLogin('PASSENGER')}
                className="w-full p-3.5 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-300 rounded-2xl border border-slate-200 text-left transition flex items-center justify-between cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">👨‍💼</span>
                  <div>
                    <span className="font-extrabold text-xs text-slate-900 group-hover:text-emerald-900 block">
                      Muhammad Ali (Passenger View)
                    </span>
                    <span className="text-[11px] text-slate-500">Book seats &amp; post on Sawari Board</span>
                  </div>
                </div>
                <span className="text-xs font-bold text-emerald-700">Enter ➔</span>
              </button>

              <button
                type="button"
                onClick={() => handleDemoLogin('DRIVER')}
                className="w-full p-3.5 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-300 rounded-2xl border border-slate-200 text-left transition flex items-center justify-between cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">👨‍✈️</span>
                  <div>
                    <span className="font-extrabold text-xs text-slate-900 group-hover:text-emerald-900 block">
                      Driver Tariq Khan (Driver Panel)
                    </span>
                    <span className="text-[11px] text-slate-500">Manage trips, car &amp; accept bookings</span>
                  </div>
                </div>
                <span className="text-xs font-bold text-emerald-700">Enter ➔</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. FOOTER                                                                 */}
      {/* ========================================================================= */}
      <footer className="bg-white border-t border-slate-200 py-6 text-xs text-slate-500">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <p>© 2026 Apni Sawari (اپنی سواری). Pakistan Nationwide Intercity Carpool Network.</p>
          <div className="flex items-center gap-4 text-xs font-bold text-slate-600">
            <Link href="/terms" className="hover:text-slate-900 transition">Terms</Link>
            <Link href="/privacy" className="hover:text-slate-900 transition">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
