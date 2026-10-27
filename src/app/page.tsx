'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  acceptBookingRequest,
  rejectBookingRequest,
  cancelConfirmedBooking,
  cancelRide,
  switchRideBookingMode,
  createBookingRequest,
  calculateAvailableSeats,
  BookingEngineError,
} from '@/lib/booking-engine';
import type {
  Ride,
  BookingRequest,
  BookingType,
  RideBookingMode,
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

export interface AppUser {
  id: string;
  name: string;
  phone: string;
  role: 'PASSENGER' | 'DRIVER';
  vehicle?: {
    makeModel: string;
    plate: string;
    capacity: number;
    hasAc: boolean;
  };
}

const DEFAULT_PASSENGER: AppUser = {
  id: 'usr-ali',
  name: 'Muhammad Ali',
  phone: '0301-2345678',
  role: 'PASSENGER',
};

const DEFAULT_DRIVER: AppUser = {
  id: 'driver-tariq',
  name: 'Tariq Khan',
  phone: '0300-9876543',
  role: 'DRIVER',
  vehicle: {
    makeModel: 'Toyota Corolla (AC)',
    plate: 'LEB-4592',
    capacity: 4,
    hasAc: true,
  },
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
    notes: 'Toyota Corolla with AC. Trunk space for luggage. Departure from Umerkot center.',
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
    notes: 'Motorway M1 express journey. Suzuki Cultus.',
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
    createdAt: '2026-10-26T15:00:00Z',
    updatedAt: '2026-10-26T15:00:00Z',
  },
];

