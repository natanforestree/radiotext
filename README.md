# Radiotext

An internet radio for every genre, from pop hits and salsa to noise rock and sludge, with numbered pages like Teletext and a one-bit black-and-white look. Plain ES modules, no build step. Made for an iPhone in the car, and for a desktop browser.

Live at https://natanforestree.github.io/radiotext/

## Using it

- **Pages:** 100 is home, 101-199 are your saved stations, 200 lists the popular genres and links to the genre indexes on 201-207 (rock and metal, electronic and dance, jazz/soul/hip hop, reggae/latin/world, folk/country/classical/gospel, pop and oldies, underground), 210-299 are the genre pages (more than one subpage when a genre is long), 300 is search and 999 is the engineering log: what the player, the audio, the lock screen and the car did, with times, to trace a stop that only happens away from a desk (Copy puts it on the clipboard). To jump to a page, tap the page number at the top left and type it on the keypad (a typed number of a saved station tunes it), or type it on a keyboard.
- **Keys along the bottom:** Prev, Play/Stop, Next, and Browse on the home page; elsewhere that last key goes up a level, as Index from a genre page to its genre index and as Home from the rest. Back (a swipe on iPhone) returns to the page before.
- **Wide screens** (760px wide and 500px tall and up): home opens on the genre lists, a menu in the top bar goes to Genres, Search and Engineering, Now Playing and the saved stations stay on the left, the genre index one level up sits beside a genre page (from 1200px), lists scroll inside their windows, and a genre page shows 14 stations per subpage instead of 8. The type grows with the window.
- **Dark mode:** the moon key at the top right turns the screen to white on black (the sun turns it back), with rings spreading out from the key like sound waves: the screen swings between light and dark as they pass, wide rings then thin ones, and settles on the new mode. Each device remembers its choice; with reduced motion on, it switches at once.
- Sizes are in CSS pixels, so a screen with Windows display scaling at 125% or 150% counts as that much smaller.
- **Keyboard:** left/right arrows for previous/next, Space for play/stop, Esc for home (or to close the keypad).
- **In the car:** previous/next on the steering wheel or lock screen flip through the current list (saved stations, or the genre/search list you tapped from). The track title comes from SomaFM and laut.fm now-playing where available.
- **Home screen:** in Safari, Share, then Add to Home Screen. It opens full screen with the mast icon.

## Saved stations

They live on the device only (local storage), not on any server. On iPhone the home-screen app and Safari keep separate storage, so stations saved in one will not show in the other. Pick one and stick to it.

On iPhone, Safari may clear a site's saved data after about 7 days without a visit; the home-screen app isn't affected.

## Why the relay

Browsers block `http://` audio on an `https://` page, and some stations only offer http. A free Cloudflare Worker, https://radiotext-relay.nathanforestlee.workers.dev, covers that gap.

- It only relays Radio Browser stations, looked up by uuid, and only when their stream is `http://` and passed Radio Browser's last check.
- It serves audio content types only.
- https first: a station with an https stream, or whose http address also works over https, plays directly. Bare-IP http streams (RadCap, for example) go straight to the relay.

The page sends no Referer (`referrer: no-referrer`), because SomaFM's stream servers refuse foreign ones.

## Phone checks

- If audio stops when the phone locks while running as the home-screen app, use the site in a Safari tab instead.
- If the tuning static seems to cause trouble, set `STATIC_ENABLED = false` in `js/config.js`.

## Development

```
npm test                       # site tests
python3 -m http.server         # serve it locally on :8000
python3 tools/make_icons.py    # redraw the icons from the mast in js/mosaic.js

cd worker && npm install && npm test && npx wrangler deploy   # relay tests and deploy
node scripts/soak.mjs <url> <seconds>                         # relay soak test (from worker/)
```

## Credits

- Station data: [Radio Browser](https://www.radio-browser.info/)
- Font: Pixelify Sans (SIL Open Font License, `fonts/OFL.txt`), https://github.com/eifetx/Pixelify-Sans
- Now-playing: the SomaFM and laut.fm APIs
