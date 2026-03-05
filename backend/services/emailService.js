/**
 * Email Service — Maxy Grand Hotel
 * ==================================
 * Centralised email delivery via Resend SDK.
 * All transactional emails go through this module.
 *
 * Resend docs: https://resend.com/docs/send-with-nodejs
 *
 * Required env:
 *   RESEND_API_KEY  — from resend.com/api-keys
 *
 * Sender domain must be verified in the Resend dashboard.
 * Use: support@maxygrandhotel.com
 */

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_ADDRESS = '"Maxy Grand Hotel" <info@official.maxygrandhotel.com>';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Low-level send wrapper.
 * Throws on failure so callers can decide how to handle it.
 */
async function send({ to, subject, html }) {
    const { data, error } = await resend.emails.send({
        from:    FROM_ADDRESS,
        to,
        subject,
        html,
    });

    if (error) {
        console.error(`[EmailService] Resend error → ${subject} → ${to}:`, error.message);
        throw new Error(error.message);
    }

    console.log(`[EmailService] Sent "${subject}" → ${to} (id: ${data.id})`);
    return data;
}

// ─── Branded layout wrapper ───────────────────────────────────────────────────

function layout(bodyHtml) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Maxy Grand Hotel</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
             style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08);max-width:600px;width:100%;">
        <!-- Header -->
        <tr>
          <td style="background:#1a1a2e;padding:36px 40px;text-align:center;">
            <h1 style="margin:0;color:#d4af37;font-size:28px;font-weight:bold;letter-spacing:3px;">MAXY GRAND</h1>
            <p style="margin:6px 0 0;color:#888;font-size:12px;letter-spacing:2px;">HOTEL &amp; RESORT</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px 40px 32px;">
            ${bodyHtml}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f8f9fa;padding:20px 40px;text-align:center;border-top:1px solid #eee;">
            <p style="margin:0 0 4px;color:#999;font-size:12px;font-weight:bold;">Maxy Grand Hotel &amp; Resort</p>
            <p style="margin:0;color:#bbb;font-size:11px;">Automated message — please do not reply.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Public Exports ────────────────────────────────────────────────────────────

/**
 * Send a password reset link email.
 * Called by: forgotPassword controller (public route).
 *
 * @param {string} email      Recipient email address
 * @param {string} firstName  Recipient first name
 * @param {string} resetLink  Full URL including raw token query param
 */
export async function sendPasswordResetEmail(email, firstName, resetLink) {
    const html = layout(`
        <h2 style="margin:0 0 20px;color:#1a1a2e;font-size:22px;">Reset Your Password</h2>
        <p style="margin:0 0 12px;color:#555;font-size:15px;line-height:1.7;">Hi ${firstName},</p>
        <p style="margin:0 0 28px;color:#555;font-size:15px;line-height:1.7;">
          We received a request to reset your Maxy Grand account password.
          Click the button below to choose a new password:
        </p>
        <!-- CTA Button -->
        <table cellpadding="0" cellspacing="0" style="margin:0 auto 32px;">
          <tr>
            <td align="center" bgcolor="#d4af37" style="border-radius:6px;">
              <a href="${resetLink}"
                 style="display:inline-block;padding:15px 40px;color:#1a1a2e;text-decoration:none;font-size:15px;font-weight:bold;border-radius:6px;">
                Reset My Password
              </a>
            </td>
          </tr>
        </table>
        <!-- Expiry notice -->
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px;">
          <tr>
            <td style="background:#fff8e1;border-left:4px solid #d4af37;padding:14px 18px;border-radius:0 6px 6px 0;">
              <p style="margin:0;color:#7a6000;font-size:14px;">
                &#9201;&nbsp; This link expires in <strong>30 minutes</strong>.
              </p>
            </td>
          </tr>
        </table>
        <!-- Fallback link -->
        <p style="margin:0 0 6px;color:#888;font-size:13px;">If the button doesn't work, copy and paste this link:</p>
        <p style="margin:0 0 28px;word-break:break-all;">
          <a href="${resetLink}" style="color:#1a1a2e;font-size:13px;">${resetLink}</a>
        </p>
        <!-- Security note -->
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr>
            <td style="background:#f8f9fa;border-radius:6px;padding:18px 20px;">
              <p style="margin:0;color:#666;font-size:13px;line-height:1.7;">
                &#128274; <strong>Didn't request this?</strong> Ignore this email — your password won't change and your account remains secure.
              </p>
            </td>
          </tr>
        </table>
    `);

    return send({
        to:      email,
        subject: 'Reset Your Password — Maxy Grand Hotel',
        html,
    });
}