export default function Home() {
  // Current logged in user
  const [currentUser, setCurrentUser] = useState<AppUser>(DEFAULT_PASSENGER);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authRoleChoice, setAuthRoleChoice] = useState<'PASSENGER' | 'DRIVER'>('PASSENGER');

  // Registration form fields
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regCarModel, setRegCarModel] = useState('Toyota Corolla (AC)');
  const [regCarPlate, setRegCarPlate] = useState('LEB-1234');
  const [regCarCapacity, setRegCarCapacity] = useState(4);
  const [regCarAc, setRegCarAc] = useState(true);

  // App Navigation: passenger, all_listings, or driver view
  const [activeTab, setActiveTab] = useState<'passenger' | 'all_listings' | 'driver'>('passenger');

  // "Where To?" Quick Prompt Popup for Passengers (Appears on open / after registration)
  const [showQuickRouteModal, setShowQuickRouteModal] = useState(true);

  // Main Rides & Bookings State
  const [rides, setRides] = useState<Ride[]>(INITIAL_RIDES);
  const [selectedRideId, setSelectedRideId] = useState<string>('ride-101');
  const [bookings, setBookings] = useState<BookingRequest[]>([]);
  const [isClientLoaded, setIsClientLoaded] = useState(false);

  // Passenger Search State
  const [searchOrigin, setSearchOrigin] = useState<string>('loc-uk');
  const [searchDest, setSearchDest] = useState<string>('loc-khi');

  // Passenger Booking Selection
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
  const [driverPostCapacity, setDriverPostCapacity] = useState<number>(4);
  const [driverPostCarModel, setDriverPostCarModel] = useState<string>('Toyota Corolla (AC)');
  const [driverPostTime, setDriverPostTime] = useState<string>('07:00 AM');
  const [driverPostNotes, setDriverPostNotes] = useState<string>('Clean AC vehicle. Trunk luggage space.');

  // Notification Toast
  const [notification, setNotification] = useState<{
    type: 'success' | 'error' | 'info';
    title: string;
    message: string;
  } | null>({
    type: 'info',
    title: 'ReturnRide Pakistan',
    message: 'Welcome! Search nationwide rides or switch to the Driver tab to publish your journey.',
  });

  // Load from localStorage
  useEffect(() => {
    try {
      const savedUser = localStorage.getItem('returnride_user');
      const savedRides = localStorage.getItem('returnride_rides');
      const savedBookings = localStorage.getItem('returnride_bookings');
      if (savedUser) setCurrentUser(JSON.parse(savedUser));
      if (savedRides) setRides(JSON.parse(savedRides));
      if (savedBookings) setBookings(JSON.parse(savedBookings));
    } catch {
      // Ignore
    }
    setIsClientLoaded(true);
  }, []);

  // Save to localStorage
  useEffect(() => {
    if (!isClientLoaded) return;
    try {
      localStorage.setItem('returnride_user', JSON.stringify(currentUser));
      localStorage.setItem('returnride_rides', JSON.stringify(rides));
      localStorage.setItem('returnride_bookings', JSON.stringify(bookings));
    } catch {
      // Ignore
    }
  }, [currentUser, rides, bookings, isClientLoaded]);

  // Handle User Registration / Login
  const handleAuthSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName.trim() || !regPhone.trim()) {
      alert('Please enter your Name and Mobile Number.');
      return;
    }

    const newUser: AppUser = {
      id: `usr-${Date.now().toString().slice(-4)}`,
      name: regName.trim(),
      phone: regPhone.trim(),
      role: authRoleChoice,
      vehicle:
        authRoleChoice === 'DRIVER'
          ? {
              makeModel: regCarModel,
              plate: regCarPlate,
              capacity: regCarCapacity,
              hasAc: regCarAc,
            }
          : undefined,
    };

    setCurrentUser(newUser);
    setShowAuthModal(false);

    if (authRoleChoice === 'PASSENGER') {
      setActiveTab('passenger');
      setShowQuickRouteModal(true); // Open "From & To" popup immediately
      setNotification({
        type: 'success',
        title: 'Welcome, ' + newUser.name + '!',
        message: 'Where do you want to travel today? Select your departure and arrival cities.',
      });
    } else {
      setActiveTab('driver');
      setDriverPostCarModel(newUser.vehicle?.makeModel || 'Toyota Corolla');
      setDriverPostCapacity(newUser.vehicle?.capacity || 4);
      setNotification({
        type: 'success',
        title: 'Driver Account Ready!',
        message: 'Welcome Captain ' + newUser.name + '. You can now publish rides and accept passengers.',
      });
    }
  };

  // Quick switch for demo testing
  const handleQuickSwitchRole = (role: 'PASSENGER' | 'DRIVER') => {
    if (role === 'PASSENGER') {
      setCurrentUser(DEFAULT_PASSENGER);
      setActiveTab('passenger');
      setShowQuickRouteModal(true);
    } else {
      setCurrentUser(DEFAULT_DRIVER);
      setActiveTab('driver');
      setDriverPostCarModel(DEFAULT_DRIVER.vehicle?.makeModel || 'Toyota Corolla (AC)');
      setDriverPostCapacity(DEFAULT_DRIVER.vehicle?.capacity || 4);
    }
  };

  // Passenger Quick "From & To" Popup Handler
  const handleQuickRouteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowQuickRouteModal(false);

    // Auto-select the first matching ride if available
    const match = rides.find(
      (r) => r.originLocationId === searchOrigin && r.destinationLocationId === searchDest
    );
    if (match) {
      setSelectedRideId(match.id);
    }

    setNotification({
      type: 'info',
      title: 'Routes Found',
      message: `Showing rides from ${
        NATIONWIDE_CITIES.find((c) => c.id === searchOrigin)?.name
      } to ${NATIONWIDE_CITIES.find((c) => c.id === searchDest)?.name}.`,
    });
  };

  // Current active ride for booking
  const currentRide = rides.find((r) => r.id === selectedRideId) || rides[0];
  const rideBookings = bookings.filter((b) => b.rideId === currentRide.id);
  const availableSeats = calculateAvailableSeats(currentRide, rideBookings);

  // Passenger matching rides
  const matchingRides = rides.filter(
    (r) => r.originLocationId === searchOrigin && r.destinationLocationId === searchDest
  );

  const originName = NATIONWIDE_CITIES.find((c) => c.id === searchOrigin)?.name || 'Origin';
  const destName = NATIONWIDE_CITIES.find((c) => c.id === searchDest)?.name || 'Destination';

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
      return true;
    });
  }, [rides, filterOrigin, filterDest, filterTime, filterMode]);

  // Current calculated price for booking
  const currentPrice =
    bookingType === 'WHOLE_CAR'
      ? currentRide.wholeCarPrice
      : (currentRide.seatPrice || 0) * seatsRequested;

  // Passenger submits booking request
  const handleCreateRequest = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const seatsToBook = bookingType === 'WHOLE_CAR' ? 1 : seatsRequested;
      const price = bookingType === 'WHOLE_CAR' ? currentRide.wholeCarPrice : (currentRide.seatPrice || 0) * seatsToBook;

      const newRequest = createBookingRequest({
        id: `req-${Date.now().toString().slice(-4)}`,
        ride: currentRide,
        passengerId: `${currentUser.name} (${currentUser.phone})`,
        bookingType,
        requestedSeats: seatsToBook,
        totalPrice: price,
        confirmedBookings: rideBookings,
      });

      setBookings((prev) => [newRequest, ...prev]);
      setNotification({
        type: 'success',
        title: 'Booking Request Sent!',
        message: `Your request for ${bookingType === 'WHOLE_CAR' ? 'the Entire Car' : `${seatsToBook} seat(s)`} was sent. Driver will review and confirm.`,
      });
    } catch (err: unknown) {
      if (err instanceof BookingEngineError) {
        setNotification({ type: 'error', title: 'Cannot Submit Request', message: err.message });
      } else {
        setNotification({ type: 'error', title: 'Error', message: 'Could not submit request.' });
      }
    }
  };

  // Driver accepts booking
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
        message: `Accepted request for ${request.passengerId}. ${
          conflictCount > 0 ? `${conflictCount} conflicting requests were automatically rejected.` : ''
        }`,
      });
    } catch (err: unknown) {
      if (err instanceof BookingEngineError) {
        setNotification({ type: 'error', title: 'Error', message: err.message });
      }
    }
  };

  // Driver rejects booking
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

  // Driver cancels booking
  const handleCancelBooking = (booking: BookingRequest) => {
    try {
      const targetRide = rides.find((r) => r.id === booking.rideId);
      if (!targetRide) return;

      const result = cancelConfirmedBooking({
        ride: targetRide,
        booking,
        cancelledBy: 'DRIVER',
        reason: 'Passenger requested cancellation',
      });

      setRides((prev) => prev.map((r) => (r.id === result.updatedRide.id ? result.updatedRide : r)));
      setBookings((prev) => prev.map((b) => (b.id === booking.id ? result.updatedBooking : b)));
      setNotification({
        type: 'info',
        title: 'Booking Cancelled',
        message: 'The booking was cancelled and its seats have been released back.',
      });
    } catch (err: unknown) {
      if (err instanceof BookingEngineError) {
        setNotification({ type: 'error', title: 'Error', message: err.message });
      }
    }
  };

  // Driver publishes new ride
  const handlePublishDriverRide = (e: React.FormEvent) => {
    e.preventDefault();
    const newRide: Ride = {
      id: `ride-${Date.now().toString().slice(-4)}`,
      driverId: currentUser.id,
      vehicleId: `veh-${Date.now().toString().slice(-4)}`,
      originLocationId: driverPostOrigin,
      destinationLocationId: driverPostDest,
      departureTime: '2026-11-03T08:00:00Z',
      bookingMode: driverPostMode,
      capacity: Number(driverPostCapacity),
      bookedSeatsCount: 0,
      wholeCarPrice: Number(driverPostCarPrice),
      seatPrice: driverPostMode === 'WHOLE_CAR' ? undefined : Number(driverPostSeatPrice),
      status: 'PUBLISHED',
      autoReopenOnCancellation: true,
      notes: `${driverPostCarModel} • Departs ${driverPostTime}. ${driverPostNotes}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setRides((prev) => [newRide, ...prev]);
    setSelectedRideId(newRide.id);
    setSearchOrigin(driverPostOrigin);
    setSearchDest(driverPostDest);
    setNotification({
      type: 'success',
      title: 'Journey Published!',
      message: `Your ride from ${
        NATIONWIDE_CITIES.find((c) => c.id === driverPostOrigin)?.name
      } to ${NATIONWIDE_CITIES.find((c) => c.id === driverPostDest)?.name} is now live for passengers!`,
    });
  };

  // Helper driver display name
  const getDriverDisplayName = (driverId: string) => {
    if (driverId === currentUser.id && currentUser.role === 'DRIVER') return currentUser.name + ' (You)';
    switch (driverId) {
      case 'driver-tariq':
        return 'Tariq Khan';
      case 'driver-aslam':
        return 'Aslam Memon';
      case 'driver-kamran':
        return 'Kamran Butt';
      case 'driver-farhan':
        return 'Farhan Shinwari';
      case 'driver-bilal':
        return 'Bilal Shah';
      case 'driver-jameel':
        return 'Jameel Soomro';
      default:
        return 'Verified Driver';
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 font-sans antialiased pb-24">
      {/* ========================================================================= */}
      {/* APP HEADER & ROLE BAR */}
      {/* ========================================================================= */}
      <header className="bg-emerald-800 text-white shadow-md sticky top-0 z-30">
        <div className="max-w-xl mx-auto px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl" role="img" aria-label="car">🚗</span>
            <div>
              <h1 className="text-xl font-black tracking-tight leading-none">ReturnRide</h1>
              <p className="text-[11px] text-emerald-200 font-medium">Pakistan Intercity Ride Marketplace</p>
            </div>
          </div>

          {/* User Account / Role Badge */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAuthModal(true)}
              className="text-xs bg-emerald-950/60 hover:bg-emerald-950 text-emerald-100 hover:text-white px-2.5 py-1.5 rounded-xl border border-emerald-600/50 transition font-bold flex items-center gap-1.5"
            >
              <span>{currentUser.role === 'DRIVER' ? '🚘 Driver' : '🙋‍♂️ User'}</span>
              <span className="max-w-[70px] truncate sm:max-w-none">{currentUser.name}</span>
              <span className="text-[10px] text-emerald-300">▼</span>
            </button>
          </div>
        </div>

        {/* 3 Main Navigation Tabs */}
        <div className="max-w-xl mx-auto px-4 grid grid-cols-3 gap-1.5 pb-2">
          {/* Passenger View Tab */}
          <button
            onClick={() => setActiveTab('passenger')}
            className={`py-2 px-1 rounded-xl font-bold text-xs flex flex-col sm:flex-row items-center justify-center gap-1 transition shadow-sm ${
              activeTab === 'passenger'
                ? 'bg-white text-emerald-900 shadow-md ring-2 ring-emerald-400 font-black'
                : 'bg-emerald-900/60 text-emerald-100 hover:bg-emerald-900'
            }`}
          >
            <span>🙋‍♂️</span>
            <span>Book a Ride</span>
          </button>

          {/* Shared All Listings Tab */}
          <button
            onClick={() => setActiveTab('all_listings')}
            className={`py-2 px-1 rounded-xl font-bold text-xs flex flex-col sm:flex-row items-center justify-center gap-1 transition shadow-sm ${
              activeTab === 'all_listings'
                ? 'bg-white text-emerald-900 shadow-md ring-2 ring-emerald-400 font-black'
                : 'bg-emerald-900/60 text-emerald-100 hover:bg-emerald-900'
            }`}
          >
            <span>📋</span>
            <span>All Listings ({rides.length})</span>
          </button>

          {/* Driver View Tab */}
          <button
            onClick={() => setActiveTab('driver')}
            className={`py-2 px-1 rounded-xl font-bold text-xs flex flex-col sm:flex-row items-center justify-center gap-1 transition shadow-sm ${
              activeTab === 'driver'
                ? 'bg-white text-emerald-900 shadow-md ring-2 ring-emerald-400 font-black'
                : 'bg-emerald-900/60 text-emerald-100 hover:bg-emerald-900'
            }`}
          >
            <span>🚘</span>
            <span>Driver Portal ({bookings.filter((b) => b.status === 'PENDING').length})</span>
          </button>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* MAIN CONTAINER */}
      {/* ========================================================================= */}
      <main className="max-w-xl mx-auto px-4 pt-3.5 space-y-4">
        {/* Notification Banner */}
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

        {/* ========================================================================= */}
        {/* VIEW 1: PASSENGER / USER SEARCH & BOOKING */}
        {/* ========================================================================= */}
        {activeTab === 'passenger' && (
          <div className="space-y-4">
            {/* Quick Route Selector Bar */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Your Selected Route
                </span>
                <button
                  onClick={() => setShowQuickRouteModal(true)}
                  className="text-xs text-emerald-700 font-extrabold hover:underline flex items-center gap-1"
                >
                  <span>✏️</span>
                  <span>Change From / To</span>
                </button>
              </div>

              {/* Visual Route Indicator */}
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

              <div className="mt-2 text-right">
                <span className="text-[11px] text-slate-500">
                  {matchingRides.length} ride(s) available for this route
                </span>
              </div>
            </div>

            {/* Ride Card (Matching route) */}
            {matchingRides.length > 0 ? (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                {/* Header: Driver Info & Status */}
                <div className="p-4 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-emerald-100 border border-emerald-300 flex items-center justify-center text-xl font-bold text-emerald-800">
                      👨‍✈️
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-extrabold text-slate-900 text-base">
                          {getDriverDisplayName(currentRide.driverId)}
                        </span>
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold">
                          VERIFIED
                        </span>
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
                    {currentRide.status === 'CANCELLED' && (
                      <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-rose-100 text-rose-800">
                        Ride Cancelled
                      </span>
                    )}
                  </div>
                </div>

                {/* Capacity Counter */}
                <div className="px-4 py-2 bg-slate-50 flex items-center justify-between border-b border-slate-100 text-xs">
                  <span className="text-slate-600 font-medium">Free Capacity:</span>
                  <span
                    className={`font-black text-sm ${
                      availableSeats > 0 ? 'text-emerald-700' : 'text-rose-600'
                    }`}
                  >
                    {availableSeats} of {currentRide.capacity} seats free
                  </span>
                </div>

                {/* Booking Form */}
                {currentRide.status === 'PUBLISHED' ? (
                  <form onSubmit={handleCreateRequest} className="p-4 space-y-4">
                    <div>
                      <span className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                        Select How You Want to Travel
                      </span>

                      <div className="grid grid-cols-1 gap-2.5">
                        {/* Whole Car Option */}
                        {currentRide.bookingMode !== 'SEATS' && (
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
                                  Private vehicle for you and your family.
                                </p>
                              </div>
                            </div>

                            <div className="text-right">
                              <span className="block text-sm font-black text-emerald-800">
                                Rs. {currentRide.wholeCarPrice.toLocaleString()}
                              </span>
                              <span className="text-[10px] text-slate-500 font-semibold">Total Price</span>
                            </div>
                          </label>
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
                                Rs. {currentRide.seatPrice?.toLocaleString()}
                              </span>
                              <span className="text-[10px] text-slate-500 font-semibold">Per Seat</span>
                            </div>
                          </label>
                        )}
                      </div>

                      {/* Seat Stepper */}
                      {bookingType === 'SEAT' && (
                        <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-700">How many seats do you need?</span>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => setSeatsRequested((s) => Math.max(1, s - 1))}
                              className="w-9 h-9 rounded-xl bg-white border border-slate-300 font-black text-lg text-slate-700 hover:bg-slate-100 flex items-center justify-center shadow-xs"
                            >
                              -
                            </button>
                            <span className="font-black text-lg w-5 text-center text-slate-900">
                              {seatsRequested}
                            </span>
                            <button
                              type="button"
                              onClick={() => setSeatsRequested((s) => Math.min(availableSeats, s + 1))}
                              className="w-9 h-9 rounded-xl bg-white border border-slate-300 font-black text-lg text-slate-700 hover:bg-slate-100 flex items-center justify-center shadow-xs"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Passenger Profile Indicator */}
                    <div className="border-t border-slate-100 pt-3 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500 font-medium">Booking As:</span>
                        <span className="font-bold text-slate-800">
                          {currentUser.name} ({currentUser.phone})
                        </span>
                      </div>

                      {/* Cash Guarantee */}
                      <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 flex items-center gap-2.5 text-amber-900">
                        <span className="text-lg">💵</span>
                        <p className="text-[11px] leading-tight">
                          <strong>Pay Cash When Boarding:</strong> No online card needed.
                          Pay Rs. {currentPrice.toLocaleString()} directly to the driver.
                        </p>
                      </div>

                      {/* Submit Button */}
                      <button
                        type="submit"
                        disabled={availableSeats <= 0}
                        className="w-full bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 text-white font-black py-4 px-4 rounded-2xl shadow-md transition text-sm flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                      >
                        <span>Send Booking Request (Rs. {currentPrice.toLocaleString()})</span>
                        <span>➔</span>
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="p-6 text-center text-slate-500 bg-slate-50">
                    <p className="text-sm font-bold text-slate-700">This ride is currently unavailable</p>
                    <p className="text-xs text-slate-400 mt-1">{currentRide.status}</p>
                  </div>
                )}
              </div>
            ) : (
              /* No matching rides for selected route */
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 text-center space-y-3">
                <span className="text-3xl block">🔍</span>
                <h3 className="text-sm font-extrabold text-slate-900">
                  No direct ride found between {originName} and {destName}
                </h3>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  Try browsing all nationwide listings, or change your search cities.
                </p>
                <div className="flex justify-center gap-2">
                  <button
                    onClick={() => setShowQuickRouteModal(true)}
                    className="bg-emerald-700 text-white font-bold text-xs py-2 px-4 rounded-xl transition"
                  >
                    Change Route
                  </button>
                  <button
                    onClick={() => setActiveTab('all_listings')}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs py-2 px-4 rounded-xl transition"
                  >
                    Browse All Listings
                  </button>
                </div>
              </div>
            )}

            {/* Passenger Active Bookings */}
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
                        <span className="text-xs font-black text-slate-900">
                          {b.bookingType === 'WHOLE_CAR' ? '🚗 Full Car Booking' : `💺 ${b.requestedSeats} Seat(s)`}
                        </span>

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

                      {/* Direct Call & WhatsApp when accepted */}
                      {b.status === 'ACCEPTED' && (
                        <div className="mt-2.5 pt-2 border-t border-emerald-200 flex flex-wrap gap-2">
                          <a
                            href="tel:03009876543"
                            className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs py-2 px-3 rounded-lg text-center flex items-center justify-center gap-1.5 transition"
                          >
                            <span>📞</span>
                            <span>Call Driver</span>
                          </a>
                          <a
                            href="https://wa.me/923009876543"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-bold text-xs py-2 px-3 rounded-lg text-center flex items-center justify-center gap-1 transition"
                          >
                            <span>💬</span>
                            <span>WhatsApp</span>
                          </a>
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
        {/* VIEW 2: ALL RIDE LISTINGS (SHARED FOR BOTH DRIVER & USER) */}
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
                  }}
                  className="text-[11px] text-emerald-700 font-bold hover:underline"
                >
                  Clear Filters
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

                    <div className="flex items-center justify-between text-xs text-slate-500 border-y border-slate-100 py-2">
                      <div>
                        <span className="font-bold text-slate-700">{getDriverDisplayName(rideItem.driverId)}</span>
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
                        className="bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs py-2 px-3.5 rounded-xl transition shadow-xs flex items-center gap-1"
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
        {/* VIEW 3: DRIVER PORTAL & PUBLISH RIDE */}
        {/* ========================================================================= */}
        {activeTab === 'driver' && (
          <div className="space-y-4">
            {/* Driver Profile Header */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Captain / Driver Account
                  </span>
                  <h2 className="text-base font-black text-slate-900">{currentUser.name}</h2>
                  <p className="text-xs text-slate-500 font-medium">
                    {currentUser.vehicle?.makeModel || 'Toyota Corolla (AC)'} • Plate:{' '}
                    {currentUser.vehicle?.plate || 'LEB-4592'}
                  </p>
                </div>
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="text-xs text-emerald-700 font-bold hover:underline"
                >
                  Edit Profile
                </button>
              </div>
            </div>

            {/* Publish Ride Form */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 space-y-3">
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                <span>➕</span>
                <span>List a New Ride for Passengers</span>
              </h3>

              <form onSubmit={handlePublishDriverRide} className="space-y-3 pt-1">
                {/* From & To */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Departure City (From)</label>
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
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Arrival City (To)</label>
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

                {/* Car Details & Capacity */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Vehicle Model & AC</label>
                    <input
                      type="text"
                      value={driverPostCarModel}
                      onChange={(e) => setDriverPostCarModel(e.target.value)}
                      placeholder="e.g. Toyota Corolla (AC)"
                      required
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Passenger Seats</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={driverPostCapacity}
                      onChange={(e) => setDriverPostCapacity(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-semibold"
                    />
                  </div>
                </div>

                {/* Booking Mode Choice */}
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

                {/* Submit Ride */}
                <button
                  type="submit"
                  className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs py-3.5 rounded-xl shadow-xs transition cursor-pointer"
                >
                  Publish Ride Online (Passengers Can Book)
                </button>
              </form>
            </div>

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
                              {req.bookingType === 'WHOLE_CAR' ? 'Entire Car' : `${req.requestedSeats} Seat(s)`}
                            </strong>{' '}
                            • <strong className="text-emerald-800">Rs. {req.totalPrice.toLocaleString()}</strong>
                          </p>
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

                      {/* Cash to collect & Cancel option */}
                      {req.status === 'ACCEPTED' && (
                        <div className="mt-3 pt-2 border-t border-emerald-200 flex items-center justify-between">
                          <span className="text-[11px] font-bold text-emerald-800">
                            Cash to collect: Rs. {req.totalPrice.toLocaleString()}
                          </span>
                          <button
                            onClick={() => handleCancelBooking(req)}
                            className="text-[11px] font-bold text-rose-700 hover:text-rose-900 hover:underline"
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
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL 1: PASSENGER "WHERE TO?" POPUP (ONLY FROM & TO) */}
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
                  className="text-slate-400 hover:text-slate-700 font-bold text-lg p-1"
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
                      }}
                      className="text-[11px] bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 text-slate-700 px-2 py-1 rounded-lg font-bold transition"
                    >
                      Umerkot ➔ Karachi
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchOrigin('loc-khi');
                        setSearchDest('loc-hyd');
                      }}
                      className="text-[11px] bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 text-slate-700 px-2 py-1 rounded-lg font-bold transition"
                    >
                      Karachi ➔ Hyderabad
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchOrigin('loc-lhr');
                        setSearchDest('loc-isb');
                      }}
                      className="text-[11px] bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 text-slate-700 px-2 py-1 rounded-lg font-bold transition"
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
        {/* MODAL 2: USER REGISTRATION & LOGIN (DRIVER VS PASSENGER) */}
        {/* ========================================================================= */}
        {showAuthModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div>
                  <h3 className="text-base font-black text-slate-900">User Account & Role</h3>
                  <p className="text-xs text-slate-400">Register or switch between Driver and User</p>
                </div>
                <button
                  onClick={() => setShowAuthModal(false)}
                  className="text-slate-400 hover:text-slate-700 font-bold text-lg"
                >
                  ✕
                </button>
              </div>

              {/* Role Toggle Switch */}
              <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-2xl">
                <button
                  type="button"
                  onClick={() => setAuthRoleChoice('PASSENGER')}
                  className={`py-2 text-xs font-extrabold rounded-xl transition ${
                    authRoleChoice === 'PASSENGER'
                      ? 'bg-white text-emerald-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  🙋‍♂️ I am a Passenger
                </button>
                <button
                  type="button"
                  onClick={() => setAuthRoleChoice('DRIVER')}
                  className={`py-2 text-xs font-extrabold rounded-xl transition ${
                    authRoleChoice === 'DRIVER'
                      ? 'bg-white text-emerald-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  🚘 I am a Driver
                </button>
              </div>

              {/* Registration Form */}
              <form onSubmit={handleAuthSubmit} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder={authRoleChoice === 'DRIVER' ? 'e.g. Tariq Khan' : 'e.g. Muhammad Ali'}
                    required
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Mobile Number (Pakistan 03xx)
                  </label>
                  <input
                    type="tel"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    placeholder="0300-1234567"
                    required
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold"
                  />
                </div>

                {/* Additional Driver Vehicle Fields */}
                {authRoleChoice === 'DRIVER' && (
                  <div className="space-y-2 border-t border-slate-100 pt-2">
                    <span className="block text-[10px] font-extrabold text-slate-400 uppercase">
                      Vehicle Information
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">Car Model</label>
                        <input
                          type="text"
                          value={regCarModel}
                          onChange={(e) => setRegCarModel(e.target.value)}
                          placeholder="e.g. Corolla (AC)"
                          required
                          className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-semibold"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">Total Seats</label>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={regCarCapacity}
                          onChange={(e) => setRegCarCapacity(Number(e.target.value))}
                          required
                          className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-semibold"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs py-3 rounded-xl transition shadow-xs mt-2 cursor-pointer"
                >
                  Save & Continue as {authRoleChoice === 'DRIVER' ? 'Driver' : 'Passenger'}
                </button>
              </form>

              {/* Quick 1-tap demo switchers */}
              <div className="pt-2 border-t border-slate-100">
                <span className="block text-[10px] text-slate-400 font-bold uppercase mb-1.5 text-center">
                  Or Test with Demo Accounts:
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      handleQuickSwitchRole('PASSENGER');
                      setShowAuthModal(false);
                    }}
                    className="text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-700 p-2 rounded-xl font-bold transition text-center"
                  >
                    Demo Passenger
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleQuickSwitchRole('DRIVER');
                      setShowAuthModal(false);
                    }}
                    className="text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-700 p-2 rounded-xl font-bold transition text-center"
                  >
                    Demo Driver
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
