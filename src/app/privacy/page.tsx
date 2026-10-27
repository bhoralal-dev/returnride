import React from 'react';
import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy | ReturnRide Pakistan',
  description: 'Privacy Policy and Data Protection Framework for ReturnRide Pakistan.',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased py-10 px-4">
      <div className="max-w-2xl mx-auto bg-white p-6 sm:p-10 rounded-3xl shadow-sm border border-slate-200 space-y-8">
        {/* Header */}
        <div className="border-b border-slate-100 pb-4">
          <Link
            href="/"
            className="text-xs font-bold text-emerald-700 hover:underline flex items-center gap-1 mb-3"
          >
            <span>← Back to ReturnRide</span>
          </Link>
          <h1 className="text-2xl font-black text-slate-900">Privacy Policy</h1>
          <p className="text-xs text-slate-500 mt-1">
            Effective Date: October 27, 2026 • ReturnRide Pakistan (Intercity Ride Marketplace)
          </p>
        </div>

        {/* Notice on Pakistani Legal Alignment */}
        <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 text-xs text-emerald-950 space-y-1">
          <p className="font-extrabold uppercase tracking-wider text-[11px] text-emerald-800">
            Legal & Data Protection Framework
          </p>
          <p>
            ReturnRide operates in compliance with the Prevention of Electronic Crimes Act (PECA) 2016
            and relevant provincial consumer protection standards. We prioritize data minimization: we
            collect only what is strictly necessary to ensure traveler safety and trip coordination.
          </p>
        </div>

        {/* 1. Information We Collect */}
        <section className="space-y-3">
          <h2 className="text-base font-extrabold text-slate-900">1. Information We Collect</h2>
          <ul className="text-xs text-slate-600 space-y-2 list-disc list-inside">
            <li>
              <strong>Account Information:</strong> Mobile phone number, full name, and chosen residential city.
            </li>
            <li>
              <strong>Driver & Security Verification:</strong> Computerized National Identity Card (CNIC) number,
              valid driving license details, vehicle registration details (make, model, license plate, seating capacity).
            </li>
            <li>
              <strong>Trip & Booking Records:</strong> Origin city, destination city, departure schedule, seat counts,
              booking status, and cancellation history.
            </li>
            <li>
              <strong>Safety & Emergency Contacts:</strong> Optional secondary emergency phone number provided by users
              for crisis escalation during intercity journeys.
            </li>
          </ul>
        </section>

        {/* 2. How Information is Used */}
        <section className="space-y-3">
          <h2 className="text-base font-extrabold text-slate-900">2. How Information is Used</h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            Your data is used solely to facilitate lawful, safe intercity carpooling and ride-sharing:
          </p>
          <ul className="text-xs text-slate-600 space-y-2 list-disc list-inside">
            <li>Connecting passengers with verified drivers traveling along matching nationwide corridors.</li>
            <li>Verifying driver legitimacy and vehicle roadworthiness to prevent impersonation and fraud.</li>
            <li>
              Enforcing the <strong>Repeat Cancellation Prevention & Reliability System</strong> to prevent serial
              booking hoaxes, last-minute ride abandonments, and malicious capacity lockouts.
            </li>
            <li>Facilitating direct phone and WhatsApp contact strictly <em>after</em> a booking request has been confirmed.</li>
          </ul>
        </section>

        {/* 3. Data Sharing & Contact Privacy */}
        <section className="space-y-3">
          <h2 className="text-base font-extrabold text-slate-900">3. Direct Contact Privacy</h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            We never sell, rent, or trade your personal information. Phone numbers are protected: a passenger&apos;s
            mobile number is hidden from the general public and is disclosed only to the assigned driver once a booking
            is explicitly accepted.
          </p>
        </section>

        {/* 4. Document Storage & Security */}
        <section className="space-y-3">
          <h2 className="text-base font-extrabold text-slate-900">4. Driver Document Security</h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            Driver CNIC and license documents submitted for verification are restricted to authorized compliance
            personnel. They are never displayed on public listings or shared with other marketplace users.
          </p>
        </section>

        {/* 5. Direct Cash Transactions */}
        <section className="space-y-3">
          <h2 className="text-base font-extrabold text-slate-900">5. Payment Information</h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            ReturnRide does not collect, process, or store credit card numbers, debit cards, or bank credentials.
            All trip cost contributions are paid in cash directly between the passenger and driver upon vehicle boarding.
          </p>
        </section>

        {/* 6. Account Deletion & Data Rights */}
        <section className="space-y-3">
          <h2 className="text-base font-extrabold text-slate-900">6. User Rights & Account Deletion</h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            Users may request an extract of their account information or complete account erasure by contacting our
            privacy desk at <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800">support@returnride.pk</code>.
            Legal transaction logs and active dispute records are retained only for the duration required by applicable
            Pakistani law.
          </p>
        </section>

        {/* Footer */}
        <div className="pt-6 border-t border-slate-100 flex justify-between items-center text-xs text-slate-400">
          <span>ReturnRide Pakistan • Safe Intercity Travel</span>
          <Link href="/terms" className="text-emerald-700 font-bold hover:underline">
            View Terms of Service →
          </Link>
        </div>
      </div>
    </div>
  );
}
