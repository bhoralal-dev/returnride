import React from 'react';
import Link from 'next/link';

export const metadata = {
  title: 'Terms of Service | ReturnRide Pakistan',
  description: 'Terms of Service and Marketplace Rules for ReturnRide Pakistan.',
};

export default function TermsPage() {
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
          <h1 className="text-2xl font-black text-slate-900">Terms of Service</h1>
          <p className="text-xs text-slate-500 mt-1">
            Last Updated: October 27, 2026 • ReturnRide Pakistan (Intercity Ride Marketplace)
          </p>
        </div>

        {/* 1. Platform Purpose & Scope */}
        <section className="space-y-3">
          <h2 className="text-base font-extrabold text-slate-900">1. Nature of the Service</h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            ReturnRide is a technology communications platform connecting drivers who have available vehicle
            capacity with passengers traveling along nationwide intercity routes in Pakistan. ReturnRide is not
            a common carrier, public transport corporation, or taxi operator. Drivers participate as independent
            individuals sharing journey costs.
          </p>
        </section>

        {/* 2. Driver Eligibility & Security Verification */}
        <section className="space-y-3">
          <h2 className="text-base font-extrabold text-slate-900">2. Driver Eligibility & Verification</h2>
          <ul className="text-xs text-slate-600 space-y-2 list-disc list-inside">
            <li>Drivers must hold a valid, unexpired Pakistani Driving License.</li>
            <li>Drivers must submit a verified Computerized National Identity Card (CNIC).</li>
            <li>Vehicles must possess valid registration documents, roadworthiness certificates where applicable, and functioning air conditioning (if advertised).</li>
            <li>Providing false identification, impersonating another captain, or using an unregistered vehicle constitutes grounds for immediate platform barring and legal referral.</li>
          </ul>
        </section>

        {/* 3. Booking & Direct Cash Payment */}
        <section className="space-y-3">
          <h2 className="text-base font-extrabold text-slate-900">3. Booking & Cash Settlement</h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            During the commission-free pilot, all financial transactions occur via direct cash payment between
            the passenger and driver upon boarding:
          </p>
          <ul className="text-xs text-slate-600 space-y-2 list-disc list-inside">
            <li>Passengers agree to pay the exact agreed cash amount upon boarding the vehicle.</li>
            <li>Drivers agree never to demand surcharges or deviate from the confirmed listing price.</li>
            <li>ReturnRide does not hold customer funds in escrow; consequently, cash disputes must be handled responsibly between traveler and captain under our customer support mediation.</li>
          </ul>
        </section>

        {/* 4. Repeat Cancellation & Reliability Policy */}
        <section className="space-y-3">
          <h2 className="text-base font-extrabold text-slate-900">4. Repeat Cancellation & Reliability Policy</h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            To protect travelers against serial flaking, ghost bookings, and last-minute cancellations, ReturnRide
            enforces an automated, transparent reliability policy:
          </p>
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2 text-xs text-slate-700">
            <p>
              <strong>Graduated Consequences (No Arbitrary Fines):</strong> ReturnRide does not levy monetary
              penalties or surprise cancellation fees. Instead, repeat cancellations trigger graduated operational
              consequences:
            </p>
            <ul className="space-y-1 list-disc list-inside ml-2">
              <li><strong>Level 1 (Warning):</strong> Issued if 2 cancellations occur within 7 days.</li>
              <li><strong>Level 2 (Temporary Restriction):</strong> A 24-hour cooling-off restriction prevents submitting new bookings or publishing new rides if 3+ cancellations occur within 7 days. Existing confirmed rides remain intact.</li>
              <li><strong>Level 3 (Manual Review):</strong> Multiple last-minute cancellations (&lt; 4 hours before departure) or a reliability score below 50/100 flags the account for human support review.</li>
            </ul>
            <p className="pt-1">
              <strong>Emergency Appeals:</strong> Legitimate emergencies (hospitalization, mechanical breakdown,
              verified roadblocks or security closures) are eligible for emergency appeal. Approved appeals fully
              restore reliability points and lift cooling-off restrictions.
            </p>
          </div>
        </section>

        {/* 5. Prohibited Cargo & Conduct */}
        <section className="space-y-3">
          <h2 className="text-base font-extrabold text-slate-900">5. Safety & Prohibited Items</h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            The carriage of commercial freight, unaccompanied goods, illegal narcotics, unlicensed firearms,
            hazardous chemical substances, or contraband prohibited under the laws of the Islamic Republic of
            Pakistan is strictly forbidden. Both drivers and passengers must maintain professional courtesy,
            safety standards, and decorum at all times.
          </p>
        </section>

        {/* 6. Legal Compliance & Jurisdiction */}
        <section className="space-y-3">
          <h2 className="text-base font-extrabold text-slate-900">6. Governing Law</h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            These Terms are governed by and construed in accordance with the laws of Pakistan. Any dispute
            arising out of or in connection with this agreement shall be subject to amicable conciliation through
            our customer dispute resolution channel before seeking judicial recourse.
          </p>
        </section>

        {/* Footer */}
        <div className="pt-6 border-t border-slate-100 flex justify-between items-center text-xs text-slate-400">
          <span>ReturnRide Pakistan • Safe Intercity Travel</span>
          <Link href="/privacy" className="text-emerald-700 font-bold hover:underline">
            View Privacy Policy →
          </Link>
        </div>
      </div>
    </div>
  );
}
