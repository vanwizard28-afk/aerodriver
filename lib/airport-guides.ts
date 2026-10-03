// Airport terminal cheat sheets for chauffeurs. Charges and zones change
// regularly — treat as guidance and confirm on the airport's own site.
export type TerminalPickup = {
  terminal: string
  pickup: string
}

export type AirportGuide = {
  code: string
  name: string
  terminals: TerminalPickup[]
  dropoff: string
  holding: string
  parkingTip: string
  tips: string[]
}

export const GENERIC_GUIDE: AirportGuide = {
  code: "—",
  name: "General UK Airport Guide",
  terminals: [
    {
      terminal: "Arrivals",
      pickup: "Never wait on the terminal forecourt — use Short Stay or the free holding area until the passenger messages they're landside.",
    },
  ],
  dropoff: "Most UK airports charge for terminal forecourt drop-off (typically £4–£7). Check the airport site before you go.",
  holding: "Look for a free waiting / long-stay grace area — many airports offer 30–60 min free parking a short ride from the terminal.",
  parkingTip: "Pre-book Short Stay online where possible — drive-up rates are significantly higher.",
  tips: [
    "Message the passenger your exact meeting point once they're through passport control.",
    "Keep the flight number visible in the app — landed ≠ landside; allow passport + bags time.",
    "Save receipts for parking so they can be recharged or logged as expenses.",
  ],
}

export const AIRPORT_GUIDES: Record<string, AirportGuide> = {
  LHR: {
    code: "LHR",
    name: "London Heathrow",
    terminals: [
      { terminal: "T2", pickup: "Short Stay 2 car park — Level 4 rows A–D nearest lifts." },
      { terminal: "T3", pickup: "Short Stay 3 car park — meet at lifts on Level 1." },
      { terminal: "T4", pickup: "Short Stay 4 car park — directly opposite arrivals." },
      { terminal: "T5", pickup: "Short Stay 5 car park — Level 4, near the arrivals exit." },
    ],
    dropoff: "Forecourt drop-off charge applies at all terminals (ANPR, pay online by midnight the next day — no barriers).",
    holding: "Heathrow Authorised Vehicle Area (AVA) off Northern Perimeter Road — free waiting for licensed drivers, toilets on site. From the AVA it's ~10 min to any terminal.",
    parkingTip: "Short Stay is charged by the half hour — time entry to after the flight is on the ground + passport queue.",
    tips: [
      "Non-UK/EU passports can take 45–90 min through immigration — don't enter Short Stay too early.",
      "T5 has its own dedicated Short Stay; T2/T3 share the central tunnel approach.",
      "Terminal is announced late — always re-check the live flight card before you park.",
    ],
  },
  LGW: {
    code: "LGW",
    name: "London Gatwick",
    terminals: [
      { terminal: "North", pickup: "Short Stay North (Car Park 5) — lifts to arrivals." },
      { terminal: "South", pickup: "Short Stay South (Orange car park) — Level 3 nearest terminal." },
    ],
    dropoff: "Forecourt drop-off charge at both terminals (ANPR, pay online). Free drop-off available at Long Stay with shuttle.",
    holding: "Long Stay car parks offer a free grace period — wait there until the passenger is at the doors, then move to Short Stay or the forecourt.",
    parkingTip: "If the passenger is delayed landside, the Long Stay free window is cheaper than looping the forecourt.",
    tips: [
      "North and South terminals are linked by a 2-min shuttle — confirm which one the flight uses.",
      "The inter-terminal shuttle lands at the same arrivals level — useful fallback meeting point.",
    ],
  },
  MAN: {
    code: "MAN",
    name: "Manchester Airport",
    terminals: [
      { terminal: "T1", pickup: "T1 Short Stay / multi-storey — ground floor rows by the lifts." },
      { terminal: "T2", pickup: "T2 multi-storey West — meet at the arrivals walk exit." },
      { terminal: "T3", pickup: "T3 is a short covered walk from T1 — pick up at the T1 zone." },
    ],
    dropoff: "Forecourt drop-off is charged (ANPR barrier-free — pay online). Free drop-off zone at JetParks with shuttle.",
    holding: "Use the free period in a Long Stay / JetParks zone, or the on-site waiting area off Ringway Road, until the passenger texts.",
    parkingTip: "T2 forecourt queuing is enforced — pick up in the multi-storey instead to avoid fines.",
    tips: [
      "T2 arrivals can be a long walk from gates — add ~10 min buffer on touchdown.",
      "Terminal assignments shift between T1/T2 for the same flight — confirm on the day.",
    ],
  },
  BHX: {
    code: "BHX",
    name: "Birmingham Airport",
    terminals: [
      { terminal: "Single terminal", pickup: "Premium Set Down / Short Stay 1 — a 1–2 min walk to arrivals." },
    ],
    dropoff: "Free drop-off at Car Park 5 area with a short walk/shuttle; premium forecourt set-down is charged.",
    holding: "Car Park 5 free drop-off zone doubles as a sensible wait spot — hold there until the passenger is landside.",
    parkingTip: "Short Stay 1 is closest to arrivals; Premium Set Down is closest but priced per short stay.",
    tips: [
      "Arrivals is compact — agree a door/landmark rather than just 'arrivals'.",
      "The free drop-off area is well signed but adds ~5 min walk — factor it into pickup timing.",
    ],
  },
  EMA: {
    code: "EMA",
    name: "East Midlands Airport",
    terminals: [
      { terminal: "Single terminal", pickup: "Short Stay 1 car park — directly in front of arrivals." },
    ],
    dropoff: "Express drop-off is charged at the terminal front (ANPR). Free waiting available in Long Stay.",
    holding: "Long Stay offers a free grace window — the standard move is to wait there and pull forward on the passenger's text.",
    parkingTip: "Short Stay 1 drive-up rate is modest — usually the cheapest way to be kerbside within 2 minutes.",
    tips: [
      "The terminal is small — passengers are typically kerbside within 20 min of touchdown.",
      "Rapid turnover: arrivals and departures share the same frontage, watch for the correct lane.",
    ],
  },
}

const GUIDE_CODES = /\b(LHR|LGW|MAN|BHX|EMA)\b/i

// Resolve a guide from any free-text airport field ('LHR (London Heathrow) T3',
// 'Heathrow T5', live destination string, ...).
export function airportGuideFor(text: string): AirportGuide {
  const m = text.match(GUIDE_CODES)
  if (m) {
    const guide = AIRPORT_GUIDES[m[1].toUpperCase()]
    if (guide) return guide
  }
  const lower = text.toLowerCase()
  if (lower.includes("heathrow")) return AIRPORT_GUIDES.LHR
  if (lower.includes("gatwick")) return AIRPORT_GUIDES.LGW
  if (lower.includes("manchester")) return AIRPORT_GUIDES.MAN
  if (lower.includes("birmingham")) return AIRPORT_GUIDES.BHX
  if (lower.includes("east midlands")) return AIRPORT_GUIDES.EMA
  return GENERIC_GUIDE
}
