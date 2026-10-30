# Scroll story notes: The Nest Retreat

Project notes for the `scroll-story-site` skill. Read first in any later session; resume from **Current phase**.

## Current phase

Phase 5 gate: the rough prototype is published for approval. Next: Phase 6a (engine and first scene in `apps/web`), after approval.

- Storyboard (approved 2026-10-30, "go with your picks"): https://claude.ai/artifact/3L1ZAs6KPJcjo4vUhkVR6k
- Prototype v1: https://claude.ai/artifact/MmZzwbaQpiEVj54NrMwMtC

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

## Storyboard table

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
