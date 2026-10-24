// The portrait artwork scales with its measured rail, not the window's breakpoint.
export function compactGraphHeight(railWidth:number):number {
  const width=Number.isFinite(railWidth)&&railWidth>0?railWidth:272;
  return Math.round(Math.max(240,Math.min(420,width*.9)));
}
