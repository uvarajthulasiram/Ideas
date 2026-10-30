import { photo as lookup } from "../lib/site";

interface Props {
  name: string;
  /** CSS sizes hint for picking a width, e.g. "(min-width: 900px) 50vw, 100vw". */
  sizes: string;
  variant?: "hero" | "wide" | "square" | "plain";
  caption?: string;
  /** The largest photo near the top of a page loads eagerly. */
  priority?: boolean;
  /** Decorative copies (alt text already given nearby) pass true. */
  decorative?: boolean;
  className?: string;
}

const srcset = (name: string, widths: number[], ext: string) => widths.map((w) => `/photos/${name}-${w}.${ext} ${w}w`).join(", ");

export function Photo({ name, sizes, variant = "wide", caption, priority, decorative, className }: Props) {
  const p = lookup(name);
  const largest = p.widths.at(-1)!;
  const img = (
    <picture>
      <source type="image/webp" srcSet={srcset(p.name, p.widths, "webp")} sizes={sizes} />
      <img
        src={`/photos/${p.name}-${largest}.webp`}
        alt={decorative ? "" : p.alt}
        width={p.width}
        height={p.height}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
      />
    </picture>
  );
  return (
    <figure className={`photo photo--${variant}${className ? ` ${className}` : ""}`}>
      {img}
      {caption && (
        <figcaption>
          <span className="plate">{caption}</span>
        </figcaption>
      )}
    </figure>
  );
}
