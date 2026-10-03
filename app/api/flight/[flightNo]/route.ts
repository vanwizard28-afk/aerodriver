import { NextResponse } from "next/server";

const API_HOST = "aerodatabox.p.rapidapi.com";

type AdbTime = { utc?: string; local?: string };

type AdbFlight = {
  number?: string;
  status?: string;
  airline?: { name?: string };
  departure?: {
    airport?: { iata?: string; name?: string; municipalityName?: string };
    scheduledTime?: AdbTime;
    actualTime?: AdbTime;
  };
  arrival?: {
    airport?: { iata?: string; name?: string; municipalityName?: string };
    terminal?: string;
    baggageBelt?: string;
    scheduledTime?: AdbTime;
    estimatedTime?: AdbTime;
    actualTime?: AdbTime;
  };
  location?: {
    lat?: number;
    lon?: number;
    altitude?: { meter?: number; feet?: number };
    groundSpeed?: { knot?: number };
    trueHeading?: { deg?: number };
  };
};

const STATUS_LABELS: Record<string, string> = {
  Expected: "Scheduled",
  CheckIn: "Check-in Open",
  Boarding: "Boarding",
  GateClosed: "Gate Closed",
  Departed: "Departed",
  EnRoute: "In Air",
  Approaching: "Approaching",
  Arrived: "Landed",
  Delayed: "Delayed",
  Canceled: "Cancelled",
  Diverted: "Diverted",
  Unknown: "Unknown",
};

const toIso = (s?: string) => (s ? s.replace(" ", "T") : null);

const toMs = (t?: AdbTime) => {
  const ms = t?.utc ? Date.parse(t.utc.replace(" ", "T")) : NaN;
  return isNaN(ms) ? null : ms;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ flightNo: string }> }
) {
  const apiKey = process.env.AERODATABOX_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { found: false, error: "AERODATABOX_API_KEY is not configured" },
      { status: 500 }
    );
  }

  const { flightNo } = await params;
  const code = flightNo.toUpperCase().replace(/\s+/g, "");

  let res: Response;
  try {
    res = await fetch(
      `https://${API_HOST}/flights/number/${encodeURIComponent(code)}?withLocation=true`,
      {
        headers: {
          "X-RapidAPI-Key": apiKey,
          "X-RapidAPI-Host": API_HOST,
        },
        next: { revalidate: 15 },
      }
    );
  } catch {
    return NextResponse.json(
      { found: false, error: "Upstream request failed" },
      { status: 502 }
    );
  }

  if (res.status === 204 || res.status === 404) {
    return NextResponse.json(
      { found: false, error: `No flight data for ${code}` },
      { status: 404 }
    );
  }
  if (!res.ok) {
    return NextResponse.json(
      { found: false, error: `AeroDataBox responded ${res.status}` },
      { status: res.status === 429 ? 429 : 502 }
    );
  }

  const flights = (await res.json()) as AdbFlight[];
  if (!Array.isArray(flights) || flights.length === 0) {
    return NextResponse.json(
      { found: false, error: `No flight data for ${code}` },
      { status: 404 }
    );
  }

  // Pick the flight closest to now by scheduled departure/arrival
  const now = Date.now();
  const flight = flights
    .map((f) => {
      const dep = toMs(f.departure?.scheduledTime) ?? toMs(f.departure?.actualTime);
      const arr = toMs(f.arrival?.scheduledTime) ?? toMs(f.arrival?.estimatedTime);
      const anchor = dep ?? arr ?? Infinity;
      return { f, dist: Math.abs(anchor - now) };
    })
    .sort((a, b) => a.dist - b.dist)[0].f;

  const depMs =
    toMs(flight.departure?.actualTime) ?? toMs(flight.departure?.scheduledTime);
  const arrMs =
    toMs(flight.arrival?.estimatedTime) ?? toMs(flight.arrival?.scheduledTime);

  let progress = 0;
  if (flight.status === "Arrived") progress = 100;
  else if (depMs && arrMs && arrMs > depMs) {
    progress = Math.min(99, Math.max(0, Math.round(((now - depMs) / (arrMs - depMs)) * 100)));
  }

  const loc = flight.location;
  const airportLabel = (a?: { iata?: string; name?: string; municipalityName?: string }) =>
    a?.iata ? `${a.iata} (${a.municipalityName ?? a.name ?? ""})` : "—";

  return NextResponse.json({
    found: true,
    flight: {
      flightNo: flight.number ?? code,
      airline: flight.airline?.name ?? "—",
      status: flight.status ?? "Unknown",
      statusLabel: STATUS_LABELS[flight.status ?? ""] ?? flight.status ?? "Unknown",
      origin: airportLabel(flight.departure?.airport),
      destination: airportLabel(flight.arrival?.airport),
      terminal: flight.arrival?.terminal ?? "TBC",
      baggageBelt: flight.arrival?.baggageBelt ?? "TBC",
      scheduledDepartureUtc: toIso(flight.departure?.scheduledTime?.utc),
      scheduledArrivalUtc: toIso(flight.arrival?.scheduledTime?.utc),
      estimatedArrivalUtc:
        toIso(flight.arrival?.estimatedTime?.utc) ?? toIso(flight.arrival?.scheduledTime?.utc),
      actualArrivalUtc: toIso(flight.arrival?.actualTime?.utc),
      altitudeFt: loc?.altitude?.feet ?? null,
      groundSpeedKt: loc?.groundSpeed?.knot ?? null,
      headingDeg: loc?.trueHeading?.deg ?? null,
      lat: loc?.lat ?? null,
      lon: loc?.lon ?? null,
      progress,
    },
  });
}
