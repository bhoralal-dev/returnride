<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## LOCKED SYSTEM BEHAVIORS & NO-REGRESSION INVARIANTS (STRICT)

The following core behaviors are locked and MUST NEVER be regressed, removed, or bypassed under any circumstances:

### 1. Authentication & Unified Registration
- **MasterMox Unified UI**: Sign In is default tab; "Create Free Account ➔" switches to registration.
- **Single Identifier Input**: Seamlessly detects Email vs. Pakistani Mobile (`03xx-xxxxxxx` or `+923xx-xxxxxxx`).
- **OTP Verification is 100% Mandatory**:
  - No direct/instant signups without OTP verification.
  - If Phone: Dispatches real SIM SMS OTP via TextBee Android SIM Gateway.
  - If Email: Dispatches real Email OTP via Nodemailer / SMTP.
  - The verification code MUST be validated before creating the account in database.

### 2. Driver Verification & Vehicle Mandatory Security
- **No Dummy Auto-fills**: Vehicle make/model and license plate MUST start empty (`""`) with placeholders. Never auto-fill dummy values (`Toyota Corolla`, `LEB-4592`).
- **Mandatory Driver Fields**:
  - 13-digit Pakistani CNIC (`formatPakistaniCnic` & `validatePakistaniCnic`) with `xxxxx-xxxxxxx-x` auto-hyphenation.
  - Driving License number (`DL-xxxx-xxxxx`).
  - Emergency family relative contact (`03xx-xxxxxxx`) for accident & motorway safety tracing.
  - Vehicle make & model, registration plate, car color, seat capacity, AC availability.
- **Enforced Across**: Registration modal, "Offer a Ride" (Step 1 Vehicle Setup), and Driver Profile.

### 3. Booking & Reliability Engines
- All 24 unit tests in `npm test` must always pass.
- Repeat cancellation prevention & cooling-off periods must remain intact.

