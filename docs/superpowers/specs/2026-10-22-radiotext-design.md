# Radiotext: design

**Date:** 2026-10-22
**Status:** approved by Nathan 2026-10-22 ("looks good")
**Mockups:** `2026-10-22-radiotext-mockups.html` (option **B, Teletext**, is the chosen look)

---

## 1. What this is and why

Nathan cancelled Spotify. The free tier's ads "kind of suck," and the mainstream catalogue isn't what he listens to anyway. He loves obscure, heavy, noisy music (Chat Pile, Black Eyes, noise rock, sludge, post-punk) and likes radio *because* it feels like a time before streaming and devices: someone else picks the music, and you just tune in.

Radiotext is a small website that works as a radio. It's styled like **Teletext**, the blocky pages of text and colour that TVs showed in the '80s and '90s. It plays internet radio stations found through the free **Radio Browser** directory (radio-browser.info). He'll use it **mostly on his phone while driving to work**, so it's built for glances and thumbs, and it keeps playing with the screen locked.

**Success:** he gets in the car, opens it, taps play, and flips between 12XU, Metal Detector and RadCap with the steering-wheel buttons, without touching Spotify again. On a slow evening he browses page 200 and finds a new station worth saving.

## 2. Goals, non-goals, anti-goals

**Goals**
- Play his three saved stations right away: 12XU, SomaFM Metal Detector, RadCap Noise Rock.
- Flip stations with big on-screen buttons, the phone's lock screen, and the car's next/previous buttons.
- Keep playing when the phone locks, and survive patchy cell signal.
- Browse by genre (curated toward his taste) and search, then save new finds.
- Look like real Teletext: cool and functional, *not tacky*.
- Add to the home screen and open full-screen like an app.

**Non-goals (v1)**
- Accounts, syncing saved stations between devices, or a backend database.
- Recording, rewinding, or pausing a live stream and resuming it later (pause means stop).
- Reordering saved stations (new saves go to the end).
- Station logos or photos.
- A native app.

**Anti-goals (a failure even if it technically works)**
- **Tacky retro:** fake CRT curvature, scanlines, glitch effects, or "lol 90s" jokes. Teletext was flat, crisp and bold, and this should be too.
- Small or fiddly controls that make him look at the phone too long while driving.
- A browse page that dumps mainstream pop, rap, rock or country stations on him.
- Stations that show up but silently don't play.
- **Anything that costs money.** Nathan said, "i do not want to pay money." Everything stays on free plans: GitHub Pages and Cloudflare Workers Free.

## 3. What Nathan decided

- **Look:** Teletext (mockup B). Stations are page numbers, the header is blocky, and the colours are flat and bold. Four coloured "fastext" keys at the bottom act as big thumb buttons.
- **Saved stations** 12XU, SomaFM Metal Detector and RadCap Noise Rock come preloaded as pages 101, 102 and 103.
- **Main use:** phone, in the car, on the drive to work.
- He agreed to the following when I played them back:
  - Star stations while browsing to save them.
  - Saved stations live in the phone's browser and don't sync.
  - Lock-screen station name and car steering-wheel next/prev.
  - Add to home screen.
  - A short burst of static when changing stations.
  - Page 200 for genres, ranked by Radio Browser votes.
  - Stations that can't play are hidden.
  - The current song shows when a station shares it.
  - Its own site on GitHub Pages, with no accounts and no server.

## 4. Facts found during design (2026-10-22)

Checked live during the design conversation:

| Station | Radio Browser uuid | Stream | Plays from an https page? | Song info |
|---|---|---|---|---|
| 12XU | `963b7906-0601-11e8-ae97-52543be04c81` | `https://stream.laut.fm/12xu` (302 to an https laut.fm host, MP3 128k) | yes | `https://api.laut.fm/station/12xu/current_song` (CORS `*`; `title`, `artist.name`, `ends_at`) |
| SomaFM Metal Detector | `960de41d-0601-11e8-ae97-52543be04c81` | `https://ice2.somafm.com/metal-128-aac` (AAC 128k) | yes | `https://api.somafm.com/channels.json` → channel `id: "metal"`, field `lastPlaying` (CORS `*`) |
| RadCap Noise Rock | `ac497573-a6c5-4505-9086-2a905134abb5` | `http://79.120.39.202:8000/noiserock` (Icecast, `audio/aacp`, 320k; `:8002` is a 48k copy) | **no, http only** | none found (no status JSON) |

