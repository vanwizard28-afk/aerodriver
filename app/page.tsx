"use client"

import React, { useEffect, useState, useSyncExternalStore } from 'react'
import { Plane, Car, Clock, Navigation, CheckCircle2, ChevronRight, ChevronDown, User, Phone, Radio, Radar, Gauge, PlaneLanding, Luggage, MoveVertical, Plus, X, Presentation, Diamond, MessageSquare, MessageCircle, Copy, Check } from 'lucide-react'

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
  stage: number
}

type JobFormField = {
  name: 'passenger' | 'phone' | 'flightNo' | 'airport' | 'meetingPoint' | 'pickupTime' | 'fare'
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
  { name: 'pickupTime', label: 'Pickup Time', type: 'time' },
  { name: 'fare', label: 'Fare (£)', type: 'number', placeholder: '0.00', step: '0.01', min: '0' },
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
    stage: typeof j.stage === 'number' ? j.stage : (legacyStages[String(j.id)] ?? 0),
  }
}

export default function AeroDriverDashboard() {
  const [activeTab, setActiveTab] = useState<'upcoming' | 'completed'>('upcoming')
  const [expandedFlight, setExpandedFlight] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [storageLoaded, setStorageLoaded] = useState(false)
  const [showAddJob, setShowAddJob] = useState(false)
  const [greetingJob, setGreetingJob] = useState<Job | null>(null)
  const [telemetry, setTelemetry] = useState<Record<string, StoredTelemetry>>({})
  const [flightErrors, setFlightErrors] = useState<Record<string, FlightError>>({})
  const [nowMs, setNowMs] = useState(0)
  const [travelMinutes, setTravelMinutes] = useState(45)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const online = useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getOnlineServerSnapshot)
  const [form, setForm] = useState({ passenger: '', phone: '', flightNo: '', airport: '', meetingPoint: '', pickupHour: '', pickupMinute: '', fare: '' })

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const storedJobs = localStorage.getItem('aerodriver-jobs')
        const storedStages = localStorage.getItem('aerodriver-stages')
        const legacyStages: Record<string, number> = storedStages ? JSON.parse(storedStages) : {}
        if (storedJobs) {
          setJobs((JSON.parse(storedJobs) as Record<string, unknown>[]).map((j) => normalizeJob(j, legacyStages)))
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
      } catch {}
      setStorageLoaded(true)
    })
  }, [])

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
    const tick = setInterval(() => setNowMs(Date.now()), 30 * 1000)
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

  const advanceJobStage = (id: string) => {
    setJobs(prev => prev.map(j => j.id === id
      ? { ...j, stage: Math.min(j.stage + 1, DRIVER_STAGES.length - 1) }
      : j))
  }

  const handleDelete = (id: string) => {
    if (confirmingDelete === id) {
      setJobs(prev => prev.filter(j => j.id !== id))
      if (expandedFlight === id) setExpandedFlight(null)
      setConfirmingDelete(null)
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

  const handleAddJob = (e: React.FormEvent) => {
    e.preventDefault()
    const pickupDate = new Date()
    pickupDate.setHours(Number(form.pickupHour), Number(form.pickupMinute), 0, 0)
    if (pickupDate.getTime() < Date.now()) pickupDate.setDate(pickupDate.getDate() + 1)

    const newJob: Job = {
      id: `JOB-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
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
      destination: 'TBC',
      fareAmount: parseFloat(form.fare) || 0,
      stage: 0,
    }
    setJobs(prev => [...prev, newJob])
    setActiveTab('upcoming')
    setShowAddJob(false)
    setForm({ passenger: '', phone: '', flightNo: '', airport: '', meetingPoint: '', pickupHour: '', pickupMinute: '', fare: '' })
  }

  const visibleJobs = jobs.filter(j => activeTab === 'upcoming' ? !isCompleted(j) : isCompleted(j))
  const activeCount = jobs.filter(j => !isCompleted(j)).length
  const completedCount = jobs.length - activeCount

  const pickupTimes = jobs
    .filter((j) => !isCompleted(j))
    .map((j) => new Date(j.pickupAt).getTime())
    .filter((t) => !isNaN(t))
  const nextPickup = pickupTimes.length ? formatHHMM(new Date(Math.min(...pickupTimes))) : '--:--'

  const fareSum = (list: Job[]) => list.reduce((sum, j) => sum + j.fareAmount, 0)
  const formatFare = (n: number) => `£${n % 1 === 0 ? n : n.toFixed(2)}`

  const dayEarningsLabel = formatFare(fareSum(jobs.filter(isCompleted)))
  const totalBookedLabel = formatFare(fareSum(jobs))

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
          <button
            onClick={() => setShowAddJob(true)}
            className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 text-sm transition-all shadow-md shadow-amber-400/10"
          >
            <Plus className="w-4 h-4" />
            Add New Job
          </button>
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

        {/* Quick Stats Banner */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5">
            <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Today&apos;s Jobs</span>
            <p className="text-2xl font-black text-white mt-0.5">{jobs.length}</p>
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
            <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Total Booked</span>
            <p className="text-2xl font-black text-slate-200 mt-0.5">{totalBookedLabel}</p>
          </div>
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 col-span-2 md:col-span-1">
            <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Day Earnings</span>
            <p className="text-2xl font-black text-white mt-0.5">{dayEarningsLabel}</p>
          </div>
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 col-span-2 md:col-span-1">
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
            Completed Today ({completedCount})
          </button>
        </div>

        {/* Job Cards */}
        <div className="space-y-5">
          {visibleJobs.length === 0 && (
            <div className="bg-slate-900/60 border border-dashed border-slate-800 rounded-2xl p-8 text-center text-sm text-slate-500">
              {activeTab === 'upcoming' ? 'No active trips — click "Add New Job" to get started.' : 'No trips completed yet.'}
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
            const leaveByMs = (Number.isFinite(touchdownMs) ? touchdownMs : Date.parse(job.pickupAt)) - travelMinutes * 60_000
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
                        <span className="text-xs text-slate-500 font-mono">• {job.id}</span>
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
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
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
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowAddJob(false)}
        >
          <div 
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="bg-amber-400/10 text-amber-400 p-2 rounded-lg border border-amber-400/20">
                  <Plus className="w-4 h-4" />
                </div>
                <h2 className="text-lg font-bold text-white">Add New Job</h2>
              </div>
              <button 
                onClick={() => setShowAddJob(false)}
                className="text-slate-400 hover:text-white transition-colors p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddJob} className="space-y-3.5">
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
                </div>
              ))}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddJob(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold px-4 py-2.5 rounded-xl text-sm transition-all border border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-sm transition-all shadow-md shadow-amber-400/10 flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Add Job
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
