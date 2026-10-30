// Optional base path, for a build served from a subfolder (a GitHub Pages preview).
// Next's <Link> adds it by itself; raw URLs (images, fonts, <a>, location) use withBase.

export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export const withBase = (path: string) => (path.startsWith("/") && !path.startsWith("//") ? `${BASE_PATH}${path}` : path);

/** A preview build with no booking Worker behind it (e.g. GitHub Pages). */
export const BOOKING_PREVIEW = process.env.NEXT_PUBLIC_BOOKING_PREVIEW === "1";
