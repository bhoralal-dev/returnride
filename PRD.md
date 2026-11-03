# Apni Sawari (اپنی سواری) — Product Requirements Document (PRD)
**Nationwide Intercity Ride & Carpool Network for Pakistan**  
*Document Version: 2.1.0 • Target: Scalable Cloud Architecture & Android APK Readiness*

---

## 1. Executive Summary & Product Vision

### 1.1 Product Purpose
**Apni Sawari (اپنی سواری)** (formerly ReturnRide) is a nationwide, mobile-first intercity travel marketplace built for Pakistan. It connects drivers with spare vehicle capacity (specifically on empty return journeys / *Khali Wapsi*) with intercity passengers traveling between cities, towns, and rural hubs nationwide.

### 1.2 Core Value Proposition
* **Whole-Car (پوری گاڑی)**: Complete vehicle privacy for families, groups, and commercial travelers at fixed direct rates.
* **Single Seats (ایک سیٹ)**: Affordable per-seat booking along intercity highways (M-9, M-2, GT Road, N-5, N-25).
* **Khali Wapsi Deals**: Discounted return fares helping drivers offset fuel and toll costs while giving riders budget options.
* **100% Direct Cash-on-Boarding**: Zero in-app financial custody or digital escrow during pilot phase; passengers pay drivers directly in cash upon pickup.
* **0% Commission Launch**: Commission-free marketplace during pilot validation to maximize driver adoption and user trust.

---

## 2. High-Concurrency Scalability Architecture (10,000+ Concurrent Users)

To reliably serve **10,000+ simultaneous active users** during holiday peaks (Eid travel, wedding season, weekend rush hours) on Vercel + Supabase without database connection exhaustion, latency spikes, or race-condition booking collisions, the system enforces the following architectural controls:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        10,000+ Concurrent Users                        │
│                   (Mobile App / Desktop Web / APK)                     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      Vercel Edge Global CDN                            │
│  • Edge Caching: Cache-Control: public, s-maxage=10, SWR=30            │
│  • Micro-cached ride searches (absorbs 95%+ of read traffic)          │
│  • SSL Termination, DDoS Shield & Brotli/Gzip Compression              │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
    (Stateless Cryptographic Auth)           (Transactional Writes & Queries)
                    │                                │
                    ▼                                ▼
┌──────────────────────────────────────┐  ┌──────────────────────────────┐
│ Stateless HMAC-SHA256 OTP Engine     │  │ Supabase PgBouncer Pooler    │
│ • No DB queries during verification  │  │ • Port: 6543 (Transaction)   │
│ • Zero server memory bloat           │  │ • 10k connections pooled     │
│ • Multi-instance serverless safe     │  │ • Eliminates max_conn error  │
└──────────────────────────────────────┘  └──────────────┬───────────────┘
                                                         │
                                                         ▼
                                          ┌──────────────────────────────┐
                                          │ PostgreSQL Database Engine   │
                                          │ • Composite B-Tree Indexes   │
                                          │ • Atomic Stored Procedure    │
                                          │   accept_booking_request_tx()│
                                          │   (SELECT ... FOR UPDATE)    │
                                          └──────────────────────────────┘
