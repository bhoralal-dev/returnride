'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { normalizePakistaniPhone, getWhatsAppUrl, getCallUrl } from '@/lib/phone';
import {
  acceptBookingRequest,
  rejectBookingRequest,
  cancelConfirmedBooking,
  createBookingRequest,
  calculateAvailableSeats,
  BookingEngineError,
} from '@/lib/booking-engine';
import {
  evaluateUserReliability,
} from '@/lib/reliability-engine';
import type {
  CancellationEvent,
  CancellationAppeal,
} from '@/types/reliability';
import type {
  Ride,
  BookingRequest,
  BookingType,
  RideBookingMode,
  PassengerRideRequest,
  DriverOffer,
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
}

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
];

function generateClientUniqueId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).substring(2, 8)}`;
}

export default function Home() {
  // Session & User Profile State: Strictly NULL by default (NO automatic demo login)
  const [currentUser, setCurrentUser] = useState<AppUserProfile | null>(null);
  const [isClientLoaded, setIsClientLoaded] = useState(false);

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
  const [searchSeatsCount, setSearchSeatsCount] = useState<number>(1);
  const [hasSearched, setHasSearched] = useState<boolean>(true);

  // Filter Chips
  const [activeTagFilter, setActiveTagFilter] = useState<'ALL' | 'KHALI_WAPSI' | 'FAMILY' | 'MAX_2_BACK' | 'LADIES_ONLY'>('ALL');

  // Authentication State (Unified Email/Phone + Ref Design UX)
  const [showAuthModal, setShowAuthModal] = useState(true);
  const [authTab, setAuthTab] = useState<'SIGNIN' | 'SIGNUP'>('SIGNIN');
  const [authMethod, setAuthMethod] = useState<'PASSWORD' | 'OTP'>('PASSWORD');
  const [authIdentifier, setAuthIdentifier] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authName, setAuthName] = useState('');
  const [authRole, setAuthRole] = useState<'PASSENGER' | 'DRIVER'>('PASSENGER');
  const [authCity, setAuthCity] = useState('Karachi');
  const [authCarModel, setAuthCarModel] = useState('Toyota Corolla');
  const [authCarPlate, setAuthCarPlate] = useState('LEB-4592');
  const [authCarCapacity, setAuthCarCapacity] = useState(4);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // OTP Verification specific state
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpToken, setOtpToken] = useState('');

  // Modals
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
  const [cancellationEvents] = useState<CancellationEvent[]>([]);
  const [appeals] = useState<CancellationAppeal[]>([]);

  // Helper to construct AppUserProfile from Supabase Auth User
  const mapSupabaseUserToProfile = (user: { id: string; email?: string; user_metadata?: Record<string, unknown> }): AppUserProfile => {
    const meta = user.user_metadata || {};
    const role = (meta.role === 'DRIVER' ? 'DRIVER' : 'PASSENGER') as 'PASSENGER' | 'DRIVER';
    const vehicleMeta = meta.vehicle as AppUserProfile['vehicle'] | undefined;
    const isSyntheticEmail = Boolean(user.email && user.email.includes('@apnisawari.pk'));
    const displayEmail = isSyntheticEmail ? '' : (user.email || '');
    const metaPhone = (meta.phone as string) || '';
    const phoneDisplay = metaPhone || (isSyntheticEmail ? user.email?.replace('phone_', '').replace('@apnisawari.pk', '') : '') || '0300-1234567';

    return {
      id: user.id,
      name: (meta.full_name as string) || (displayEmail ? displayEmail.split('@')[0] : phoneDisplay) || 'Member',
      email: displayEmail,
      phone: phoneDisplay,
      role,
      avatarUrl: role === 'DRIVER' ? '👨‍✈️' : '🧑',
      city: (meta.city as string) || 'Karachi',
      emergencyContact: (meta.emergencyContact as string) || '',
      vehicle: vehicleMeta || (role === 'DRIVER' ? {
        makeModel: (meta.carModel as string) || 'Toyota Corolla',
        plate: (meta.carPlate as string) || 'LEB-4592',
        capacity: Number(meta.carCapacity) || 4,
        hasAc: true,
        color: 'White',
        imageUrl: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=600&q=80',
      } : undefined),
      verificationStatus: 'VERIFIED',
    };
  };

  // Check Supabase session on client load and subscribe to auth state changes
  useEffect(() => {
    setIsClientLoaded(true);

    if (supabase) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          const profile = mapSupabaseUserToProfile(session.user);
          setCurrentUser(profile);
          setShowAuthModal(false);
          if (profile.role === 'DRIVER') {
            setPortalMode('DRIVER');
          }
        } else {
          setShowAuthModal(true);
          setAuthTab('SIGNIN');
        }
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          const profile = mapSupabaseUserToProfile(session.user);
          setCurrentUser(profile);
          setShowAuthModal(false);
        } else {
          setCurrentUser(null);
        }
      });

      return () => {
        subscription.unsubscribe();
      };
    }
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

  // Reliability score
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

  // Switch to Driver Panel handler (Requires Authentication)
  const handleSwitchToDriverPanel = () => {
    if (!currentUser) {
      setAuthTab('SIGNIN');
      setShowAuthModal(true);
      setNotification({
        type: 'info',
        title: 'Sign In Required',
        message: 'Please sign in or create an account to access the Driver Control Hub.',
      });
      return;
    }

    if (!currentUser.vehicle) {
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

  // Open Offer a Ride Modal (Requires Authentication)
  const handleOpenOfferRide = () => {
    if (!currentUser) {
      setAuthTab('SIGNIN');
      setShowAuthModal(true);
      setNotification({
        type: 'info',
        title: 'Sign In Required',
        message: 'Please sign in to offer a ride and publish journeys.',
      });
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

  // Open Booking Modal for Ride (Requires Authentication)
  const handleSelectRideForBooking = (ride: Ride) => {
    if (!currentUser) {
      setSelectedRideForBooking(ride);
      setAuthTab('SIGNIN');
      setShowAuthModal(true);
      setNotification({
        type: 'info',
        title: 'Sign In Required',
        message: 'Please sign in or create an account to book your seat.',
      });
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
        passengerId: `${currentUser.name} (#${currentUser.id.slice(0, 6)})`,
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

  // Post Sawari Request on Board (Requires Authentication)
  const handleOpenPostSawariRequest = () => {
    if (!currentUser) {
      setAuthTab('SIGNIN');
      setShowAuthModal(true);
      setNotification({
        type: 'info',
        title: 'Sign In Required',
        message: 'Please sign in or register to post your ride request on the Sawari Board.',
      });
      return;
    }
    setShowPostRequestModal(true);
  };

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
      message: `You accepted the passenger budget. The passenger has been notified to confirm.`,
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
    setShowProfileModal(false);
    setNotification({
      type: 'success',
      title: 'Profile Updated!',
      message: 'Your personal information, photo, and preferences have been saved.',
    });
  };

  // ===========================================================================
  // REAL AUTHENTICATION HANDLERS (SUPABASE PASSWORD + EMAIL OTP)
  // ===========================================================================

  // Helper to parse either an email address or a Pakistani phone number seamlessly
  const parseIdentifier = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed.includes('@')) {
      const clean = trimmed.toLowerCase();
      return {
        type: 'EMAIL' as const,
        raw: trimmed,
        formatted: clean,
        display: clean,
        internalEmail: clean,
        isValid: clean.includes('.') && clean.length > 5,
        norm: null,
      };
    }
    const norm = normalizePakistaniPhone(trimmed);
    return {
      type: 'PHONE' as const,
      raw: trimmed,
      formatted: norm.formatted,
      display: norm.display || trimmed,
      internalEmail: norm.internalEmail,
      isValid: norm.valid,
      norm,
    };
  };

  const handleSupabaseSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);

    try {
      if (!supabase) {
        throw new Error('Supabase client is not initialized.');
      }

      if (!authIdentifier.trim()) {
        throw new Error('Please enter your email address or mobile number.');
      }

      const idInfo = parseIdentifier(authIdentifier);
      if (!idInfo.isValid) {
        throw new Error(
          idInfo.type === 'PHONE'
            ? 'Please enter a valid Pakistani mobile number (e.g. 0333 1234567) or email address.'
            : 'Please enter a valid email address (e.g. you@example.com).'
        );
      }

      if (authMethod === 'PASSWORD') {
        if (!authPassword) {
          throw new Error('Please enter your password.');
        }

        const { data, error } = await supabase.auth.signInWithPassword({
          email: idInfo.internalEmail,
          password: authPassword,
        });

        if (error) {
          if (error.message.toLowerCase().includes('invalid login')) {
            throw new Error('Invalid credentials. If you are new to Apni Sawari, click "Create Free Account" below.');
          }
          throw error;
        }

        if (data.user) {
          const profile = mapSupabaseUserToProfile(data.user);
          setCurrentUser(profile);
          setShowAuthModal(false);
          setAuthPassword('');
          setNotification({
            type: 'success',
            title: 'Welcome Back!',
            message: `Signed in as ${profile.name} (${idInfo.display}).`,
          });

          if (selectedRideForBooking) {
            setShowBookingModal(true);
          }
        }
      } else {
        // OTP Sign-In Method (SMS or Email)
        if (!otpSent) {
          if (idInfo.type === 'PHONE') {
            const res = await fetch('/api/auth/otp', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'send_sms', phone: idInfo.formatted }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) {
              throw new Error(json.error || 'Failed to dispatch SMS code.');
            }
            setOtpToken(json.token || '');
            setOtpSent(true);
            setNotification({
              type: 'success',
              title: 'SMS Code Dispatched!',
              message: `A 6-digit verification code has been dispatched via SMS to ${idInfo.display}.`,
            });
          } else {
            const res = await fetch('/api/auth/otp', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'send_email', email: idInfo.formatted }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) {
              throw new Error(json.error || 'Failed to dispatch email verification code.');
            }
            setOtpToken(json.token || '');
            setOtpSent(true);
            setNotification({
              type: 'success',
              title: 'Verification Code Dispatched!',
              message: `A 6-digit code has been sent to ${idInfo.formatted}. Please check your inbox.`,
            });
          }
        } else {
          // Verify OTP Code
          if (!otpCode || otpCode.trim().length !== 6) {
            throw new Error('Please enter the 6-digit verification code.');
          }

          if (idInfo.type === 'PHONE') {
            const res = await fetch('/api/auth/otp', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'verify_sms',
                phone: idInfo.formatted,
                code: otpCode.trim(),
                token: otpToken,
              }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) {
              throw new Error(json.error || 'Invalid or expired verification code.');
            }

            const profile: AppUserProfile = {
              id: `usr-ph-${(idInfo.norm?.digits || '00000000').slice(-8)}`,
              name: `User ${(idInfo.norm?.display || idInfo.display).slice(-4)}`,
              email: '',
              phone: idInfo.display,
              role: 'PASSENGER',
              avatarUrl: '🧑',
              city: 'Karachi',
              verificationStatus: 'VERIFIED',
            };
            setCurrentUser(profile);
            setShowAuthModal(false);
            setOtpSent(false);
            setOtpCode('');
            setNotification({
              type: 'success',
              title: 'Mobile Verified!',
              message: `Logged in with ${idInfo.display}.`,
            });
          } else {
            const res = await fetch('/api/auth/otp', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'verify_email',
                email: idInfo.formatted,
                code: otpCode.trim(),
                token: otpToken,
              }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) {
              throw new Error(json.error || 'Invalid or expired verification code.');
            }

            const profile: AppUserProfile = {
              id: `usr-em-${Date.now()}`,
              name: idInfo.formatted.split('@')[0],
              email: idInfo.formatted,
              phone: '',
              role: 'PASSENGER',
              avatarUrl: '🧑',
              city: 'Karachi',
              verificationStatus: 'VERIFIED',
            };
            setCurrentUser(profile);
            setShowAuthModal(false);
            setOtpSent(false);
            setOtpCode('');
            setNotification({
              type: 'success',
              title: 'Email Verified!',
              message: `Logged in as ${idInfo.formatted}.`,
            });
          }

          if (selectedRideForBooking) {
            setShowBookingModal(true);
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication failed.';
      setAuthError(msg);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSupabaseSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);

    try {
      if (!authIdentifier.trim()) {
        throw new Error('Please enter your email address or mobile number.');
      }

      const idInfo = parseIdentifier(authIdentifier);
      if (!idInfo.isValid) {
        throw new Error(
          idInfo.type === 'PHONE'
            ? 'Please enter a valid Pakistani mobile number (e.g. 0333 1234567) or email address.'
            : 'Please enter a valid email address.'
        );
      }

      if (!authPassword) {
        throw new Error('Please enter a password.');
      }
      if (authPassword.length < 6) {
        throw new Error('Password must be at least 6 characters long.');
      }

      const phoneToUse = idInfo.type === 'PHONE' ? idInfo.formatted : '';
      const emailToUse = idInfo.type === 'EMAIL' ? idInfo.formatted : '';
      const targetAuthIdentifier = idInfo.internalEmail;
      const fullName = authName.trim() || (idInfo.type === 'PHONE' ? idInfo.display : emailToUse.split('@')[0]);

      // STEP 1: Dispatches OTP via real SIM SMS or Email if not yet sent
      if (!otpSent) {
        if (idInfo.type === 'PHONE') {
          const res = await fetch('/api/auth/otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'send_sms', phone: phoneToUse }),
          });
          const json = await res.json();
          if (!res.ok || !json.success) {
            throw new Error(json.error || 'Failed to dispatch SMS verification code.');
          }
          setOtpToken(json.token || '');
          setOtpSent(true);
          setOtpCode('');
          setNotification({
            type: 'success',
            title: 'SMS Code Dispatched!',
            message: `A 6-digit verification code has been dispatched via SMS to ${idInfo.display}.`,
          });
        } else {
          const res = await fetch('/api/auth/otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'send_email', email: emailToUse }),
          });
          const json = await res.json();
          if (!res.ok || !json.success) {
            throw new Error(json.error || 'Failed to dispatch verification email.');
          }
          setOtpToken(json.token || '');
          setOtpSent(true);
          setOtpCode('');
          setNotification({
            type: 'success',
            title: 'Verification Code Dispatched!',
            message: `A 6-digit verification code has been sent to ${emailToUse}. Please check your inbox.`,
          });
        }
        return;
      }

      // STEP 2: Verify user entered OTP code
      if (!otpCode || otpCode.trim().length !== 6) {
        throw new Error('Please enter the 6-digit verification code sent to your ' + (idInfo.type === 'PHONE' ? 'mobile' : 'email') + '.');
      }

      if (idInfo.type === 'PHONE') {
        const verifyRes = await fetch('/api/auth/otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'verify_sms',
            phone: phoneToUse,
            code: otpCode.trim(),
            token: otpToken,
          }),
        });
        const verifyJson = await verifyRes.json();
        if (!verifyRes.ok || !verifyJson.success) {
          throw new Error(verifyJson.error || 'Invalid or expired SMS verification code.');
        }
      } else {
        const verifyRes = await fetch('/api/auth/otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'verify_email',
            email: emailToUse,
            code: otpCode.trim(),
            token: otpToken,
          }),
        });
        const verifyJson = await verifyRes.json();
        if (!verifyRes.ok || !verifyJson.success) {
          throw new Error(verifyJson.error || 'Invalid or expired email verification code.');
        }
      }

      // STEP 3: OTP verified! Create user in database with auto-confirmation
      const vehiclePayload =
        authRole === 'DRIVER'
          ? {
              makeModel: authCarModel,
              plate: authCarPlate,
              capacity: Number(authCarCapacity),
              hasAc: true,
              color: 'White',
            }
          : undefined;

      // 1. Try server-side instant registration with auto-confirmation
      let registeredUser: any = null;
      try {
        const regRes = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            authMode: idInfo.type,
            email: emailToUse,
            phone: phoneToUse,
            password: authPassword,
            fullName,
            role: authRole,
            city: authCity,
            vehicle: vehiclePayload,
          }),
        });
        const regJson = await regRes.json();
        if (regRes.ok && regJson.success) {
          registeredUser = regJson.user;
        } else if (regJson.error && !regJson.error.toLowerCase().includes('server error')) {
          throw new Error(regJson.error);
        }
      } catch (srvErr: unknown) {
        if (srvErr instanceof Error && srvErr.message && !srvErr.message.includes('fetch')) {
          throw srvErr;
        }
      }

      // 2. Direct Supabase client sign up fallback if server registration was not used
      if (!registeredUser && supabase) {
        const { data, error } = await supabase.auth.signUp({
          email: targetAuthIdentifier,
          password: authPassword,
          options: {
            data: {
              full_name: fullName,
              phone: phoneToUse,
              auth_mode: idInfo.type,
              role: authRole,
              city: authCity,
              vehicle: vehiclePayload,
            },
          },
        });
        if (error) throw error;
        registeredUser = data.user;
      }

      // 3. Immediately log in via Supabase password auth
      if (supabase) {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: targetAuthIdentifier,
          password: authPassword,
        });

        if (!signInError && signInData?.user) {
          const profile = mapSupabaseUserToProfile(signInData.user);
          setCurrentUser(profile);
          setShowAuthModal(false);
          setOtpSent(false);
          setOtpCode('');
          setAuthPassword('');
          setNotification({
            type: 'success',
            title: 'Account Created Successfully!',
            message: `Welcome to Apni Sawari, ${profile.name}! Your ${idInfo.type === 'PHONE' ? 'mobile number' : 'email'} is verified.`,
          });

          if (profile.role === 'DRIVER') {
            setPortalMode('DRIVER');
            setActiveDriverNav('driver_trips');
          } else if (selectedRideForBooking) {
            setShowBookingModal(true);
          }
          return;
        }
      }

      // Fallback profile if auto sign-in was deferred
      const fallbackProfile: AppUserProfile = {
        id: registeredUser?.id || `usr-${Date.now()}`,
        name: fullName,
        email: emailToUse,
        phone: phoneToUse || '0300-1234567',
        role: authRole,
        city: authCity,
        vehicle: vehiclePayload,
        verificationStatus: 'VERIFIED',
      };
      setCurrentUser(fallbackProfile);
      setShowAuthModal(false);
      setOtpSent(false);
      setOtpCode('');
      setAuthPassword('');
      setNotification({
        type: 'success',
        title: 'Account Created Successfully!',
        message: `Welcome to Apni Sawari, ${fallbackProfile.name}! Your account is now active.`,
      });

      if (authRole === 'DRIVER') {
        setPortalMode('DRIVER');
        setActiveDriverNav('driver_trips');
      } else if (selectedRideForBooking) {
        setShowBookingModal(true);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Registration failed.';
      setAuthError(msg);
    } finally {
      setAuthLoading(false);
    }
  };

  // Logout (Clears Supabase Session & Local State completely)
  const handleLogout = async () => {
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch {
        // Safe ignore
      }
    }
    setCurrentUser(null);
    setShowProfileModal(false);
    setPortalMode('PASSENGER');
    setActivePassengerNav('find_ride');
    setNotification({
      type: 'info',
      title: 'Signed Out',
      message: 'You have been signed out of Apni Sawari. All private ride screens are closed.',
    });
  };

  const openSawariRequestsCount = passengerRequests.filter((r) => r.status === 'OPEN').length;

  if (!isClientLoaded) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-400">Loading Apni Sawari...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50/60 text-slate-800 flex flex-col font-sans antialiased selection:bg-emerald-100 selection:text-emerald-900 pb-20 md:pb-8">
      {/* ========================================================================= */}
      {/* 1. TOP APP BAR (DESKTOP & MOBILE RESPONSIVE)                               */}
      {/* ========================================================================= */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-2xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4">
          {/* Brand Logo */}
          <div className="flex items-center gap-2">
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
              <span className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-emerald-700 text-white flex items-center justify-center text-base sm:text-lg font-black shadow-xs group-hover:bg-emerald-800 transition">
                🚗
              </span>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm sm:text-base font-black tracking-tight text-slate-900 group-hover:text-emerald-800 transition">
                    Apni Sawari
                  </span>
                  <span className="text-[9px] sm:text-[10px] font-extrabold text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 hidden xs:inline">
                    {portalMode === 'DRIVER' ? 'DRIVER' : 'CARPOOL'}
                  </span>
                </div>
                <span className="text-[9px] sm:text-[10px] text-slate-500 font-medium block truncate max-w-[130px] sm:max-w-none">
                  اپنی سواری • Pakistan Intercity
                </span>
              </div>
            </button>
          </div>

          {/* Desktop Navigation Links */}
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
                onClick={() => {
                  if (!currentUser) {
                    setAuthTab('SIGNIN');
                    setShowAuthModal(true);
                  } else {
                    setActivePassengerNav('my_bookings');
                  }
                }}
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
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Mode Switcher Button (if logged in) */}
            {currentUser && (
              portalMode === 'PASSENGER' ? (
                <button
                  type="button"
                  onClick={handleSwitchToDriverPanel}
                  className="bg-slate-900 hover:bg-black text-white font-bold text-[11px] sm:text-xs px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-full transition flex items-center gap-1 shadow-2xs cursor-pointer"
                  title="Open Driver Control Dashboard"
                >
                  <span>🚗</span>
                  <span className="hidden sm:inline">Driver Panel</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSwitchToPassengerView}
                  className="bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold text-[11px] sm:text-xs px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-full transition flex items-center gap-1 cursor-pointer shadow-2xs"
                  title="Return to Passenger Portal"
                >
                  <span>←</span>
                  <span className="hidden sm:inline">Passenger View</span>
                </button>
              )
            )}

            {/* Offer a Ride Button */}
            <button
              type="button"
              onClick={handleOpenOfferRide}
              className="border border-emerald-600 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-[11px] sm:text-xs px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-full transition flex items-center gap-1 shadow-2xs cursor-pointer"
            >
              <span>+</span>
              <span className="hidden sm:inline">Offer a Ride</span>
            </button>

            {/* User Profile Pill or Sign In / Register Buttons */}
            {currentUser ? (
              <button
                type="button"
                onClick={() => setShowProfileModal(true)}
                className="flex items-center gap-1 sm:gap-1.5 p-1 pl-1.5 pr-2 sm:pr-2.5 bg-slate-100 hover:bg-slate-200 rounded-full border border-slate-200 transition cursor-pointer"
                title="Account Settings"
              >
                <span className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-emerald-100 flex items-center justify-center text-xs">
                  {currentUser.avatarUrl || '🧑'}
                </span>
                <span className="text-xs font-bold text-slate-800 max-w-[60px] sm:max-w-[80px] truncate hidden xs:inline">
                  {currentUser.name}
                </span>
                <span className="text-emerald-600 text-[10px] sm:text-[11px] font-black">✓</span>
              </button>
            ) : (
              <div className="flex items-center gap-1 sm:gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('SIGNIN');
                    setAuthError(null);
                    setShowAuthModal(true);
                  }}
                  className="bg-emerald-800 hover:bg-emerald-900 text-white text-[11px] sm:text-xs font-bold px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-full transition cursor-pointer shadow-xs"
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('SIGNUP');
                    setAuthError(null);
                    setShowAuthModal(true);
                  }}
                  className="hidden sm:inline-block border border-slate-300 hover:bg-slate-100 text-slate-800 text-xs font-bold px-3 py-1.5 rounded-full transition cursor-pointer"
                >
                  Register
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Notification Toast Alert */}
      {notification && (
        <div className="max-w-4xl mx-auto px-4 mt-2 sm:mt-3 w-full">
          <div
            className={`p-3 sm:p-3.5 rounded-2xl border flex items-start justify-between shadow-xs transition ${
              notification.type === 'success'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : notification.type === 'error'
                ? 'bg-rose-50 border-rose-300 text-rose-900'
                : 'bg-blue-50 border-blue-300 text-blue-900'
            }`}
          >
            <div className="flex gap-2 sm:gap-2.5">
              <span className="text-sm sm:text-base">
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
      {/* 2. MAIN APPLICATION WORKSPACE                                             */}
      {/* ========================================================================= */}
      {portalMode === 'PASSENGER' ? (
        /* ========================================================================= */
        /* A. PASSENGER PORTAL (FIND & BOOK RIDES, SAWARI BOARD, MY BOOKINGS)         */
        /* ========================================================================= */
        <div className="flex-1 flex flex-col">
          {/* Passenger Hero & Floating Horizontal Search Capsule */}
          {activePassengerNav === 'find_ride' && (
            <section className="bg-gradient-to-b from-white via-slate-50 to-slate-50/60 pt-6 sm:pt-8 pb-8 sm:pb-10 border-b border-slate-200/70">
              <div className="max-w-4xl mx-auto px-4 text-center space-y-1 sm:space-y-1.5 mb-5 sm:mb-6">
                <h1 className="text-xl sm:text-3xl font-black text-slate-900 tracking-tight leading-tight">
                  Your Pick of Verified Rides at Low Prices
                </h1>
                <p className="text-xs sm:text-sm text-slate-600 font-medium max-w-lg mx-auto">
                  اپنی سواری • Reserve single seats or book the entire car with verified drivers across Pakistan.
                </p>
              </div>

              {/* Floating Mobile-Responsive Search Capsule */}
              <div className="max-w-4xl mx-auto px-3 sm:px-4">
                <form
                  onSubmit={handleSearchSubmit}
                  className="bg-white shadow-lg shadow-slate-200/60 rounded-2xl md:rounded-full border border-slate-200 p-2 sm:p-2.5 flex flex-col md:flex-row items-stretch md:items-center gap-2 md:gap-1.5"
                >
                  {/* Leaving From */}
                  <div className="flex-1 w-full px-3 py-2 flex items-center gap-2 hover:bg-slate-50 rounded-xl md:rounded-full transition bg-slate-50/50 md:bg-transparent">
                    <span className="text-sm">🟢</span>
                    <div className="w-full text-left">
                      <label className="block text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Leaving From
                      </label>
                      <select
                        value={searchOrigin}
                        onChange={(e) => setSearchOrigin(e.target.value)}
                        className="w-full bg-transparent text-xs sm:text-sm font-extrabold text-slate-900 focus:outline-none cursor-pointer"
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
                  <div className="flex justify-center md:block">
                    <button
                      type="button"
                      onClick={handleSwapCities}
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center shrink-0 transition cursor-pointer text-xs"
                      title="Swap Departure and Destination"
                    >
                      ⇄
                    </button>
                  </div>

                  {/* Going To */}
                  <div className="flex-1 w-full px-3 py-2 flex items-center gap-2 hover:bg-slate-50 rounded-xl md:rounded-full transition bg-slate-50/50 md:bg-transparent border-t md:border-t-0 md:border-l border-slate-200">
                    <span className="text-sm">🔴</span>
                    <div className="w-full text-left">
                      <label className="block text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Going To
                      </label>
                      <select
                        value={searchDest}
                        onChange={(e) => setSearchDest(e.target.value)}
                        className="w-full bg-transparent text-xs sm:text-sm font-extrabold text-slate-900 focus:outline-none cursor-pointer"
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
                  <div className="w-full md:w-32 px-3 py-2 flex items-center gap-2 hover:bg-slate-50 rounded-xl md:rounded-full transition bg-slate-50/50 md:bg-transparent border-t md:border-t-0 md:border-l border-slate-200 text-left">
                    <span className="text-sm">📅</span>
                    <div>
                      <label className="block text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Date
                      </label>
                      <span className="text-xs font-black text-slate-900 block truncate">Today</span>
                    </div>
                  </div>

                  {/* Search CTA */}
                  <button
                    type="submit"
                    className="w-full md:w-auto bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs sm:text-xs px-6 py-3 sm:py-3.5 rounded-xl md:rounded-full shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <span>Find a Ride</span>
                  </button>
                </form>

                {/* Popular Route Shortcuts (Horizontally Scrollable on Mobile) */}
                <div className="mt-3 flex items-center justify-start sm:justify-center overflow-x-auto gap-1.5 text-xs pb-1 scrollbar-none">
                  <span className="text-[10px] sm:text-[11px] text-slate-400 font-bold uppercase shrink-0">Popular:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchOrigin('loc-uk');
                      setSearchDest('loc-khi');
                      setHasSearched(true);
                    }}
                    className="px-2.5 py-1 bg-white hover:bg-emerald-50 hover:text-emerald-900 text-slate-700 rounded-full border border-slate-200 transition font-bold cursor-pointer shrink-0 text-[11px]"
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
                    className="px-2.5 py-1 bg-white hover:bg-emerald-50 hover:text-emerald-900 text-slate-700 rounded-full border border-slate-200 transition font-bold cursor-pointer shrink-0 text-[11px]"
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
                    className="px-2.5 py-1 bg-white hover:bg-emerald-50 hover:text-emerald-900 text-slate-700 rounded-full border border-slate-200 transition font-bold cursor-pointer shrink-0 text-[11px]"
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
                    className="px-2.5 py-1 bg-white hover:bg-emerald-50 hover:text-emerald-900 text-slate-700 rounded-full border border-slate-200 transition font-bold cursor-pointer shrink-0 text-[11px]"
                  >
                    Multan ➔ Lahore
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* Passenger Body Container */}
          <main className="flex-1 max-w-5xl mx-auto px-3 sm:px-6 py-4 sm:py-6 w-full space-y-5">
            {/* VIEW 1: FIND A RIDE (HORIZONTAL RIDE CARDS) */}
            {activePassengerNav === 'find_ride' && (
              <div className="space-y-4">
                {/* Filter Chips Bar (Mobile scrollable) */}
                <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs w-full sm:w-auto scrollbar-none">
                    <button
                      type="button"
                      onClick={() => setActiveTagFilter('ALL')}
                      className={`px-3 py-1.5 rounded-full font-bold transition whitespace-nowrap cursor-pointer text-[11px] sm:text-xs shrink-0 ${
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
                      className={`px-3 py-1.5 rounded-full font-bold transition whitespace-nowrap cursor-pointer text-[11px] sm:text-xs shrink-0 ${
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
                      className={`px-3 py-1.5 rounded-full font-bold transition whitespace-nowrap cursor-pointer text-[11px] sm:text-xs shrink-0 ${
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
                      className={`px-3 py-1.5 rounded-full font-bold transition whitespace-nowrap cursor-pointer text-[11px] sm:text-xs shrink-0 ${
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
                      className={`px-3 py-1.5 rounded-full font-bold transition whitespace-nowrap cursor-pointer text-[11px] sm:text-xs shrink-0 ${
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
                    <span>Post on Sawari Board</span>
                    <span>➔</span>
                  </button>
                </div>

                {/* Ride Results Feed */}
                <div className="space-y-3">
                  {matchingRides.length === 0 ? (
                    <div className="bg-white p-6 sm:p-8 rounded-2xl sm:rounded-3xl border border-slate-200 text-center space-y-3 shadow-2xs">
                      <span className="text-3xl block">🚗</span>
                      <h3 className="text-sm sm:text-base font-black text-slate-800">
                        No direct scheduled rides found for this route
                      </h3>
                      <p className="text-xs text-slate-500 max-w-md mx-auto">
                        Post your request on the Sawari Board and verified drivers traveling along this route will send you direct quotes.
                      </p>
                      <button
                        type="button"
                        onClick={handleOpenPostSawariRequest}
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
                          className="bg-white rounded-2xl border border-slate-200/90 hover:border-slate-300 p-4 sm:p-5 transition shadow-2xs hover:shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 sm:gap-4"
                        >
                          {/* Driver Info Row */}
                          <div className="flex items-center gap-3 shrink-0">
                            <div className="relative">
                              <span className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-lg sm:text-xl">
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
                                <span className="font-extrabold text-xs sm:text-sm text-slate-900">Driver Tariq Khan</span>
                                <span className="text-[10px] font-black text-amber-900 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                                  ★ 4.9
                                </span>
                              </div>
                              <span className="text-[10px] sm:text-[11px] text-slate-500 font-medium block">
                                Toyota Corolla GLi • White
                              </span>
                            </div>
                          </div>

                          {/* Center Column: Route & Travel Comfort Tags */}
                          <div className="flex-1 space-y-1.5 sm:space-y-2">
                            {/* Schedule Timeline */}
                            <div className="flex items-center gap-1.5 sm:gap-2 text-xs font-bold text-slate-900 flex-wrap">
                              <span>07:00 AM</span>
                              <span className="text-slate-500 font-normal">({oName})</span>
                              <span className="text-emerald-600 font-black">➔</span>
                              <span>11:30 AM</span>
                              <span className="text-slate-500 font-normal">({dName})</span>
                            </div>

                            {/* Waypoint Dropoffs */}
                            {ride.routeStops && ride.routeStops.length > 0 && (
                              <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium truncate">
                                Stops: {ride.routeStops.map((s) => s.name).join(' • ')}
                              </p>
                            )}

                            {/* Comfort Tags */}
                            <div className="flex items-center flex-wrap gap-1 text-[10px] sm:text-[11px]">
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
                          <div className="w-full md:w-auto flex items-center md:flex-col justify-between md:justify-center shrink-0 border-t md:border-t-0 pt-2.5 md:pt-0 border-slate-100 gap-2">
                            <div className="text-left md:text-right">
                              <span className="text-[10px] sm:text-xs text-slate-400 font-bold block">Per Seat</span>
                              <div className="flex items-baseline gap-1">
                                <span className="text-base sm:text-xl font-black text-slate-900">
                                  Rs. {ride.seatPrice?.toLocaleString()}
                                </span>
                              </div>
                              <span className="text-[10px] sm:text-[11px] font-bold text-emerald-700 block">
                                {isFull ? 'Sold Out' : `${availableSeats} of ${ride.capacity} seats left`}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleSelectRideForBooking(ride)}
                              disabled={isFull}
                              className={`px-4 sm:px-5 py-2 sm:py-2.5 rounded-full font-bold text-xs transition cursor-pointer shadow-xs ${
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
                <div className="flex items-center justify-between flex-wrap gap-2 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200">
                  <div>
                    <h2 className="text-sm sm:text-base font-black text-slate-900">Sawari Request Board</h2>
                    <p className="text-[11px] sm:text-xs text-slate-500">
                      Cannot find a ride matching your schedule? Broadcast your itinerary and drivers will submit offers.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleOpenPostSawariRequest}
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
                            <span className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-slate-100 flex items-center justify-center text-sm sm:text-base">
                              {req.isFamilyTrip ? '👨‍👩‍👧' : '🧑'}
                            </span>
                            <div>
                              <span className="font-extrabold text-xs sm:text-sm text-slate-900 block">
                                {oName} ➔ {dName}
                              </span>
                              <span className="text-[10px] sm:text-[11px] text-slate-500 font-medium">
                                Requested by {req.passengerName}
                              </span>
                            </div>
                          </div>

                          <span
                            className={`text-[9px] sm:text-[10px] font-black px-2 sm:px-2.5 py-0.5 rounded-full uppercase ${
                              req.status === 'ACCEPTED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {req.status === 'ACCEPTED' ? '✓ Driver Confirmed' : '🟢 Open for Bids'}
                          </span>
                        </div>

                        {/* Travel tags */}
                        <div className="flex flex-wrap items-center gap-1 text-[10px] sm:text-[11px]">
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
                            <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase block">
                              Passenger Budget:
                            </span>
                            <span className="text-sm sm:text-base font-black text-emerald-800">
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
                                  : `💬 ${req.offers.length} Offer(s)`}
                              </span>
                              {req.status === 'OPEN' && (
                                <button
                                  type="button"
                                  onClick={() => handleCancelSawariRequest(req.id)}
                                  className="text-xs text-rose-600 hover:text-rose-800 font-bold bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200 cursor-pointer"
                                >
                                  Cancel
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
                                  className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs"
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

                                  <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-2">
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

            {/* VIEW 3: MY BOOKINGS (AUTH PROTECTED - ONLY SHOWS FOR LOGGED IN USERS) */}
            {activePassengerNav === 'my_bookings' && (
              <div className="space-y-4">
                <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200">
                  <h2 className="text-sm sm:text-base font-black text-slate-900">My Bookings &amp; Tickets</h2>
                  <p className="text-[11px] sm:text-xs text-slate-500">
                    Track your reserved seats, boarding terminal points, and direct cash payments due to drivers.
                  </p>
                </div>

                {!currentUser ? (
                  <div className="bg-white p-6 sm:p-8 rounded-2xl sm:rounded-3xl border border-slate-200 text-center space-y-3 shadow-2xs">
                    <span className="text-3xl block">🔒</span>
                    <h3 className="text-sm sm:text-base font-black text-slate-800">Sign in to view your bookings</h3>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      Access your confirmed tickets, driver phone numbers, and reservation history.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthTab('SIGNIN');
                        setShowAuthModal(true);
                      }}
                      className="bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs px-6 py-2.5 rounded-full transition shadow-xs cursor-pointer inline-block"
                    >
                      Sign In / Register
                    </button>
                  </div>
                ) : myPassengerBookings.length === 0 ? (
                  <div className="bg-white p-6 sm:p-8 rounded-2xl sm:rounded-3xl border border-slate-200 text-center space-y-2 shadow-2xs">
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
                          className={`bg-white p-4 sm:p-5 rounded-2xl border transition shadow-2xs space-y-3 ${
                            b.status === 'ACCEPTED'
                              ? 'border-emerald-300'
                              : b.status === 'PENDING'
                              ? 'border-amber-300'
                              : 'border-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-xs sm:text-sm font-black text-slate-900 block">
                                {oName} ➔ {dName}
                              </span>
                              <span className="text-[11px] sm:text-xs text-slate-500 font-medium">
                                {b.bookingType === 'WHOLE_CAR'
                                  ? b.isRoundTrip
                                    ? '🚗 Full Car (Round-Trip Wait & Return)'
                                    : '🚗 Full Car Reservation'
                                  : `💺 ${b.requestedSeats} Seat(s)`}
                              </span>
                            </div>

                            <span
                              className={`text-[9px] sm:text-[10px] font-black px-2 sm:px-2.5 py-0.5 rounded-full uppercase ${
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
                              <span className="font-extrabold text-xs sm:text-sm text-emerald-900">
                                Rs. {b.totalPrice.toLocaleString()} (Cash upon boarding)
                              </span>
                            </div>
                            {b.dropoffStopName && (
                              <span className="text-[10px] sm:text-[11px] font-bold text-slate-700">
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
              <div className="bg-white p-5 sm:p-8 rounded-2xl sm:rounded-3xl border border-slate-200 space-y-6">
                <div className="text-center max-w-xl mx-auto space-y-1">
                  <h2 className="text-lg sm:text-xl font-black text-slate-900">How Apni Sawari Works</h2>
                  <p className="text-xs text-slate-500">
                    A safe, verified carpool network connecting passengers and car owners traveling between cities in Pakistan.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 pt-2 sm:pt-4">
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                    <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-emerald-700 text-white font-black text-xs flex items-center justify-center">
                      1
                    </span>
                    <h3 className="font-bold text-xs text-slate-900">Find or Request</h3>
                    <p className="text-[11px] text-slate-600">
                      Search direct scheduled rides or post your custom trip request on the Sawari Board.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                    <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-emerald-700 text-white font-black text-xs flex items-center justify-center">
                      2
                    </span>
                    <h3 className="font-bold text-xs text-slate-900">Instant Seat or Full Car</h3>
                    <p className="text-[11px] text-slate-600">
                      Reserve single seats to split fuel costs, or book the entire car with round-trip waiting.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                    <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-emerald-700 text-white font-black text-xs flex items-center justify-center">
                      3
                    </span>
                    <h3 className="font-bold text-xs text-slate-900">Verified Profiles</h3>
                    <p className="text-[11px] text-slate-600">
                      Drivers are vetted with CNIC and driving licenses. Ratings and reviews keep travel secure.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                    <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-emerald-700 text-white font-black text-xs flex items-center justify-center">
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
        <div className="flex-1 max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-6 w-full space-y-5">
          {/* Driver Top Banner & Quick KPI Bar */}
          <div className="bg-slate-900 text-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl shadow-sm space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
                  Captain Control Hub
                </span>
                <h1 className="text-lg sm:text-2xl font-black mt-1.5">
                  Welcome back, {currentUser?.name || 'Captain'}
                </h1>
                <p className="text-[11px] sm:text-xs text-slate-400">
                  Vehicle: {currentUser?.vehicle?.makeModel} ({currentUser?.vehicle?.plate}) • City: {currentUser?.city}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenOfferRide}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-full transition shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <span>+</span>
                  <span>Publish Journey</span>
                </button>
              </div>
            </div>

            {/* 4 Metric KPI Cards (Responsive 2x2 on mobile, 4x1 on desktop) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 pt-2 border-t border-slate-800">
              <div className="bg-slate-800/80 p-3 sm:p-3.5 rounded-xl sm:rounded-2xl border border-slate-700/60">
                <span className="text-[9px] sm:text-[10px] font-bold uppercase text-slate-400 block">Active Listings</span>
                <span className="text-base sm:text-xl font-black text-white">{myDriverRides.length}</span>
                <span className="text-[9px] sm:text-[10px] text-emerald-400 font-semibold block mt-0.5">Live on Search</span>
              </div>

              <div className="bg-slate-800/80 p-3 sm:p-3.5 rounded-xl sm:rounded-2xl border border-slate-700/60">
                <span className="text-[9px] sm:text-[10px] font-bold uppercase text-slate-400 block">Pending Requests</span>
                <span className="text-base sm:text-xl font-black text-amber-400">{driverPendingBookings.length}</span>
                <span className="text-[9px] sm:text-[10px] text-slate-400 font-semibold block mt-0.5">Awaiting approval</span>
              </div>

              <div className="bg-slate-800/80 p-3 sm:p-3.5 rounded-xl sm:rounded-2xl border border-slate-700/60">
                <span className="text-[9px] sm:text-[10px] font-bold uppercase text-slate-400 block">Cash to Collect</span>
                <span className="text-base sm:text-xl font-black text-emerald-400 truncate block">
                  Rs. {driverTotalCashDue.toLocaleString()}
                </span>
                <span className="text-[9px] sm:text-[10px] text-slate-400 font-semibold block mt-0.5">From passengers</span>
              </div>

              <div className="bg-slate-800/80 p-3 sm:p-3.5 rounded-xl sm:rounded-2xl border border-slate-700/60">
                <span className="text-[9px] sm:text-[10px] font-bold uppercase text-slate-400 block">Reliability</span>
                <span className="text-base sm:text-xl font-black text-white">98% ★ 4.9</span>
                <span className="text-[9px] sm:text-[10px] text-emerald-400 font-semibold block mt-0.5">Top-Rated Captain</span>
              </div>
            </div>
          </div>

          {/* Sub-navigation Tabs for Driver (Scrollable horizontally on mobile) */}
          <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 text-xs font-bold scrollbar-none">
            <button
              type="button"
              onClick={() => setActiveDriverNav('driver_trips')}
              className={`px-3 sm:px-4 py-2 rounded-xl transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
                activeDriverNav === 'driver_trips'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <span>📋</span>
              <span>Trips &amp; Requests</span>
              {driverPendingBookings.length > 0 && (
                <span className="px-1.5 py-0.2 bg-amber-500 text-white text-[10px] font-black rounded-full">
                  {driverPendingBookings.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveDriverNav('driver_leads')}
              className={`px-3 sm:px-4 py-2 rounded-xl transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
                activeDriverNav === 'driver_leads'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <span>📢</span>
              <span>Sawari Leads ({openSawariRequestsCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveDriverNav('driver_vehicle')}
              className={`px-3 sm:px-4 py-2 rounded-xl transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
                activeDriverNav === 'driver_vehicle'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <span>🚙</span>
              <span>My Vehicle</span>
            </button>
          </div>

          {/* DRIVER SUB-VIEW 1: TRIPS & INCOMING PASSENGER REQUESTS */}
          {activeDriverNav === 'driver_trips' && (
            <div className="space-y-5">
              {/* Priority Callout: Incoming Booking Requests Queue */}
              {driverPendingBookings.length > 0 && (
                <div className="bg-amber-50/80 border border-amber-300 p-4 sm:p-5 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-base sm:text-lg">📩</span>
                      <h3 className="text-xs sm:text-sm font-black text-amber-950">
                        Incoming Passenger Requests ({driverPendingBookings.length})
                      </h3>
                    </div>
                    <span className="text-[10px] sm:text-[11px] font-bold text-amber-800">Review to confirm</span>
                  </div>

                  <div className="space-y-2">
                    {driverPendingBookings.map((req) => (
                      <div
                        key={req.id}
                        className="bg-white p-3.5 sm:p-4 rounded-xl border border-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-xs sm:text-sm text-slate-900">{req.passengerId}</span>
                            <span className="text-[10px] font-black bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                              {req.bookingType === 'WHOLE_CAR' ? 'Entire Car' : `${req.requestedSeats} Seat(s)`}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600">
                            Dropoff: <span className="font-bold">{req.dropoffStopName || 'Destination'}</span> • Cash due upon boarding:{' '}
                            <span className="font-black text-emerald-800">Rs. {req.totalPrice.toLocaleString()}</span>
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
                          <button
                            type="button"
                            onClick={() => handleAcceptBooking(req)}
                            className="bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs py-2 px-3 sm:px-4 rounded-lg transition cursor-pointer shadow-xs"
                          >
                            ✓ Accept
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
                  <h3 className="text-xs sm:text-sm font-black text-slate-900">Your Active Scheduled Journeys</h3>
                  <button
                    type="button"
                    onClick={handleOpenOfferRide}
                    className="text-xs text-emerald-700 hover:text-emerald-900 font-bold cursor-pointer"
                  >
                    + Publish Trip
                  </button>
                </div>

                {myDriverRides.length === 0 ? (
                  <div className="bg-white p-6 sm:p-8 rounded-2xl sm:rounded-3xl border border-slate-200 text-center space-y-2">
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
                          className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3"
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-black text-sm sm:text-base text-slate-900">
                                  {oName} ➔ {dName}
                                </span>
                                <span className="text-[9px] sm:text-[10px] font-black bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                                  Active
                                </span>
                              </div>
                              <span className="text-xs text-slate-500 font-medium">
                                Departure: 07:00 AM • Vehicle: {currentUser?.vehicle?.makeModel} ({currentUser?.vehicle?.plate})
                              </span>
                            </div>

                            <div className="text-right">
                              <span className="text-[10px] sm:text-xs text-slate-400 font-bold block">Capacity</span>
                              <span className="text-xs sm:text-sm font-black text-slate-900">
                                {ride.capacity - availableSeats}/{ride.capacity} Booked
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-slate-50 p-2.5 sm:p-3 rounded-xl border border-slate-100 text-xs">
                            <div>
                              <span className="text-[9px] sm:text-[10px] text-slate-400 uppercase font-bold block">Seat Fare:</span>
                              <span className="font-extrabold text-slate-800">Rs. {ride.seatPrice?.toLocaleString()}</span>
                            </div>
                            <div>
                              <span className="text-[9px] sm:text-[10px] text-slate-400 uppercase font-bold block">Whole Car:</span>
                              <span className="font-extrabold text-slate-800">Rs. {ride.wholeCarPrice.toLocaleString()}</span>
                            </div>
                            <div className="col-span-2 sm:col-span-1">
                              <span className="text-[9px] sm:text-[10px] text-slate-400 uppercase font-bold block">Round-Trip:</span>
                              <span className="font-extrabold text-slate-800">
                                {ride.roundTripWholeCarPrice ? `Rs. ${ride.roundTripWholeCarPrice.toLocaleString()}` : 'Not offered'}
                              </span>
                            </div>
                          </div>
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
              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200">
                <h3 className="text-sm sm:text-base font-black text-slate-900">Live Passenger Requests (Leads)</h3>
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
                      className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-slate-100 flex items-center justify-center text-base sm:text-lg">
                            {req.isFamilyTrip ? '👨‍👩‍👧' : '🧑'}
                          </span>
                          <div>
                            <span className="font-black text-sm sm:text-base text-slate-900 block">
                              {oName} ➔ {dName}
                            </span>
                            <span className="text-[11px] text-slate-500 font-medium">
                              {req.passengerName} • {req.travelDate} ({req.desiredTime})
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase block">Budget</span>
                          <span className="text-base sm:text-lg font-black text-emerald-800">
                            Rs. {req.budgetPrice.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                        {alreadyOffered ? (
                          <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
                            ✓ Quote Sent
                          </span>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => handleDriverAcceptBudget(req)}
                              className="bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs py-2 px-3 sm:px-3.5 rounded-xl transition cursor-pointer shadow-xs"
                            >
                              ⚡ Accept Budget
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenCustomOfferModal(req)}
                              className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs py-2 px-3 rounded-xl transition cursor-pointer"
                            >
                              Counter-Offer
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
            <div className="bg-white p-5 sm:p-8 rounded-2xl sm:rounded-3xl border border-slate-200 space-y-6">
              <div>
                <h3 className="text-sm sm:text-base font-black text-slate-900">Vehicle Specifications &amp; Driver Details</h3>
                <p className="text-xs text-slate-500">
                  Keep your vehicle information and emergency contacts accurate for passenger safety.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
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
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Driver Verification</span>
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-extrabold text-sm text-slate-900">{currentUser?.name}</h4>
                      <p className="text-xs text-slate-500">Status: Verified Driver Account</p>
                    </div>
                    <span className="text-xs font-bold bg-emerald-600 text-white px-2 py-0.5 rounded-full">
                      ✓ VERIFIED
                    </span>
                  </div>
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
      {/* 3. MOBILE BOTTOM NAVIGATION BAR (md:hidden)                               */}
      {/* ========================================================================= */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 py-1.5 px-2 flex items-center justify-around text-center shadow-lg">
        <button
          type="button"
          onClick={() => {
            if (portalMode === 'DRIVER') setPortalMode('PASSENGER');
            setActivePassengerNav('find_ride');
          }}
          className={`flex flex-col items-center justify-center p-1 rounded-xl transition cursor-pointer ${
            portalMode === 'PASSENGER' && activePassengerNav === 'find_ride' ? 'text-emerald-800 font-black' : 'text-slate-500'
          }`}
        >
          <span className="text-base">🔍</span>
          <span className="text-[10px] mt-0.5">Find Ride</span>
        </button>

        <button
          type="button"
          onClick={() => {
            if (portalMode === 'DRIVER') setPortalMode('PASSENGER');
            setActivePassengerNav('sawari_board');
          }}
          className={`flex flex-col items-center justify-center p-1 rounded-xl transition cursor-pointer relative ${
            portalMode === 'PASSENGER' && activePassengerNav === 'sawari_board' ? 'text-emerald-800 font-black' : 'text-slate-500'
          }`}
        >
          <span className="text-base">📢</span>
          <span className="text-[10px] mt-0.5">Board</span>
          {openSawariRequestsCount > 0 && (
            <span className="absolute top-0 right-1 w-3.5 h-3.5 bg-emerald-600 text-white rounded-full text-[9px] flex items-center justify-center font-bold">
              {openSawariRequestsCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={handleOpenOfferRide}
          className="flex flex-col items-center justify-center p-1 rounded-xl transition cursor-pointer text-emerald-700 font-bold"
        >
          <span className="w-8 h-8 rounded-full bg-emerald-700 text-white flex items-center justify-center text-sm font-black shadow-xs">
            +
          </span>
          <span className="text-[10px] mt-0.5 text-slate-800 font-bold">Offer</span>
        </button>

        <button
          type="button"
          onClick={() => {
            if (!currentUser) {
              setAuthTab('SIGNIN');
              setShowAuthModal(true);
            } else if (portalMode === 'DRIVER') {
              setActiveDriverNav('driver_trips');
            } else {
              setActivePassengerNav('my_bookings');
            }
          }}
          className={`flex flex-col items-center justify-center p-1 rounded-xl transition cursor-pointer relative ${
            (portalMode === 'PASSENGER' && activePassengerNav === 'my_bookings') || (portalMode === 'DRIVER' && activeDriverNav === 'driver_trips')
              ? 'text-emerald-800 font-black'
              : 'text-slate-500'
          }`}
        >
          <span className="text-base">{portalMode === 'DRIVER' ? '📋' : '🎟️'}</span>
          <span className="text-[10px] mt-0.5">{portalMode === 'DRIVER' ? 'My Trips' : 'Bookings'}</span>
          {myPassengerBookings.length > 0 && (
            <span className="absolute top-0 right-1 w-3.5 h-3.5 bg-emerald-700 text-white rounded-full text-[9px] flex items-center justify-center font-bold">
              {myPassengerBookings.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            if (currentUser) {
              setShowProfileModal(true);
            } else {
              setAuthTab('SIGNIN');
              setAuthError(null);
              setShowAuthModal(true);
            }
          }}
          className="flex flex-col items-center justify-center p-1 rounded-xl transition cursor-pointer text-slate-500"
        >
          <span className="text-base">{currentUser ? (currentUser.avatarUrl || '🧑') : '👤'}</span>
          <span className="text-[10px] mt-0.5">{currentUser ? 'Profile' : 'Sign In'}</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* 4. MODALS (AUTHENTICATION, BOOKING, OFFER RIDE, SAWARI REQUEST, PROFILE)  */}
      {/* ========================================================================= */}

      {/* MODAL 1: AUTHENTICATION DIALOG (MATCHING REFERENCE DESIGN: UNIFIED EMAIL/PHONE + INSTANT SIGNIN) */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-2xl relative max-h-[94vh] overflow-y-auto">
            {/* Top Close Button */}
            <button
              type="button"
              onClick={() => {
                setShowAuthModal(false);
                setAuthError(null);
                setOtpSent(false);
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 transition cursor-pointer font-bold text-base"
              title="Close"
            >
              ✕
            </button>

            {/* Error Banner */}
            {authError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-start gap-2">
                <span>⚠️</span>
                <span>{authError}</span>
              </div>
            )}

            {/* ========================================================================= */}
            {/* VIEW 1: SIGN IN ("Welcome Back" - Exactly like Reference Image)           */}
            {/* ========================================================================= */}
            {authTab === 'SIGNIN' && (
              <div className="space-y-5">
                {/* Header */}
                <div className="text-center pt-1">
                  <h3 className="text-2xl sm:text-[26px] font-black text-slate-900 tracking-tight">
                    Welcome Back
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-500 mt-1 font-medium">
                    Sign in to your Apni Sawari account
                  </p>
                </div>

                <form onSubmit={handleSupabaseSignIn} className="space-y-4">
                  {/* Single Unified Identifier Input (Email or Mobile Number) */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1.5">
                      Email Address or Mobile Number
                    </label>
                    <div className="relative flex items-center bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 py-3 focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/10 focus-within:bg-white transition">
                      <span className="text-slate-400 mr-2.5 text-sm select-none">
                        {authIdentifier.includes('@') ? '✉️' : authIdentifier.replace(/\D/g, '').length >= 4 ? '📱' : '👤'}
                      </span>
                      <input
                        type="text"
                        required
                        value={authIdentifier}
                        onChange={(e) => {
                          setAuthIdentifier(e.target.value);
                          setAuthError(null);
                        }}
                        placeholder="you@example.com or 0333 1234567"
                        className="w-full bg-transparent text-xs sm:text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none"
                      />
                      {authIdentifier.replace(/\D/g, '').length >= 10 && !authIdentifier.includes('@') && (
                        <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-md select-none shrink-0">
                          🇵🇰 Mobile
                        </span>
                      )}
                      {authIdentifier.includes('@') && (
                        <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded-md select-none shrink-0">
                          ✉️ Email
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Password or OTP Input */}
                  {authMethod === 'PASSWORD' ? (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-bold text-slate-800">Password</label>
                        <button
                          type="button"
                          onClick={() => {
                            setAuthMethod('OTP');
                            setOtpSent(false);
                            setAuthError(null);
                          }}
                          className="text-xs text-purple-600 hover:text-purple-700 font-bold hover:underline cursor-pointer"
                        >
                          Sign in with OTP / SMS?
                        </button>
                      </div>
                      <div className="relative flex items-center bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 py-3 focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/10 focus-within:bg-white transition">
                        <span className="text-slate-400 mr-2.5 text-sm select-none">🔒</span>
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          value={authPassword}
                          onChange={(e) => setAuthPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full bg-transparent text-xs sm:text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="text-slate-400 hover:text-slate-600 ml-2 text-sm cursor-pointer select-none"
                          title={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? '🙈' : '👁️'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-bold text-slate-800">
                          {otpSent ? 'Enter 6-Digit OTP Code' : 'Instant OTP Access'}
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setAuthMethod('PASSWORD');
                            setOtpSent(false);
                            setAuthError(null);
                          }}
                          className="text-xs text-purple-600 hover:text-purple-700 font-bold hover:underline cursor-pointer"
                        >
                          Use Password instead
                        </button>
                      </div>

                      {otpSent ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            required
                            maxLength={6}
                            value={otpCode}
                            onChange={(e) => setOtpCode(e.target.value)}
                            placeholder="• • • • • •"
                            autoFocus
                            className="w-full bg-slate-50 border-2 border-emerald-600 rounded-xl px-4 py-2.5 text-lg font-black text-center tracking-[0.35em] text-emerald-900 focus:outline-none focus:bg-white shadow-xs"
                          />
                          <div className="flex items-center justify-between text-[11px] text-slate-500">
                            {!authIdentifier.includes('@') && (
                              <a
                                href={getWhatsAppUrl(authIdentifier, `Salam, mera Apni Sawari login code chahye.`)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-emerald-700 hover:underline font-bold"
                              >
                                💬 WhatsApp code
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => setOtpSent(false)}
                              className="text-slate-600 hover:underline font-semibold ml-auto cursor-pointer"
                            >
                              Resend Code 🔄
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                          Click below to receive a secure 6-digit OTP code directly to your{' '}
                          {authIdentifier.includes('@') ? 'email inbox' : 'mobile SMS'}.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Prominent CTA Sign In Button (Vibrant Orange like Reference Image) */}
                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full bg-orange-500 hover:bg-orange-600 active:scale-[0.99] disabled:opacity-50 text-white font-black text-sm py-3.5 rounded-2xl shadow-md transition cursor-pointer flex items-center justify-center gap-2 mt-2"
                  >
                    {authLoading ? (
                      'Signing In...'
                    ) : authMethod === 'PASSWORD' ? (
                      <>
                        <span>Sign In</span>
                        <span>➔</span>
                      </>
                    ) : !otpSent ? (
                      <>
                        <span>Send OTP Code</span>
                        <span>➔</span>
                      </>
                    ) : (
                      <>
                        <span>Verify & Sign In</span>
                        <span>➔</span>
                      </>
                    )}
                  </button>
                </form>

                {/* BOTTOM CARD: "New to Apni Sawari? FREE" - Exact Replica of Reference Image */}
                <div className="bg-purple-50/70 border border-purple-200/80 rounded-2xl p-4 text-center space-y-2 mt-2">
                  <div className="flex items-center justify-center gap-1.5 text-xs font-black text-purple-900">
                    <span>✨</span>
                    <span>New to Apni Sawari?</span>
                    <span className="bg-purple-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                      FREE
                    </span>
                  </div>
                  <p className="text-[11px] text-purple-700 leading-relaxed font-medium">
                    Create your free account to find or offer nationwide return rides & carpooling!
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthTab('SIGNUP');
                      setOtpSent(false);
                      setAuthError(null);
                    }}
                    className="w-full bg-purple-600 hover:bg-purple-700 active:scale-[0.99] text-white font-black text-xs sm:text-sm py-2.5 rounded-xl transition shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <span>Create Free Account</span>
                    <span>➔</span>
                  </button>
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* VIEW 2: SIGN UP / REGISTRATION (Unified Email or Phone + Full OTP Flow)    */}
            {/* ========================================================================= */}
            {authTab === 'SIGNUP' && (
              <div className="space-y-4">
                {/* Header */}
                <div className="text-center pt-1">
                  <h3 className="text-2xl sm:text-[26px] font-black text-slate-900 tracking-tight">
                    Create Free Account
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-500 mt-1 font-medium">
                    Join Pakistan’s intercity nationwide carpool network
                  </p>
                </div>

                <form onSubmit={handleSupabaseSignUp} className="space-y-3.5">
                  {otpSent ? (
                    /* OTP VERIFICATION STEP */
                    <div className="space-y-3.5 p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-emerald-950 uppercase tracking-wide">
                          🔐 Enter Verification Code
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setOtpSent(false);
                            setOtpCode('');
                            setAuthError(null);
                          }}
                          className="text-[11px] text-emerald-800 hover:text-emerald-950 font-bold underline cursor-pointer"
                        >
                          ✏️ Edit Details
                        </button>
                      </div>
                      <p className="text-xs text-emerald-900 font-medium">
                        A 6-digit verification code has been dispatched to{' '}
                        <span className="font-black bg-white px-2 py-0.5 rounded-md border border-emerald-200">
                          {authIdentifier}
                        </span>
                      </p>

                      <div>
                        <input
                          type="text"
                          required
                          maxLength={6}
                          value={otpCode}
                          onChange={(e) => setOtpCode(e.target.value)}
                          placeholder="• • • • • •"
                          autoFocus
                          className="w-full bg-white border-2 border-emerald-600 rounded-xl px-4 py-3 text-xl font-black text-center tracking-[0.35em] text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-xs"
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px] pt-0.5">
                        {!authIdentifier.includes('@') ? (
                          <a
                            href={getWhatsAppUrl(authIdentifier, `Salam, mera Apni Sawari signup code chahye.`)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-700 hover:text-emerald-800 font-bold hover:underline inline-flex items-center gap-1 cursor-pointer"
                          >
                            <span>💬</span> WhatsApp fallback
                          </a>
                        ) : <span />}

                        <button
                          type="button"
                          disabled={authLoading}
                          onClick={() => {
                            setOtpSent(false);
                          }}
                          className="text-slate-600 hover:text-slate-900 font-bold underline cursor-pointer ml-auto"
                        >
                          Resend Code 🔄
                        </button>
                      </div>

                      <button
                        type="submit"
                        disabled={authLoading}
                        className="w-full bg-orange-500 hover:bg-orange-600 active:scale-[0.99] disabled:opacity-50 text-white font-black text-xs sm:text-sm py-3 rounded-xl transition shadow-md cursor-pointer mt-2"
                      >
                        {authLoading ? 'Verifying Code & Creating Account...' : '✅ Verify Code & Complete Registration ➔'}
                      </button>
                    </div>
                  ) : (
                    /* INITIAL REGISTRATION FORM */
                    <>
                      {/* Full Name */}
                      <div>
                        <label className="block text-xs font-bold text-slate-800 mb-1">Full Name</label>
                        <div className="relative flex items-center bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 py-2.5 focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/10 focus-within:bg-white transition">
                          <span className="text-slate-400 mr-2 select-none text-xs">👤</span>
                          <input
                            type="text"
                            required
                            value={authName}
                            onChange={(e) => setAuthName(e.target.value)}
                            placeholder="e.g. Ali Ahmed"
                            className="w-full bg-transparent text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none"
                          />
                        </div>
                      </div>

                      {/* Single Unified Identifier: Email or Mobile */}
                      <div>
                        <label className="block text-xs font-bold text-slate-800 mb-1">
                          Email Address or Mobile Number
                        </label>
                        <div className="relative flex items-center bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 py-2.5 focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/10 focus-within:bg-white transition">
                          <span className="text-slate-400 mr-2 select-none text-xs">
                            {authIdentifier.includes('@') ? '✉️' : authIdentifier.replace(/\D/g, '').length >= 4 ? '📱' : '✉️/📱'}
                          </span>
                          <input
                            type="text"
                            required
                            value={authIdentifier}
                            onChange={(e) => {
                              setAuthIdentifier(e.target.value);
                              setAuthError(null);
                            }}
                            placeholder="you@example.com or 0333 1234567"
                            className="w-full bg-transparent text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none"
                          />
                          {authIdentifier.replace(/\D/g, '').length >= 10 && !authIdentifier.includes('@') && (
                            <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-md select-none shrink-0">
                              🇵🇰 Mobile (SMS)
                            </span>
                          )}
                          {authIdentifier.includes('@') && (
                            <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded-md select-none shrink-0">
                              ✉️ Email
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Password */}
                      <div>
                        <label className="block text-xs font-bold text-slate-800 mb-1">Password</label>
                        <div className="relative flex items-center bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 py-2.5 focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/10 focus-within:bg-white transition">
                          <span className="text-slate-400 mr-2 select-none text-xs">🔒</span>
                          <input
                            type={showPassword ? 'text' : 'password'}
                            required
                            value={authPassword}
                            onChange={(e) => setAuthPassword(e.target.value)}
                            placeholder="Create a strong password (min 6 chars)"
                            className="w-full bg-transparent text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="text-slate-400 hover:text-slate-600 ml-2 text-xs cursor-pointer select-none"
                          >
                            {showPassword ? '🙈' : '👁️'}
                          </button>
                        </div>
                      </div>

                      {/* City */}
                      <div>
                        <label className="block text-xs font-bold text-slate-800 mb-1">City</label>
                        <select
                          value={authCity}
                          onChange={(e) => setAuthCity(e.target.value)}
                          className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-orange-500"
                        >
                          {NATIONWIDE_CITIES.map((c) => (
                            <option key={c.id} value={c.name}>
                              {c.name} ({c.province})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Role Choice */}
                      <div>
                        <label className="block text-xs font-bold text-slate-800 mb-1">How will you use Apni Sawari?</label>
                        <div className="grid grid-cols-2 gap-2 text-xs font-bold">
                          <button
                            type="button"
                            onClick={() => setAuthRole('PASSENGER')}
                            className={`p-2.5 rounded-xl border text-center transition cursor-pointer ${
                              authRole === 'PASSENGER'
                                ? 'bg-purple-50 border-purple-600 text-purple-950 font-black'
                                : 'bg-white border-slate-200 text-slate-700'
                            }`}
                          >
                            <span className="block text-base">🧑</span>
                            <span>Passenger</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setAuthRole('DRIVER')}
                            className={`p-2.5 rounded-xl border text-center transition cursor-pointer ${
                              authRole === 'DRIVER'
                                ? 'bg-purple-50 border-purple-600 text-purple-950 font-black'
                                : 'bg-white border-slate-200 text-slate-700'
                            }`}
                          >
                            <span className="block text-base">🚗</span>
                            <span>Driver (Have Car)</span>
                          </button>
                        </div>
                      </div>

                      {authRole === 'DRIVER' && (
                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                          <span className="text-[11px] font-bold text-slate-700 block">Vehicle Information</span>
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="text"
                              required
                              value={authCarModel}
                              onChange={(e) => setAuthCarModel(e.target.value)}
                              placeholder="Car Model (e.g. Corolla)"
                              className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold"
                            />
                            <input
                              type="text"
                              required
                              value={authCarPlate}
                              onChange={(e) => setAuthCarPlate(e.target.value)}
                              placeholder="Plate (e.g. LEB-4592)"
                              className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold"
                            />
                          </div>
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={authLoading}
                        className="w-full bg-orange-500 hover:bg-orange-600 active:scale-[0.99] disabled:opacity-50 text-white font-black text-xs sm:text-sm py-3.5 rounded-2xl shadow-md transition cursor-pointer mt-2"
                      >
                        {authLoading ? 'Sending Verification Code...' : 'Send Verification Code ➔'}
                      </button>
                    </>
                  )}
                </form>

                {/* BOTTOM CARD: Already have account -> Back to Sign In */}
                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 text-center space-y-1.5 mt-2">
                  <p className="text-xs font-bold text-slate-700">Already registered on Apni Sawari?</p>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthTab('SIGNIN');
                      setOtpSent(false);
                      setAuthError(null);
                    }}
                    className="w-full bg-slate-900 hover:bg-black active:scale-[0.99] text-white font-black text-xs py-2.5 rounded-xl transition shadow-xs cursor-pointer"
                  >
                    Sign In to Your Account ➔
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 2: PASSENGER BOOKING DIALOG */}
      {showBookingModal && selectedRideForBooking && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl sm:rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
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
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer p-1"
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
                <span className="text-base sm:text-lg font-black text-emerald-800">
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
                className="bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs px-5 sm:px-6 py-2.5 sm:py-3 rounded-full transition shadow-xs cursor-pointer"
              >
                Send Request to Driver
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: OFFER A RIDE / TRIP SETUP */}
      {showOfferRideModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl sm:rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
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
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer p-1"
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

      {/* MODAL 4: POST ON SAWARI BOARD (PASSENGER) */}
      {showPostRequestModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl sm:rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
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
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer p-1"
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
                  <label className="block text-xs font-bold text-slate-700 mb-1">Target Budget (PKR)</label>
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

      {/* MODAL 5: DRIVER COUNTER-OFFER MODAL */}
      {selectedReqForOffer && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white w-full max-w-md rounded-2xl sm:rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-xl space-y-4">
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
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer p-1"
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

      {/* MODAL 6: USER PROFILE & CAR MODAL */}
      {showProfileModal && currentUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl sm:rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900">Profile &amp; Settings</h3>
                <p className="text-xs text-slate-500">Manage your contact information, photo, and vehicle</p>
              </div>
              <button
                type="button"
                onClick={() => setShowProfileModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer p-1"
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

      {/* ========================================================================= */}
      {/* 5. FOOTER                                                                 */}
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