/**
 * Send a 6-digit OTP for in-app password reset or email change verification.
 * Called by: requestPasswordReset controller (protected route) and guestProfileController.
 *
 * @param {string} email    Recipient email address
 * @param {string} firstName Recipient first name
 * @param {string} otp      6-digit OTP code
 * @param {string} [purpose] 'password-reset' | 'email-change' (default: 'password-reset')
 */
export async function sendOTPEmail(email, firstName, otp, purpose = 'password-reset') {
    const isEmailChange = purpose === 'email-change';

    const subject = isEmailChange
        ? 'Email Change Verification — Maxy Grand Hotel'
        : 'Your Password Reset Code — Maxy Grand Hotel';

    const heading = isEmailChange ? 'Email Change Request' : 'Password Reset Code';
    const intro   = isEmailChange
        ? 'You requested to change your email address. Use the code below to confirm:'
        : 'You requested to reset your password. Use the one-time code below:';

    const html = layout(`
        <h2 style="margin:0 0 20px;color:#1a1a2e;font-size:22px;">${heading}</h2>
        <p style="margin:0 0 12px;color:#555;font-size:15px;line-height:1.7;">Hi ${firstName},</p>
        <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.7;">${intro}</p>
        <!-- OTP Display -->
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px;">
          <tr>
            <td style="background:#f0f0f0;border-radius:8px;padding:24px;text-align:center;">
              <span style="color:#1a1a2e;font-size:38px;font-weight:bold;letter-spacing:10px;font-family:monospace;">${otp}</span>
            </td>
          </tr>
        </table>
        <!-- Expiry notice -->
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px;">
          <tr>
            <td style="background:#fff8e1;border-left:4px solid #d4af37;padding:14px 18px;border-radius:0 6px 6px 0;">
              <p style="margin:0;color:#7a6000;font-size:14px;">
                &#9201;&nbsp; This code is valid for <strong>10 minutes</strong> only.
              </p>
            </td>
          </tr>
        </table>
        <!-- Security note -->
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr>
            <td style="background:#f8f9fa;border-radius:6px;padding:18px 20px;">
              <p style="margin:0;color:#666;font-size:13px;line-height:1.7;">
                &#128274; <strong>Didn't request this?</strong> Ignore this email — your account is secure.
              </p>
            </td>
          </tr>
        </table>
    `);

    return send({ to: email, subject, html });
}

/**
 * Send a confirmation email after a successful password reset.
 * Called by: confirmResetPassword controller (fire-and-forget).
 *
 * @param {string} email      Recipient email address
 * @param {string} firstName  Recipient first name
 */
export async function sendPasswordChangedConfirmation(email, firstName) {
    const html = layout(`
        <h2 style="margin:0 0 20px;color:#1a1a2e;font-size:22px;">Password Changed Successfully</h2>
        <p style="margin:0 0 12px;color:#555;font-size:15px;line-height:1.7;">Hi ${firstName},</p>
        <p style="margin:0 0 28px;color:#555;font-size:15px;line-height:1.7;">
          Your Maxy Grand account password has been successfully updated.
          You can now log in with your new password.
        </p>
        <!-- Security warning -->
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr>
            <td style="background:#fff3f3;border-left:4px solid #e53e3e;padding:18px 20px;border-radius:0 6px 6px 0;">
              <p style="margin:0;color:#c53030;font-size:14px;line-height:1.7;">
                &#9888;&nbsp; <strong>Wasn't you?</strong> Your account may be compromised.
                Please contact our support team immediately at
                <a href="mailto:info@official.maxygrandhotel.com" style="color:#c53030;">info@official.maxygrandhotel.com</a>.
              </p>
            </td>
          </tr>
        </table>
    `);

    return send({
        to:      email,
        subject: 'Your Password Has Been Changed — Maxy Grand Hotel',
        html,
    });
}

