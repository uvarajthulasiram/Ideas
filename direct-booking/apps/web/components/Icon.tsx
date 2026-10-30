import type { AmenityIcon } from "@direct-booking/core";

const paths: Record<AmenityIcon, string> = {
  kitchen: "M3 9l7-6 7 6v8H3z",
  fire: "M10 17c3 0 5-2 5-5 0-3-3-5-3-9-2 2-3 3-3 5-1-1-2-2-2-3-2 2-2 4-2 7 0 3 2 5 5 5z",
  bolt: "M11 2L5 11h5l-1 7 6-9h-5z",
  desk: "M3 4h14v10H3zM7 17h6",
  washer: "M4 2h12v16H4zM10 7.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z",
  alarm: "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM10 6v4M10 13v.5",
  parking: "M4 3h12v14H4zM8 14V6h3a2.5 2.5 0 0 1 0 5H8",
  wifi: "M2 8a12 12 0 0 1 16 0M5 11a8 8 0 0 1 10 0M8 14a4 4 0 0 1 4 0M10 17h.01",
};

export function Icon({ name }: { name: AmenityIcon }) {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[name]} />
    </svg>
  );
}
