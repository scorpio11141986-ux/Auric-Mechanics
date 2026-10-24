import type { ReactNode } from "react";
import { createPortal } from "react-dom";

// Escape the chart ScrollView's containing block so previews remain inside the viewport.
export function HoverPortal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body);
}