- **Radio Browser API** answers with `Access-Control-Allow-Origin: *`, so the page can call it directly. `https://all.api.radio-browser.info/json/servers` currently lists only `de1.api.radio-browser.info`.
- **Many stations are http-only.** Radio Browser's share of https streams by tag: noise rock 2/4, sludge 5/6, post-punk 33/43, freeform 30/74, college radio 130/232, experimental 110/166, punk 185/318. RadCap has **no** https stream at all (106 RadCap entries, 0 https). A GitHub Pages site is https-only, and browsers block or break http audio on https pages. Without a fix, RadCap and roughly half the freeform and college stations can't play.
- **Cloudflare Workers can't simply `fetch()` these.** `fetch()` to a raw IP address fails (Cloudflare error 1003), and RadCap is a raw IP on port 8000. Workers' **TCP sockets** (`connect()` from `cloudflare:sockets`) are documented as blocked only for Cloudflare IPs, private and localhost addresses, and port 25. Whether raw public IPs on port 8000 work is **not yet proven**.
- Nathan already has a Cloudflare account with `wrangler` logged in (the Ruby Radar Worker: `~/Documents/code/finals-radar/worker`, account `nathanforestlee`, `*.nathanforestlee.workers.dev`).
- The GitHub repo name `natanforestree/radiotext` is free.

## 5. The pages

All pages share one frame: a **header row**, the **page body**, and the **fastext bar** pinned to the bottom of the screen.

The header row reads `P100   RADIOTEXT   07:41`: page number, the name in yellow, and the real clock.

**Page 100: home** (what the mockup shows)
- **ON AIR** block: the station name in big double-height letters, its genre tags and country, and the current song when the station shares one. When nothing is playing it says so plainly, for example `OFF AIR — PRESS PLAY`.
- **Saved stations** list: `101 12XU ......... NOISE`, `102 METAL DETECTOR .. SLUDGE`, `103 RADCAP NOISE ROCK .. NOISE`, and so on. The station playing now is shown in inverse video. Tapping a row tunes to it.
- Links to `200 BROWSE GENRES` and `300 SEARCH`.

**Page 200: genres.** A curated list leaning toward his taste, each genre with its own page number (210, 211, ...):
- noise rock, sludge, post-punk, post-hardcore, noise, punk, hardcore, math rock, no wave
- doom metal, stoner rock, shoegaze, industrial, darkwave, krautrock
- experimental, avant-garde, freeform, college radio, community radio

Genres with no playable stations are hidden. The builder may adjust the list against real tag counts, but it should stay in this spirit, with no broad pop, rock, hip hop or country tags.

**Genre pages (2xx):** stations with that tag, ranked by Radio Browser votes, filtered to ones that can play (section 8). Each row shows the name, the top tag or two, and the country, plus a **save star**. Tapping the row tunes to the station. Long lists page through with a teletext-style `1/3` subpage counter and next/prev subpage arrows.

**Page 300: search.** A text box that searches station names and tags. Results are ranked and filtered the same way, with the same rows and stars. *(My call: page 300 was "all stations" in the playback, but with ~50,000 stations, search is the useful version of that.)*

**Unsaving:** the now-playing station has a star toggle on page 100. Unstarring a saved station removes its 1xx page, and the remaining pages renumber in order.

## 6. Controls: the fastext bar

Four big coloured keys in a 2×2 grid, each at least ~64 px tall, always visible:

| Key | Does |
|---|---|
| **Red ◀ PREV** | previous station in the flip list |
| **Green ▶ PLAY / ■ STOP** | start or stop the current station |
| **Yellow NEXT ▶** | next station in the flip list |
| **Cyan BROWSE / HOME** | goes to page 200 from home, or back to page 100 from anywhere else |

**The flip list** is the list you last tuned from. By default that's the saved stations. If you tap a station on a genre page, prev/next walk that genre's list, like scanning the dial. Tapping a saved station switches back to the saved list. Flipping wraps around at the ends. *(My call.)*

On a computer, the arrow keys and space do the same jobs, and typing a three-digit page number jumps to it like a real Teletext remote. *(My call.)*

## 7. Playback in the car

- **Background play:** audio keeps going when the screen locks or another app is open. Use one `<audio>` element for the stream.
- **Lock screen and car display (Media Session API):**
  - Metadata: title is the current song if known, otherwise the station name; artist is the station name; album is "Radiotext"; artwork is a Teletext-style tile icon.
  - Action handlers: `play`, `pause` (which stops the stream), `stop`, `nexttrack`, `previoustrack`.
  - Leave `seekforward` and `seekbackward` unset so the phone shows next/prev, not ±10 s. Car Bluetooth next/prev arrives as `nexttrack`/`previoustrack` and flips stations.
