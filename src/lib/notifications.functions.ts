import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { db } from '#/db/index.ts'
import { notificationPreferences, notifications, pushSubscriptions } from '#/db/schema.ts'
import { requireGuardian } from '#/lib/session.ts'
import { notificationConfig } from '#/lib/notifications.server.ts'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_PATTERN = /^\+[1-9]\d{7,14}$/

export const getNotificationCenter = createServerFn({ method: 'GET' }).handler(async () => {
  const guardian = requireGuardian()
  const preferences = db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.guardianId, guardian.guardianId))
    .get()
  const inbox = db
    .select()
    .from(notifications)
    .where(eq(notifications.guardianId, guardian.guardianId))
    .orderBy(desc(notifications.createdAt))
    .limit(50)
    .all()
  const unread = db
    .select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(and(eq(notifications.guardianId, guardian.guardianId), isNull(notifications.readAt)))
    .get()?.count ?? 0
  const pushSubscriptionsForGuardian = db
    .select({ subscriptionId: pushSubscriptions.subscriptionId })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.guardianId, guardian.guardianId))
    .all()

  return {
    settings: {
      inApp: preferences?.inApp ?? true,
      push: preferences?.push ?? false,
      email: preferences?.email ?? false,
      sms: preferences?.sms ?? false,
      emailAddress: preferences?.emailAddress ?? '',
      phoneNumber: preferences?.phoneNumber ?? '',
    },
    notifications: inbox,
    unread,
    pushSubscriptionCount: pushSubscriptionsForGuardian.length,
    channels: notificationConfig(),
  }
})

export const saveNotificationPreferences = createServerFn({ method: 'POST' })
  .validator((input: {
    inApp: boolean
    push: boolean
    email: boolean
    sms: boolean
    emailAddress: string
    phoneNumber: string
  }) => {
    if (
      !input ||
      typeof input.inApp !== 'boolean' ||
      typeof input.push !== 'boolean' ||
      typeof input.email !== 'boolean' ||
      typeof input.sms !== 'boolean'
    ) {
      throw new Error('Choose valid notification preferences.')
    }
    const emailAddress = String(input.emailAddress ?? '').trim().toLowerCase()
    const phoneNumber = String(input.phoneNumber ?? '').trim()
    const config = notificationConfig()

    if (emailAddress.length > 254 || (emailAddress && !EMAIL_PATTERN.test(emailAddress))) {
      throw new Error('Enter a valid email address.')
    }
    if (phoneNumber.length > 16 || (phoneNumber && !PHONE_PATTERN.test(phoneNumber))) {
      throw new Error('Enter a phone number in international format, e.g. +32470123456.')
    }
    if (input.push && !config.pushAvailable) throw new Error('Web Push is not configured on this server yet.')
    if (input.email && !config.emailAvailable) throw new Error('Email delivery is not configured on this server yet.')
    if (input.sms && !config.smsAvailable) throw new Error('SMS delivery is not configured on this server yet.')
    if (input.email && !emailAddress) throw new Error('Add an email address before enabling email alerts.')
    if (input.sms && !phoneNumber) throw new Error('Add a phone number before enabling SMS alerts.')

    return { ...input, emailAddress: emailAddress || null, phoneNumber: phoneNumber || null }
  })
  .handler(async ({ data }) => {
    const guardian = requireGuardian()
    if (data.push) {
      const subscription = db
        .select({ subscriptionId: pushSubscriptions.subscriptionId })
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.guardianId, guardian.guardianId))
        .get()
      if (!subscription) throw new Error('Enable push on this device before saving push alerts.')
    }

    db.insert(notificationPreferences)
      .values({ guardianId: guardian.guardianId, ...data, updatedAt: new Date().toISOString() })
      .onConflictDoUpdate({
        target: notificationPreferences.guardianId,
        set: {
          inApp: data.inApp,
          push: data.push,
          email: data.email,
          sms: data.sms,
          emailAddress: data.emailAddress,
          phoneNumber: data.phoneNumber,
          updatedAt: new Date().toISOString(),
        },
      })
      .run()
  })

export const markNotificationRead = createServerFn({ method: 'POST' })
  .validator((notificationId: string) => {
    if (typeof notificationId !== 'string' || notificationId.length > 64) throw new Error('Invalid notification.')
    return notificationId
  })
  .handler(async ({ data: notificationId }) => {
    const guardian = requireGuardian()
    db.update(notifications)
      .set({ readAt: new Date().toISOString() })
      .where(
        and(
          eq(notifications.notificationId, notificationId),
          eq(notifications.guardianId, guardian.guardianId),
          isNull(notifications.readAt),
        ),
      )
      .run()
  })

export const markAllNotificationsRead = createServerFn({ method: 'POST' }).handler(async () => {
  const guardian = requireGuardian()
  db.update(notifications)
    .set({ readAt: new Date().toISOString() })
    .where(and(eq(notifications.guardianId, guardian.guardianId), isNull(notifications.readAt)))
    .run()
})

export const savePushSubscription = createServerFn({ method: 'POST' })
  .validator((input: { endpoint: string; keys: { p256dh: string; auth: string } }) => {
    if (!input || typeof input.endpoint !== 'string' || !input.keys) {
      throw new Error('The browser returned an invalid push subscription.')
    }
    let endpoint: URL
    try {
      endpoint = new URL(input.endpoint)
    } catch {
      throw new Error('The browser returned an invalid push endpoint.')
    }
    const host = endpoint.hostname.toLowerCase()
    const trustedHost =
      host === 'fcm.googleapis.com' ||
      host === 'web.push.apple.com' ||
      host.endsWith('.push.apple.com') ||
      host.endsWith('.push.services.mozilla.com')
    if (endpoint.protocol !== 'https:' || !trustedHost || endpoint.href.length > 2048) {
      throw new Error('The browser returned an unsupported push endpoint.')
    }
    if (
      !input.keys ||
      !/^[A-Za-z0-9_-]{40,200}$/.test(input.keys.p256dh) ||
      !/^[A-Za-z0-9_-]{16,100}$/.test(input.keys.auth)
    ) {
      throw new Error('The browser returned invalid push keys.')
    }
    return { endpoint: endpoint.href, keys: input.keys }
  })
  .handler(async ({ data }) => {
    const guardian = requireGuardian()
    if (!notificationConfig().pushAvailable) throw new Error('Web Push is not configured on this server yet.')
    const existing = db
      .select({ guardianId: pushSubscriptions.guardianId })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, data.endpoint))
      .get()
    if (existing && existing.guardianId !== guardian.guardianId) {
      throw new Error('This browser subscription is linked to another guardian. Remove it there first.')
    }
    db.insert(pushSubscriptions)
      .values({
        subscriptionId: randomUUID(),
        guardianId: guardian.guardianId,
        endpoint: data.endpoint,
        p256dh: data.keys.p256dh,
        auth: data.keys.auth,
        createdAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { p256dh: data.keys.p256dh, auth: data.keys.auth },
      })
      .run()
  })

export const removePushSubscription = createServerFn({ method: 'POST' })
  .validator((endpoint: string) => {
    if (typeof endpoint !== 'string' || endpoint.length > 2048) throw new Error('Invalid push endpoint.')
    return endpoint
  })
  .handler(async ({ data: endpoint }) => {
    const guardian = requireGuardian()
    const existing = db
      .select({ guardianId: pushSubscriptions.guardianId })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint))
      .get()
    if (existing && existing.guardianId !== guardian.guardianId) {
      throw new Error('This browser subscription belongs to another guardian.')
    }
    if (!existing) return false
    db.delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.guardianId, guardian.guardianId)))
      .run()
    return true
  })
