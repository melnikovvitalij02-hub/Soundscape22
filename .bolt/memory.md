# Project memory

## Product intent & audience

- **SoundScape Pro**: web platform + Telegram Mini App for music creation, social networking, and gamification.
- Core tools: BeatComposerPage (sequencer), AI recording studio, beat feed, user profiles with social features.
- Gamification via Gems currency; DB function for earning Gems on listens exists but is not yet wired to playback.
- Telegram channel: t.me/soundscapepro for project updates.

## Brand personality & voice

- Russian-language UI; assistant communicates in Russian with the user.
- Tone: production-quality, polished, non-generic — "beautiful, not cookie cutter."

## Visual design & UX direction

- **Theming**: site uses CSS custom-property variables for theme colors; blocks must use these variables, not hardcoded palettes.
- Previously disjointed palettes (sequencer violet/orange, login blue-purple, rules modal) have been migrated to shared theme variables so all blocks recolor together on theme change.
- Components: React + Tailwind CSS + Lucide React icons only; no extra UI/icon packages.
- Imports via `@/` alias → `src/`.
- Favicon set to site logo; Telegram promo banner on About page (header + footer).
- Sequencer visualizer recolored to follow theme.

## Decisions, constraints & rationale

- **Track publish dedup**: republishing a beat with an existing title updates the same track (audio, bpm, genre, description, access) instead of creating a duplicate; rationale — DB had no unique-title constraint, so duplicates accumulated.
- **Paid downloads**: DB access rule extended to allow `paid` access level alongside `premium`/`nobody`; publish modal writes paid price correctly and preserves existing audio on update.
- **Project deletion in BeatComposerPage**: trash button per saved project; removes from both user account (DB) and localStorage.
- **Privacy settings**: same panel reused in both DMs and profile ("Privacy & access": who can message, call, send requests, blacklist).
- **No auto-publishing**: everything publishes only on explicit "Опубликовать" action.

## Open questions & assumptions

- **Gems for listens**: DB function ready but not connected to track playback UI — needs wiring.
- **Download gating from sequencer**: not yet implemented; desired but pending.
- Localization dictionary is the source for UI strings; new UI text should be added there (pattern inferred, not explicitly confirmed).
- Supabase assumed as DB layer based on column/rule references (not explicitly stated).