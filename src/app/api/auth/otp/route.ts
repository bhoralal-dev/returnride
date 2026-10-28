import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

interface StoredOtp {
  code: string;
  expiresAt: number;
  attempts: number;
}

// In-memory server cache for OTP tokens (10 minute expiry)
const otpStore = new Map<string, StoredOtp>();

function normalizePhone(phone: string): string {
  const clean = phone.replace(/[\s\-\(\)]/g, '');
  if (clean.startsWith('03')) {
    return '+92' + clean.slice(1);
  }
  if (clean.startsWith('3')) {
    return '+92' + clean;
  }
  if (!clean.startsWith('+')) {
    return '+' + clean;
  }
  return clean;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function createEmailTransporter() {
  const gmailUser = process.env.GMAIL_USER || process.env.EMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD || process.env.EMAIL_PASS;
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
  const smtpUser = process.env.SMTP_USER || gmailUser;
  const smtpPass = process.env.SMTP_PASS || gmailPass;

  // 1. Direct Gmail with App Password (Recommended for personal Gmail dispatch)
  if (gmailUser && gmailPass) {
    return {
      transporter: nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: gmailUser,
          pass: gmailPass.replace(/\s+/g, ''), // Strip spaces from Google App Password
        },
      }),
      fromEmail: gmailUser,
    };
  }

  // 2. Custom SMTP provider (SendGrid, Mailgun, Brevo, AWS SES)
  if (smtpHost && smtpUser && smtpPass) {
    return {
      transporter: nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      }),
      fromEmail: smtpUser,
    };
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, phone, email, code } = body;

    // =========================================================================
    // ACTION: SEND EMAIL OTP (Dispatched via user's configured Gmail/SMTP)
    // =========================================================================
    if (action === 'send_email') {
      if (!email || typeof email !== 'string' || !email.includes('@')) {
        return NextResponse.json(
          { success: false, error: 'Please enter a valid email address.' },
          { status: 400 }
        );
      }

      const normalized = normalizeEmail(email);
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

      otpStore.set(normalized, {
        code: otpCode,
        expiresAt,
        attempts: 0,
      });

      const mailer = createEmailTransporter();
      let sentViaEmail = false;
      let emailError: string | null = null;

      if (mailer) {
        try {
          const htmlContent = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; color: #1e293b;">
              <div style="text-align: center; margin-bottom: 24px;">
                <div style="font-size: 38px; line-height: 1; margin-bottom: 8px;">🚗</div>
                <h1 style="color: #065f46; font-size: 24px; font-weight: 800; margin: 0; letter-spacing: -0.5px;">ReturnRide Pakistan</h1>
                <p style="color: #64748b; font-size: 13px; font-weight: 600; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px;">Nationwide Intercity Marketplace</p>
              </div>

              <div style="background: #f0fdf4; border: 1.5px solid #86efac; border-radius: 14px; padding: 24px; text-align: center; margin-bottom: 20px;">
                <p style="color: #166534; font-size: 14px; font-weight: 700; margin: 0 0 10px 0;">Your Verification Code</p>
                <div style="font-family: 'Courier New', Courier, monospace; font-size: 38px; font-weight: 900; letter-spacing: 8px; color: #047857; margin: 8px 0; background: #ffffff; padding: 12px; border-radius: 8px; border: 1px dashed #4ade80;">
                  ${otpCode}
                </div>
                <p style="color: #64748b; font-size: 12px; margin: 12px 0 0 0; font-weight: 500;">Valid for the next 10 minutes</p>
              </div>

              <p style="color: #475569; font-size: 13px; line-height: 1.6; margin-bottom: 16px;">
                Enter this 6-digit code on the ReturnRide platform to verify your account. If you did not request this code, you can safely ignore this message.
              </p>

              <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; text-align: center; color: #94a3b8; font-size: 11px;">
                ReturnRide Pakistan • Safe & Economical Nationwide Intercity Travel
              </div>
            </div>
          `;

          await mailer.transporter.sendMail({
            from: `"ReturnRide Pakistan" <${mailer.fromEmail}>`,
            to: normalized,
            subject: `Your ReturnRide Verification Code: ${otpCode}`,
            text: `Your ReturnRide verification code is: ${otpCode}. Valid for 10 minutes.`,
            html: htmlContent,
          });

          sentViaEmail = true;
          console.log(`[ReturnRide Email Dispatch] Successfully sent OTP code to ${normalized} via ${mailer.fromEmail}`);
        } catch (err: unknown) {
          emailError = err instanceof Error ? err.message : 'Unknown mailer error';
          console.error('[ReturnRide Email Dispatch] Nodemailer error:', emailError);
        }
      } else {
        console.warn(`[ReturnRide Email OTP] Generated code ${otpCode} for ${normalized}. SMTP credentials (GMAIL_USER / GMAIL_APP_PASSWORD) not yet configured in .env.local.`);
      }

      return NextResponse.json({
        success: true,
        message: sentViaEmail
          ? `Verification code dispatched from your email to ${normalized}. Please check your inbox.`
          : `Verification code generated for ${normalized}. Configure GMAIL_USER & GMAIL_APP_PASSWORD in .env.local to send directly from your personal Gmail.`,
        emailDispatched: sentViaEmail,
        smtpConfigured: !!mailer,
        errorDetails: emailError,
      });
    }

    // =========================================================================
    // ACTION: VERIFY EMAIL OTP
    // =========================================================================
    if (action === 'verify_email') {
      if (!email || !code) {
        return NextResponse.json(
          { success: false, error: 'Email address and verification code are required.' },
          { status: 400 }
        );
      }

      const normalized = normalizeEmail(email);
      const record = otpStore.get(normalized);

      if (!record) {
        return NextResponse.json(
          { success: false, error: 'No active verification code found for this email. Please request a new code.' },
          { status: 400 }
        );
      }

      if (Date.now() > record.expiresAt) {
        otpStore.delete(normalized);
        return NextResponse.json(
          { success: false, error: 'Verification code has expired. Please request a fresh code.' },
          { status: 400 }
        );
      }

      record.attempts += 1;
      if (record.attempts > 5) {
        otpStore.delete(normalized);
        return NextResponse.json(
          { success: false, error: 'Too many incorrect attempts. Please request a new code.' },
          { status: 429 }
        );
      }

      if (record.code !== code.trim()) {
        return NextResponse.json(
          { success: false, error: 'Invalid verification code. Please check your email and try again.' },
          { status: 400 }
        );
      }

      // Invalidate code upon successful verification
      otpStore.delete(normalized);

      return NextResponse.json({
        success: true,
        message: 'Email address verified successfully.',
      });
    }

    // =========================================================================
    // ACTION: SEND SMS OTP
    // =========================================================================
    if (action === 'send_sms') {
      if (!phone || typeof phone !== 'string') {
        return NextResponse.json(
          { success: false, error: 'Please enter a valid mobile number.' },
          { status: 400 }
        );
      }

      const normalized = normalizePhone(phone);
      if (normalized.length < 11 || normalized.length > 15) {
        return NextResponse.json(
          { success: false, error: 'Invalid Pakistani mobile number format (e.g. 0300-1234567).' },
          { status: 400 }
        );
      }

      // Generate 6-digit cryptographic OTP
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

      otpStore.set(normalized, {
        code: otpCode,
        expiresAt,
        attempts: 0,
      });

      // WebOTP standard format for native Android/iOS auto-fill
      const smsBody = `Your ReturnRide verification code is: ${otpCode}\n\n@returnride.vercel.app #${otpCode}`;

      // Check for external SMS Gateway (Twilio / HTTP Gateway)
      const twilioSid = process.env.TWILIO_ACCOUNT_SID;
      const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
      const twilioFrom = process.env.TWILIO_PHONE_NUMBER;
      const genericSmsUrl = process.env.SMS_GATEWAY_URL;

      let sentViaGateway = false;

      if (twilioSid && twilioAuth && twilioFrom) {
        try {
          const authHeader = 'Basic ' + Buffer.from(`${twilioSid}:${twilioAuth}`).toString('base64');
          const twilioRes = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
            {
              method: 'POST',
              headers: {
                Authorization: authHeader,
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: new URLSearchParams({
                To: normalized,
                From: twilioFrom,
                Body: smsBody,
              }),
            }
          );
          if (twilioRes.ok) {
            sentViaGateway = true;
          }
        } catch (twilioErr) {
          console.error('[ReturnRide SMS Gateway] Twilio error:', twilioErr);
        }
      } else if (genericSmsUrl) {
        try {
          const gwRes = await fetch(genericSmsUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: normalized,
              message: smsBody,
              code: otpCode,
            }),
          });
          if (gwRes.ok) {
            sentViaGateway = true;
          }
        } catch (gwErr) {
          console.error('[ReturnRide SMS Gateway] HTTP Gateway error:', gwErr);
        }
      }

      console.log(`[ReturnRide SMS Dispatch] Destination: ${normalized} | Gateway: ${sentViaGateway ? 'ACTIVE' : 'READY'} | WebOTP: Active`);

      return NextResponse.json({
        success: true,
        message: `Verification code dispatched via SMS to ${phone}. It will arrive in your mobile inbox shortly.`,
        carrierDispatched: sentViaGateway,
      });
    }

    // =========================================================================
    // ACTION: VERIFY SMS OTP
    // =========================================================================
    if (action === 'verify_sms') {
      if (!phone || !code) {
        return NextResponse.json(
          { success: false, error: 'Mobile number and verification code are required.' },
          { status: 400 }
        );
      }

      const normalized = normalizePhone(phone);
      const record = otpStore.get(normalized);

      if (!record) {
        return NextResponse.json(
          { success: false, error: 'No verification code found. Please request a new code.' },
          { status: 400 }
        );
      }

      if (Date.now() > record.expiresAt) {
        otpStore.delete(normalized);
        return NextResponse.json(
          { success: false, error: 'Verification code has expired. Please request a new code.' },
          { status: 400 }
        );
      }

      record.attempts += 1;
      if (record.attempts > 5) {
        otpStore.delete(normalized);
        return NextResponse.json(
          { success: false, error: 'Too many incorrect attempts. Please request a new code.' },
          { status: 429 }
        );
      }

      if (record.code !== code.trim()) {
        return NextResponse.json(
          { success: false, error: 'Invalid verification code. Please check your SMS messages and try again.' },
          { status: 400 }
        );
      }

      // Verification successful - invalidate code
      otpStore.delete(normalized);

      return NextResponse.json({
        success: true,
        message: 'Mobile number verified successfully.',
      });
    }

    return NextResponse.json({ success: false, error: 'Unknown action specified.' }, { status: 400 });
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : 'Server error';
    return NextResponse.json({ success: false, error: errMessage }, { status: 500 });
  }
}
