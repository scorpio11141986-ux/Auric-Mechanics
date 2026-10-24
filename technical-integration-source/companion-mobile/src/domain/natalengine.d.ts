declare module "natalengine/humandesign" {
  export function calculateHumanDesign(
    date: string,
    hour: number,
    offset: number,
    options?: { nodeType: "true" | "mean" },
  ): unknown;
}
