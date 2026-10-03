"use client"

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Plane, Car, Clock, Navigation, CheckCircle2, ChevronRight, ChevronDown, User, Phone, Radio, Radar, Gauge, PlaneLanding, Luggage, MoveVertical, Plus, X, Presentation, Diamond, MessageSquare, MessageCircle, Copy, Check, LogOut, TimerReset, MapPin, Download, Printer, Info, Pencil, CalendarDays, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { airportGuideFor, type AirportGuide } from '@/lib/airport-guides'

const DRIVER_STAGES = ["En Route to Terminal", "At Pickup Point", "Passenger Onboard", "Completed"]
const NEXT_STAGE_LABELS = ["Mark as Arrived", "Passenger Onboard", "Complete Trip"]

type Job = {
  id: string
  passenger: string
  phone: string
  flightNo: string
  airline: string
  airport: string
  terminal: string
  origin: string
  pickupAt: string
  estimatedArrival: string
  altitude: string
  airspeed: string
  progress: number
  baggageBelt: string
  flightStatus: string
  statusColor: string
  pickupPoint: string
  destination: string
  fareAmount: number
  parkingFee: number
  otherExpenses: number
  stage: number
}

const jobExpenses = (j: Job) => (j.parkingFee ?? 0) + (j.otherExpenses ?? 0)

type JobFormField = {
  name: 'passenger' | 'phone' | 'flightNo' | 'airport' | 'meetingPoint' | 'destination' | 'pickupDate' | 'pickupTime' | 'fare' | 'parking' | 'expenses'
  label: string
  type: string
  placeholder?: string
  step?: string
  min?: string
  optional?: boolean
}

const NEW_JOB_FIELDS: JobFormField[] = [
  { name: 'passenger', label: 'Passenger Name', type: 'text', placeholder: 'e.g. Jane Doe' },
  { name: 'phone', label: 'Phone Number', type: 'tel', placeholder: '+44 7700 900000' },
  { name: 'flightNo', label: 'Flight Number', type: 'text', placeholder: 'e.g. BA0249' },
  { name: 'airport', label: 'Airport / Terminal', type: 'text', placeholder: 'e.g. LHR (London Heathrow) T3' },
  { name: 'meetingPoint', label: 'Meeting Point', type: 'text', placeholder: 'e.g. Short Stay Car Park', optional: true },
  { name: 'destination', label: 'Destination / Drop-off', type: 'text', placeholder: 'e.g. 12 High Street, Derby' },
  { name: 'pickupDate', label: 'Pickup Date', type: 'date' },
  { name: 'pickupTime', label: 'Pickup Time', type: 'time' },
  { name: 'fare', label: 'Fare (£)', type: 'number', placeholder: '0.00', step: '0.01', min: '0' },
  { name: 'parking', label: 'Parking / Airport Fee (£)', type: 'number', placeholder: '0.00', step: '0.50', min: '0', optional: true },
  { name: 'expenses', label: 'Other Expenses (£)', type: 'number', placeholder: '0.00', step: '0.50', min: '0', optional: true },
]

const PARKING_PRESETS = [
  { label: 'EMA (£5)', value: '5' },
  { label: 'BHX (£6)', value: '6' },
  { label: 'LHR (£5)', value: '5' },
  { label: 'MAN (£6)', value: '6' },
  { label: 'LTN (£5)', value: '5' },
]

const MEETING_PRESETS = [
  'Short Stay Car Park',
  'Express Drop-off Zone',
  'Costa Coffee — Arrivals Hall',
  'Arrivals Hall — Main Exit',
  'Station / Rail Link Entrance',
]

const TRAVEL_MINUTE_OPTIONS = [15, 30, 45, 60, 90, 120]

const PICKUP_HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const PICKUP_MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))

type FlightTelemetry = {
  airline: string
  status: string
  statusLabel: string
  origin: string
  destination: string
  terminal: string
  baggageBelt: string
  scheduledArrivalUtc?: string | null
  estimatedArrivalUtc: string | null
  actualArrivalUtc: string | null
  altitudeFt: number | null
  groundSpeedKt: number | null
  progress: number
}

type StoredTelemetry = { flight: FlightTelemetry; fetchedAt: number }

type FlightError = {
  kind: 'not_found' | 'rate_limited' | 'error'
  error: string
}

const subscribeOnline = (callback: () => void) => {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}
const getOnlineSnapshot = () => navigator.onLine
const getOnlineServerSnapshot = () => true

const STALE_MS = 10 * 60 * 1000

// Kerbside buffer — passport control + baggage reclaim after touchdown.
const PASSPORT_MIN = 25
const BAGGAGE_MIN = 20
const ARRIVAL_BUFFER_MIN = PASSPORT_MIN + BAGGAGE_MIN
// Delays inside this window are treated as on-time (airport noise).
const ON_TIME_THRESHOLD_MIN = 5

const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    try {
      document.execCommand('copy')
      return true
    } catch {
      return false
    } finally {
      document.body.removeChild(ta)
    }
  }
}

const formatAge = (ms: number) => {
  if (ms < 60_000) return 'Updated just now'
  const m = Math.floor(ms / 60_000)
  if (m < 60) return `Updated ${m} min ago`
  return `Updated ${Math.floor(m / 60)}h ago`
}

const flightCode = (s: string) => s.toUpperCase().replace(/\s+/g, '')

const liveStatusColor = (status: string) =>
  status === 'Arrived'
    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
    : status === 'Delayed' || status === 'Canceled' || status === 'Diverted'
      ? 'bg-red-500/20 text-red-400 border-red-500/40'
      : status === 'EnRoute' || status === 'Departed' || status === 'Approaching'
        ? 'bg-blue-500/20 text-blue-400 border-blue-500/40'
        : 'bg-amber-500/20 text-amber-400 border-amber-500/40'

const pad2 = (n: number) => String(n).padStart(2, '0')

const localDateStr = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

const EMPTY_JOB_FORM = {
  passenger: '', phone: '', flightNo: '', airport: '', meetingPoint: '',
  destination: '', pickupDate: '', pickupHour: '', pickupMinute: '',
  fare: '', parking: '', expenses: '',
}

// Offline outbox — ops queued while offline flush when signal returns.
type OutboxOp = {
  id: string
  op: 'insert' | 'update' | 'delete'
  row?: TransferRow
  patch?: Record<string, unknown>
  at: number
  tries?: number
}
const OUTBOX_KEY = 'aerodriver-outbox'
const OUTBOX_MAX_TRIES = 10

const readOutbox = (): OutboxOp[] => {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX_KEY) ?? '[]') as OutboxOp[]
  } catch {
    return []
  }
}

const writeOutboxRaw = (ops: OutboxOp[]) => {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(ops))
  } catch {}
}

const applyTransferOp = async (op: OutboxOp): Promise<boolean> => {
  if (!supabase) return true
  try {
    const res =
      op.op === 'delete'
        ? await supabase.from('transfers').delete().eq('id', op.id)
        : op.op === 'insert'
          ? await supabase.from('transfers').upsert(op.row ?? {})
          : await supabase.from('transfers').update(op.patch ?? {}).eq('id', op.id)
    if (res.error) {
      console.error(`transfer ${op.op} failed:`, res.error.message)
      return false
    }
    return true
  } catch {
    return false
  }
}

