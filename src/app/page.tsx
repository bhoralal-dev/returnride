'use client';

import React, { useState, useEffect } from 'react';
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
    notes: 'Air-conditioned Toyota Corolla. Trunk space for luggage. Non-smoking ride.',
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
    notes: 'Honda City with AC. Clean interior. Departure from Toll Plaza.',
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
    notes: 'Motorway M2 direct travel. Toyota Yaris with chilled AC.',
    createdAt: '2026-10-26T12:00:00Z',
    updatedAt: '2026-10-26T12:00:00Z',
  },
  {
    id: 'ride-104',
    driverId: 'driver-farhan',
    vehicleId: 'veh-cultus',
    originLocationId: 'loc-pes',
    destinationLocationId: 'loc-isb',
    departureTime: '2026-11-02T10:00:00Z',
    bookingMode: 'SEATS',
    capacity: 3,
    bookedSeatsCount: 0,
    wholeCarPrice: 7500,
    seatPrice: 2500,
    status: 'PUBLISHED',
    autoReopenOnCancellation: true,
    notes: 'Motorway M1 journey. Quick travel, spacious seating.',
    createdAt: '2026-10-26T13:00:00Z',
    updatedAt: '2026-10-26T13:00:00Z',
  },
];

export default function Home() {
  // Navigation: passenger vs driver mode
  const [activeTab, setActiveTab] = useState<'passenger' | 'driver'>('passenger');

  // Rides & Bookings State
  const [rides, setRides] = useState<Ride[]>(INITIAL_RIDES);
  const [selectedRideId, setSelectedRideId] = useState<string>('ride-101');
  const [bookings, setBookings] = useState<BookingRequest[]>([]);
  const [isClientLoaded, setIsClientLoaded] = useState(false);

  // Search & Filter State
  const [originId, setOriginId] = useState<string>('loc-uk');
  const [destId, setDestId] = useState<string>('loc-khi');

  // Passenger booking form
  const [passengerName, setPassengerName] = useState('Muhammad Ali');
  const [passengerPhone, setPassengerPhone] = useState('0301-2345678');
  const [bookingType, setBookingType] = useState<BookingType>('WHOLE_CAR');
  const [seatsRequested, setSeatsRequested] = useState(1);

  // Driver quick-post form state
  const [showDriverPostModal, setShowDriverPostModal] = useState(false);
  const [newPostOrigin, setNewPostOrigin] = useState('loc-khi');
  const [newPostDest, setNewPostDest] = useState('loc-hyd');
  const [newPostCarPrice, setNewPostCarPrice] = useState(6000);
  const [newPostSeatPrice, setNewPostSeatPrice] = useState(1500);

  // Status notification
  const [banner, setBanner] = useState<{
    type: 'success' | 'error' | 'info';
    title: string;
    description: string;
  } | null>({
    type: 'info',
    title: 'ReturnRide Pakistan (Mobile-First Prototype)',
    description: 'Book full car or single seats with cash on boarding. Switch between Passenger and Driver views to test.',
  });

  // Load from localStorage on client mount
  useEffect(() => {
    try {
      const savedRides = localStorage.getItem('returnride_rides');
      const savedBookings = localStorage.getItem('returnride_bookings');
      if (savedRides) {
        setRides(JSON.parse(savedRides));
      }
      if (savedBookings) {
        setBookings(JSON.parse(savedBookings));
      }
    } catch {
      // Ignore localStorage read failures
    }
    setIsClientLoaded(true);
  }, []);

  // Save to localStorage when state changes
  useEffect(() => {
    if (!isClientLoaded) return;
    try {
      localStorage.setItem('returnride_rides', JSON.stringify(rides));
      localStorage.setItem('returnride_bookings', JSON.stringify(bookings));
    } catch {
      // Ignore localStorage write failures
    }
  }, [rides, bookings, isClientLoaded]);

  // Current active ride
  const currentRide = rides.find((r) => r.id === selectedRideId) || rides[0];
  const rideBookings = bookings.filter((b) => b.rideId === currentRide.id);
  const availableSeats = calculateAvailableSeats(currentRide, rideBookings);

  // Matching rides for the selected search route
  const matchingRides = rides.filter(
    (r) => r.originLocationId === originId && r.destinationLocationId === destId
  );

  const originCity = NATIONWIDE_CITIES.find((c) => c.id === originId)?.name || 'Origin';
  const destCity = NATIONWIDE_CITIES.find((c) => c.id === destId)?.name || 'Destination';

  // Calculate price
  const currentPrice =
    bookingType === 'WHOLE_CAR'
      ? currentRide.wholeCarPrice
      : (currentRide.seatPrice || 0) * seatsRequested;

  // Passenger creates a request
  const handleCreateRequest = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const seatsToBook = bookingType === 'WHOLE_CAR' ? 1 : seatsRequested;
      const price = bookingType === 'WHOLE_CAR' ? currentRide.wholeCarPrice : (currentRide.seatPrice || 0) * seatsToBook;

      const newRequest = createBookingRequest({
        id: `req-${Date.now().toString().slice(-4)}`,
        ride: currentRide,
        passengerId: `${passengerName} (${passengerPhone})`,
        bookingType,
        requestedSeats: seatsToBook,
        totalPrice: price,
        confirmedBookings: rideBookings,
      });

      setBookings((prev) => [newRequest, ...prev]);
      setBanner({
        type: 'success',
        title: 'Request Sent to Driver!',
        description: `Your request for ${bookingType === 'WHOLE_CAR' ? 'the Full Car' : `${seatsToBook} seat(s)`} has been sent. Driver will review and accept it.`,
      });
    } catch (err: unknown) {
      if (err instanceof BookingEngineError) {
        setBanner({ type: 'error', title: 'Cannot Submit Request', description: err.message });
      } else {
        setBanner({ type: 'error', title: 'Error', description: 'Could not submit booking request.' });
      }
    }
  };

  // Driver accepts a booking request
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

      // Update ride in rides array
      setRides((prev) => prev.map((r) => (r.id === result.updatedRide.id ? result.updatedRide : r)));

      // Update bookings
      setBookings((prev) =>
        prev.map((b) => {
          if (b.id === result.acceptedRequest.id) return result.acceptedRequest;
          const autoRejected = result.autoRejectedRequests.find((r) => r.id === b.id);
          if (autoRejected) return autoRejected;
          return b;
        })
      );

      const conflictCount = result.autoRejectedRequests.length;
      setBanner({
        type: 'success',
        title: 'Booking Confirmed!',
        description: `Request accepted for ${request.passengerId}. ${
          conflictCount > 0 ? `${conflictCount} conflicting requests were automatically rejected.` : ''
        }`,
      });
    } catch (err: unknown) {
      if (err instanceof BookingEngineError) {
        setBanner({ type: 'error', title: 'Acceptance Failed', description: err.message });
      }
    }
  };

  // Driver rejects a booking request
  const handleRejectRequest = (request: BookingRequest) => {
    try {
      const rejected = rejectBookingRequest(request, 'Driver is unavailable or seats filled.');
      setBookings((prev) => prev.map((b) => (b.id === request.id ? rejected : b)));
      setBanner({
        type: 'info',
        title: 'Request Declined',
        description: `Request from ${request.passengerId} was declined.`,
      });
    } catch (err: unknown) {
      if (err instanceof BookingEngineError) {
        setBanner({ type: 'error', title: 'Error', description: err.message });
      }
    }
  };

  // Driver or passenger cancels a confirmed booking
  const handleCancelBooking = (booking: BookingRequest) => {
    try {
      const targetRide = rides.find((r) => r.id === booking.rideId);
      if (!targetRide) return;

      const result = cancelConfirmedBooking({
        ride: targetRide,
        booking,
        cancelledBy: 'DRIVER',
        reason: 'Passenger requested cancellation over phone call',
      });

      setRides((prev) => prev.map((r) => (r.id === result.updatedRide.id ? result.updatedRide : r)));
      setBookings((prev) => prev.map((b) => (b.id === booking.id ? result.updatedBooking : b)));
      setBanner({
        type: 'info',
        title: 'Booking Cancelled',
        description: 'The booking was cancelled and its seats have been safely released.',
      });
    } catch (err: unknown) {
      if (err instanceof BookingEngineError) {
        setBanner({ type: 'error', title: 'Cancellation Error', description: err.message });
      }
    }
  };

  // Driver cancels entire ride
  const handleCancelRide = (rideToCancel: Ride) => {
    if (!confirm('Are you sure you want to cancel this entire ride? All passengers will be notified.')) {
      return;
    }
    try {
      const rideBookingsList = bookings.filter((b) => b.rideId === rideToCancel.id);
      const result = cancelRide({
        ride: rideToCancel,
        driverId: rideToCancel.driverId,
        reason: 'Emergency or mechanical vehicle issue',
        confirmedBookings: rideBookingsList,
        pendingRequests: rideBookingsList,
      });

      setRides((prev) => prev.map((r) => (r.id === result.updatedRide.id ? result.updatedRide : r)));
      setBookings((prev) =>
        prev.map((b) => {
          const cancelled = result.cancelledBookings.find((c) => c.id === b.id);
          if (cancelled) return cancelled;
          const rejected = result.rejectedPendingRequests.find((r) => r.id === b.id);
          if (rejected) return rejected;
          return b;
        })
      );

      setBanner({
        type: 'error',
        title: 'Ride Cancelled',
        description: 'The ride was cancelled. All confirmed bookings and requests have been safely closed.',
      });
    } catch (err: unknown) {
      if (err instanceof BookingEngineError) {
        setBanner({ type: 'error', title: 'Error', description: err.message });
      }
    }
  };

  // Driver switches booking mode
  const handleModeSwitch = (newMode: RideBookingMode) => {
    try {
      const result = switchRideBookingMode({
        ride: currentRide,
        newMode,
        confirmedBookings: rideBookings,
        pendingRequests: rideBookings,
      });

      setRides((prev) => prev.map((r) => (r.id === result.updatedRide.id ? result.updatedRide : r)));
      setBookings((prev) =>
        prev.map((b) => {
          const autoRej = result.autoRejectedRequests.find((r) => r.id === b.id);
          return autoRej || b;
        })
      );

      setBanner({
        type: 'success',
        title: 'Booking Preference Updated',
        description: `Ride mode set to: ${
          newMode === 'WHOLE_CAR'
            ? 'Full Car Only'
            : newMode === 'SEATS'
            ? 'Single Seats Only'
            : 'Both Full Car & Seats'
        }.`,
      });
    } catch (err: unknown) {
      if (err instanceof BookingEngineError) {
        setBanner({ type: 'error', title: 'Cannot Change Mode', description: err.message });
      }
    }
  };

  // Reset demo state
  const handleReset = () => {
    try {
      localStorage.removeItem('returnride_rides');
      localStorage.removeItem('returnride_bookings');
    } catch {
      // Ignore
    }
    setRides(INITIAL_RIDES);
    setSelectedRideId('ride-101');
    setBookings([]);
    setOriginId('loc-uk');
    setDestId('loc-khi');
    setBanner({
      type: 'info',
      title: 'Demo Reset',
      description: 'Reset demo data back to nationwide defaults.',
    });
  };

  // Driver publishes a new custom ride route
  const handlePublishNewRide = (e: React.FormEvent) => {
    e.preventDefault();
    const newRide: Ride = {
      id: `ride-${Date.now().toString().slice(-4)}`,
      driverId: 'driver-tariq',
      vehicleId: 'veh-corolla',
      originLocationId: newPostOrigin,
      destinationLocationId: newPostDest,
      departureTime: '2026-11-03T08:00:00Z',
      bookingMode: 'WHOLE_CAR_OR_SEATS',
      capacity: 4,
      bookedSeatsCount: 0,
      wholeCarPrice: Number(newPostCarPrice),
      seatPrice: Number(newPostSeatPrice),
      status: 'PUBLISHED',
      autoReopenOnCancellation: true,
      notes: 'Clean car with AC. Trunk space available for standard luggage.',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setRides((prev) => [newRide, ...prev]);
    setSelectedRideId(newRide.id);
    setOriginId(newPostOrigin);
    setDestId(newPostDest);
    setShowDriverPostModal(false);
    setBanner({
      type: 'success',
      title: 'New Journey Published!',
      description: `Ride created from ${
        NATIONWIDE_CITIES.find((c) => c.id === newPostOrigin)?.name
      } to ${NATIONWIDE_CITIES.find((c) => c.id === newPostDest)?.name}.`,
    });
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 font-sans antialiased pb-20">
      {/* ========================================================================= */}
      {/* TOP HEADER */}
      {/* ========================================================================= */}
      <header className="bg-emerald-800 text-white shadow-md sticky top-0 z-30">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl" role="img" aria-label="car">🚗</span>
            <div>
              <h1 className="text-xl font-black tracking-tight leading-none">ReturnRide</h1>
              <p className="text-[11px] text-emerald-200 font-medium">Pakistan Intercity Ride Marketplace</p>
            </div>
          </div>

          <button
            onClick={handleReset}
            className="text-xs bg-emerald-950/60 hover:bg-emerald-950 text-emerald-200 hover:text-white px-3 py-1.5 rounded-lg border border-emerald-600/50 transition font-medium"
          >
            Reset Demo
          </button>
        </div>

        {/* Big Touch Tabs */}
        <div className="max-w-xl mx-auto px-4 grid grid-cols-2 gap-2 pb-2">
          <button
            onClick={() => setActiveTab('passenger')}
            className={`py-2.5 px-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition shadow-sm ${
              activeTab === 'passenger'
                ? 'bg-white text-emerald-900 shadow-md ring-2 ring-emerald-400'
                : 'bg-emerald-900/60 text-emerald-100 hover:bg-emerald-900'
            }`}
          >
            <span>🙋‍♂️</span>
            <span>I Need a Ride</span>
          </button>

          <button
            onClick={() => setActiveTab('driver')}
            className={`py-2.5 px-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition shadow-sm ${
              activeTab === 'driver'
                ? 'bg-white text-emerald-900 shadow-md ring-2 ring-emerald-400'
                : 'bg-emerald-900/60 text-emerald-100 hover:bg-emerald-900'
            }`}
          >
            <span>🚘</span>
            <span>Driver View ({bookings.filter((b) => b.status === 'PENDING').length})</span>
          </button>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* MAIN CONTENT AREA */}
      {/* ========================================================================= */}
      <main className="max-w-xl mx-auto px-4 pt-4 space-y-4">
        {/* Simple Notification Alert */}
        {banner && (
          <div
            className={`p-3.5 rounded-2xl border flex items-start justify-between shadow-sm transition ${
              banner.type === 'success'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : banner.type === 'error'
                ? 'bg-rose-50 border-rose-300 text-rose-900'
                : 'bg-blue-50 border-blue-300 text-blue-900'
            }`}
          >
            <div className="flex gap-2">
              <span className="text-lg">
                {banner.type === 'success' ? '✅' : banner.type === 'error' ? '⚠️' : 'ℹ️'}
              </span>
              <div>
                <h4 className="text-sm font-bold">{banner.title}</h4>
                <p className="text-xs mt-0.5 opacity-90">{banner.description}</p>
              </div>
            </div>
            <button
              onClick={() => setBanner(null)}
              className="text-slate-400 hover:text-slate-700 text-sm font-bold px-1.5"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        )}

        {/* ========================================================================= */}
        {/* PASSENGER VIEW */}
        {/* ========================================================================= */}
        {activeTab === 'passenger' && (
          <div className="space-y-4">
            {/* Step 1: Route Search */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Step 1: Where do you want to travel?
                </span>
                <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-semibold">
                  Nationwide Routes
                </span>
              </div>

              {/* Visual Route Indicator */}
              <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <span className="block text-[11px] font-semibold text-emerald-700 uppercase">From</span>
                  <span className="text-base font-extrabold text-slate-900">{originCity}</span>
                </div>
                <div className="text-emerald-700 text-lg font-bold">➔</div>
                <div className="text-right">
                  <span className="block text-[11px] font-semibold text-emerald-700 uppercase">To</span>
                  <span className="text-base font-extrabold text-slate-900">{destCity}</span>
                </div>
              </div>

              {/* Route Dropdowns */}
              <div className="grid grid-cols-2 gap-2 mt-3">
                <div>
                  <label className="block text-[11px] text-slate-500 font-semibold mb-1">Departure City</label>
                  <select
                    value={originId}
                    onChange={(e) => {
                      setOriginId(e.target.value);
                      const match = rides.find(
                        (r) => r.originLocationId === e.target.value && r.destinationLocationId === destId
                      );
                      if (match) setSelectedRideId(match.id);
                    }}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {NATIONWIDE_CITIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.province})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 font-semibold mb-1">Arrival City</label>
                  <select
                    value={destId}
                    onChange={(e) => {
                      setDestId(e.target.value);
                      const match = rides.find(
                        (r) => r.originLocationId === originId && r.destinationLocationId === e.target.value
                      );
                      if (match) setSelectedRideId(match.id);
                    }}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {NATIONWIDE_CITIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.province})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Quick Popular Route Chips */}
              <div className="mt-3 pt-2.5 border-t border-slate-100">
                <span className="block text-[10px] text-slate-400 font-bold uppercase mb-1.5">
                  Popular Routes (Tap to switch):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => {
                      setOriginId('loc-uk');
                      setDestId('loc-khi');
                      setSelectedRideId('ride-101');
                    }}
                    className="text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-800 px-2.5 py-1 rounded-lg font-medium transition"
                  >
                    Umerkot ➔ Karachi
                  </button>
                  <button
                    onClick={() => {
                      setOriginId('loc-khi');
                      setDestId('loc-hyd');
                      setSelectedRideId('ride-102');
                    }}
                    className="text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-800 px-2.5 py-1 rounded-lg font-medium transition"
                  >
                    Karachi ➔ Hyderabad
                  </button>
                  <button
                    onClick={() => {
                      setOriginId('loc-lhr');
                      setDestId('loc-isb');
                      setSelectedRideId('ride-103');
                    }}
                    className="text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-800 px-2.5 py-1 rounded-lg font-medium transition"
                  >
                    Lahore ➔ Islamabad
                  </button>
                  <button
                    onClick={() => {
                      setOriginId('loc-pes');
                      setDestId('loc-isb');
                      setSelectedRideId('ride-104');
                    }}
                    className="text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-800 px-2.5 py-1 rounded-lg font-medium transition"
                  >
                    Peshawar ➔ Islamabad
                  </button>
                </div>
              </div>
            </div>

            {/* Ride Card (Matching or Active) */}
            {matchingRides.length > 0 ? (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                {/* Driver & Ride Header */}
                <div className="p-4 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-emerald-100 border border-emerald-300 flex items-center justify-center text-xl font-bold text-emerald-800">
                      👨‍✈️
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-extrabold text-slate-900 text-base">
                          {currentRide.driverId === 'driver-tariq'
                            ? 'Tariq Khan'
                            : currentRide.driverId === 'driver-aslam'
                            ? 'Aslam Memon'
                            : currentRide.driverId === 'driver-kamran'
                            ? 'Kamran Butt'
                            : 'Farhan Shinwari'}
                        </span>
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold">
                          VERIFIED
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 font-medium">{currentRide.notes}</p>
                    </div>
                  </div>

                  {/* Status Badge */}
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

                {/* Capacity Banner */}
                <div className="px-4 py-2.5 bg-slate-50 flex items-center justify-between border-b border-slate-100 text-xs">
                  <span className="text-slate-600 font-medium">Available Capacity:</span>
                  <span
                    className={`font-black text-sm ${
                      availableSeats > 0 ? 'text-emerald-700' : 'text-rose-600'
                    }`}
                  >
                    {availableSeats} of {currentRide.capacity} seats remaining
                  </span>
                </div>

                {/* Step 2: Choose Booking Mode */}
                {currentRide.status === 'PUBLISHED' ? (
                  <form onSubmit={handleCreateRequest} className="p-4 space-y-4">
                    <div>
                      <span className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                        Step 2: Choose How You Want To Ride
                      </span>

                      {/* Booking Cards */}
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
                                  Private car for you & family. No stranger passengers.
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
                                  Share journey with others. Pay only per seat.
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

                      {/* Stepper for Seat count if 'SEAT' chosen */}
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

                    {/* Step 3: Passenger Details */}
                    <div className="border-t border-slate-100 pt-3 space-y-3">
                      <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                        Step 3: Your Name & Phone Number
                      </span>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">Your Full Name</label>
                          <input
                            type="text"
                            value={passengerName}
                            onChange={(e) => setPassengerName(e.target.value)}
                            placeholder="e.g. Ali Khan"
                            required
                            className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">
                            Mobile Number (for Driver Call)
                          </label>
                          <input
                            type="tel"
                            value={passengerPhone}
                            onChange={(e) => setPassengerPhone(e.target.value)}
                            placeholder="0300-1234567"
                            required
                            className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                      </div>

                      {/* Cash Guarantee Note */}
                      <div className="p-3 bg-amber-50 rounded-xl border border-amber-200/80 flex items-center gap-2.5 text-amber-900">
                        <span className="text-lg">💵</span>
                        <p className="text-[11px] leading-tight">
                          <strong>Naqad Raqam (Cash on Boarding):</strong> No bank card needed.
                          Pay Rs. {currentPrice.toLocaleString()} directly to the driver when you board.
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
                      <p className="text-[11px] text-center text-slate-400 font-medium">
                        Driver will review and accept your request before it is confirmed.
                      </p>
                    </div>
                  </form>
                ) : (
                  <div className="p-6 text-center text-slate-500 bg-slate-50 space-y-2">
                    <span className="text-3xl block">🚫</span>
                    <p className="text-sm font-bold text-slate-700">This ride is currently unavailable</p>
                    <p className="text-xs">
                      {currentRide.status === 'FULL_CAR_BOOKED'
                        ? 'The entire car has been reserved by another passenger.'
                        : currentRide.status === 'SEATS_FILLED'
                        ? 'All available seats for this journey have been filled.'
                        : 'The driver cancelled this journey.'}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              /* No Rides Found for exact route */
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 text-center space-y-3">
                <span className="text-3xl block">🔍</span>
                <h3 className="text-sm font-extrabold text-slate-900">
                  No direct ride found between {originCity} and {destCity}
                </h3>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  Try selecting one of the popular routes above, or switch to the Driver View to post a ride for this route!
                </p>
                <button
                  onClick={() => {
                    setNewPostOrigin(originId);
                    setNewPostDest(destId);
                    setActiveTab('driver');
                    setShowDriverPostModal(true);
                  }}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs py-2.5 px-4 rounded-xl transition"
                >
                  Post This Route as Driver
                </button>
              </div>
            )}

            {/* Passenger My Bookings Tracker */}
            {bookings.length > 0 && (
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 space-y-3">
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                  <span>📋</span>
                  <span>My Booking Requests & Status</span>
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

                        {/* Status Chip */}
                        <span
                          className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${
                            b.status === 'ACCEPTED'
                              ? 'bg-emerald-600 text-white'
                              : b.status === 'PENDING'
                              ? 'bg-amber-600 text-white'
                              : b.status === 'REJECTED_AUTO_CONFLICT'
                              ? 'bg-purple-600 text-white'
                              : 'bg-rose-600 text-white'
                          }`}
                        >
                          {b.status === 'ACCEPTED'
                            ? 'Confirmed'
                            : b.status === 'PENDING'
                            ? 'Waiting Approval'
                            : b.status === 'REJECTED_AUTO_CONFLICT'
                            ? 'Conflict'
                            : 'Declined'}
                        </span>
                      </div>

                      <div className="text-xs text-slate-600 mt-1 flex justify-between">
                        <span>Total: Rs. {b.totalPrice.toLocaleString()} (Cash)</span>
                        <span className="text-[10px] text-slate-400">ID: {b.id}</span>
                      </div>

                      {/* Action for Accepted Booking */}
                      {b.status === 'ACCEPTED' && (
                        <div className="mt-2.5 pt-2 border-t border-emerald-200/80 flex flex-wrap gap-2">
                          <a
                            href="tel:03009876543"
                            className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs py-2 px-3 rounded-lg text-center flex items-center justify-center gap-1.5 transition"
                          >
                            <span>📞</span>
                            <span>Call Driver (0300-9876543)</span>
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

                      {/* Conflict note */}
                      {b.status === 'REJECTED_AUTO_CONFLICT' && (
                        <p className="text-[11px] text-purple-800 mt-1.5 font-medium">
                          Note: Another booking for the entire car was accepted, so seat requests were automatically closed.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* DRIVER DASHBOARD VIEW */}
        {/* ========================================================================= */}
        {activeTab === 'driver' && (
          <div className="space-y-4">
            {/* Driver Summary Card */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Driver Dashboard
                  </span>
                  <h2 className="text-base font-black text-slate-900">
                    {NATIONWIDE_CITIES.find((c) => c.id === currentRide.originLocationId)?.name} ➔{' '}
                    {NATIONWIDE_CITIES.find((c) => c.id === currentRide.destinationLocationId)?.name}
                  </h2>
                  <p className="text-xs text-slate-500">Departure: Today at 07:00 AM • Toyota Corolla</p>
                </div>
                <button
                  onClick={() => setShowDriverPostModal(true)}
                  className="bg-slate-900 hover:bg-black text-white text-xs font-bold px-3 py-2 rounded-xl transition"
                >
                  + Post New Route
                </button>
              </div>

              {/* Big Stat Counters */}
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-center">
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="block text-[10px] text-slate-500 font-bold uppercase">Seats Free</span>
                  <span className="text-lg font-black text-emerald-700">
                    {availableSeats} / {currentRide.capacity}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="block text-[10px] text-slate-500 font-bold uppercase">Pending</span>
                  <span className="text-lg font-black text-amber-700">
                    {bookings.filter((b) => b.status === 'PENDING').length}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="block text-[10px] text-slate-500 font-bold uppercase">Status</span>
                  <span className="text-xs font-black block mt-1 text-slate-800">
                    {currentRide.status === 'PUBLISHED' ? 'Active' : currentRide.status}
                  </span>
                </div>
              </div>

              {/* Mode Switching for Driver */}
              <div className="pt-2 border-t border-slate-100">
                <label className="block text-[11px] font-bold text-slate-600 mb-1.5">
                  Change Ride Mode (Only if no confirmed bookings):
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    onClick={() => handleModeSwitch('WHOLE_CAR_OR_SEATS')}
                    className={`py-2 px-1 text-center rounded-xl text-xs font-bold border transition ${
                      currentRide.bookingMode === 'WHOLE_CAR_OR_SEATS'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    Both Options
                  </button>
                  <button
                    onClick={() => handleModeSwitch('WHOLE_CAR')}
                    className={`py-2 px-1 text-center rounded-xl text-xs font-bold border transition ${
                      currentRide.bookingMode === 'WHOLE_CAR'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    Full Car Only
                  </button>
                  <button
                    onClick={() => handleModeSwitch('SEATS')}
                    className={`py-2 px-1 text-center rounded-xl text-xs font-bold border transition ${
                      currentRide.bookingMode === 'SEATS'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    Seats Only
                  </button>
                </div>
              </div>

              {/* Cancel Ride Option */}
              {currentRide.status !== 'CANCELLED' && (
                <div className="pt-2 border-t border-slate-100 flex justify-end">
                  <button
                    onClick={() => handleCancelRide(currentRide)}
                    className="text-xs font-bold text-rose-700 hover:text-rose-900 hover:underline"
                  >
                    Cancel Entire Ride (Emergency)
                  </button>
                </div>
              )}
            </div>

            {/* Incoming Requests Section */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                  <span>📩</span>
                  <span>Passenger Booking Requests ({bookings.length})</span>
                </h3>
                <span className="text-[11px] text-slate-500">
                  {bookings.filter((b) => b.status === 'PENDING').length} awaiting response
                </span>
              </div>

              {bookings.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-300 space-y-1">
                  <span className="text-2xl block">📬</span>
                  <p className="text-xs font-bold text-slate-700">No requests yet</p>
                  <p className="text-[11px] text-slate-500">
                    Switch to &quot;I Need a Ride&quot; tab above and submit a request to test this flow.
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
                          <div className="font-extrabold text-slate-900 text-sm">
                            {req.passengerId}
                          </div>
                          <p className="text-xs text-slate-600 mt-0.5">
                            Wants:{' '}
                            <strong className="text-slate-800">
                              {req.bookingType === 'WHOLE_CAR' ? 'Entire Car' : `${req.requestedSeats} Seat(s)`}
                            </strong>{' '}
                            • <strong className="text-emerald-800">Rs. {req.totalPrice.toLocaleString()}</strong>
                          </p>
                        </div>

                        {/* Status Label */}
                        <span
                          className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${
                            req.status === 'ACCEPTED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : req.status === 'PENDING'
                              ? 'bg-amber-100 text-amber-800'
                              : req.status === 'REJECTED_AUTO_CONFLICT'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {req.status}
                        </span>
                      </div>

                      {/* Driver Action Buttons */}
                      {req.status === 'PENDING' && (
                        <div className="mt-3 pt-2.5 border-t border-amber-200 flex gap-2">
                          <button
                            onClick={() => handleAcceptRequest(req)}
                            className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs py-2.5 rounded-xl shadow-xs transition flex items-center justify-center gap-1.5"
                          >
                            <span>✓</span>
                            <span>ACCEPT REQUEST</span>
                          </button>
                          <button
                            onClick={() => handleRejectRequest(req)}
                            className="bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 font-bold text-xs py-2.5 px-3 rounded-xl transition"
                          >
                            Decline
                          </button>
                        </div>
                      )}

                      {/* Driver Action for Accepted Booking */}
                      {req.status === 'ACCEPTED' && (
                        <div className="mt-3 pt-2 border-t border-emerald-200 flex items-center justify-between">
                          <span className="text-[11px] font-bold text-emerald-800">
                            Cash to collect on boarding: Rs. {req.totalPrice.toLocaleString()}
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
        {/* DRIVER MODAL: POST NEW NATIONWIDE ROUTE */}
        {/* ========================================================================= */}
        {showDriverPostModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-xl border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h3 className="text-base font-extrabold text-slate-900">Post New Journey Route</h3>
                <button
                  onClick={() => setShowDriverPostModal(false)}
                  className="text-slate-400 hover:text-slate-700 font-bold text-lg"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handlePublishNewRide} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Departure City (From)</label>
                  <select
                    value={newPostOrigin}
                    onChange={(e) => setNewPostOrigin(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold"
                  >
                    {NATIONWIDE_CITIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.province})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Arrival City (To)</label>
                  <select
                    value={newPostDest}
                    onChange={(e) => setNewPostDest(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold"
                  >
                    {NATIONWIDE_CITIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.province})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Full Car Price (Rs.)</label>
                    <input
                      type="number"
                      value={newPostCarPrice}
                      onChange={(e) => setNewPostCarPrice(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Seat Price (Rs.)</label>
                    <input
                      type="number"
                      value={newPostSeatPrice}
                      onChange={(e) => setNewPostSeatPrice(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs py-3 rounded-xl transition shadow-xs mt-2"
                >
                  Publish Ride Online
                </button>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
