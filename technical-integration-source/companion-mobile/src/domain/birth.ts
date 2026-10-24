import type { BirthRecordV1 } from "./contracts";

const wallFormatters = new Map<string, Intl.DateTimeFormat>();
function wallFormatter(zone: string) {
  let formatter = wallFormatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    });
    wallFormatters.set(zone, formatter);
  }
  return formatter;
}
function wallParts(utc: number, zone: string) {
  const parts = wallFormatter(zone).formatToParts(new Date(utc));
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
}

export function resolveBirthUtc(birth: BirthRecordV1): string {
  validateBirth(birth);
  if (birth.confidence === "unknown" || birth.confidence === "range") {
    throw Error(
      "Unknown or range birth times require the time-window analysis path, not a certain single-time chart.",
    );
  }
  const matches = birthUtcCandidates(birth);
  if (!matches.length)
    throw Error(
      "This local time does not exist in the selected timezone (daylight-saving gap).",
    );
  if (matches.length > 1 && !birth.utcDisambiguation)
    throw Error(
      "This local time occurs twice. Select the earlier or later occurrence.",
    );
  return new Date(
    birth.utcDisambiguation === "later"
      ? matches[matches.length - 1]
      : matches[0],
  ).toISOString();
}

export function birthUtcCandidates(birth: BirthRecordV1): number[] {
  validateBirth(birth);
  const [y, m, d] = birth.date.split("-").map(Number);
  const [h, min] = birth.localTime.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, h, min);
  const offsets = new Set<number>();
  // Sampling both sides of the date finds DST folds, gaps and non-hour offsets.
  for (let hours = -36; hours <= 36; hours += 6) {
    const instant = wall + hours * 3600000;
    offsets.add(wallParts(instant, birth.timezone) - instant);
  }
  const matches = [...offsets]
    .map((offset) => wall - offset)
    .filter((utc) => wallParts(utc, birth.timezone) === wall)
    .sort((a, b) => a - b);
  return matches;
}

export function validateBirth(b: BirthRecordV1) {
  if (
    !b ||
    b.schema !== "BirthRecordV1" ||
    typeof b.name !== "string" ||
    !b.name.trim() ||
    b.name.length > 80
  )
    throw Error("Enter a name (up to 80 characters).");
  if (
    typeof b.id !== "string" ||
    !b.id ||
    typeof b.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(b.updatedAt))
  )
    throw Error("Invalid birth record identity.");
  if (!["exact", "approximate", "range", "unknown"].includes(b.confidence))
    throw Error("Choose birth-time confidence.");
  if (
    b.utcDisambiguation !== undefined &&
    !["earlier", "later"].includes(b.utcDisambiguation)
  )
    throw Error("Invalid time occurrence.");
  if (typeof b.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.date))
    throw Error("Use a date in YYYY-MM-DD format.");
  const [y, m, d] = b.date.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (y < 1900 || y > 2099 || date.toISOString().slice(0, 10) !== b.date)
    throw Error("Enter a real date between 1900 and 2099.");
  if (
    typeof b.localTime !== "string" ||
    (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(b.localTime) && !(b.confidence === "range" && b.localTime === ""))
  )
    throw Error("Use local time in 24-hour HH:MM format.");
  if (typeof b.timezone !== "string" || !b.timezone.trim())
    throw Error("Enter an IANA timezone.");
  try {
    wallFormatter(b.timezone).format(date);
  } catch {
    throw Error("The IANA timezone is not recognized.");
  }
  if (
    !Number.isFinite(b.latitude) ||
    Math.abs(b.latitude) > 90 ||
    !Number.isFinite(b.longitude) ||
    Math.abs(b.longitude) > 180
  )
    throw Error("Latitude must be -90 to 90; longitude -180 to 180.");
  if (typeof b.place !== "string" || b.place.length > 160)
    throw Error("Invalid place label.");
  if (b.resolution && (
    !["resolved", "manual"].includes(b.resolution.status) ||
    !b.resolution.originalPlace.trim() || !b.resolution.resolvedPlace.trim() ||
    !["open-meteo-geonames", "manual", "synthetic"].includes(b.resolution.coordinateSource)
  )) throw Error("Select a resolved birth location or confirm its coordinates in advanced manual correction. No coordinates will be guessed.");
}

export function prepareBirthRecord(birth: BirthRecordV1): BirthRecordV1 {
  const utc = resolveBirthUtc(birth);
  const wall = Date.parse(`${birth.date}T${birth.localTime}:00Z`);
  return {
    ...birth,
    conversion: {
      utc, offsetMinutes: (wall - Date.parse(utc)) / 60000,
      timezone: birth.timezone, runtime: "Intl.DateTimeFormat", databaseVersion: null,
    },
  };
}

export function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
