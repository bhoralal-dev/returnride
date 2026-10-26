# ReturnRide — Project Specification & Product Requirements

**ReturnRide** is a mobile-first intercity ride marketplace designed specifically for Pakistan. It connects intercity drivers with passengers traveling between cities, towns, and rural hubs nationwide.

---

## 1. Product Purpose & Nationwide Scope

* **Core Mission**: Provide a safe, transparent, and ultra-simple platform for intercity travelers across Pakistan. Full-car booking is prioritized as the primary option, while drivers can offer individual seats as an alternative.
* **Geographic Scope**: Nationwide across all provinces and territories of Pakistan (Sindh, Punjab, Khyber Pakhtunkhwa, Balochistan, Islamabad Capital Territory, Azad Jammu & Kashmir, and Gilgit-Baltistan). Initial routes (e.g., Umerkot ↔ Karachi) serve as pilot corridors, but the system architecture is entirely data-driven with zero hardcoded cities or routes. `[Planned]`
* **Target Audience**: Everyday Pakistani citizens, including non-technical users with low digital literacy. The interface must be minimal, high-contrast, touch-friendly ($\ge 48\text{px}$ touch targets), and support intuitive bilingual affordances (English and Roman Urdu). `[Implemented and verified]`

---

## 2. Core Marketplace Workflows

### A. Passenger Workflow `[Planned]`
1. **Search**: Select origin and destination from dynamic location records, and specify travel date.
2. **Browse**: View published rides with clear transparent pricing:
   * **Full Car (پوری گاڑی)**: Reserve the entire vehicle for private/family travel.
   * **Per Seat (ایک سیٹ)**: Book individual seats at a per-passenger rate.
3. **Submit Request**: Passenger enters their name, phone number, and requested capacity (1 full car or 1–N seats). The request enters `PENDING` status.
4. **Driver Confirmation**: Request is confirmed only after the driver reviews and explicitly accepts it.

### B. Driver Workflow `[Planned]`
1. **Publish Ride**: Specify origin, destination, departure date/time, vehicle details, passenger capacity (1–10 seats), pricing mode, and pricing.
2. **Review Requests**: View incoming pending requests on a one-tap dashboard.
3. **Accept / Reject**:
   * Tapping **Accept** transactionally locks the ride inventory and auto-rejects any newly conflicting pending requests.
   * Tapping **Reject** declines the passenger without altering vehicle capacity.
4. **Trip Management**: Contact confirmed passengers directly via phone/WhatsApp, commence trip, and complete ride.

---

## 3. Booking Modes & Invariants

### Booking Modes `[Implemented and verified]`
* `WHOLE_CAR`: Vehicle is exclusively offered as an entire car reservation.
* `SEATS`: Vehicle is exclusively offered on a per-seat basis.
* `WHOLE_CAR_OR_SEATS`: Vehicle is primarily offered as a whole car, but individual seat bookings are permitted if no whole-car reservation has taken place. Accepting either mode locks out the other.

### Core Booking Invariants `[Implemented and verified]`
1. **Pending Requests Do Not Reserve Capacity**: A pending request does not consume seats. This prevents malicious users from locking out drivers by submitting fake requests.
2. **Driver Acceptance Gate**: All requests start in `PENDING` status. Only driver acceptance commits inventory.
3. **Mutual Exclusivity**:
   * An accepted `WHOLE_CAR` booking sets `bookedSeatsCount = capacity`, changes ride status to `FULL_CAR_BOOKED`, and auto-rejects all other pending requests (`REJECTED_AUTO_CONFLICT`).
   * An accepted `SEAT` booking sets `is_full_car_available = false`, permanently blocks whole-car reservations, and auto-rejects any pending whole-car requests.
4. **Capacity Ceiling**: `bookedSeatsCount + requestedSeats` can never exceed vehicle `capacity`. Any request that would exceed available seats is rejected (`CAPACITY_EXCEEDED`).
5. **Mode Switching Invariants**: Switching a ride's booking mode via `switchRideBookingMode` is strictly forbidden if any confirmed bookings or occupied seats exist (`MODE_SWITCH_CONFLICT`). Any pending requests incompatible with the new mode are automatically transitioned to `REJECTED_AUTO_CONFLICT`.
6. **No Auto-Acceptance**: Compatible pending requests remain `PENDING` and are never automatically accepted when capacity is freed.
7. **Lifecycle Invariant**: Inactive, departed, completed, or cancelled rides cannot accept bookings (`RIDE_INACTIVE`, `RIDE_CLOSED`).

---

## 4. Cancellation & Lifecycle Rules

### A. Booking Cancellation `[Implemented and verified]`
* **Allowed Ride States**: Booking cancellations via `cancelConfirmedBooking` are permitted only on active, pre-departure rides (`PUBLISHED`, `FULL_CAR_BOOKED`, `SEATS_FILLED`). Inactive, departed, completed, or draft rides throw `RIDE_INACTIVE`.
* **Capacity Restoration**:
  * Cancelling an individual seat booking releases exactly the seats that booking occupied.
  * Cancelling a whole-car booking restores full capacity.
  * If `autoReopenOnCancellation` is enabled (default `true`), rides marked `FULL_CAR_BOOKED` or `SEATS_FILLED` revert to `PUBLISHED`.
