# ReturnRide — Deployment & Production Guide

This guide explains how to deploy **ReturnRide** to the web so you and others can access it on any smartphone or computer across Pakistan.

---

## 1. Quick Deploy: Live Prototype (Ready Right Now)

The current Next.js application is **100% ready for instant deployment** to platforms like **Vercel** or **Netlify**.

### Deploy to Vercel (Recommended, Free & Takes 2 Minutes):

1. **Push your code to GitHub**:
   * Create a repository on [GitHub](https://github.com) named `returnride`.
   * Push your local commits:
     ```bash
     git remote add origin https://github.com/YOUR_USERNAME/returnride.git
     git branch -M master
     git push -u origin master
     ```

2. **Deploy on Vercel**:
   * Sign in to [Vercel](https://vercel.com) using your GitHub account.
   * Click **"Add New Project"** and select `returnride`.
   * Framework Preset: **Next.js** (automatically detected).
   * Click **"Deploy"**.

3. **Open on Smartphone**:
   * Once deployed, Vercel gives you a public HTTPS link (e.g. `https://returnride.vercel.app`).
   * Open this link in Chrome or Safari on your phone.
   * Tap browser menu (**⋮** or Share) and select **"Add to Home screen"** to install it like a native mobile app!

---

## 2. Production Architecture: Connecting Supabase (Database)

In the current demo prototype, rides and bookings are managed via browser state and local persistence.

To transition to a nationwide multi-user commercial system where drivers and passengers see each other across different phones in real-time:

1. **Create a Free Supabase Project**:
   * Visit [Supabase](https://supabase.com) and create a free project.
   * Set your database region (e.g., Singapore or Frankfurt for optimal latency to Pakistan).

2. **Run the Database Migration**:
   * Open the **SQL Editor** in your Supabase dashboard.
   * Copy and paste the entire script from [`supabase/migrations/20261027_initial_schema.sql`](supabase/migrations/20261027_initial_schema.sql).
   * Click **Run**.
   * This creates all tables (`locations`, `users`, `driver_profiles`, `vehicles`, `rides`, `booking_requests`, `cancellation_records`) and the atomic row-locking procedure `accept_booking_request_tx()`.

3. **Configure Environment Variables**:
   * In Supabase, go to **Project Settings** ➔ **API**.
   * Copy `Project URL` and `anon public key`.
   * In Vercel (or in your `.env.local` file):
     * Set `NEXT_PUBLIC_SUPABASE_URL`
     * Set `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## 3. Pre-Launch Production Checklist

Before launching commercial operations with real strangers in Pakistan:

- [x] **Core Domain Engine**: Mutual exclusion, seat capacity, cancellation safeguards (`13/13 tests passing`).
- [x] **Accessible UI**: Designed for low-literacy users, large 48px+ touch targets, direct WhatsApp/phone actions.
- [x] **Zero-Error Build**: Clean TypeScript and Next.js static generation.
- [x] **PWA Manifest**: Configured for mobile home-screen installation.
- [x] **Database Schema**: Full PostgreSQL relational schema with row-level locks.
- [ ] **SMS OTP Authentication**: Integrate Jazz/Telenor/Twilio SMS OTP for phone verification.
- [ ] **Driver Document Verification**: Admin review workflow for driver CNIC & License before rides go live.
- [ ] **Provincial Transport Compliance**: Verify local carpooling cost-sharing regulations with provincial transport authorities.
