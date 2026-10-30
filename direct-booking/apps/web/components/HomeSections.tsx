import Link from "next/link";
import { formatTime, type HomeSection } from "@direct-booking/core";
import story from "@direct-booking/sites/story";
import { contentFile, contentPath } from "../lib/content-files";
import { markdownSections, renderMarkdown } from "../lib/markdown";
import { fill, primaryProperty, site } from "../lib/site";
import { existsSync } from "node:fs";
import { Photo } from "./Photo";
import { StoryFilm } from "./StoryFilm";
import { Title } from "./Title";

const HALF = "(min-width: 900px) 560px, 100vw";

export function HomeSections({ sections }: { sections: HomeSection[] }) {
  return (
    <>
      {sections.map((s, i) => (
        <Section key={i} section={s} />
      ))}
    </>
  );
}

function Head({ eyebrow, title, body, id }: { eyebrow: string; title: string; body?: string[]; id?: string }) {
  return (
    <div className="stack">
      <p className="eyebrow">{fill(eyebrow)}</p>
      <h2 className="h2" id={id}>
        <Title text={fill(title)} />
      </h2>
      {body?.map((p, i) => (
        <p key={i}>{fill(p)}</p>
      ))}
    </div>
  );
}

function Section({ section: s }: { section: HomeSection }) {
  switch (s.type) {
    case "story":
      if (!story) return null;
      return (
        <>
          <section id="story" className="wrap section story" aria-labelledby="story-title">
            <div className="story__head">
              <h2 id="story-title" className="h3">
                The story of the Nest
              </h2>
            </div>
            <StoryFilm name={site.name} checkHref="#check" skipHref="#after-story" />
            {/* Without JavaScript: the film's chapters as text. */}
            <noscript>
              <ol className="story__transcript">
                {story.shots.map((s) => (
                  <li key={s.id}>
                    <strong>{s.head}</strong> {s.line}
                  </li>
                ))}
              </ol>
            </noscript>
            {existsSync(contentPath("story.md")) && (
              <details className="story__words">
                <summary>The story in {site.host.name}&apos;s words</summary>
                <div className="prose story__prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(contentFile("story.md")) }} />
              </details>
            )}
          </section>
          <div id="after-story" />
        </>
      );

    case "feature":
      return (
        <section id={s.id} className="wrap section">
          <div className={`row${s.reverse ? " row--reverse" : ""}`}>
            {s.photo && <Photo name={s.photo.photo} caption={s.photo.caption} sizes={HALF} variant="square" />}
            <div className="stack">
              <Head eyebrow={s.eyebrow} title={s.title} body={s.body} />
              {s.items && (
                <div className="items">
                  {s.items.map((it) => (
                    <div key={it.title}>
                      <p className="eyebrow">{it.eyebrow}</p>
                      <h3 className="h4">{it.title}</h3>
                      <p className="small">{fill(it.body)}</p>
                    </div>
                  ))}
                </div>
              )}
              {s.link && (
                <Link className="text-link" href={s.link.href}>
                  {s.link.label}
                </Link>
              )}
            </div>
          </div>
        </section>
      );

    case "timeline":
      return (
        <section id={s.id} className="band">
          <div className="wrap">
            <Head eyebrow={s.eyebrow} title={s.title} />
            <ol className="timeline">
              {s.steps.map((step) => (
                <li key={step.title}>
                  {step.photo && <Photo name={step.photo} sizes="(min-width: 900px) 280px, 100vw" variant="plain" decorative />}
                  <p className="eyebrow">{step.eyebrow}</p>
                  <h3 className="h4">{step.title}</h3>
                  <p className="small">{fill(step.body)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      );

    case "stats":
      return (
        <section id={s.id} className="wrap section">
          <div className="row row--top">
            <Head eyebrow={s.eyebrow} title={s.title} body={s.body} />
            <dl className="stats">
              {s.stats.map((st) => (
                <div key={st.label}>
                  <dt>{fill(st.value)}</dt>
                  <dd>{fill(st.label)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      );

    case "guide":
      return (
        <section id={s.id} className="wrap section">
          <Head eyebrow={s.eyebrow} title={s.title} body={[s.body]} />
          {s.photo && <Photo name={s.photo.photo} caption={s.photo.caption} sizes="100vw" variant="wide" />}
          <div className="guide">
            {s.groups.map((g) => (
              <div key={g.title}>
                <h3 className="h4">{g.title}</h3>
                {g.items.map((it) => (
                  <div key={it.name} className="guide__item">
                    <p>{it.name}</p>
                    <p className="small muted">{fill(it.text)}</p>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      );

    case "steps":
      return (
        <section id={s.id} className={`band${s.tone === "dark" ? " band--dark" : ""}`}>
          <div className="wrap">
            <Head eyebrow={s.eyebrow} title={s.title} />
            <ol className="steps">
              {s.steps.map((st) => (
                <li key={st.title}>
                  <h3 className="h4">{st.title}</h3>
                  <p className="small">{fill(st.body)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      );

    case "faq": {
      const questions = markdownSections(contentFile("faq.md"));
      return (
        <section id={s.id} className="wrap section">
          <div className="row row--top">
            <Head eyebrow={s.eyebrow} title={s.title} body={s.body ? [s.body] : undefined} />
            <div className="faq">
              {questions.map((q, i) => (
                <details key={q.heading} open={i === 0}>
                  <summary>{q.heading}</summary>
                  <div className="prose small" dangerouslySetInnerHTML={{ __html: q.html }} />
                </details>
              ))}
            </div>
          </div>
        </section>
      );
    }

    case "policies":
      return <PolicySummary id={s.id} />;
  }
}

/** Plain-words policy summary, every figure from config. */
export function PolicySummary({ id }: { id?: string }) {
  const p = primaryProperty;
  return (
    <section id={id} className="band" aria-label="Policies">
      <div className="wrap policies">
        <div>
          <h3 className="h4">Cancellation</h3>
          <p>
            {fill("{{cancellation}}")} <Link href="/cancellation/">Full policy</Link>
          </p>
        </div>
        <div>
          <h3 className="h4">Paying</h3>
          <p>{fill("{{payment}} Secure payment by Stripe.")}</p>
        </div>
        <div>
          <h3 className="h4">Check-in</h3>
          <p>
            From {formatTime(p.checkInTime, site.locale)} · check-out by {formatTime(p.checkOutTime, site.locale)} · self check-in
          </p>
        </div>
        <div>
          <h3 className="h4">House rules</h3>
          <p>
            <Link href="/house-rules/">Read the house rules</Link>
          </p>
        </div>
      </div>
    </section>
  );
}
