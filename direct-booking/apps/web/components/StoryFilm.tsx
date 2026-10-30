"use client";

// The home page story as a short illustrated film (see lib/film-player.ts).
// The site's scenes come from @direct-booking/sites/story, which never includes
// the site config, so nothing private reaches the browser.

import { useEffect, useRef } from "react";
import story from "@direct-booking/sites/story";
import { FilmPlayer } from "../lib/film-player";

export function StoryFilm({ name, checkHref, skipHref }: { name: string; checkHref: string; skipHref: string }) {
  const root = useRef<HTMLDivElement>(null);
  const player = useRef<FilmPlayer | null>(null);

  useEffect(() => {
    const r = root.current!;
    const q = <T extends Element>(sel: string) => r.querySelector<T>(sel)!;
    const p = new FilmPlayer(story, {
      stage: q(".film-stage"), canvas: q("canvas.film-canvas"), chips: q(".film-chips"), cap: q(".film-cap"), capK: q(".film-cap .film-k"),
      capH: q(".film-cap h3"), capL: q(".film-cap .film-l"), play: q(".film-play"), bar: q(".film-bar"), time: q(".film-time"), hint: q(".film-hint"),
      mark: q(".film-mark"), rule: q(".film-mark i"), start: q(".film-start"), stills: q(".film-stills"),
    });
    player.current = p;
    (window as unknown as { __film?: FilmPlayer }).__film = p;
    return () => { p.destroy(); player.current = null; };
  }, []);

  return (
    <div className="film" ref={root}>
      <div className="film-stage">
        <canvas className="film-canvas" role="img" aria-label={story.label} />
        <div className="film-chips" aria-hidden="true" />
        <div className="film-mark" aria-hidden="true">
          <span>{name}</span>
          <i />
        </div>
        <p className="film-hint" aria-hidden="true">
          Playing. Pause anytime, or keep scrolling.
        </p>
        <div className="film-cap" aria-live="polite">
          <p className="film-k" />
          <h3 />
          <p className="film-l" />
          <div className="film-end">
            <a className="button button--small" href={checkHref}>
              Check your dates
            </a>
            <button type="button" className="button button--small button--ghost" onClick={() => player.current?.restart()}>
              Watch again
            </button>
          </div>
        </div>
        <div className="film-start" hidden>
          <div>
            <button type="button" className="button" onClick={() => player.current?.play(true)}>
              ▶ Play the story (1 min)
            </button>
            <button type="button" className="button button--ghost" onClick={() => player.current?.showStills()}>
              Show as pictures
            </button>
          </div>
        </div>
      </div>
      <div className="film-controls">
        <button type="button" className="film-play" aria-label="Play the story" />
        <div className="film-bar" role="group" aria-label="Chapters" />
        <span className="film-time" aria-hidden="true">
          0:00
        </span>
      </div>
      <div className="film-below">
        <span>Plays by itself. Scroll on anytime.</span>
        <span>
          <button type="button" onClick={() => player.current?.showStills()}>
            Show as pictures
          </button>
          {" · "}
          <a href={skipHref}>Skip the story</a>
        </span>
      </div>
      <ol className="film-stills" hidden />
    </div>
  );
}
