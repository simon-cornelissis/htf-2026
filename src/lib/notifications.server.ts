import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { sendNotification, setVapidDetails } from 'web-push'
import { db } from '#/db/index.ts'
import { guardians, notificationPreferences, notifications, pushSubscriptions } from '#/db/schema.ts'

export type CriticalAlert = {
  eventKey: string
  kind: 'CRITICAL_REPORT' | 'BOMB_ARMED' | 'BOMB_DETONATED' | 'SENSOR_ANOMALY'
  title: string
  body: string
  href: string
}

export function notificationConfig() {
  const pushPublicKey = process.env.WEB_PUSH_PUBLIC_KEY?.trim() ?? ''
  return {
    pushPublicKey,
    pushAvailable: Boolean(pushPublicKey && process.env.WEB_PUSH_PRIVATE_KEY && process.env.WEB_PUSH_SUBJECT),
    emailAvailable: Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL),
    smsAvailable: Boolean(
      process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER,
    ),
  }
}

export function publishCriticalAlert(alert: CriticalAlert) {
  let recipients: Array<{ guardianId: string }>
  try {
    recipients = db.select({ guardianId: guardians.guardianId }).from(guardians).all()
  } catch (error) {
    console.error(`[notifications:in-app] Could not find recipients for ${alert.eventKey}: ${errorMessage(error)}`)
    return
  }

  for (const recipient of recipients) {
    let preference
    try {
      preference = db
        .select()
        .from(notificationPreferences)
        .where(eq(notificationPreferences.guardianId, recipient.guardianId))
        .get()
    } catch (error) {
      console.error(`[notifications:preferences] Could not load ${recipient.guardianId}: ${errorMessage(error)}`)
      continue
    }
    const inApp = preference?.inApp ?? true

    if (inApp) {
      try {
        db.insert(notifications)
          .values({
            notificationId: randomUUID(),
            guardianId: recipient.guardianId,
            eventKey: alert.eventKey,
            kind: alert.kind,
            title: alert.title,
            body: alert.body,
            href: alert.href,
            createdAt: new Date().toISOString(),
            readAt: null,
          })
          .onConflictDoNothing()
          .run()
      } catch (error) {
        console.error(`[notifications:in-app] Could not store ${alert.eventKey}: ${errorMessage(error)}`)
      }
    }

    if (preference?.push && notificationConfig().pushAvailable) {
      try {
        const subscriptions = db
          .select()
          .from(pushSubscriptions)
          .where(eq(pushSubscriptions.guardianId, recipient.guardianId))
          .all()
        for (const subscription of subscriptions) {
          deliver('push', alert.eventKey, () => sendPush(alert, subscription))
        }
      } catch (error) {
        console.error(`[notifications:push] Could not load subscriptions for ${recipient.guardianId}: ${errorMessage(error)}`)
      }
    }
    if (preference?.email && preference.emailAddress && notificationConfig().emailAvailable) {
      deliver('email', alert.eventKey, () => sendEmail(alert, preference.emailAddress!))
    }
    if (preference?.sms && preference.phoneNumber && notificationConfig().smsAvailable) {
      deliver('sms', alert.eventKey, () => sendSms(alert, preference.phoneNumber!))
    }
  }
}

function deliver(channel: string, eventKey: string, send: () => Promise<void>) {
  void send().catch((error: unknown) => {
    console.error(`[notifications:${channel}] Could not deliver ${eventKey}: ${errorMessage(error)}`)
  })
}

async function sendPush(
  alert: CriticalAlert,
  subscription: { subscriptionId: string; endpoint: string; p256dh: string; auth: string },
) {
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY!.trim()
  setVapidDetails(
    process.env.WEB_PUSH_SUBJECT!.trim(),
    publicKey,
    process.env.WEB_PUSH_PRIVATE_KEY!.trim(),
  )
  try {
    await sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify({ title: alert.title, body: alert.body, url: alert.href, eventKey: alert.eventKey }),
      { TTL: 3600, urgency: 'high' },
    )
  } catch (error) {
    const statusCode = typeof error === 'object' && error && 'statusCode' in error ? error.statusCode : undefined
    if (statusCode === 404 || statusCode === 410) {
      db.delete(pushSubscriptions)
        .where(eq(pushSubscriptions.subscriptionId, subscription.subscriptionId))
        .run()
      return
    }
    throw error
  }
}

async function sendEmail(alert: CriticalAlert, to: string) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL,
      to: [to],
      subject: alert.title,
      text: `${alert.body}\n\nOpen the incident: ${new URL(alert.href, process.env.APP_BASE_URL ?? 'http://localhost:3000').href}`,
    }),
    signal: AbortSignal.timeout(8_000),
  })
  if (!response.ok) throw new Error(`Resend returned HTTP ${response.status}.`)
}

async function sendSms(alert: CriticalAlert, to: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID!.trim()
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      From: process.env.TWILIO_FROM_NUMBER!,
      To: to,
      Body: `${alert.title}: ${alert.body}`,
    }),
    signal: AbortSignal.timeout(8_000),
  })
  if (!response.ok) throw new Error(`Twilio returned HTTP ${response.status}.`)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
