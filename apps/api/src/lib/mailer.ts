const nodemailer: any = require('nodemailer');
import jwt from 'jsonwebtoken';
import ActivityModel, { ActivityType } from '../models/Activity';
import Tenant from '../models/Tenant';
import User from '../models/User';
import {
  welcomeEmailTemplate,
  emailVerificationTemplate,
  passwordResetTemplate,
  eventReminderTemplate,
  announcementTemplate,
  joinRequestApprovedTemplate,
} from './emailTemplates';
import { generateToken, hashToken, getTokenExpiry } from './tokenUtils';
import { getJwtSecret } from './jwtSecret';
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM || 'no-reply@qabeelah.com';
const API_BASE_URL = process.env.API_URL || 'http://localhost:3001/api';
const JWT_SECRET = getJwtSecret();

let transporter: any = null;

if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });
} else {
  console.warn('[MAILER] SMTP not configured - emails will be skipped');
}

type EmailJob = {
  to: string;
  subject: string;
  html: string;
  tenantId?: string;
  attempts?: number;
};

const queue: EmailJob[] = [];
let processing = false;

type PreferenceType = 'eventReminders' | 'announcements' | 'all';

const buildUnsubscribeToken = (email: string, type: PreferenceType) =>
  jwt.sign(
    {
      purpose: 'unsubscribe',
      email: email.toLowerCase().trim(),
      type,
    },
    JWT_SECRET,
    { expiresIn: '30d' }
  );

const buildUnsubscribeUrl = (email: string, type: PreferenceType) =>
  `${API_BASE_URL}/auth/unsubscribe?token=${buildUnsubscribeToken(email, type)}`;

const canSendEmail = async (email: string, preference: 'eventReminders' | 'announcements') => {
  const user = await User.findOne({ email: email.toLowerCase().trim() })
    .select('emailPreferences')
    .lean() as {
      emailPreferences?: {
        emailNotifications?: boolean;
        eventReminders?: boolean;
        announcements?: boolean;
      };
    } | null;

  if (!user || !user.emailPreferences) return true;

  const globalEnabled = user.emailPreferences.emailNotifications !== false;
  const specificEnabled = user.emailPreferences[preference] !== false;
  return globalEnabled && specificEnabled;
};

async function processQueue() {
  if (processing) return;
  processing = true;

  while (queue.length > 0) {
    const job = queue.shift()!;
    try {
      if (!transporter) throw new Error('SMTP not configured');
      await transporter.sendMail({ from: EMAIL_FROM, to: job.to, subject: job.subject, html: job.html });
      console.log('[MAILER] Sent email to', job.to);

      // Log activity if tenantId provided
      if (job.tenantId) {
        try {
          await ActivityModel.create({
            tenantId: job.tenantId,
            type: ActivityType.EMAIL_SENT as any,
            userId: job.tenantId, // use tenant as actor for system emails
            description: `Email sent to ${job.to}: ${job.subject}`
          });
        } catch (e) {
          console.error('Failed to log email-sent activity', e);
        }
      }
    } catch (err) {
      console.error('[MAILER] Failed to send email to', job.to, err);
      job.attempts = (job.attempts || 0) + 1;
      if (job.attempts < 3) {
        // simple retry with backoff
        setTimeout(() => queue.push(job), 1000 * job.attempts);
      } else {
        // final failure log
        if (job.tenantId) {
          try {
            const errorMessage = err instanceof Error ? err.message : String(err);
            await ActivityModel.create({
              tenantId: job.tenantId,
              type: ActivityType.EMAIL_FAILED as any,
              userId: job.tenantId,
              description: `Failed to send email to ${job.to}: ${errorMessage}`
            });
          } catch (e) {
            console.error('Failed to log email-failed activity', e);
          }
        }
      }
    }
  }

  processing = false;
}

// periodically ensure queue processed
setInterval(() => {
  if (queue.length > 0) processQueue();
}, 2000);