const formatHHMM = (value: string | Date) => {
  const d = typeof value === 'string' ? new Date(value) : value
  return isNaN(d.getTime()) ? '--:--' : `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

const normalizeJob = (j: Record<string, unknown>, legacyStages: Record<string, number>): Job => {
  const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback)
  const m = str(j.scheduledTime, '').match(/\b(\d{1,2}):(\d{2})\b/)
  const fallbackPickup = new Date()
  if (m) fallbackPickup.setHours(+m[1], +m[2], 0, 0)
  return {
    id: str(j.id, `JOB-${crypto.randomUUID().slice(0, 8).toUpperCase()}`),
    passenger: str(j.passenger, ''),
    phone: str(j.phone, ''),
    flightNo: str(j.flightNo, ''),
    airline: str(j.airline, '—'),
    airport: str(j.airport, ''),
    terminal: str(j.terminal, '—'),
    origin: str(j.origin, '—'),
    pickupAt: str(j.pickupAt, fallbackPickup.toISOString()),
    estimatedArrival: str(j.estimatedArrival, 'TBC'),
    altitude: str(j.altitude, '—'),
    airspeed: str(j.airspeed, '—'),
    progress: typeof j.progress === 'number' ? j.progress : 0,
    baggageBelt: str(j.baggageBelt, 'TBC'),
    flightStatus: str(j.flightStatus, 'Scheduled'),
    statusColor: str(j.statusColor, 'bg-amber-500/20 text-amber-400 border-amber-500/40'),
    pickupPoint: str(j.pickupPoint, ''),
    destination: str(j.destination, 'TBC'),
    fareAmount:
      typeof j.fareAmount === 'number'
        ? j.fareAmount
        : parseFloat(String(j.fare ?? '').replace(/[^0-9.]/g, '')) || 0,
    parkingFee: typeof j.parkingFee === 'number' ? j.parkingFee : 0,
    otherExpenses: typeof j.otherExpenses === 'number' ? j.otherExpenses : 0,
    stage: typeof j.stage === 'number' ? j.stage : (legacyStages[String(j.id)] ?? 0),
  }
}

type TransferRow = Record<string, unknown>

const rowToJob = (r: TransferRow): Job => ({
  id: String(r.id),
  passenger: String(r.passenger ?? ''),
  phone: String(r.phone ?? ''),
  flightNo: String(r.flight_no ?? ''),
  airline: '—',
  airport: String(r.airport ?? ''),
  terminal: String(r.terminal ?? '—'),
  origin: '—',
  pickupAt: String(r.pickup_at ?? ''),
  estimatedArrival: 'TBC',
  altitude: '—',
  airspeed: '—',
  progress: 0,
  baggageBelt: 'TBC',
  flightStatus: 'Scheduled',
  statusColor: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
  pickupPoint: String(r.meeting_point ?? ''),
  destination: String(r.dropoff ?? 'TBC'),
  fareAmount: Number(r.fare_amount ?? 0) || 0,
  parkingFee: Number(r.parking_fee ?? 0) || 0,
  otherExpenses: Number(r.other_expenses ?? 0) || 0,
  stage: typeof r.stage === 'number' ? r.stage : 0,
})

const jobToRow = (j: Job): TransferRow => ({
  id: j.id,
  flight_no: j.flightNo,
  passenger: j.passenger,
  phone: j.phone,
  airport: j.airport,
  terminal: j.terminal,
  meeting_point: j.pickupPoint,
  dropoff: j.destination,
  pickup_at: j.pickupAt || null,
  fare_amount: j.fareAmount,
  parking_fee: j.parkingFee,
  other_expenses: j.otherExpenses,
  stage: j.stage,
})

export default function AeroDriverDashboard() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'upcoming' | 'completed'>('upcoming')
  const [expandedFlight, setExpandedFlight] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [storageLoaded, setStorageLoaded] = useState(false)
  const [showAddJob, setShowAddJob] = useState(false)
  const [greetingJob, setGreetingJob] = useState<Job | null>(null)
  const [guideJob, setGuideJob] = useState<Job | null>(null)
  const [editingJob, setEditingJob] = useState<Job | null>(null)
  const [filterDate, setFilterDate] = useState('')
  const [todayStr, setTodayStr] = useState('')
  const [outboxCount, setOutboxCount] = useState(0)
  const [telemetry, setTelemetry] = useState<Record<string, StoredTelemetry>>({})
  const [flightErrors, setFlightErrors] = useState<Record<string, FlightError>>({})
  const [nowMs, setNowMs] = useState(0)
  const [travelMinutes, setTravelMinutes] = useState(45)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const online = useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getOnlineServerSnapshot)
  const [form, setForm] = useState(EMPTY_JOB_FORM)
  const [userEmail, setUserEmail] = useState('')
  const [userId, setUserId] = useState<string | null>(null)
  const expenseTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    queueMicrotask(async () => {
      let localJobs: Job[] = []
      try {
        const storedJobs = localStorage.getItem('aerodriver-jobs')
        const storedStages = localStorage.getItem('aerodriver-stages')
        const legacyStages: Record<string, number> = storedStages ? JSON.parse(storedStages) : {}
        if (storedJobs) {
          localJobs = (JSON.parse(storedJobs) as Record<string, unknown>[]).map((j) => normalizeJob(j, legacyStages))
          setJobs(localJobs)
        }
        const storedTelemetry = localStorage.getItem('aerodriver-telemetry')
        if (storedTelemetry) {
          const parsed = JSON.parse(storedTelemetry) as Record<string, StoredTelemetry>
          const valid: Record<string, StoredTelemetry> = {}
          for (const [k, v] of Object.entries(parsed)) {
            if (v && typeof v.fetchedAt === 'number' && v.flight) valid[k] = v
          }
          setTelemetry(valid)
        }
        const storedTravel = localStorage.getItem('aerodriver-travel-mins')
        if (storedTravel) {
          const n = parseInt(storedTravel, 10)
          if (!isNaN(n)) setTravelMinutes(n)
        }
        localStorage.removeItem('aerodriver-stages')
        setOutboxCount(readOutbox().length)
      } catch {}
      setTodayStr(localDateStr(new Date()))

      if (supabase) {
        try {
          // getSession reads the local cookie — no network, so the PWA
          // still boots offline with a valid cached session.
          const { data: { session } } = await supabase.auth.getSession()
          if (!session?.user) {
            router.replace('/login')
            return
          }
          setUserId(session.user.id)
          setUserEmail(session.user.email ?? '')
          const { data } = await supabase
            .from('transfers')
            .select('*')
            .order('pickup_at')
          if (data) {
            if (data.length === 0 && localJobs.length > 0) {
              // One-time migration: push localStorage jobs up as transfers.
              const rows = localJobs.map((j) =>
                jobToRow({ ...j, id: crypto.randomUUID() })
              )
              const { data: inserted } = await supabase
                .from('transfers')
                .insert(rows)
                .select()
              if (inserted) setJobs(inserted.map((r) => rowToJob(r as TransferRow)))
            } else {
              setJobs(data.map((r) => rowToJob(r as TransferRow)))
            }
          }
        } catch {}
      }
      setStorageLoaded(true)
    })
  }, [router])

  // Realtime: apply transfer changes made on other devices instantly.
  useEffect(() => {
    if (!supabase || !userId) return
    const sb = supabase
    const channel = sb
      .channel('transfers-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transfers' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const id = String((payload.old as { id?: unknown }).id ?? '')
            setJobs((prev) => prev.filter((j) => j.id !== id))
          } else {
            const job = rowToJob(payload.new as TransferRow)
            setJobs((prev) =>
              prev.some((j) => j.id === job.id)
                ? prev.map((j) => (j.id === job.id ? job : j))
                : [...prev, job]
            )
          }
        }
      )
      .subscribe()
    return () => {
      void sb.removeChannel(channel)
    }
  }, [userId])

  useEffect(() => {
    if (!storageLoaded) return
    localStorage.setItem('aerodriver-jobs', JSON.stringify(jobs))
    localStorage.setItem('aerodriver-telemetry', JSON.stringify(telemetry))
    localStorage.setItem('aerodriver-travel-mins', String(travelMinutes))
  }, [jobs, telemetry, travelMinutes, storageLoaded])

  const flightKey = jobs.map((j) => flightCode(j.flightNo)).filter(Boolean).join(',')

  useEffect(() => {
    const flightNos = [...new Set(flightKey ? flightKey.split(',') : [])]
    if (!flightNos.length) return
    let cancelled = false
    const load = async () => {
      const fetchedAt = Date.now()
      setNowMs(fetchedAt)
      const results = await Promise.allSettled(
        flightNos.map((fn) =>
          fetch(`/api/flight/${fn}`).then(async (r) => ({
            status: r.status,
            body: (await r.json().catch(() => null)) as { found?: boolean; flight?: FlightTelemetry; error?: string } | null,
          }))
        )
      )
      if (cancelled) return
      setTelemetry((prev) => {
        const next = { ...prev }
        results.forEach((r, i) => {
          const v = r.status === 'fulfilled' ? r.value : null
          if (v?.status === 200 && v.body?.found && v.body.flight) {
            next[flightNos[i]] = { flight: v.body.flight, fetchedAt }
          }
        })
        return next
      })
      setFlightErrors((prev) => {
        const next = { ...prev }
        results.forEach((r, i) => {
          const fn = flightNos[i]
          const v = r.status === 'fulfilled' ? r.value : null
          if (!v) {
            next[fn] = { kind: 'error', error: 'Network error — retrying' }
          } else if (v.status === 200 && v.body?.found) {
            delete next[fn]
          } else {
            const kind = v.status === 404 ? 'not_found' : v.status === 429 ? 'rate_limited' : 'error'
            next[fn] = { kind, error: v.body?.error ?? `Lookup failed (${v.status})` }
          }
        })
        return next
      })
    }
    load()
    const interval = setInterval(load, 5 * 60 * 1000)
    const tick = setInterval(() => {
      setNowMs(Date.now())
      setTodayStr(localDateStr(new Date()))
    }, 30 * 1000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearInterval(interval)
      clearInterval(tick)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [flightKey])

  const toggleFlightDetails = (id: string) => {
    setExpandedFlight(expandedFlight === id ? null : id)
  }

  const isCompleted = (j: Job) => j.stage === DRIVER_STAGES.length - 1

  // Offline outbox flush — replays queued ops in order, stops on first
  // failure, drops an op only after OUTBOX_MAX_TRIES attempts.
  useEffect(() => {
    if (!supabase || !storageLoaded) return
    let inFlight = false
    const flush = async () => {
      if (inFlight || !navigator.onLine) return
      inFlight = true
      try {
        const ops = readOutbox()
        for (let i = 0; i < ops.length; i++) {
          if (!(await applyTransferOp(ops[i]))) {
            const remaining = ops
              .slice(i)
              .map((o, k) => (k === 0 ? { ...o, tries: (o.tries ?? 0) + 1 } : o))
              .filter((o) => (o.tries ?? 0) <= OUTBOX_MAX_TRIES)
            writeOutboxRaw(remaining)
            setOutboxCount(remaining.length)
            return
          }
        }
        writeOutboxRaw([])
        setOutboxCount(0)
      } finally {
        inFlight = false
      }
    }
    void flush()
    window.addEventListener('online', flush)
    const interval = setInterval(flush, 60_000)
    return () => {
      window.removeEventListener('online', flush)
      clearInterval(interval)
    }
  }, [online, storageLoaded])

  const enqueueOutbox = (op: OutboxOp) => {
    const tries = (op.tries ?? 0) + 1
    if (tries > OUTBOX_MAX_TRIES) {
      console.warn('dropping sync op after max retries:', op.op, op.id)
      return
    }
    const next = [...readOutbox(), { ...op, tries }]
    writeOutboxRaw(next)
    setOutboxCount(next.length)
  }

  const syncOp = (op: OutboxOp) => {
    if (!supabase) return
    if (!navigator.onLine) {
      enqueueOutbox(op)
      return
    }
    void applyTransferOp(op).then((ok) => {
      if (!ok) enqueueOutbox(op)
    })
  }

  const syncUpdate = (id: string, patch: Record<string, unknown>) => {
    if (!supabase) return
    syncOp({ id, op: 'update', patch, at: Date.now() })
  }

  const advanceJobStage = (id: string) => {
    const job = jobs.find(j => j.id === id)
    if (!job) return
    const nextStage = Math.min(job.stage + 1, DRIVER_STAGES.length - 1)
    setJobs(prev => prev.map(j => j.id === id ? { ...j, stage: nextStage } : j))
    syncUpdate(id, { stage: nextStage })
  }

  const handleDelete = (id: string) => {
    if (confirmingDelete === id) {
      setJobs(prev => prev.filter(j => j.id !== id))
      if (expandedFlight === id) setExpandedFlight(null)
      setConfirmingDelete(null)
      if (supabase) {
        syncOp({ id, op: 'delete', at: Date.now() })
      }
    } else {
      setConfirmingDelete(id)
      setTimeout(() => setConfirmingDelete(prev => (prev === id ? null : prev)), 3000)
    }
  }

  const openDirections = (pickup: string) => {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(pickup)}`, '_blank')
  }

  const handleCopyPoint = async (id: string, text: string) => {
    if (await copyText(text)) {
      setCopiedId(id)
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1500)
    }
  }

  const updateJobExpense = (id: string, field: 'parkingFee' | 'otherExpenses', value: string) => {
    const n = parseFloat(value)
    const val = isNaN(n) ? 0 : n
    setJobs(prev => prev.map(j => j.id === id ? { ...j, [field]: val } : j))
    // Debounce — number inputs fire on every keystroke.
    const key = `${id}:${field}`
    clearTimeout(expenseTimers.current[key])
    expenseTimers.current[key] = setTimeout(() => {
      syncUpdate(id, { [field === 'parkingFee' ? 'parking_fee' : 'other_expenses']: val })
    }, 600)
  }

  const handleSignOut = async () => {
    await supabase?.auth.signOut()
    router.replace('/login')
  }

  const closeJobModal = () => {
    setShowAddJob(false)
    setEditingJob(null)
    setForm(EMPTY_JOB_FORM)
  }

  const openAddJob = () => {
    setEditingJob(null)
    setForm({ ...EMPTY_JOB_FORM, pickupDate: todayStr || localDateStr(new Date()) })
    setShowAddJob(true)
  }

  const openEditJob = (job: Job) => {
    const d = new Date(job.pickupAt)
    const valid = !isNaN(d.getTime())
    setEditingJob(job)
    setForm({
      passenger: job.passenger,
      phone: job.phone,
      flightNo: job.flightNo,
      airport: job.airport,
      meetingPoint: job.pickupPoint,
      destination: job.destination === 'TBC' ? '' : job.destination,
      pickupDate: valid ? localDateStr(d) : todayStr || localDateStr(new Date()),
      pickupHour: valid ? pad2(d.getHours()) : '',
      pickupMinute: valid ? pad2(d.getMinutes()) : '',
      fare: job.fareAmount ? String(job.fareAmount) : '',
      parking: job.parkingFee ? String(job.parkingFee) : '',
      expenses: job.otherExpenses ? String(job.otherExpenses) : '',
    })
    setShowAddJob(true)
  }

  const handleSubmitJob = (e: React.FormEvent) => {
    e.preventDefault()
    const dateStr = form.pickupDate || todayStr || localDateStr(new Date())
    const pickupDate = new Date(`${dateStr}T${form.pickupHour}:${form.pickupMinute}:00`)

    if (editingJob) {
      const updated: Job = {
        ...editingJob,
        passenger: form.passenger,
        phone: form.phone,
        flightNo: form.flightNo.toUpperCase(),
        airport: form.airport,
        terminal: form.airport,
        pickupAt: pickupDate.toISOString(),
        pickupPoint: form.meetingPoint || form.airport,
        destination: form.destination || 'TBC',
        fareAmount: parseFloat(form.fare) || 0,
        parkingFee: parseFloat(form.parking) || 0,
        otherExpenses: parseFloat(form.expenses) || 0,
      }
      setJobs(prev => prev.map(j => (j.id === updated.id ? updated : j)))
      const patch = { ...jobToRow(updated) }
      delete patch.id
      syncUpdate(updated.id, patch)
    } else {
      const newJob: Job = {
        id: crypto.randomUUID(),
        passenger: form.passenger,
        phone: form.phone,
        flightNo: form.flightNo.toUpperCase(),
        airline: '—',
        airport: form.airport,
        terminal: form.airport,
        origin: '—',
        pickupAt: pickupDate.toISOString(),
        estimatedArrival: 'TBC',
        altitude: 'Awaiting telemetry',
        airspeed: '—',
        progress: 0,
        baggageBelt: 'TBC',
        flightStatus: 'Scheduled',
        statusColor: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
        pickupPoint: form.meetingPoint || form.airport,
        destination: form.destination || 'TBC',
        fareAmount: parseFloat(form.fare) || 0,
        parkingFee: parseFloat(form.parking) || 0,
        otherExpenses: parseFloat(form.expenses) || 0,
        stage: 0,
      }
      setJobs(prev => [...prev, newJob])
      syncOp({ id: newJob.id, op: 'insert', row: jobToRow(newJob), at: Date.now() })
      setActiveTab('upcoming')
    }
    // Make sure the saved job is visible — jump the day filter to its date.
    setFilterDate(localDateStr(pickupDate))
    closeJobModal()
  }

  // Day scoping — '' falls back to today once todayStr is populated on mount.
  const activeDate = filterDate || todayStr
  const onActiveDate = (j: Job) =>
    activeDate !== '' && localDateStr(new Date(j.pickupAt)) === activeDate
  const jobsOnDate = jobs.filter(onActiveDate)
  const isViewingToday = activeDate === todayStr

  const visibleJobs = jobsOnDate.filter(j => activeTab === 'upcoming' ? !isCompleted(j) : isCompleted(j))
  const activeCount = jobsOnDate.filter(j => !isCompleted(j)).length
  const completedCount = jobsOnDate.length - activeCount

  const pickupTimes = jobsOnDate
    .filter((j) => !isCompleted(j))
    .map((j) => new Date(j.pickupAt).getTime())
    .filter((t) => !isNaN(t))
  const nextPickup = pickupTimes.length ? formatHHMM(new Date(Math.min(...pickupTimes))) : '--:--'

  const fareSum = (list: Job[]) => list.reduce((sum, j) => sum + j.fareAmount, 0)
  const formatFare = (n: number) => `£${n % 1 === 0 ? n : n.toFixed(2)}`

  const dayEarningsLabel = formatFare(fareSum(jobsOnDate.filter(isCompleted)))
  const totalExpenses = jobsOnDate.reduce((s, j) => s + jobExpenses(j), 0)
  const grossFaresLabel = formatFare(fareSum(jobsOnDate))
  const expensesLabel = formatFare(totalExpenses)
  const netProfitLabel = formatFare(fareSum(jobsOnDate) - totalExpenses)

  const completedJobs = jobsOnDate.filter(isCompleted)
  const invoiceDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  const csvEscape = (v: string | number) => {
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }

  const downloadCsv = () => {
    const header = ['Date', 'Passenger', 'Flight', 'Airport', 'Pickup Time', 'Fare (£)', 'Parking (£)', 'Other Expenses (£)', 'Net (£)']
    const rows = completedJobs.map((j) => [
      new Date(j.pickupAt).toLocaleDateString('en-GB'),
      j.passenger,
      j.flightNo,
      j.airport,
      formatHHMM(j.pickupAt),
      j.fareAmount.toFixed(2),
      j.parkingFee.toFixed(2),
      j.otherExpenses.toFixed(2),
      (j.fareAmount - jobExpenses(j)).toFixed(2),
    ])
    rows.push([
      'TOTAL', `${completedJobs.length} trip${completedJobs.length === 1 ? '' : 's'}`, '', '', '',
      fareSum(completedJobs).toFixed(2),
      completedJobs.reduce((s, j) => s + j.parkingFee, 0).toFixed(2),
      completedJobs.reduce((s, j) => s + j.otherExpenses, 0).toFixed(2),
      completedJobs.reduce((s, j) => s + j.fareAmount - jobExpenses(j), 0).toFixed(2),
    ])
    const csv = [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\r\n')
    // ﻿ prefix is a UTF-8 BOM so Excel renders £/names correctly
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `aerodriver-transfers-${activeDate || 'all'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const printInvoice = () => {
    const win = window.open('', '_blank')
    if (!win) return
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const gross = fareSum(completedJobs)
    const expenses = completedJobs.reduce((s, j) => s + jobExpenses(j), 0)
    const rows = completedJobs.map((j, i) => `
      <tr style="background:${i % 2 ? '#f8fafc' : '#fff'}">
        <td>${esc(new Date(j.pickupAt).toLocaleDateString('en-GB'))}</td>
        <td>${esc(j.passenger)}</td>
        <td>${esc(j.flightNo)}</td>
        <td>${esc(j.airport)}</td>
        <td>${esc(j.pickupPoint)}</td>
        <td style="text-align:right">£${j.fareAmount.toFixed(2)}</td>
      </tr>`).join('')
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>AeroDriver Invoice — ${esc(invoiceDate)}</title>
      <style>
        body { font-family: ui-sans-serif, system-ui, sans-serif; color: #0f172a; max-width: 720px; margin: 40px auto; padding: 0 24px; }
        h1 { font-size: 22px; margin: 0; } .sub { color: #64748b; font-size: 12px; margin-top: 4px; }
        table { width: 100%; border-collapse: collapse; margin-top: 24px; font-size: 13px; }
        th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: #64748b; border-bottom: 2px solid #0f172a; padding: 8px; }
        td { border-bottom: 1px solid #e2e8f0; padding: 8px; }
        .totals { margin-top: 16px; margin-left: auto; width: 260px; font-size: 13px; }
        .totals div { display: flex; justify-content: space-between; padding: 4px 8px; }
        .grand { font-weight: 800; font-size: 15px; border-top: 2px solid #0f172a; }
        .foot { margin-top: 48px; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 12px; }
        @media print { body { margin: 0; } }
      </style></head><body>
      <h1>AeroDriver — Transfer Invoice</h1>
      <p class="sub">${esc(userEmail || 'Driver account')} · ${isViewingToday ? 'Today' : esc(activeDate)} · Issued ${esc(invoiceDate)} · ${completedJobs.length} completed trip${completedJobs.length === 1 ? '' : 's'}</p>
      <table><thead><tr><th>Date</th><th>Passenger</th><th>Flight</th><th>Airport</th><th>Meeting Point</th><th style="text-align:right">Fare</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <div class="totals">
        <div><span>Gross fares</span><span>£${gross.toFixed(2)}</span></div>
        <div><span>Expenses (driver-borne)</span><span>−£${expenses.toFixed(2)}</span></div>
        <div class="grand"><span>Net total</span><span>£${(gross - expenses).toFixed(2)}</span></div>
      </div>
      <p class="foot">Generated by AeroDriver. Expenses shown for reference where they are not rechargeable to the client. Please retain parking receipts.</p>
      <script>window.onload = () => setTimeout(() => window.print(), 150)<\/script>
      </body></html>`)
    win.document.close()
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-4 md:p-6">
      <style>{`@keyframes radar-sweep { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      {/* Top Header */}
      <header className="max-w-4xl mx-auto flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="relative bg-amber-400 text-slate-950 p-2.5 rounded-xl font-bold shadow-lg shadow-amber-400/10">
            <Car className="w-6 h-6" />
            <div className="absolute -top-1.5 -right-1.5 bg-slate-900 border border-amber-400/40 rounded-full p-1 shadow-md">
              <Plane className="w-3 h-3 text-amber-400" />
            </div>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">AeroDriver</h1>
            <p className="text-xs text-slate-400">Chauffeur & Flight Monitoring Portal</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className={`hidden sm:flex items-center gap-2 bg-slate-900 border px-3.5 py-1.5 rounded-full text-xs font-semibold ${online ? 'border-slate-800 text-emerald-400' : 'border-amber-500/40 text-amber-400'}`}>
            <span className={`w-2.5 h-2.5 rounded-full ${online ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
            {online ? 'Live Flight Tracking Active' : 'Offline — Last Known Data'}
          </div>
          {outboxCount > 0 && (
            <div
              title="Changes made offline will sync when signal returns"
              className="flex items-center gap-1.5 bg-slate-900 border border-sky-500/40 text-sky-300 px-3 py-1.5 rounded-full text-xs font-semibold"
            >
              <RefreshCw className="w-3 h-3" />
              {outboxCount} pending sync
            </div>
          )}
          <button
            onClick={openAddJob}
            className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 text-sm transition-all shadow-md shadow-amber-400/10"
          >
            <Plus className="w-4 h-4" />
            Add New Job
          </button>
          {isSupabaseConfigured && (
            <button
              onClick={handleSignOut}
              title={userEmail ? `Sign out (${userEmail})` : 'Sign out'}
              aria-label="Sign out"
              className="bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 p-2.5 rounded-xl transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-4xl mx-auto space-y-6">

        {/* Offline Banner */}
        {!online && (
          <div className="bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-bold rounded-xl px-4 py-2.5 flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0"></span>
            Offline — showing last known flight data. Updates resume automatically when signal returns.
          </div>
        )}

        {/* Day Filter */}
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Showing:</span>
          <input
            type="date"
            value={activeDate}
            onChange={(e) => setFilterDate(e.target.value)}
            aria-label="Filter jobs by date"
            className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 font-bold outline-none focus:border-amber-400 transition-colors [color-scheme:dark]"
          />
          {!isViewingToday && (
            <button
              onClick={() => setFilterDate(todayStr)}
              className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-amber-400/15 border border-amber-400/40 text-amber-300 hover:bg-amber-400/25 transition-colors"
            >
              Back to Today
            </button>
          )}
        </div>

        {/* Quick Stats Banner */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5">
            <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">{isViewingToday ? 'Today\u2019s' : 'Day'} Jobs</span>
            <p className="text-2xl font-black text-white mt-0.5">{jobsOnDate.length}</p>
          </div>
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5">
            <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Next Pickup</span>
            <p className="text-2xl font-black text-amber-400 mt-0.5">{nextPickup}</p>
          </div>
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5">
            <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Monitored Flights</span>
            <p className="text-2xl font-black text-emerald-400 mt-0.5">{activeCount} Live</p>
          </div>
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5">
            <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Drive to Airport</span>
            <select
              value={travelMinutes}
              onChange={(e) => setTravelMinutes(Number(e.target.value))}
              aria-label="Drive time to airport"
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-base text-amber-400 font-black outline-none focus:border-amber-400 transition-colors [color-scheme:dark]"
            >
              {TRAVEL_MINUTE_OPTIONS.map((m) => (
                <option key={m} value={m}>{m} min</option>
              ))}
            </select>
          </div>
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5">
            <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Gross Fares</span>
            <p className="text-2xl font-black text-slate-200 mt-0.5">{grossFaresLabel}</p>
          </div>
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5">
            <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Total Expenses</span>
            <p className="text-2xl font-black text-slate-200 mt-0.5">{expensesLabel}</p>
          </div>
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5">
            <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Day Earnings</span>
            <p className="text-2xl font-black text-white mt-0.5">{dayEarningsLabel}</p>
          </div>
          <div className="bg-slate-900/90 border border-emerald-500/30 rounded-xl p-3.5">
            <span className="text-xs text-emerald-400/80 uppercase tracking-wider font-semibold">Net Profit</span>
            <p className="text-2xl font-black text-emerald-400 mt-0.5">{netProfitLabel}</p>
          </div>
        </div>

        {/* Billing Export */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2.5 text-xs">
            <Download className="w-4 h-4 text-amber-400" />
            <span className="font-bold text-slate-200">Billing Export</span>
            <span className="text-slate-500">
              {completedCount > 0
                ? `${completedCount} completed trip${completedCount === 1 ? '' : 's'} ready`
                : 'Complete a trip to export'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={downloadCsv}
              disabled={completedCount === 0}
              className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 hover:border-amber-400/50 hover:text-amber-300 transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
            <button
              onClick={printInvoice}
              disabled={completedCount === 0}
              className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 hover:border-amber-400/50 hover:text-amber-300 transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              <Printer className="w-3.5 h-3.5" /> Invoice / Print
            </button>
          </div>
        </div>

        {/* Tab Filters */}
        <div className="flex border-b border-slate-800 gap-6 text-sm font-semibold">
          <button 
            onClick={() => setActiveTab('upcoming')}
            className={`pb-3 border-b-2 transition-colors ${activeTab === 'upcoming' ? 'border-amber-400 text-amber-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            Active Trips ({activeCount})
          </button>
          <button 
            onClick={() => setActiveTab('completed')}
            className={`pb-3 border-b-2 transition-colors ${activeTab === 'completed' ? 'border-amber-400 text-amber-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            Completed ({completedCount})
          </button>
        </div>

        {/* Job Cards */}
        <div className="space-y-5">
          {visibleJobs.length === 0 && (
            <div className="bg-slate-900/60 border border-dashed border-slate-800 rounded-2xl p-8 text-center text-sm text-slate-500">
              {jobsOnDate.length === 0 && jobs.length > 0
                ? `No trips on ${activeDate} — ${jobs.length} job${jobs.length === 1 ? '' : 's'} exist on other dates.`
                : activeTab === 'upcoming'
                  ? 'No active trips — click "Add New Job" to get started.'
                  : 'No trips completed on this date.'}
            </div>
          )}

          {visibleJobs.map((job) => {
            const isExpanded = expandedFlight === job.id
            const stage = job.stage
            const completed = isCompleted(job)
            const entry = telemetry[flightCode(job.flightNo)]
            const live = entry?.flight
            const flightError = flightErrors[flightCode(job.flightNo)]
            const stale = !online || (entry != null && nowMs - entry.fetchedAt > STALE_MS)

            const originStr = live?.origin ?? job.origin
            const destStr = live?.destination ?? job.airport
            const originCode = originStr.split(' ')[0]
            const originCity = originStr.match(/\((.*?)\)/)?.[1] ?? ''
            const destCode = destStr.split(' ')[0]
            const destCity = destStr.match(/\((.*?)\)/)?.[1] ?? ''
            const touchdownMs = Date.parse(live?.actualArrivalUtc ?? live?.estimatedArrivalUtc ?? '')
            const scheduledArrMs = Date.parse(live?.scheduledArrivalUtc ?? '')
            const delayMin =
              Number.isFinite(scheduledArrMs) && Number.isFinite(touchdownMs)
                ? Math.round((touchdownMs - scheduledArrMs) / 60_000)
                : null
            // Kerbside-ready time: touchdown + passport + baggage buffer.
            const kerbsideMs = Number.isFinite(touchdownMs)
              ? touchdownMs + ARRIVAL_BUFFER_MIN * 60_000
              : NaN
            const landed =
              live?.status === 'Arrived' ||
              live?.statusLabel === 'Landed' ||
              job.flightStatus === 'Landed' ||
              (Number.isFinite(touchdownMs) && nowMs >= touchdownMs)
            const progress = landed ? 100 : (live?.progress ?? job.progress)
            const flightStatusLabel = landed ? 'Landed' : (live?.statusLabel ?? job.flightStatus)
            const flightStatusColor = landed
              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
              : live ? liveStatusColor(live.status) : job.statusColor
            const altitude = live?.altitudeFt != null ? `${Math.round(live.altitudeFt).toLocaleString()} ft` : job.altitude
            const airspeed = live?.groundSpeedKt != null ? `${Math.round(live.groundSpeedKt)} kts` : job.airspeed
            const estArrival = live?.actualArrivalUtc
              ? formatHHMM(live.actualArrivalUtc)
              : live?.estimatedArrivalUtc
                ? formatHHMM(live.estimatedArrivalUtc)
                : job.estimatedArrival
            const terminal = live && live.terminal !== 'TBC' ? `Terminal ${live.terminal}` : job.terminal
            const belt = live?.baggageBelt ?? job.baggageBelt
            const airlineLine = live ? `${live.airline} — ${live.destination}` : `${job.airline} — ${job.airport}`
            const contactMessage = `Hi ${job.passenger.split(' ')[0] || 'there'}, this is your driver. I'm tracking flight ${job.flightNo} (${flightStatusLabel}, est. touchdown ${estArrival}). I will meet you at ${job.pickupPoint}.`
            const waPhone = job.phone.replace(/\D/g, '').replace(/^00/, '').replace(/^0/, '44')
            // Leave By anchors to kerbside-ready time when live telemetry
            // exists, else the driver's manually set pickup time.
            const leaveByMs = (Number.isFinite(kerbsideMs) ? kerbsideMs : Date.parse(job.pickupAt)) - travelMinutes * 60_000
            const departNow = nowMs > 0 && Number.isFinite(leaveByMs) && leaveByMs <= nowMs

            const t = progress / 100
            const p0 = { x: 24, y: 116 }
            const p1 = { x: 200, y: 4 }
            const p2 = { x: 376, y: 116 }
            const mt = 1 - t
            const planeX = (mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x) / 400 * 100
            const planeY = (mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y) / 140 * 100
            const dx = 2 * mt * (p1.x - p0.x) + 2 * t * (p2.x - p1.x)
            const dy = 2 * mt * (p1.y - p0.y) + 2 * t * (p2.y - p1.y)
            const planeAngle = Math.atan2(dy, dx) * 180 / Math.PI + 45

            return (
              <div key={job.id} className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 md:p-6 transition-all shadow-xl">
                
                {/* Flight & Passenger Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="bg-amber-400/10 text-amber-400 p-3 rounded-xl border border-amber-400/20">
                      <Plane className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-white text-xl">{job.flightNo}</span>
                        <span className="text-xs text-slate-500 font-mono">• {job.id.slice(0, 8).toUpperCase()}</span>
                      </div>
                      <p className="text-xs font-medium text-slate-400">{airlineLine}</p>
                      {entry && nowMs > 0 && (
                        <p className={`text-[10px] font-medium ${stale ? 'text-amber-400' : 'text-slate-500'}`}>
                          {formatAge(nowMs - entry.fetchedAt)}{!online ? ' — offline' : ''}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1.5 rounded-full text-xs font-bold border ${completed ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' : 'bg-amber-400/10 text-amber-300 border-amber-400/30'}`}>
                      {DRIVER_STAGES[stage]}
                    </span>
                    <div className={`px-3 py-1.5 rounded-full text-xs font-bold border ${flightStatusColor}`}>
                      {flightStatusLabel}
                    </div>
                    {flightError && (
                      <div
                        title={flightError.error}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold border ${
                          flightError.kind === 'not_found'
                            ? 'bg-red-500/20 text-red-400 border-red-500/40'
                            : 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                        }`}
                      >
                        {flightError.kind === 'not_found'
                          ? 'Flight Not Found'
                          : flightError.kind === 'rate_limited'
                            ? 'API Rate Limited'
                            : 'Telemetry Error'}
                      </div>
                    )}
                    <button
                      onClick={() => openEditJob(job)}
                      aria-label={`Edit job ${job.id}`}
                      title="Edit job"
                      className="text-slate-500 hover:text-amber-300 hover:bg-amber-400/10 border border-transparent hover:border-amber-400/30 rounded-lg p-1.5 transition-all"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(job.id)}
                      aria-label={confirmingDelete === job.id ? `Confirm delete job ${job.id}` : `Delete job ${job.id}`}
                      title="Delete job"
                      className={`rounded-lg border transition-all ${
                        confirmingDelete === job.id
                          ? 'text-red-300 bg-red-500/15 border-red-500/50 font-bold text-xs px-2.5 py-1.5'
                          : 'text-slate-500 hover:text-red-400 hover:bg-red-500/10 border-transparent hover:border-red-500/30 p-1.5'
                      }`}
                    >
                      {confirmingDelete === job.id ? 'Confirm' : <X className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Main Details Grid */}
                <div className="grid md:grid-cols-2 gap-4 text-sm mb-4">
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2.5 text-slate-200">
                      <User className="w-4 h-4 text-amber-400" />
                      <span className="font-bold text-white text-base">{job.passenger}</span>
                    </div>
                    <div className="flex items-center gap-2.5 text-slate-300">
                      <Phone className="w-4 h-4 text-slate-400" />
                      <span>{job.phone}</span>
                    </div>
                    {job.phone && (
                      <div className="flex items-center gap-2 pt-0.5">
                        <a
                          href={`tel:${job.phone}`}
                          className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 hover:border-emerald-500/50 hover:text-emerald-300 transition-colors"
                        >
                          <Phone className="w-3.5 h-3.5" /> Call
                        </a>
                        <a
                          href={`sms:${job.phone}?&body=${encodeURIComponent(contactMessage)}`}
                          className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 hover:border-emerald-500/50 hover:text-emerald-300 transition-colors"
                        >
                          <MessageSquare className="w-3.5 h-3.5" /> SMS
                        </a>
                        {waPhone && (
                          <a
                            href={`https://wa.me/${waPhone}?text=${encodeURIComponent(contactMessage)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 hover:border-emerald-500/50 hover:text-emerald-300 transition-colors"
                          >
                            <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                          </a>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-2.5 text-slate-300">
                      <Clock className="w-4 h-4 text-slate-400" />
                      <span>Pickup Time: <strong className="text-amber-400">{formatHHMM(job.pickupAt)}</strong></span>
                    </div>
                    {Number.isFinite(kerbsideMs) && !completed && (
                      <div
                        title={`Pickup auto-adjusts to touchdown + ${PASSPORT_MIN}m passport + ${BAGGAGE_MIN}m bags`}
                        className={`flex items-center gap-2 text-[11px] font-bold rounded-lg border px-2.5 py-1.5 w-fit ${
                          delayMin != null && delayMin > ON_TIME_THRESHOLD_MIN
                            ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                            : delayMin != null && delayMin < -ON_TIME_THRESHOLD_MIN
                              ? 'bg-sky-500/10 border-sky-500/40 text-sky-300'
                              : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                        }`}
                      >
                        <TimerReset className="w-3.5 h-3.5 shrink-0" />
                        {delayMin == null || Math.abs(delayMin) <= ON_TIME_THRESHOLD_MIN
                          ? `On time — passenger ready ~${formatHHMM(new Date(kerbsideMs))}`
                          : delayMin > 0
                            ? `+${delayMin} min delay — Pickup moved to ${formatHHMM(new Date(kerbsideMs))}`
                            : `${-delayMin} min early — Pickup moved to ${formatHHMM(new Date(kerbsideMs))}`}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
                    <div className="text-xs">
                      <span className="text-amber-400 font-bold block mb-0.5">Meeting Point:</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-200">{job.pickupPoint}</span>
                        <button
                          onClick={() => handleCopyPoint(job.id, job.pickupPoint)}
                          title="Copy meeting point"
                          aria-label="Copy meeting point"
                          className="p-1 rounded-md text-slate-500 hover:text-amber-300 hover:bg-slate-800 transition-colors"
                        >
                          {copiedId === job.id
                            ? <Check className="w-3.5 h-3.5 text-emerald-400" />
                            : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                    <div className="text-xs pt-1 border-t border-slate-800/60">
                      <span className="text-slate-400 font-bold block mb-0.5">Drop-off Destination:</span>
                      <span className="text-slate-300">{job.destination}</span>
                    </div>
                    <div className="text-xs pt-1 border-t border-slate-800/60">
                      <span className="text-slate-400 font-bold block mb-1">Expenses (£):</span>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5 text-slate-400">
                          Parking
                          <input
                            type="number"
                            min="0"
                            step="0.50"
                            inputMode="decimal"
                            aria-label="Parking fee"
                            value={job.parkingFee || ''}
                            onChange={(e) => updateJobExpense(job.id, 'parkingFee', e.target.value)}
                            placeholder="0"
                            className="w-16 bg-slate-900 border border-slate-700 rounded-md px-1.5 py-0.5 text-slate-200 outline-none focus:border-amber-400 transition-colors [color-scheme:dark]"
                          />
                        </label>
                        <label className="flex items-center gap-1.5 text-slate-400">
                          Other
                          <input
                            type="number"
                            min="0"
                            step="0.50"
                            inputMode="decimal"
                            aria-label="Other expenses"
                            value={job.otherExpenses || ''}
                            onChange={(e) => updateJobExpense(job.id, 'otherExpenses', e.target.value)}
                            placeholder="0"
                            className="w-16 bg-slate-900 border border-slate-700 rounded-md px-1.5 py-0.5 text-slate-200 outline-none focus:border-amber-400 transition-colors [color-scheme:dark]"
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* TOGGLE BUTTON FOR LIVE FLIGHT DETAILS */}
                <div className="border-t border-b border-slate-800/80 my-4 py-2.5">
                  <button 
                    onClick={() => toggleFlightDetails(job.id)}
                    className="w-full flex items-center justify-between text-xs font-bold text-amber-400 hover:text-amber-300 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <Radio className="w-4 h-4 animate-pulse text-amber-400" />
                      {isExpanded ? "Hide Live Flight Radar Details" : "Show Live Flight Radar & Terminal Details"}
                    </span>
                    <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>

                  {/* EXPANDABLE PANEL */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-slate-800/50 space-y-3">
                      {/* FLIGHT TRAJECTORY BOX */}
                      <div 
                        className="relative rounded-xl border border-emerald-500/25 hover:border-emerald-500/45 overflow-hidden bg-slate-950 transition-colors cursor-crosshair group"
                        style={{
                          backgroundImage: `
                            repeating-conic-gradient(rgba(52, 211, 153, 0.035) 0deg 90deg, transparent 90deg 180deg),
                            linear-gradient(rgba(52, 211, 153, 0.08) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(52, 211, 153, 0.08) 1px, transparent 1px),
                            radial-gradient(ellipse at 50% 40%, rgba(16, 185, 129, 0.12), transparent 70%)
                          `,
                          backgroundSize: '36px 36px, 18px 18px, 18px 18px, 100% 100%'
                        }}
                        title={`${job.flightNo} — ${progress}% of route complete`}
                      >
                        {/* Radar sweep */}
                        <div 
                          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[220%] aspect-square opacity-60 group-hover:opacity-100 transition-opacity"
                          style={{
                            background: 'conic-gradient(from 0deg, rgba(52, 211, 153, 0.18), transparent 22%)',
                            animation: 'radar-sweep 9s linear infinite'
                          }}
                        />

                        {/* Box header */}
                        <div className="relative z-10 flex items-center justify-between px-4 pt-3">
                          <span className="text-[10px] font-bold tracking-[0.2em] text-emerald-400 uppercase flex items-center gap-1.5">
                            <Radar className="w-3.5 h-3.5 animate-pulse" />
                            Live Trajectory — {job.flightNo}
                          </span>
                          <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2 py-0.5">
                            {progress}% COMPLETE
                          </span>
                        </div>

                        {/* Arc area */}
                        <div className="relative h-32 md:h-36 mx-3 mt-1">
                          <svg 
                            viewBox="0 0 400 140" 
                            preserveAspectRatio="none" 
                            className="absolute inset-0 w-full h-full"
                          >
                            <path 
                              d="M 24 116 Q 200 4 376 116" 
                              fill="none" 
                              stroke="rgba(148, 163, 184, 0.35)" 
                              strokeWidth="1.5" 
                              strokeDasharray="5 5" 
                              vectorEffect="non-scaling-stroke"
                            />
                            <path 
                              d="M 24 116 Q 200 4 376 116" 
                              fill="none" 
                              stroke="#34d399" 
                              strokeWidth="2.5" 
                              pathLength={100}
                              strokeDasharray={100}
                              strokeDashoffset={100 - progress}
                              vectorEffect="non-scaling-stroke"
                              style={{ filter: 'drop-shadow(0 0 6px rgba(52, 211, 153, 0.9))' }}
                            />
                            <circle cx="24" cy="116" r="4" fill="#020617" stroke="#34d399" strokeWidth="1.5" />
                            <circle cx="376" cy="116" r="4" fill="#020617" stroke={progress >= 100 ? '#34d399' : '#64748b'} strokeWidth="1.5" />
                          </svg>

                          {/* Origin label */}
                          <div className="absolute left-1 bottom-0.5 flex flex-col">
                            <span className="font-mono font-black text-emerald-300 text-sm leading-none">{originCode}</span>
                            <span className="text-[10px] text-slate-400">{originCity}</span>
                          </div>

                          {/* Destination label */}
                          <div className="absolute right-1 bottom-0.5 flex flex-col items-end">
                            <span className="font-mono font-black text-emerald-300 text-sm leading-none">{destCode}</span>
                            <span className="text-[10px] text-slate-400">{destCity}</span>
                          </div>

                          {/* Airplane marker */}
                          <div 
                            className="absolute z-10"
                            style={{ 
                              left: `${planeX}%`, 
                              top: `${planeY}%`, 
                              transform: `translate(-50%, -50%) rotate(${planeAngle}deg)` 
                            }}
                          >
                            <Plane 
                              className="w-5 h-5 text-emerald-300" 
                              style={{ filter: 'drop-shadow(0 0 8px rgba(52, 211, 153, 1))' }}
                            />
                          </div>
                          <div 
                            className="absolute w-8 h-8 rounded-full bg-emerald-400/20 animate-ping pointer-events-none"
                            style={{ left: `calc(${planeX}% - 16px)`, top: `calc(${planeY}% - 16px)` }}
                          />
                        </div>

                        {/* Telemetry strip */}
                        <div className="relative z-10 grid grid-cols-2 md:grid-cols-4 gap-px bg-emerald-500/10 border-t border-emerald-500/20 text-xs">
                          <div className="bg-slate-950/95 px-3 py-2.5">
                            <span className="text-slate-500 font-semibold uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                              <MoveVertical className="w-3 h-3 text-emerald-500" /> Altitude
                            </span>
                            <span className="text-emerald-300 font-mono font-bold block mt-0.5">{altitude}</span>
                          </div>
                          <div className="bg-slate-950/95 px-3 py-2.5">
                            <span className="text-slate-500 font-semibold uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                              <Gauge className="w-3 h-3 text-emerald-500" /> Airspeed
                            </span>
                            <span className="text-emerald-300 font-mono font-bold block mt-0.5">{airspeed}</span>
                          </div>
                          <div className="bg-slate-950/95 px-3 py-2.5">
                            <span className="text-slate-500 font-semibold uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                              <PlaneLanding className="w-3 h-3 text-emerald-500" /> Est. Touchdown
                            </span>
                            <span className="text-emerald-300 font-mono font-bold block mt-0.5">{estArrival}</span>
                          </div>
                          <div className="bg-slate-950/95 px-3 py-2.5">
                            <span className="text-slate-500 font-semibold uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                              <Luggage className="w-3 h-3 text-emerald-500" /> Baggage Belt
                            </span>
                            <span className="text-amber-400 font-mono font-bold block mt-0.5">{belt}</span>
                          </div>
                        </div>
                      </div>

                      {/* Terminal & signal info */}
                      <div className="grid grid-cols-2 gap-3 bg-slate-950/80 p-3.5 rounded-xl text-xs">
                        <div>
                          <span className="text-slate-500 block font-medium">Terminal & Gate:</span>
                          <span className="text-slate-200 font-semibold">{terminal}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block font-medium">Live Telemetry:</span>
                          <span className="text-emerald-400 font-bold">Signal Strong (ADS-B)</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Card Action Footer */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex flex-wrap items-center gap-6">
                    <div>
                      <span className="text-xs text-slate-500 block">Fare Value</span>
                      <span className="text-xl font-black text-white">{formatFare(job.fareAmount)}</span>
                    </div>
                    <div>
                      <span className="text-xs text-slate-500 block">Leave By</span>
                      <span
                        title={`Touchdown minus ${travelMinutes} min drive`}
                        className={`text-xl font-black ${departNow ? 'text-red-400 animate-pulse' : 'text-amber-400'}`}
                      >
                        {departNow ? 'Now' : formatHHMM(new Date(leaveByMs))}
                      </span>
                    </div>
                    {jobExpenses(job) > 0 && (
                      <div>
                        <span className="text-xs text-slate-500 block">Net</span>
                        <span className="text-xl font-black text-emerald-400">{formatFare(job.fareAmount - jobExpenses(job))}</span>
                        <span className="text-[10px] text-slate-500 block">
                          {formatFare(job.fareAmount)} − {formatFare(job.parkingFee)} park − {formatFare(job.otherExpenses)} other
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => setGuideJob(job)}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 font-bold px-5 py-2.5 rounded-xl flex items-center gap-2 transition-all text-sm"
                    >
                      Airport Guide
                      <MapPin className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => setGreetingJob(job)}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 font-bold px-5 py-2.5 rounded-xl flex items-center gap-2 transition-all text-sm"
                    >
                      Show Greeting Sign
                      <Presentation className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => openDirections(job.pickupPoint)}
                      className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold px-5 py-2.5 rounded-xl flex items-center gap-2 transition-all shadow-md shadow-amber-400/10 text-sm"
                    >
                      Start Driver Guidance
                      <Navigation className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => advanceJobStage(job.id)}
                      disabled={completed}
                      className={`font-bold px-5 py-2.5 rounded-xl flex items-center gap-2 transition-all text-sm ${
                        completed
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 cursor-default'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700'
                      }`}
                    >
                      {completed ? 'Trip Completed' : NEXT_STAGE_LABELS[stage]}
                      {completed ? <CheckCircle2 className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

              </div>
            )
          })}
        </div>

      </main>

      {/* ADD NEW JOB MODAL */}
      {showAddJob && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex justify-center overflow-y-auto p-4 pb-8 pt-[max(2rem,calc(env(safe-area-inset-top,0px)_+_0.75rem))]"
          onClick={closeJobModal}
        >
          <div
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="bg-amber-400/10 text-amber-400 p-2 rounded-lg border border-amber-400/20">
                  {editingJob ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                </div>
                <h2 className="text-lg font-bold text-white">{editingJob ? 'Edit Job' : 'Add New Job'}</h2>
              </div>
              <button 
                onClick={closeJobModal}
                className="text-slate-400 hover:text-white transition-colors p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitJob} className="space-y-3.5">
              {NEW_JOB_FIELDS.map((field) => (
                <div key={field.name}>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                    {field.label}
                  </label>
                  {field.type === 'time' ? (
                    <div className="flex gap-2">
                      <select
                        required
                        aria-label="Pickup hour"
                        value={form.pickupHour}
                        onChange={(e) => setForm({ ...form, pickupHour: e.target.value })}
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-400 transition-colors [color-scheme:dark]"
                      >
                        <option value="" disabled>HH</option>
                        {PICKUP_HOURS.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                      <select
                        required
                        aria-label="Pickup minute"
                        value={form.pickupMinute}
                        onChange={(e) => setForm({ ...form, pickupMinute: e.target.value })}
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-400 transition-colors [color-scheme:dark]"
                      >
                        <option value="" disabled>MM</option>
                        {form.pickupMinute && !PICKUP_MINUTES.includes(form.pickupMinute) && (
                          <option value={form.pickupMinute}>{form.pickupMinute}</option>
                        )}
                        {PICKUP_MINUTES.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <input
                      type={field.type}
                      step={field.step}
                      min={field.min}
                      name={field.name}
                      required={!field.optional}
                      value={form[field.name as keyof typeof form]}
                      onChange={(e) => setForm({ ...form, [field.name]: e.target.value })}
                      placeholder={field.placeholder}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-amber-400 transition-colors [color-scheme:dark]"
                    />
                  )}
                  {field.name === 'meetingPoint' && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {MEETING_PRESETS.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setForm({ ...form, meetingPoint: p })}
                          className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition-colors ${
                            form.meetingPoint === p
                              ? 'bg-amber-400/15 border-amber-400/50 text-amber-300'
                              : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-amber-400/50 hover:text-amber-300'
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  )}
                  {field.name === 'parking' && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {PARKING_PRESETS.map((p) => (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => setForm({ ...form, parking: p.value })}
                          className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition-colors ${
                            form.parking === p.value
                              ? 'bg-amber-400/15 border-amber-400/50 text-amber-300'
                              : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-amber-400/50 hover:text-amber-300'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeJobModal}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold px-4 py-2.5 rounded-xl text-sm transition-all border border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-sm transition-all shadow-md shadow-amber-400/10 flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {editingJob ? 'Save Changes' : 'Add Job'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AIRPORT TERMINAL GUIDE MODAL */}
      {guideJob && (() => {
        const live = telemetry[flightCode(guideJob.flightNo)]?.flight
        const guide: AirportGuide = airportGuideFor(
          `${live?.destination ?? ''} ${guideJob.airport} ${guideJob.terminal}`
        )
        const wantedTerminal = guideJob.terminal.match(/T(\d)/i)?.[1] ?? live?.terminal ?? ''
        return (
          <div
            className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex justify-center overflow-y-auto p-4 pb-8 pt-[max(2rem,calc(env(safe-area-inset-top,0px)_+_0.75rem))]"
            onClick={() => setGuideJob(null)}
          >
            <div
              className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl my-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="bg-amber-400/10 text-amber-400 p-2 rounded-lg border border-amber-400/20">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">{guide.name}</h2>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider">Driver Cheat Sheet — {guideJob.flightNo}</p>
                  </div>
                </div>
                <button
                  onClick={() => setGuideJob(null)}
                  aria-label="Close airport guide"
                  className="text-slate-400 hover:text-white transition-colors p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4 text-sm">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block mb-2">Terminal Pickup Zones</span>
                  <div className="space-y-1.5">
                    {guide.terminals.map((t) => (
                      <div
                        key={t.terminal}
                        className={`rounded-lg border px-3 py-2 text-xs ${
                          wantedTerminal && (t.terminal.includes(wantedTerminal) || t.terminal.toLowerCase().includes('single'))
                            ? 'border-amber-400/50 bg-amber-400/10'
                            : 'border-slate-800 bg-slate-950/60'
                        }`}
                      >
                        <span className="font-bold text-slate-200">{t.terminal}: </span>
                        <span className="text-slate-300">{t.pickup}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">Express Drop-off</span>
                    <p className="text-xs text-slate-300 leading-relaxed">{guide.dropoff}</p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">Driver Holding Area</span>
                    <p className="text-xs text-slate-300 leading-relaxed">{guide.holding}</p>
                  </div>
                </div>

                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block mb-1">Short-Stay Parking Tip</span>
                  <p className="text-xs text-slate-300 leading-relaxed">{guide.parkingTip}</p>
                </div>

                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block mb-1.5">Pro Tips</span>
                  <ul className="space-y-1.5">
                    {guide.tips.map((tip, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-slate-300 leading-relaxed">
                        <span className="w-1 h-1 rounded-full bg-amber-400 mt-1.5 shrink-0"></span>
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>

                <p className="flex items-start gap-1.5 text-[10px] text-slate-500 leading-relaxed border-t border-slate-800 pt-3">
                  <Info className="w-3 h-3 shrink-0 mt-px" />
                  Charges and zones change regularly — confirm on the airport&apos;s official site before billing expenses.
                </p>
              </div>
            </div>
          </div>
        )
      })()}

      {/* GREETING SIGN MODAL */}
      {greetingJob && (
        <div 
          className="fixed inset-0 z-50 bg-black flex items-center justify-center p-4"
          onClick={() => setGreetingJob(null)}
          style={{
            backgroundImage: 'radial-gradient(ellipse at 50% 35%, rgba(251, 191, 36, 0.07), transparent 65%)'
          }}
        >
          <div 
            className="relative w-full max-w-3xl border border-amber-500/25 rounded-3xl p-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border border-amber-400/40 rounded-[1.35rem] px-6 py-12 md:px-14 md:py-16 text-center bg-slate-950/60">
              {/* Brand line */}
              <div className="flex items-center justify-center gap-3 text-amber-500/90 mb-8">
                <span className="h-px w-10 md:w-16 bg-gradient-to-r from-transparent to-amber-500/60"></span>
                <span className="text-[10px] md:text-xs font-bold tracking-[0.45em] uppercase">AeroDriver</span>
                <span className="h-px w-10 md:w-16 bg-gradient-to-l from-transparent to-amber-500/60"></span>
              </div>

              {/* Welcome */}
              <p className="text-slate-400 text-xs md:text-sm font-semibold tracking-[0.6em] uppercase mb-4">
                Welcome
              </p>

              {/* Passenger name */}
              <h2 className="font-serif font-bold uppercase tracking-wide leading-tight text-4xl md:text-6xl text-transparent bg-clip-text bg-gradient-to-b from-amber-100 via-amber-300 to-amber-600 break-words">
                {greetingJob.passenger}
              </h2>

              {/* Ornamental divider */}
              <div className="flex items-center justify-center gap-3 mt-8 mb-8">
                <span className="h-px w-16 md:w-24 bg-gradient-to-r from-transparent to-amber-500/60"></span>
                <Diamond className="w-3.5 h-3.5 text-amber-400" />
                <span className="h-px w-16 md:w-24 bg-gradient-to-l from-transparent to-amber-500/60"></span>
              </div>

              {/* Flight meta */}
              <p className="text-slate-400 text-xs md:text-sm tracking-[0.25em] uppercase">
                Flight {greetingJob.flightNo} <span className="text-amber-500/70 mx-2">•</span> {greetingJob.airport}
              </p>
              <p className="text-slate-500 text-[10px] md:text-xs tracking-[0.3em] uppercase mt-2">
                Chauffeur Meeting Point — {greetingJob.pickupPoint}
              </p>
            </div>

            {/* Close */}
            <div className="flex justify-center mt-6 mb-1">
              <button
                onClick={() => setGreetingJob(null)}
                className="border border-amber-400/40 hover:border-amber-300 text-amber-300 hover:text-amber-200 font-bold px-10 py-3 rounded-full text-xs tracking-[0.3em] uppercase transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