- **Static:** when you flip, a short, quiet burst of white noise (Web Audio) plays until the new stream starts, capped at about 1.5 s. Skip it when the page is hidden, since phones may not allow it in the background. *(My call.)*
- **Stop means disconnect:** STOP or pause drops the stream to save data, and PLAY reconnects live. Nothing is buffered.
- **Patchy signal:** on stall or error, reconnect automatically with backoff (1, 2, 4, 8 s, then every 15 s, giving up after about 2 minutes). Show `NO SIGNAL — RETRYING` in the ON AIR block. Never skip to another station on its own.
- **A station that won't start:** show `PAGE NOT AVAILABLE` (the classic Teletext phrase) and stay put. Next and prev still work. *(My call.)*
- **Current song:** for SomaFM and laut.fm stations, poll their now-playing endpoint about every 30 s while playing, and update both page 100 and the lock-screen title. Other stations show genre and country only. Background timers may be throttled, which is fine.

## 8. Station data and filtering

- **Server:** pick a server from `all.api.radio-browser.info/json/servers`, falling back to `de1.api.radio-browser.info`.
- **Click counting:** when a station is started, call `/json/url/{stationuuid}`. Radio Browser asks clients to do this, and it keeps its vote and click rankings honest.
- **Playable means all of the following:**
  - `lastcheckok` is 1 (use `hidebroken=true`).
  - The codec plays in this browser (map Radio Browser's `codec` to a MIME type and check `audio.canPlayType`). MP3 and AAC/AAC+ are safe on iPhone.
  - Not HLS, unless the browser can play `application/vnd.apple.mpegurl`.
  - The stream can be reached over https (see the next point).
- **Try https first.** For a station listed as `http://`, try the same address over https before anything else. Many work: a recheck on 2026-10-22 found 16 of the 35 http-only heavy-genre stations play fine that way, including 12XU (laut.fm). Only if that fails, use the relay (section 9).
  - With no relay, show `PAGE NOT AVAILABLE` and remember the station as unplayable on this device, so it's hidden from lists after that.
  - Roughly: of ~1,700 stations across the page-200 genres, at most ~375 can't do https at all. The real number is lower, because the quick check missed some that work.
  - In the heavy genres, nearly all the losses are RadCap / Radio Caprice channels (15), plus ~6 others: CORE Radio!, Culture Failure, Metalourgio, XWave Radio, Dogmazic, and Punkrockers' http copy.
- **Duplicates:** Radio Browser lists the same station several times, for example "SomaFM Metal Detector (128k AAC)", "(32k AAC)" and "(128k MP3)". Show one row per station and prefer the copy closest to 128k.

## 9. The relay for http-only stations

A tiny **Cloudflare Worker**, `radiotext-relay`, on Nathan's existing account (`radiotext-relay.nathanforestlee.workers.dev`). It's the only server-side piece.

- **Endpoint:** `GET /s/{stationuuid}`. The Worker looks up that station on Radio Browser and caches the lookup. It only relays a station whose `url_resolved` starts with `http://`. **It never accepts an arbitrary URL**, so it can't be used as an open proxy for the wider internet.
- **How it relays:**
  - Open a TCP socket (`connect()` from `cloudflare:sockets`) to the stream's host and port (default 80).
  - Send a plain `GET <path> HTTP/1.0` with a `Host` header and a `Radiotext` User-Agent.
  - Read the status line and headers.
  - Follow up to 3 redirects. A redirect to https is fetched with `fetch()`.
  - Stream the body back to the browser with the upstream `Content-Type`, `Cache-Control: no-store`, and CORS `*`.
  - Close the upstream socket when the listener disconnects.
- **Keep CPU near zero.** After the headers are parsed, pipe the socket's readable stream straight into the response body. Don't touch each audio chunk in JavaScript, because Workers Free allows only 10 ms of CPU per request.
- **Prove it early, but don't block on it.** An early build task shows RadCap Noise Rock playing through the relay in desktop Chrome for 10 minutes.
  - **Pass:** the audio is heard throughout. At most one automatic reconnect is allowed, with a gap under ~3 s, since the page reconnects on its own anyway.
  - **Build in parallel:** the rest of the site (https stations, pages, browse, storage) doesn't depend on the relay and is built alongside it.
  - **Phone preview:** send Nathan an early relay test link so his phone can confirm it. Don't block on his reply. This Mac only has Safari 16.6 and no current WebKit, so it can't stand in for his phone.
  - **If it fails** (`connect()` can't reach raw IPs, or Free-plan limits cut streams), **don't move to a paid plan**; Nathan won't pay. Drop the relay instead: hide http-only stations and replace preset 103 with the top-voted playable **https** station tagged "noise rock" (for example "Athens Noise Rocks" or "Radio Noise Rock"). Say which one in the hand-back.
- The page uses the relay only when a stream is http. https streams always play directly.

## 10. Saved stations and storage

- Saved stations are a list of `{stationuuid, name, url, tags, country}` in `localStorage`, seeded with the three defaults on first run.
- Removing a default keeps it removed.
- Wrap every read and write in try/catch. The page still works with storage blocked; it just forgets saves.
- **Heads-up for Nathan:** on iPhone, the home-screen app and a Safari tab keep **separate** storage. Stars added in one won't show in the other.

## 11. Look

- **Palette:** the 8 Teletext colours only: black, red, green, yellow, blue, magenta, cyan, white. Black background, flat fills, no gradients or shadows.
- **Type:** a real Teletext-style font. Bedstead is a free, public-domain Teletext font; self-host it, but **check its licence first**. VT323 is the fallback. Double-height for station names and the page title.
- **Mosaic graphics:** blocky mosaic art for the RADIOTEXT title band and a small radio or antenna motif. This is the site's pixel art. Draw it from a small grid as crisp SVG rects rather than relying on Unicode sextant characters, which phones may not render.
- **Layout:**
  - A 40-column feel scaled to the phone's width, with the fastext bar pinned to the bottom.
  - On a computer, a black page with the Teletext screen centred at phone-ish width, around 480 px max.
  - No horizontal scroll.
- **Motion:** none needed. If anything blinks (the old Teletext flash attribute), keep it to the ON AIR tag, and turn it off under `prefers-reduced-motion`.
- **Home screen:** a web manifest with display `standalone`, black theme, and Teletext tile icons (192, 512, plus an Apple touch icon).

## 12. Build, hosting, testing

- **Repo:** `natanforestree/radiotext` (public). The site sits at the repo root with ES modules, no build step and a `.nojekyll` file, the same way Arcadipelago works. Pages deploys from `main` root to **natanforestree.github.io/radiotext/**.
- **Worker:** lives in `worker/` with its own `wrangler.toml`. Deploy with `wrangler deploy` (already logged in).
- **Tests:**
  - Use `node --test` for the pure logic: flip list, station filtering and dedupe, codec mapping, storage seeding and removal, page numbering, and the relay's header and redirect parsing.
  - Keep logic out of DOM code so it can be tested.
- **Checks before calling it done:**
  - All three presets play in desktop Chrome on the live site, flipping works, and static plays.
  - Browse, search, save and unsave work.
  - Media Session handlers are registered.
  - Reconnect works after a forced network drop (DevTools offline, then online).
  - No console errors.
- **Nathan's phone check (can't be automated here):**
  - lock-screen controls
  - car next/prev
  - background play in a Safari tab **and** in the home-screen app

  Home-screen web apps on iPhone have had background-audio bugs in some iOS versions. If it fails there but works in a Safari tab, tell him to use the tab, and note it in the README.

## 13. Calls I made (Nathan, check these)

1. **Name:** "Radiotext," at natanforestree.github.io/radiotext/ (from the mockup's header).
2. **A relay Worker on your Cloudflare account**, so RadCap and the many http-only college and freeform stations can play. Without it, RadCap can't play at all.
3. **Page 300 is search**, not a list of every station.
4. **The flip list follows where you tuned from:** saved stations by default, or a genre page while you're scanning one.
5. **RadCap plays its 320k stream** (about 145 MB an hour on cell data). It's the only RadCap noise rock entry in Radio Browser, and the relay only takes Radio Browser stations. A 48k copy (`:8002`) exists but isn't listed.
6. **Dead stations show "PAGE NOT AVAILABLE"** and don't auto-skip. Lost signal retries for about 2 minutes.
7. **Static only while the screen is on.**
8. **No fake-CRT effects anywhere.**

## 14. Left to the builder

- Exact genre list and page numbers within 200–299, kept to the spirit of section 5.
- Subpage size on genre and search pages.
- Exact mosaic art.
- The bitrate and dedupe rule details.
- Caching for Radio Browser lookups.
- The relay's internal structure, as long as section 9's limits hold.
- Whether the relay also checks `Referer` to cut casual abuse.
