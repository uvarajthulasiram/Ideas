# Scroll story notes: The Nest Retreat

Project notes for the `scroll-story-site` skill. Read first in any later session; resume from **Current phase**.

## Current phase

Phase 6a gate: the film is built into the site (prototype 2 approved 2026-10-30; all nine shots ported at once). Next: Uvaraj and Allie check it on a phone, then Phase 7 checks and hand-off.

Where the code lives: generic helpers in `packages/film`, the Nest's scenes and captions in `sites/nest-retreat/story/`, the player in `apps/web/lib/film-player.ts` and `apps/web/components/StoryFilm.tsx`. Allie's words: `content/story.md`. Checks: `node scripts/check-story.mjs <site-url>`.

Page pass done: "A day at the Nest" and the closing section removed; hero photo 4:3 on phones. GSAP was not needed (the film runs on its own clock).

- Storyboard (approved 2026-10-30, "go with your picks"): https://claude.ai/artifact/3L1ZAs6KPJcjo4vUhkVR6k
- Prototype (v1 scroll-scrubbed, v2 autoplay film, same link): https://claude.ai/artifact/MmZzwbaQpiEVj54NrMwMtC

## Override of the skill's default (Uvaraj and Allie, 2026-10-30)

The skill's default is a pinned story scrubbed by scroll. On a phone Allie found it unclear: the page stopped moving while she scrolled. Uvaraj asked for autoplay instead, with normal scrolling past the story. So:

- The story is a self-contained player, about 64 s, that plays by itself when at least 55% of it is on screen and pauses when it leaves the screen or the tab is hidden. The page always scrolls normally.
- Controls under the picture (never over the middle): play/pause, chapter bar (tap to jump), "Skip the story", "Show as pictures". Tap the picture to pause. A first-play hint: "Playing. Pause anytime, or keep scrolling."
- At the end: "Check your dates", "Watch again", and the page continues below.
- Reduced motion: no autoplay; a "Play the story" button and "Show as pictures".
- Shots join with short cross-dissolves where the camera can't move continuously (the skill's continuity rule still holds inside each shot; dissolves never pop).

## Decisions