```

### 2.1 Concurrency & Throughput Math (10K Active Users)
* **Estimated Peak Load**: 10,000 active concurrent users generate **1,500 to 2,500 Requests Per Second (RPS)**.
* **Traffic Distribution**:
  * **85% Read Traffic**: Searching routes, viewing ride details, browsing listings.
  * **10% Polling & Status**: Checking booking acceptance, viewing driver phone/WhatsApp.
  * **5% Write Operations**: Submitting booking requests, accepting passengers, publishing journeys.

### 2.2 Database Connection Pooler (PgBouncer)
* **Problem**: Standard PostgreSQL instances crash with `FATAL: remaining connection slots are reserved` when serverless Lambda functions spawn hundreds of simultaneous instances under 10k users.
* **Enforced Solution**:
  * Direct PostgreSQL port `5432` is prohibited in production serverless routes.
  * Supabase **Transaction Connection Pooler (PgBouncer)** on **Port `6543`** pools thousands of stateless transactions into a managed pool of ~50 physical connections.
  * Stateless REST queries leverage Supabase PostgREST HTTP edge calls (`@supabase/ssr` / `@supabase/supabase-js`), which never exhaust connection pools.

### 2.3 Edge Caching & Stale-While-Revalidate (SWR)
* Search feed queries (`GET /api/rides`) are equipped with Edge CDN caching headers:
  ```http
  Cache-Control: public, s-maxage=10, stale-while-revalidate=30
  ```
* **Performance Gain**: 1,000 passengers searching for Karachi ↔ Hyderabad within 10 seconds trigger **1 database query**; the remaining 999 requests are served by Vercel's global edge network in **$< 20\text{ms}$**.

### 2.4 Stateless Cryptographic HMAC-SHA256 OTP Verification
* Instead of storing temporary verification codes in a database table (which causes table bloat and high write contention during traffic spikes), OTP verification uses a **stateless HMAC-SHA256 signature**:
  $$\text{Payload} = \text{identifier} : \text{code} : \text{expiresAt}$$
  $$\text{Token} = \text{expiresAt} . \text{HMAC-SHA256}(\text{Payload}, \text{Secret})$$
* **Scalability Benefit**: Verification is computed in **$O(1)$ CPU time** with **0 database lookups**, completely immune to lambda cold starts and multi-region routing.

### 2.5 Atomic Row Locking (`SELECT ... FOR UPDATE`)
* When 50 passengers attempt to book the last remaining seat at the exact same millisecond, standard application-level checks fail.
* ReturnRide enforces PostgreSQL stored procedure `accept_booking_request_tx()` using `SELECT ... FOR UPDATE` row locks:
  * Only 1 transaction acquires the row lock and decrements capacity.
  * Remaining competing transactions fail cleanly with `CAPACITY_EXCEEDED` or `CONFLICT`.
  * Guarantees zero overbooking across distributed cloud instances.

### 2.6 Composite Indexing Strategy
Implemented in [`supabase/migrations/20261102_scalability_10k_users_indexes.sql`](file:///c:/Users/Admin/Desktop/returnride/supabase/migrations/20261102_scalability_10k_users_indexes.sql):
* `rides(origin_location_id, destination_location_id, status, departure_time ASC)`
* `rides(booking_mode, status, departure_time ASC)`
* `booking_requests(ride_id, status)`
* `booking_requests(passenger_id, status, created_at DESC)`
* `user_profiles(phone_number)`
* `driver_profiles(cnic_number)`

---

## 3. Mobile View Testing & Desktop Frame Simulator

To ensure effortless testing over Vercel while preparing the entire codebase for instant conversion into an Android APK, the user interface operates in **Mobile-First Viewport Mode**:

### 3.1 Desktop Smartphone Frame Simulator (Default on Vercel)
* When visited from a laptop, desktop, or tablet (${\ge} 640\text{px}$), the app renders inside a **centered smartphone device frame**:
  * **Standard Ratio**: $390 \times 844\text{px}$ viewport (matching modern Android/iPhone screen standards).
  * **Phone Bezel**: 48px rounded corners, deep shadow, dynamic camera island pill.
  * **Simulated Mobile Status Bar**: Live digital clock, 5G cellular indicator, Wi-Fi icon, 100% battery badge.
  * **Persistent Mobile Bottom Nav**: Always docked at the base of the device frame (Find Rides, Bookings, Guide, Profile/Driver Dashboard).
  * **Testing Header**: Quick-action bar with device dimensions (`390×844`), APK status badge, and optional "Full Width" desktop toggle.

### 3.2 Native Edge-to-Edge Experience on Mobile Devices & APK
* When opened on a mobile device ($< 640\text{px}$), inside an Android WebView, or within an installed APK:
  * The desktop backdrop and simulated phone bezel **automatically hide**.
  * The app expands to **100% width and height** (`w-full min-h-screen bg-slate-50`).
  * Full touch ergonomics: Touch targets $\ge 48\text{px}$, safe area insets (`env(safe-area-inset-top)` / `safe-area-inset-bottom`), overscroll containment.

---

## 4. Post-Completion Android APK Conversion Playbook

The project is structured with [`capacitor.config.json`](file:///c:/Users/Admin/Desktop/returnride/capacitor.config.json), mobile viewport meta tags, and [`public/manifest.json`](file:///c:/Users/Admin/Desktop/returnride/public/manifest.json) for 1-click APK generation.

### Path A: Capacitor Native Android Export (Recommended)
This method packages the live Vercel deployment or static bundle into a native Android Studio project:

1. **Install Capacitor Dependencies**:
   ```powershell
   npm install @capacitor/core @capacitor/cli @capacitor/android
   ```
2. **Initialize Capacitor Android Project**:
   ```powershell
   npx cap add android
   ```
3. **Synchronize Assets & Vercel URL**:
   ```powershell
   npx cap sync
   ```
4. **Build APK via Android CLI / Gradle**:
   ```powershell
   cd android
   ./gradlew assembleDebug
   # Output debug APK: android/app/build/outputs/apk/debug/app-debug.apk
   ```
5. **Open in Android Studio (for release signing & Play Store AAB)**:
   ```powershell
   npx cap open android
   ```

### Path B: Trusted Web Activity (TWA) via Google Bubblewrap
Generates a signed Google Play Store APK/AAB directly from the PWA manifest in under 5 minutes:

1. **Install Bubblewrap CLI**:
   ```powershell
   npm install -g @bubblewrap/cli
   ```
2. **Initialize from Vercel Domain**:
   ```powershell
   bubblewrap init --manifest="https://your-app.vercel.app/manifest.json"
   ```
3. **Build Signed Release APK / AAB**:
   ```powershell
   bubblewrap build
   ```

---

## 5. Core Marketplace Workflows & System Invariants

### 5.1 Passenger Workflow
1. **Quick Route Modal ("Where To?")**: Instant prompt on initial entry for Origin City and Destination City with 1-tap popular routes (Karachi ↔ Hyderabad, Umerkot ↔ Karachi, Lahore ↔ Islamabad).
2. **Transparent Choice**:
   * Whole Car (پوری گاڑی): Full vehicle privacy.
   * Single Seats (ایک سیٹ): $1$ to $N$ individual seats at per-seat rate.
3. **Booking Submission**: Enters `PENDING` status. Pending requests do **not** decrease vehicle capacity.
4. **Confirmation**: Upon driver acceptance, status updates to `ACCEPTED`. Driver phone number and WhatsApp direct links unlock for pickup coordination.

### 5.2 Driver / Captain Workflow
1. **Mandatory Security Verification**:
   * Full name, verified mobile number.
   * **Mandatory 13-Digit Pakistani CNIC** (`formatPakistaniCnic` auto-hyphenation `44101-xxxxxxx-x`).
   * **Mandatory Driving License** (`DL-xxxx-xxxxx`).
   * **Mandatory Emergency Family Contact** (`03xx-xxxxxxx`) for accident & motorway safety.
   * **Vehicle Details MUST Start Empty (`""`)**: Make, model, and license plate start empty with placeholders (`Toyota Corolla`, `LEB-4592`). No dummy auto-fills.
2. **Publish Journey**: Set origin, destination, schedule, whole-car price, seat price, AC status, and comfort perks.
3. **Accept / Reject**:
   * **Accept**: Atomically locks seats and auto-rejects conflicting pending requests (`REJECTED_AUTO_CONFLICT`).
   * **Reject**: Declines passenger without altering vehicle capacity.
4. **Trip Cancellation**: Automatically notifies passengers, resets occupied seats, and updates reliability score.

---

## 6. Authentication & Unified Registration (Strict Invariants)

* **MasterMox Unified UI**: Sign In is default tab; "Create Free Account ➔" switches to registration.
* **Single Identifier Input**: Seamlessly detects Email vs. Pakistani Mobile (`03xx-xxxxxxx` or `+923xx-xxxxxxx`).
* **100% Mandatory OTP Verification**:
  * Direct or instant unverified signups are prohibited.
  * **Phone**: Real SIM SMS OTP via TextBee Android SIM Gateway.
  * **Email**: Real Email OTP via Nodemailer / Personal Gmail SMTP.
  * Verification code must be cryptographically validated before account creation in database.

---

## 7. Repeat Cancellation Prevention & Reliability System

To maintain market trust and eliminate last-minute ghosting without levying unapproved financial fines:

1. **Zero Monetary Penalties**: No automatic fines or balance deductions.
2. **Transparent Scoring**: Baseline score of **100 points**, visible with human-readable explanations.
3. **Graduated Consequences**:
   * **Level 0 (Normal, 80–100)**: Full platform access.
   * **Level 1 (Warning, 65–79 or 2 cancels in 7d)**: In-app warning banner.
   * **Level 2 (Cooling-Off, 3+ cancels in 7d or 5+ in 30d)**: Automated **24-hour cooling-off restriction** prohibiting new bookings or ride listings.
   * **Level 3 (Flagged, < 50 score or 3+ last-minute cancels)**: Account flagged for manual support review.
4. **Timing Differentiation**:
   * Standard (${\ge} 24\text{h}$ prior): $-5$ points.
   * Moderate ($4$ to $24\text{h}$ prior): $-10$ points.
   * Last-Minute ($< 4\text{h}$ prior): $-20$ points.
   * Driver ride disruption multiplier: $1.5\times$ penalty if confirmed passengers are disrupted.
5. **Score Recovery**: $+2$ points awarded per completed journey (capped at 100).
6. **Emergency Appeals**: Users with legitimate emergency documentation (hospitalization, vehicle breakdown, road closure) can submit an emergency appeal to restore their score immediately.

---

## 8. Legal & Provincial Regulatory Matrix (Pakistan)

| Jurisdiction | Relevant Statute | Operational Policy |
| :--- | :--- | :--- |
| **Sindh** | Motor Vehicles Ordinance 1965 / Provincial Transport Dept | Non-profit private cost-sharing between individuals is legally distinct from commercial stage carriages (buses). |
| **Punjab** | Punjab Motor Vehicles (Amendment) Act / PTA | Enforces commercial route permit checks; intercity private carpooling is classified as cost-recovery sharing during 0% pilot. |
| **Islamabad (ICT)** | ICT Transport Authority / Motorway Police (NH&MP) | Vehicles entering M-2 / GT Road are subject to highway safety inspections; driver CNIC and license must match in-app records. |
| **Cyberlaw** | PECA 2016 (Prevention of Electronic Crimes Act) | User data minimization enforced; phone numbers and CNICs encrypted with access audit trails. |
| **Taxation** | FBR / SRB / PRA | 0% sales tax due during pilot phase because platform charges 0% commission. |

---

## 9. Performance & Capacity Benchmarks

| Metric | Target SLA | Scalability Control |
| :--- | :--- | :--- |
| **Concurrent Users** | $\ge 10,000$ active users | PgBouncer pooler (port 6543) + PostgREST stateless API |
| **Search Feed Latency (p95)** | $< 50\text{ms}$ | Vercel Edge CDN cache (`s-maxage=10, SWR=30`) |
| **Booking Acceptance Latency** | $< 180\text{ms}$ | Stored procedure `accept_booking_request_tx()` row locking |
| **OTP Verification Time** | $< 10\text{ms}$ | In-memory HMAC-SHA256 token verification ($O(1)$) |
| **Lighthouse Mobile Score** | $\ge 90$ | Mobile-first viewport, safe-area CSS, zero unneeded bundles |
| **Test Suite Pass Rate** | $24 / 24$ Unit Tests ($100\%$) | Automated `npm test` gate |
| **TypeScript / ESLint** | $0$ Errors | Automated `npm run build` and `npm run lint` gates |

---

## 10. Document Maintenance Log

| Version | Date | Author | Summary of Changes |
| :--- | :--- | :--- | :--- |
| `1.0.0` | Oct 2026 | Engineering Team | Initial project specification and booking engine invariants. |
| `2.0.0` | Oct 2026 | Engineering Team | Unified MasterMox UI, mandatory OTP, repeat cancellation reliability engine. |
| `2.1.0` | Nov 2026 | Antigravity AI | Added 10K+ concurrent users scalability architecture, PgBouncer pooler advisory, composite database indexes, Vercel mobile viewport frame simulator, and Android APK Capacitor/Bubblewrap export pipeline. |
