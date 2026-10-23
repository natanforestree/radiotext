# Radiotext

A Teletext-style internet radio, for noise rock, sludge and other obscure stations. Plain ES modules, no build step. Made to be used on an iPhone in the car.

Live at https://natanforestree.github.io/radiotext/

## Using it

- **Pages:** 100 is home, 101-199 are your saved stations, 200 lists the genres, 210-228 are the genre pages (more than one subpage when a genre is long) 300 is search and 999 is the engineering log: what the player, the audio, the lock screen and the car did, with times, to trace a stop that only happens away from a desk (COPY puts it on the clipboard). Type a three-digit number on a keyboard to jump to a page.
- **Coloured keys along the bottom:** red = previous station, green = play/stop, yellow = next station, cyan = browse (it becomes HOME away from the home page).
- **Keyboard:** left/right arrows for previous/next, Space for play/stop, Esc for home.
- **In the car:** previous/next on the steering wheel or lock screen flip through the current list (saved stations, or the genre/search list you tapped from). The track title comes from SomaFM and laut.fm now-playing where available.
- **Home screen:** in Safari, Share, then Add to Home Screen. It opens full screen with the Teletext icon.

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
- Font: Bedstead (CC0), https://bjh21.me.uk/bedstead/
- Now-playing: the SomaFM and laut.fm APIs