export async function sendWelcomeEmail(to: string, password: string, tenantId?: string, tenantName?: string) {
  const subject = `مرحبا بك في ${tenantName || 'قبيلة'}`;
  const appUrl = process.env.APP_URL || 'https://qabeelah.app';
  const html = welcomeEmailTemplate({
    email: to,
    password,
    tenantName: tenantName || 'قبيلة',
    loginUrl: `${appUrl}/login`,
    unsubscribeUrl: buildUnsubscribeUrl(to, 'all'),
  });

  if (!transporter) {
    console.warn('[MAILER] transporter missing, enqueueing no-op and logging skip for', to);
    if (tenantId) {
      try {
        await ActivityModel.create({
          tenantId,
          type: ActivityType.EMAIL_FAILED as any,
          userId: tenantId,
          description: `SMTP not configured, welcome email skipped for ${to}`
        });
      } catch (e) {
        console.error('Failed to log skipped email activity', e);
      }
    }
    return;
  }

  queue.push({ to, subject, html, tenantId, attempts: 0 });
  processQueue().catch((e) => console.error('Mailer queue error', e));
}

  /**
   * Send email verification email
   */
  export async function sendEmailVerificationEmail(
    to: string,
    verificationToken: string,
    verificationCode: string,
    tenantId?: string,
    tenantName?: string,
    appUrl?: string
  ) {
    const subject = `تأكيد بريدك الإلكتروني - ${tenantName || 'قبيلة'}`;
    const baseAppUrl = appUrl || 'https://qabeelah.app';
    const verificationUrl = `${baseAppUrl}/verify-email?token=${verificationToken}`;

    const html = emailVerificationTemplate({
      email: to,
      verificationUrl,
      tenantName: tenantName || 'قبيلة',
      code: verificationCode,
    });

    if (!transporter) {
      console.warn('[MAILER] transporter missing, skipping verification email for', to);
      return;
    }

    queue.push({ to, subject, html, tenantId, attempts: 0 });
    processQueue().catch((e) => console.error('Mailer queue error', e));
  }

  /**
   * Send password reset email
   */
  export async function sendPasswordResetEmail(
    to: string,
    resetToken: string,
    resetCode: string,
    tenantId?: string,
    tenantName?: string,
    appUrl?: string
  ) {
    const subject = `إعادة تعيين كلمة المرور - ${tenantName || 'قبيلة'}`;
    const baseAppUrl = appUrl || 'https://qabeelah.app';
    const resetUrl = `${baseAppUrl}/reset-password?token=${resetToken}`;

    const html = passwordResetTemplate({
      email: to,
      resetUrl,
      tenantName: tenantName || 'قبيلة',
      code: resetCode,
    });

    if (!transporter) {
      console.warn('[MAILER] transporter missing, skipping password reset email for', to);
      return;
    }

    queue.push({ to, subject, html, tenantId, attempts: 0 });
    processQueue().catch((e) => console.error('Mailer queue error', e));
  }

  /**
   * Send event reminder email
   */
  export async function sendEventReminderEmail(
    to: string,
    eventTitle: string,
    eventDate: string,
    eventLocation: string,
    eventDescription: string,
    tenantId?: string,
    tenantName?: string,
    appUrl?: string,
    eventId?: string
  ) {
    const allowed = await canSendEmail(to, 'eventReminders');
    if (!allowed) {
      console.log('[MAILER] Event reminder skipped by user preferences for', to);
      return;
    }

    const subject = `تذكير: ${eventTitle}`;
    const baseAppUrl = appUrl || 'https://qabeelah.app';
    const eventUrl = eventId ? `${baseAppUrl}/events/${eventId}` : baseAppUrl;

    const html = eventReminderTemplate({
      eventTitle,
      eventDate,
      eventLocation,
      eventDescription,
      eventUrl,
      tenantName: tenantName || 'قبيلة',
      unsubscribeUrl: buildUnsubscribeUrl(to, 'eventReminders'),
    });

    if (!transporter) {
      console.warn('[MAILER] transporter missing, skipping event reminder email for', to);
      return;
    }

    queue.push({ to, subject, html, tenantId, attempts: 0 });
    processQueue().catch((e) => console.error('Mailer queue error', e));
  }

  /**
   * Send announcement email
   */
  export async function sendAnnouncementEmail(
    to: string,
    title: string,
    message: string,
    tenantId?: string,
    tenantName?: string,
    appUrl?: string,
    contentId?: string
  ) {
    const allowed = await canSendEmail(to, 'announcements');
    if (!allowed) {
      console.log('[MAILER] Announcement skipped by user preferences for', to);
      return;
    }

    const subject = `📢 ${title}`;
    const baseAppUrl = appUrl || 'https://qabeelah.app';
    const contentUrl = contentId ? `${baseAppUrl}/announcements/${contentId}` : baseAppUrl;

    const html = announcementTemplate({
      title,
      message,
      contentUrl,
      tenantName: tenantName || 'قبيلة',
      unsubscribeUrl: buildUnsubscribeUrl(to, 'announcements'),
    });

    if (!transporter) {
      console.warn('[MAILER] transporter missing, skipping announcement email for', to);
      return;
    }

    queue.push({ to, subject, html, tenantId, attempts: 0 });
    processQueue().catch((e) => console.error('Mailer queue error', e));
  }

  /**
   * Send join request approved email
   */
  export async function sendJoinRequestApprovedEmail(
    to: string,
    memberName: string,
    tenantId?: string,
    tenantName?: string,
    appUrl?: string
  ) {
    const subject = `تم قبول طلب الانضمام - مرحبا بك في ${tenantName || 'قبيلة'}!`;
    const baseAppUrl = appUrl || 'https://qabeelah.app';
    const loginUrl = `${baseAppUrl}/login`;

    const html = joinRequestApprovedTemplate({
      memberName,
      tenantName: tenantName || 'قبيلة',
      loginUrl,
      unsubscribeUrl: buildUnsubscribeUrl(to, 'all'),
    });

    if (!transporter) {
      console.warn('[MAILER] transporter missing, skipping approval email for', to);
      return;
    }

    queue.push({ to, subject, html, tenantId, attempts: 0 });
    processQueue().catch((e) => console.error('Mailer queue error', e));
  }

  export async function sendLineageVerifiedEmail(
    to: string,
    memberName: string,
    tenantName?: string,
    notes?: string
  ) {
    const subject = `تم اعتماد التحقق من النسب - ${tenantName || 'قبيلة'}`;
    const html = `
      <div style="font-family: Arial, sans-serif; direction: rtl; text-align: right; line-height: 1.8; color: #1f2937;">
        <h2>تم اعتماد التحقق من النسب</h2>
        <p>مرحباً ${memberName}،</p>
        <p>تمت مراجعة مستندات النسب الخاصة بك واعتمادها في ${tenantName || 'قبيلة'}.</p>
        ${notes ? `<p><strong>ملاحظات المراجع:</strong> ${notes}</p>` : ''}
        <p>يمكنك الآن متابعة استخدام المنصة مع حالة عضوية محدثة.</p>
      </div>
    `;

    if (!transporter) {
      console.warn('[MAILER] transporter missing, skipping lineage verified email for', to);
      return;
    }

    queue.push({ to, subject, html, attempts: 0 });
    processQueue().catch((e) => console.error('Mailer queue error', e));
  }

  export async function sendLineageRejectedEmail(
    to: string,
    memberName: string,
    tenantName?: string,
    notes?: string
  ) {
    const subject = `تحديث حالة التحقق من النسب - ${tenantName || 'قبيلة'}`;
    const html = `
      <div style="font-family: Arial, sans-serif; direction: rtl; text-align: right; line-height: 1.8; color: #1f2937;">
        <h2>تمت مراجعة طلب التحقق من النسب</h2>
        <p>مرحباً ${memberName}،</p>
        <p>بعد المراجعة، لم يتم اعتماد التحقق من النسب حالياً في ${tenantName || 'قبيلة'}.</p>
        ${notes ? `<p><strong>ملاحظات المراجع:</strong> ${notes}</p>` : ''}
        <p>يرجى التواصل مع الإدارة إذا كنت ترغب في تقديم مستندات إضافية.</p>
      </div>
    `;

    if (!transporter) {
      console.warn('[MAILER] transporter missing, skipping lineage rejected email for', to);
      return;
    }

    queue.push({ to, subject, html, attempts: 0 });
    processQueue().catch((e) => console.error('Mailer queue error', e));
  }

  /**
   * Generate password reset token and code
   */
  export function generatePasswordResetToken(): { token: string; code: string; hash: string; expiry: number } {
    const token = generateToken(32);
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const hash = hashToken(token);
    const expiry = getTokenExpiry(3600); // 1 hour

    return { token, code, hash, expiry };
  }

  /**
   * Generate email verification token and code
   */
  export function generateEmailVerificationToken(): { token: string; code: string; hash: string; expiry: number } {
    const token = generateToken(32);
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const hash = hashToken(token);
    const expiry = getTokenExpiry(86400); // 24 hours

    return { token, code, hash, expiry };
  }
