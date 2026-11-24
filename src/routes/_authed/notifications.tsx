import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useEffect, useState, type FormEvent } from 'react'
import { Bell, Check, Save } from 'lucide-react'
import {
  getNotificationCenter,
  markAllNotificationsRead,
  markNotificationRead,
  removePushSubscription,
  saveNotificationPreferences,
  savePushSubscription,
} from '#/lib/notifications.functions.ts'

export const Route = createFileRoute('/_authed/notifications')({
  loader: () => getNotificationCenter(),
  head: () => ({ meta: [{ title: 'Notifications · Guardians of the Grid' }] }),
  component: NotificationsPage,
})

type Settings = Awaited<ReturnType<typeof getNotificationCenter>>['settings']

function NotificationsPage() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const [settings, setSettings] = useState<Settings>(data.settings)
  const [subscriptionCount, setSubscriptionCount] = useState(data.pushSubscriptionCount)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setSettings(data.settings)
    setSubscriptionCount(data.pushSubscriptionCount)
  }, [data.settings, data.pushSubscriptionCount])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      if (settings.push) {
        await enablePush(data.channels.pushPublicKey)
        setSubscriptionCount((count) => Math.max(count, 1))
      } else if (data.settings.push) {
        await disableCurrentDevicePush()
        setSubscriptionCount((count) => Math.max(0, count - 1))
      }
      await saveNotificationPreferences({ data: settings })
      setSaved(true)
      await router.invalidate()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save your notification settings.')
    } finally {
      setBusy(false)
    }
  }

  async function markRead(notificationId: string) {
    setError(null)
    try {
      await markNotificationRead({ data: notificationId })
      await router.invalidate()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not mark that alert as read.')
    }
  }

  async function markAllRead() {
    setError(null)
    try {
      await markAllNotificationsRead()
      await router.invalidate()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not mark alerts as read.')
    }
  }

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((current) => ({ ...current, [key]: value }))
    setSaved(false)
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <header>
        <h1 className="stamp flex items-center gap-3 text-2xl font-bold">
          <Bell className="size-6" />
          Critical alerts
        </h1>
        <p className="mt-2 text-xl leading-tight text-[#d8d3a6]">
          Choose how Achrona reaches you when a critical report arrives or a device is armed or detonates.
        </p>
      </header>

      <section aria-labelledby="preferences-heading" className="metal rivets p-5">
        <h2 id="preferences-heading" className="stamp mb-4 text-lg font-bold">Your preferences</h2>
        <form onSubmit={save} className="flex flex-col gap-5">
          <Toggle
            checked={settings.inApp}
            label="In-app inbox"
            help="Keep critical alerts in your notification centre."
            onChange={(value) => update('inApp', value)}
          />

          <div className="border-t border-edge pt-4">
            <Toggle
              checked={settings.push}
              disabled={!data.channels.pushAvailable}
              label="Browser push"
              help={
                data.channels.pushAvailable
                  ? `Send alerts to this browser. ${subscriptionCount} browser${subscriptionCount === 1 ? '' : 's'} linked.`
                  : 'Web Push needs VAPID keys configured on the server.'
              }
              onChange={(value) => update('push', value)}
            />
          </div>

          <div className="grid gap-3 border-t border-edge pt-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className="block">
              <span className="label mb-2 block">Email address</span>
              <input
                type="email"
                maxLength={254}
                autoComplete="email"
                value={settings.emailAddress}
                onChange={(event) => update('emailAddress', event.currentTarget.value)}
                placeholder="you@example.com"
                className="inset w-full px-3 py-2 text-lg"
              />
            </label>
            <Toggle
              checked={settings.email}
              disabled={!data.channels.emailAvailable}
              label="Email alerts"
              help={data.channels.emailAvailable ? 'Sent through Resend.' : 'Resend is not configured on the server.'}
              onChange={(value) => update('email', value)}
            />
          </div>

          <div className="grid gap-3 border-t border-edge pt-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className="block">
              <span className="label mb-2 block">Phone number</span>
              <input
                type="tel"
                maxLength={16}
                autoComplete="tel"
                value={settings.phoneNumber}
                onChange={(event) => update('phoneNumber', event.currentTarget.value)}
                placeholder="+32470123456"
                className="inset w-full px-3 py-2 text-lg"
              />
              <span className="mt-1 block text-sm text-ink-dim">Use international format, including the +country code.</span>
            </label>
            <Toggle
              checked={settings.sms}
              disabled={!data.channels.smsAvailable}
              label="SMS alerts"
              help={data.channels.smsAvailable ? 'Sent through Twilio.' : 'Twilio is not configured on the server.'}
              onChange={(value) => update('sms', value)}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-edge pt-4">
            <p aria-live="polite" className="text-sm text-[#ff8a6a]">{error ?? (saved ? 'Preferences saved.' : '')}</p>
            <button type="submit" disabled={busy} className="btn flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-50">
              {saved ? <Check className="size-4" /> : <Save className="size-4" />}
              {busy ? 'Saving…' : 'Save preferences'}
            </button>
          </div>
        </form>
      </section>

      <section aria-labelledby="inbox-heading" className="metal rivets p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id="inbox-heading" className="stamp text-lg font-bold">
            Inbox <span className="text-amber">({data.unread} unread)</span>
          </h2>
          {data.unread > 0 && (
            <button type="button" onClick={markAllRead} className="btn px-3 py-1.5 text-xs">
              Mark all read
            </button>
          )}
        </div>
        {data.notifications.length === 0 ? (
          <div className="crt px-4 py-8 text-center text-lg text-phos-dim">
            &gt; NO CRITICAL ALERTS. YOU’RE ALL CAUGHT UP.
          </div>
        ) : (
          <ol className="flex flex-col gap-3">
            {data.notifications.map((notification) => (
              <li
                key={notification.notificationId}
                className={`inset p-4 ${notification.readAt ? 'opacity-70' : 'border-amber/70'}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="stamp text-base font-bold">{notification.title}</p>
                    <p className="mt-1 text-lg text-[#e8e4d0]">{notification.body}</p>
                    <time className="mt-1 block text-sm text-phos-dim" dateTime={notification.createdAt}>
                      {new Date(notification.createdAt).toLocaleString()}
                    </time>
                  </div>
                  <div className="flex items-center gap-3">
                    <a href={notification.href} className="text-sm text-amber underline underline-offset-2">
                      Open incident ▸
                    </a>
                    {!notification.readAt && (
                      <button
                        type="button"
                        onClick={() => void markRead(notification.notificationId)}
                        className="btn px-2 py-1 text-xs"
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}

function Toggle({
  checked,
  disabled = false,
  label,
  help,
  onChange,
}: {
  checked: boolean
  disabled?: boolean
  label: string
  help: string
  onChange: (checked: boolean) => void
}) {
  return (
    <label className={`flex items-center justify-between gap-4 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <span>
        <span className="block text-lg text-phos">{label}</span>
        <span className="block text-sm text-ink-dim">{help}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className="size-5 accent-amber"
      />
    </label>
  )
}

async function enablePush(publicKey: string) {
  if (!publicKey) throw new Error('Web Push is not configured on the server.')
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    throw new Error('This browser does not support Web Push notifications.')
  }
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Allow browser notifications to enable push alerts.')

  const registration = await navigator.serviceWorker.register('/sw.js')
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeVapidKey(publicKey),
    })
  }
  const data = subscription.toJSON()
  if (!data.endpoint || !data.keys?.p256dh || !data.keys.auth) {
    throw new Error('The browser returned an incomplete push subscription.')
  }
  await savePushSubscription({
    data: { endpoint: data.endpoint, keys: { p256dh: data.keys.p256dh, auth: data.keys.auth } },
  })
}

async function disableCurrentDevicePush() {
  if (!('serviceWorker' in navigator)) return
  const registration = await navigator.serviceWorker.getRegistration('/')
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return
  await removePushSubscription({ data: subscription.endpoint })
  await subscription.unsubscribe()
}

function decodeVapidKey(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(padded)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}
