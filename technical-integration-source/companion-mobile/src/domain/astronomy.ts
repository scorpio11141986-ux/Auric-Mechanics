import * as Astronomy from "astronomy-engine";

export const WHEEL = [
  41, 19, 13, 49, 30, 55, 37, 63, 22, 36, 25, 17, 21, 51, 42, 3, 27, 24, 2, 23,
  8, 20, 16, 35, 45, 12, 15, 52, 39, 53, 62, 56, 31, 33, 7, 4, 29, 59, 40, 64,
  47, 6, 46, 18, 48, 57, 32, 50, 28, 44, 1, 43, 14, 34, 9, 5, 26, 11, 10, 58,
  38, 54, 61, 60,
];
export const normalize = (n: number) => ((n % 360) + 360) % 360;
export function longitude(planet: string, date: Date): number {
  if (planet === "Earth") return normalize(longitude("Sun", date) + 180);
  if (planet === "South Node")
    return normalize(longitude("North Node", date) + 180);
  if (planet === "North Node") {
    const state = Astronomy.RotateState(
      Astronomy.Rotation_EQJ_ECT(date),
      Astronomy.GeoMoonState(date),
    );
    const hx = state.y * state.vz - state.z * state.vy;
    const hy = state.z * state.vx - state.x * state.vz;
    return normalize((Math.atan2(hx, -hy) * 180) / Math.PI);
  }
  if (!Object.values(Astronomy.Body).includes(planet as Astronomy.Body))
    throw Error("Unsupported astronomical body");
  return normalize(
    Astronomy.Ecliptic(
      Astronomy.GeoVector(planet as Astronomy.Body, date, true),
    ).elon,
  );
}

export function designDate(birth: Date) {
  const target = normalize(longitude("Sun", birth) - 88);
  const difference = (time: number) =>
    ((longitude("Sun", new Date(time)) - target + 540) % 360) - 180;
  let lower = birth.getTime() - 110 * 86400000,
    upper = birth.getTime() - 70 * 86400000;
  if (difference(lower) >= 0 || difference(upper) <= 0)
    throw Error("Cannot bracket the 88-degree Design solar arc");
  for (let i = 0; i < 60; i++) {
    const mid = new Date((lower + upper) / 2).getTime();
    if (difference(mid) < 0) lower = mid;
    else upper = mid;
  }
  const date = new Date((lower + upper) / 2);
  if (
    Math.abs(normalize(longitude("Sun", birth) - longitude("Sun", date)) - 88) >
    0.000001
  )
    throw Error("Design arc did not converge");
  return date;
}
export function mapLongitude(value: number) {
  if (!Number.isFinite(value)) throw Error("Longitude must be finite");
  const adjusted = normalize(value - 302),
    gateIndex = Math.floor(adjusted / 5.625);
  const withinGate = adjusted - gateIndex * 5.625;
  const withinLine = withinGate % 0.9375;
  return {
    gate: WHEEL[gateIndex],
    line: Math.floor(withinGate / 0.9375) + 1,
    boundaryRisk: Math.min(withinLine, 0.9375 - withinLine) <= 1 / 60,
  };
}
