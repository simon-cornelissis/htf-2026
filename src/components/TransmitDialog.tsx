import { getRouteApi, useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { ImagePlus, Mic, MicOff, X } from 'lucide-react'
import { DistrictMap } from '#/components/DistrictMap.tsx'
import { DISTRICTS, parseSiteId, siteName, type DistrictId } from '#/lib/districts.ts'
import { reportEcho } from '#/lib/glitches.functions.ts'
import { MAX_ECHO_IMAGE_BYTES, MAX_ECHO_IMAGES, MAX_ECHO_IMAGES_BYTES } from '#/lib/user-engagement.ts'

const MAX = 500
const authed = getRouteApi('/_authed')

export type TransmitTarget = { glitchId?: string; district?: DistrictId; siteId?: string }

type SpeechResult = { isFinal: boolean; 0: { transcript: string } }
type SpeechEvent = { resultIndex: number; results: ArrayLike<SpeechResult> }
type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: SpeechEvent) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}
type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike
  webkitSpeechRecognition?: new () => SpeechRecognitionLike
}

/**
 * Report an echo. Without a target glitch it opens a new glitch in the
 * picked district; with one it adds an update to that glitch.
 */
export function TransmitDialog({
  target,
  onClose,
}: {
  target: TransmitTarget | null
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const router = useRouter()
  const glitches = authed.useLoaderData()
  const [text, setText] = useState('')
  const [district, setDistrict] = useState<DistrictId | undefined>()
  const [site, setSite] = useState<string | undefined>()
  const [images, setImages] = useState<File[]>([])
  const [dictationLanguage, setDictationLanguage] = useState('en-US')
  const [recording, setRecording] = useState(false)
  const [interimTranscript, setInterimTranscript] = useState('')
  const [dictationError, setDictationError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (target && !dialog.open) {
      setText('')
      setImages([])
      setDistrict(target.district)
      setSite(target.siteId)
      setError(null)
      setDictationError(null)
      dialog.showModal()
    } else if (!target && dialog.open) {
      recognitionRef.current?.abort()
      setRecording(false)
      dialog.close()
    }
  }, [target])

  useEffect(() => () => recognitionRef.current?.abort(), [])

  const forGlitch = target?.glitchId

  function selectImages(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.currentTarget.files ?? [])
    event.currentTarget.value = ''
    const combined = [...images, ...selected]
    if (combined.length > MAX_ECHO_IMAGES) {
      setError(`Attach up to ${MAX_ECHO_IMAGES} photos.`)
      return
    }
    if (
      combined.some(
        (file) =>
          !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
          file.size === 0 ||
          file.size > MAX_ECHO_IMAGE_BYTES,
      )
    ) {
      setError('Use JPG, PNG or WebP photos under 4 MB each.')
      return
    }
    if (combined.reduce((sum, file) => sum + file.size, 0) > MAX_ECHO_IMAGES_BYTES) {
      setError('Photos must total less than 8 MB.')
      return
    }
    setImages(combined)
    setError(null)
  }

  function startDictation() {
    const speech = window as SpeechWindow
    const Recognition = speech.SpeechRecognition ?? speech.webkitSpeechRecognition
    if (!Recognition) {
      setDictationError('Speech-to-text is not supported in this browser. You can still type your report.')
      return
    }
    if (!recognitionRef.current) {
      const recognition = new Recognition()
      recognition.continuous = false
      recognition.interimResults = true
      recognition.onresult = (event) => {
        let finalText = ''
        let interim = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript
          if (event.results[i].isFinal) finalText += transcript
          else interim += transcript
        }
        setInterimTranscript(interim)
        if (finalText.trim()) {
          setText((current) => `${current.trim()}${current.trim() ? ' ' : ''}${finalText.trim()}`.slice(0, MAX))
        }
      }
      recognition.onerror = (event) => {
        setRecording(false)
        setDictationError(
          event.error === 'not-allowed'
            ? 'Microphone access was denied. Allow it in your browser settings to dictate.'
            : event.error === 'no-speech'
              ? 'No speech was detected. Try again or type your report.'
              : `Speech recognition failed (${event.error}). You can still type your report.`,
        )
      }
      recognition.onend = () => {
        setRecording(false)
        setInterimTranscript('')
      }
      recognitionRef.current = recognition
    }
    recognitionRef.current.lang = dictationLanguage
    setDictationError(null)
    try {
      recognitionRef.current.start()
      setRecording(true)
    } catch (error) {
      setDictationError(error instanceof Error ? error.message : 'Could not start speech recognition.')
    }
  }

  function stopDictation() {
    recognitionRef.current?.stop()
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!forGlitch && !district) {
      setError('Mark the district on the map first.')
      return
    }
    if (text.trim().length < 3) {
      setError('Describe what you saw, at least a few words.')
      return
    }
    setPending(true)
    try {
      if (recording) stopDictation()
      const encodedImages = await Promise.all(images.map(encodeImage))
      const { glitchId } = await reportEcho({
        data: {
          description: text,
          glitchId: forGlitch,
          district,
          siteId: site && parseSiteId(site)?.district === district ? site : undefined,
          images: encodedImages,
        },
      })
      onClose()
      await router.invalidate()
      await router.navigate({ to: '/glitches/$glitchId', params: { glitchId }, search: { fresh: true } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transmission failed. Try again.')
    } finally {
      setPending(false)
    }
  }

  const remaining = MAX - text.length

  return (
    <dialog
      ref={ref}
      onClose={() => {
        recognitionRef.current?.abort()
        setRecording(false)
        setInterimTranscript('')
        onClose()
      }}
      className="metal rivets m-auto max-h-[calc(100dvh-2rem)] w-[min(720px,calc(100vw-1.5rem))] overflow-y-auto p-0 text-phos-mid"
      aria-labelledby="transmit-title"
    >
      <div className="hazard h-3" aria-hidden="true" />
      <form onSubmit={onSubmit} className="p-4 sm:p-7">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 id="transmit-title" className="stamp text-2xl font-bold">
            {forGlitch ? `Update ${forGlitch}` : 'Transmit echo'}
          </h2>
          <span className="flex shrink-0 items-center gap-2" aria-hidden="true">
            <span data-on="red" className="lamp size-3 animate-blink" />
            <span className="text-lg leading-none text-ink-dim uppercase">On air</span>
          </span>
        </div>

        {!forGlitch && (
          <fieldset className="mb-4">
            <legend className="mb-2 flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="label">1. Where? Tap a district</span>
              <span className="readout px-2 text-xl leading-tight uppercase">{district ? DISTRICTS[district].name : '-- none --'}{site ? ` · ${siteName(site)}` : ''}</span>
            </legend>
            <div className="inset mx-auto max-w-[480px] bg-edge p-1">
              <DistrictMap glitches={glitches} selected={district} onSelect={(id) => { setDistrict(id); setSite(undefined); setError(null) }} compact />
            </div>
          </fieldset>
        )}

        <label className="block">
          <span className="label mb-2 block">{forGlitch ? 'What changed?' : '2. What did you witness?'}</span>
          <div className="crt rounded-[10px] p-3">
            <textarea
              autoFocus={Boolean(forGlitch)}
              rows={4}
              maxLength={MAX}
              value={text}
              onChange={(e) => { setText(e.target.value); setError(null) }}
              placeholder="> CLOCK TOWER BELLS RANG TWICE AT 14:02, AND AGAIN AT 14:02_"
              className="relative z-10 w-full resize-y bg-transparent text-[22px] leading-tight text-phos caret-phos placeholder:text-phos-dim focus:outline-none"
            />
          </div>
        </label>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={recording ? stopDictation : startDictation}
            disabled={pending}
            className="btn flex items-center gap-2 px-3 py-2 text-sm disabled:opacity-50"
          >
            {recording ? <MicOff className="size-4" /> : <Mic className="size-4" />}
            {recording ? 'Stop dictation' : 'Dictate'}
          </button>
          <label className="flex items-center gap-2 text-sm text-ink-dim">
            Language
            <select
              value={dictationLanguage}
              onChange={(event) => setDictationLanguage(event.currentTarget.value)}
              disabled={recording}
              className="inset bg-[#0b0703] px-2 py-1 text-phos"
            >
              <option value="en-US">English</option>
              <option value="nl-BE">Nederlands (België)</option>
              <option value="nl-NL">Nederlands</option>
            </select>
          </label>
          {recording && <span className="text-sm text-[#ff7a5c]">Listening…</span>}
        </div>
        {(interimTranscript || dictationError) && (
          <p aria-live="polite" className="mt-1 text-sm text-phos-dim">
            {interimTranscript ? `Heard: ${interimTranscript}` : dictationError}
          </p>
        )}

        <div className="mt-4">
          <input
            id="echo-photos"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="sr-only"
            onChange={selectImages}
            disabled={pending}
          />
          <label htmlFor="echo-photos" className="btn inline-flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
            <ImagePlus className="size-4" />
            Attach photos ({images.length}/{MAX_ECHO_IMAGES})
          </label>
          <span className="ml-2 text-sm text-ink-dim">JPG, PNG or WebP · 4 MB each</span>
          {images.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-3" aria-label="Photos to attach">
              {images.map((image, index) => (
                <li key={`${image.name}-${image.lastModified}-${index}`}>
                  <PhotoPreview
                    file={image}
                    onRemove={() => setImages((current) => current.filter((_, i) => i !== index))}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-2 flex items-start justify-between gap-4">
          <span role={error ? 'alert' : undefined} aria-live="polite" className="text-xl leading-tight text-[#ff8a6a]">{error && `✕ ${error}`}</span>
          <span className={`readout px-2 text-xl leading-tight ${remaining < 50 ? 'text-[#ff5a3a]' : ''}`}>{String(remaining).padStart(3, '0')}</span>
        </div>

        <p className="mt-3 text-xl leading-tight text-ink-dim">
          {forGlitch
            ? 'Your echo is added to this glitch’s log.'
            : 'A new echo is logged as a glitch and flagged as leaked until a commander assesses it.'}
        </p>

        <div className="mt-5 flex justify-end gap-4">
          <button type="button" onClick={onClose} className="btn px-5 py-3 text-sm">Cancel</button>
          <button type="submit" disabled={pending || recording} className="btn btn-primary flex items-center gap-3 px-6 py-3 text-sm">
            <span data-on="red" className="lamp size-4" aria-hidden="true" />
            {pending ? 'Sending…' : 'Transmit'}
          </button>
        </div>
      </form>
    </dialog>
  )
}

function PhotoPreview({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])

  return (
    <figure className="relative w-24">
      {url && <img src={url} alt="" className="size-24 border border-edge object-cover" />}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${file.name}`}
        className="btn absolute top-1 right-1 p-1"
      >
        <X className="size-4" />
      </button>
      <figcaption className="truncate text-xs text-phos-dim">{file.name}</figcaption>
    </figure>
  )
}

function encodeImage(file: File): Promise<{ fileName: string; mimeType: string; base64: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const base64 = result.slice(result.indexOf(',') + 1)
      if (!base64) {
        reject(new Error(`Could not read ${file.name}.`))
        return
      }
      resolve({ fileName: file.name, mimeType: file.type, base64 })
    }
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`))
    reader.readAsDataURL(file)
  })
}