* **Idempotency**: Repeated cancellation of an already cancelled booking throws `INVALID_STATUS_TRANSITION`.

### B. Driver Ride Cancellation (`cancelRide`) `[Implemented and verified]`
* **Authorization**: Only the assigned driver can cancel their ride (`UNAUTHORIZED_DRIVER`).
* **Lifecycle Guards**: Duplicate cancellation, completed rides, and departed rides are rejected (`ALREADY_CANCELLED`, `RIDE_ALREADY_COMPLETED`, `RIDE_ALREADY_DEPARTED`).
* **Cascade**:
  * Ride status transitions to `CANCELLED` and `bookedSeatsCount` resets to 0.
  * All confirmed bookings (`ACCEPTED`) transition to `CANCELLED_BY_DRIVER`.
  * A `CancellationRecord` is generated for each confirmed booking.
  * All pending requests (`PENDING`) transition to `REJECTED_AUTO_CONFLICT`.
  * Bookings for other rides are unaffected.

---

## 5. Safety, Trust & Identity Verification `[Planned]`

1. **Driver Identity & Document Verification**:
   * Drivers must submit CNIC (Computerized National Identity Card), valid driving license, and vehicle registration documents before their rides become visible to the public.
   * Admin verification dashboard to manually review and approve/reject driver credentials during the initial phase.
2. **Phone Number Verification (SMS OTP)**:
   * SMS OTP verifies control over a Pakistani mobile number (Jazz, Telenor, Zong, Ufone).
   * *Critical Distinction*: Phone OTP confirms phone ownership, **not** legal personal identity. It must be paired with verified CNIC records for drivers.
3. **Safety & Privacy**:
   * Phone numbers and direct contact details are revealed only **after** a booking request is accepted by the driver.
   * In-app reporting and user blocking workflows for misconduct, harassment, or unsafe driving.
   * Admin emergency contact sharing and trip details sharing via WhatsApp link.

---

## 6. Payments & Business Model

* **Initial Phase (Pilot)**: **100% Cash-on-Boarding** between passenger and driver. `[Planned]`
  * Direct cash payment avoids payment gateway licensing, merchant account setup, and banking friction during early market validation.
  * Completely commission-free pilot to encourage adoption and gather real passenger-driver feedback.
* **Future Monetization**:
  * Transparent platform fee per confirmed ride.
  * Any commission structure will be explicitly disclosed upfront to drivers and riders.
  * Digital wallet escrow (JazzCash, Easypaisa, Raast) will be considered in post-MVP phases only.

---

## 7. Architecture & Technology Stack

* **Frontend**: Next.js 16 (App Router) + TypeScript + Tailwind CSS 4. Ultra-minimal, touch-first components. `[Implemented and verified]`
* **Domain Engine**: Pure TypeScript in-memory booking engine with zero external dependencies and 13 automated tests. `[Implemented and verified]`
* **Production Backend (Target)**: Supabase (PostgreSQL). `[Planned]`
  * Relational schema with strict foreign keys, check constraints, and Row Level Security (RLS).
  * **Transactional Concurrency**: Booking acceptance and capacity adjustments will be wrapped in PostgreSQL stored procedures / RPCs using `SELECT ... FOR UPDATE` row locks to guarantee zero overbooking under real concurrent traffic.

---

## 8. Legal & Regulatory Compliance `[Requires external/legal research]`

* Pakistan’s motor vehicle laws and commercial ride regulations vary across provincial transport authorities (Sindh Transport Department, Punjab Transport Authority, KP Urban Mobility Authority, etc.).
* Legal research is required prior to public commercial launch to establish:
  * Private carpooling / cost-sharing legal exemptions vs. commercial transport licensing.
  * Driver background check requirements and carrier liabilities.
  * Tax compliance (PRA, SRB, FBR).

---

## 9. Explicit MVP Exclusions

* **Cargo & Goods Delivery**: Explicitly out of scope for MVP.
* **In-App Digital Wallet / Escrow**: No digital payments in MVP (cash only).
* **Live GPS Fleet Tracking**: No continuous GPS tracking in MVP; pickup locations and routes are managed via discrete location checkpoints.

---

## 10. Requirement Status Matrix

| Component | Feature | Status |
| :--- | :--- | :--- |
| **Domain Engine** | Mutual exclusivity (Full Car vs Seats) | **Implemented and verified** |
| **Domain Engine** | Capacity calculation & overcapacity guards | **Implemented and verified** |
| **Domain Engine** | Driver acceptance & auto-conflict rejection | **Implemented and verified** |
| **Domain Engine** | Booking & ride cancellation state machines | **Implemented and verified** |
| **Domain Engine** | Booking mode switching safeguards | **Implemented and verified** |
| **Domain Engine** | Automated unit tests (13 test suites) | **Implemented and verified** |
| **Interface** | Minimalist mobile prototype UI | **Implemented and verified** |
| **Database** | Supabase / PostgreSQL schema & migrations | **Planned** |
| **Database** | Atomic RPC transactions (`SELECT FOR UPDATE`) | **Planned** |
| **Security** | Driver CNIC & License manual verification | **Planned** |
| **Security** | Pakistani SMS OTP authentication | **Planned** |
| **Compliance** | Provincial transport legal validation | **Requires external/legal research** |
| **Operations** | Customer support helpline & dispute protocol | **Planned** |
