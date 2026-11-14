import type { SVGProps } from "react";

/** A rounded square holding a flowing "S": two arcs joined by a diagonal. */
export function SynthiaMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="1" y="1" width="22" height="22" rx="6.5" fill="currentColor" opacity="0.14" />
      <path
        d="M16.5 7.6c-.9-1.2-2.6-1.9-4.5-1.9-2.6 0-4.4 1.4-4.4 3.3 0 4.2 9 2.4 9 6.6 0 1.9-1.9 3.4-4.6 3.4-2 0-3.7-.8-4.6-2.1"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
    </svg>
  );
}