/**
 * Send a post-checkout review invitation email.
 * Called non-blocking (via setImmediate) inside checkOutGuest controller.
 *
 * @param {string} email       Guest email address
 * @param {string} guestName   Guest's full name
 * @param {object} booking     Booking document (checkInDate, checkOutDate, confirmationCode)
 * @param {string} reviewLink  One-time review URL with raw token
 */
export async function sendReviewInvitationEmail(email, guestName, booking, reviewLink) {
    const firstName = guestName ? guestName.split(' ')[0] : 'Guest';

    const fmt = (d) =>
        new Date(d).toLocaleDateString('en-US', {
            weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
        });

    const checkIn  = booking.checkInDate  ? fmt(booking.checkInDate)  : '—';
    const checkOut = booking.checkOutDate ? fmt(booking.checkOutDate) : '—';

    const html = layout(`
        <h2 style="margin:0 0 20px;color:#1a1a2e;font-size:22px;">How Was Your Stay?</h2>
        <p style="margin:0 0 12px;color:#555;font-size:15px;line-height:1.7;">Dear ${firstName},</p>
        <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.7;">
          Thank you for choosing <strong>Maxy Grand Hotel</strong>. We hope your recent stay was exceptional.
          We'd love to hear about your experience — your feedback helps us serve every guest better.
        </p>
        <!-- Stay summary -->
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:28px;">
          <tr>
            <td style="background:#f8f9fa;border-radius:8px;padding:18px 20px;">
              <p style="margin:0 0 8px;color:#1a1a2e;font-size:14px;font-weight:bold;">Your Stay Summary</p>
              <p style="margin:0 0 4px;color:#666;font-size:14px;">&#128197;&nbsp; Check-in: <strong>${checkIn}</strong></p>
              <p style="margin:0 0 4px;color:#666;font-size:14px;">&#128197;&nbsp; Check-out: <strong>${checkOut}</strong></p>
            </td>
          </tr>
        </table>
        <!-- CTA Button -->
        <table cellpadding="0" cellspacing="0" style="margin:0 auto 32px;">
          <tr>
            <td align="center" bgcolor="#d4af37" style="border-radius:6px;">
              <a href="${reviewLink}"
                 style="display:inline-block;padding:16px 44px;color:#1a1a2e;text-decoration:none;font-size:16px;font-weight:bold;border-radius:6px;">
                &#11088; Leave a Review
              </a>
            </td>
          </tr>
        </table>
        <!-- Expiry notice -->
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px;">
          <tr>
            <td style="background:#fff8e1;border-left:4px solid #d4af37;padding:14px 18px;border-radius:0 6px 6px 0;">
              <p style="margin:0;color:#7a6000;font-size:14px;">
                &#9201;&nbsp; This link is valid for <strong>7 days</strong> and can only be used once.
              </p>
            </td>
          </tr>
        </table>
        <!-- Fallback link -->
        <p style="margin:0 0 6px;color:#888;font-size:13px;">If the button doesn't work, copy and paste this link:</p>
        <p style="margin:0 0 28px;word-break:break-all;">
          <a href="${reviewLink}" style="color:#1a1a2e;font-size:13px;">${reviewLink}</a>
        </p>
        <!-- Support note -->
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr>
            <td style="background:#f8f9fa;border-radius:6px;padding:18px 20px;">
              <p style="margin:0;color:#666;font-size:13px;line-height:1.7;">
                Questions or concerns? Reach us at
                <a href="mailto:info@official.maxygrandhotel.com" style="color:#1a1a2e;">info@official.maxygrandhotel.com</a>.
                We look forward to welcoming you back.
              </p>
            </td>
          </tr>
        </table>
    `);

    return send({
        to:      email,
        subject: 'Share Your Experience — Maxy Grand Hotel',
        html,
    });
}