| Topic | Decision |
|---|---|
| Concept | "The Rise": one continuous camera on one street; the garage grows a cottage on top; guests arrive, live in the nest, walk to the Sound, come home at gold, stay for the stars, wake at dawn |
| Feeling / audience | Calm, sheltered / couples and small families visiting Seattle from anywhere |
| Market and setting | West Seattle, Seattle, WA 98136; local cues allowed (the Sound, drizzle, evergreens); no named landmarks or trademarks (generic towers for downtown, plain ferry) |
| Spelling | US |
| Art | Drawn in code (Canvas 2D), Driftwood & Fog palette |
| Thread | A small chickadee (running gag) and the driftwood roofline, which becomes the rule under the name in the finale |
| People | One stylized couple (the guests) from "arrive" to the finale; a generic waving neighbor. Nobody real |
| Finale | Dawn, ends in light; the name set in Newsreader as HTML, the driftwood rule drawing in; lands before the last 10% of the scroll; caption "Settle in and stay a while." with "Check your dates" |
| Logo | None yet; wordmark only |
| Live touches | None |
| Allie's full text | In the still list and a closed "The story in Allie's words" panel under the story ("like TV being tucked" corrected to "like being tucked") |
| Hero | `living-window-wall` photo stays the hero (Uvaraj, 2026-10-30); cropped to 4:3 on phones so the story starts about 1.1 screens down |
| Additions (Uvaraj, 2026-10-30) | What a stay feels like (guests' point of view) and "minutes from beaches, cafés, restaurants and downtown Seattle" (beats "Now it's yours for a while" and "Minutes from it all") |
| Page pass | Drop "A day at the Nest" timeline and the closing section; keep the rest |

## Shot list (prototype 2, supersedes the storyboard table below)

| # | Shot | Seconds | What you see | Caption |
|---|---|---|---|---|
| 1 | years | 6.5 | The old garage through autumn leaves, snow, spring blossom; bird on the wire | For years, it was just a garage / Tools, bikes, and whatever didn't fit. |
| 2 | rise | 6.5 | Construction time-lapse: scaffolding, walls rise, windows, roof drops on, lights on; bird rides the peak | Then it reached upward / Same footprint, a home built on top. |
| 3 | arrive | 7 | A car pulls up; the couple with a rolling suitcase; keypad close-up turns green; the door opens | Your stay starts at the door / Self check-in with your own code. |
| 4 | inside | 7.5 | Dollhouse cutaway: both floors, EV charger in the garage, queen room and bath, the nest upstairs; the couple climbs and sits | Tucked in, lifted up / Two floors, two bedrooms, two baths. |
| 5 | aerial | 8 | Fly up to a schematic map: routes and labels for Lowman Beach, Lincoln Park, the Junction's cafés and restaurants, downtown Seattle | Minutes from it all / Beaches, cafés, restaurants, downtown. |
| 6 | beach | 8.5 | Snow-capped mountains, an island, waves and foam, wet sand, driftwood; the couple sits on a log with coffee | Down to the Sound / Lowman Beach, just under a mile away. |
| 7 | golden | 7 | Golden hour; drizzle cloud; bird ducks under the eave; the couple at the big window | Home as the sky turns gold / Watch the weather roll in. |
| 8 | night | 7 | The backyard: round fire pit, four Adirondack chairs, string lights, stars | Fire pit, then stars / The backyard, after dark. |
| 9 | dawn | 7 | Dawn over the house; the name and the driftwood rule land | Settle in and stay a while. / Check your dates, Watch again |

Facts to confirm with Allie: the house exterior colors (drawn as cedar and slate; real colors unknown), the downstairs layout in the cutaway (garage, queen room with French doors, bath), the keypad (self check-in with a door code), and the map is schematic, not to scale.

## Storyboard table (v1, superseded)

| # | Segment | Screens | What the visitor sees | Headline | Line | Proves |
|---|---|---|---|---|---|---|
| 1 | garage | 1.0 | Quiet street, old garage, bird on the wire | It started as a garage | Tools, bikes, and whatever didn't fit. | The home has a story |
| 2 | rise | 1.0 | Walls rise out of the garage roof; the bird rides the peak | Then it reached upward | Same footprint, a home built on top. | Built upward |
| 3 | arrive | 0.9 | The couple walks up with bags to the door | Now it's yours for a while | Bags down, door code, up the stairs. | Self check-in, the stay |
| 4 | nest | 1.0 | Camera to the big window: beams, sofa, the couple inside | Tucked in, lifted up | Wood beams around you, sky above. | The nest |
| 5 | around | 0.9 | Pull back and pan along the street to the cafés, towers on the horizon | Minutes from it all | Beaches, cafés and downtown Seattle. (link: Allie's guide) | Location |
| 6 | sound | 1.2 | The couple walks with coffee past a waving neighbor to the beach | Down to the Sound | Lowman Beach, just under a mile away. | The beach walk |
| 7 | gold | 1.0 | Back home at golden hour; a drizzle cloud; the bird ducks under the eave | Home as the sky turns gold | Watch the weather roll in. | The sky |
| 8 | stars | 0.7 | Night, stars, lit window, bird asleep | A little closer to the stars | Your perch, after dark. | The sky at night |
| 9 | finale | 1.4 | Dawn; the name and rule land; bird on the sill | Settle in and stay a while. | Check your dates (link) | Come and stay |

Camera path: street level, up the rising wall, down to the gate, in to the window, back out and along to the Junction, back past the house to the beach, home again, up to the roof for the night, settle at dawn. Light has its own curve: morning, day, gold, night, dawn.

## Checks so far

- Prototype continuity: 400 sampled frames, no single-frame jumps (fast moves are smooth runs).
- Framing checked at 390 × 844, 375 × 667 and 844 × 390.
