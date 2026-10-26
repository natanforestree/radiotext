import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer } from '../js/player.js';
import { FakeAudio } from './fake-audio.js';

const HTTPS = { uuid: 'soma', url: 'https://ice5.somafm.com/metal-128-aac' };
// An http station on a hostname tries https first; one on a bare IP goes straight to the relay.
const HTTP = { uuid: 'cia', url: 'http://stream.example.org:8000/x' };
const HTTP_AS_HTTPS = 'https://stream.example.org:8000/x';
const IP = { uuid: 'radcap', url: 'http://79.120.39.202:8000/noiserock' };
const RELAY = 'https://relay.example';
const deadSpy = () => { const added = []; return { added, has: (u) => added.includes(u), add: (u) => added.push(u) }; };
const setup = (t, opts = {}) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const audio = new FakeAudio(); const dead = deadSpy(); const kinds = [];
  const p = createPlayer({ audio, relayBase: RELAY, dead, online: () => true, onChange: (s) => kinds.push(s.kind), ...opts });
  return { audio, dead, kinds, p };
};

test('an https station plays directly', (t) => {
  const { audio, kinds, p } = setup(t);
  p.tune(HTTPS); assert.equal(audio.src, HTTPS.url);
  audio.fire('playing'); assert.deepEqual(kinds, ['tuning', 'playing']);
});
test('an http station tries https first, then the relay', (t) => {
  const { audio, p } = setup(t);
  p.tune(HTTP); assert.equal(audio.src, HTTP_AS_HTTPS);
  audio.fire('error'); assert.equal(audio.src, RELAY + '/s/cia');
  audio.fire('playing'); assert.equal(p.state.kind, 'playing');
});
test('a candidate that never starts times out after 8 s', (t) => {
  const { audio, p } = setup(t);
  p.tune(HTTP); t.mock.timers.tick(7999); assert.equal(audio.src, HTTP_AS_HTTPS);
  t.mock.timers.tick(1); assert.equal(audio.src, RELAY + '/s/cia');
});
test('a stale tune timeout never touches the next station', (t) => {
  const { audio, p } = setup(t);
  p.tune(HTTP); t.mock.timers.tick(5000);
  p.tune(HTTPS); t.mock.timers.tick(3000);
  assert.equal(audio.src, HTTPS.url); assert.equal(p.state.kind, 'tuning'); assert.equal(p.state.station.uuid, 'soma');
});
test('marks an http station dead only with no relay and while online', (t) => {
  const a = setup(t, { relayBase: null });
  a.p.tune(HTTP); a.audio.fire('error');
  assert.equal(a.p.state.kind, 'unavailable'); assert.deepEqual(a.dead.added, ['cia']);
});
test('does not mark a station dead while offline', (t) => {
  const { audio, dead, p } = setup(t, { relayBase: null, online: () => false });
  p.tune(HTTP); audio.fire('error');
  assert.equal(p.state.kind, 'unavailable'); assert.deepEqual(dead.added, []);
});
test('never marks dead when a relay exists or the station is https', (t) => {
  const { audio, dead, p } = setup(t);
  p.tune(HTTP); audio.fire('error'); audio.fire('error');
  p.tune(HTTPS); audio.fire('error');
  assert.equal(p.state.kind, 'unavailable'); assert.deepEqual(dead.added, []);
});
test('a dropped stream retries at 1, 2, 4, 8 then every 15 s and gives up at 2 minutes', (t) => {
  const { audio, p } = setup(t);
  p.tune(HTTPS); audio.fire('playing');
  audio.fire('error'); assert.equal(p.state.kind, 'retrying');
  const n = audio.plays;
  t.mock.timers.tick(999); assert.equal(audio.plays, n);
  t.mock.timers.tick(1); assert.equal(audio.plays, n + 1); assert.equal(audio.src, HTTPS.url);
  audio.fire('error'); t.mock.timers.tick(2000); assert.equal(audio.plays, n + 2);
  for (let i = 0; i < 20 && p.state.kind === 'retrying'; i++) { audio.fire('error'); t.mock.timers.tick(15000); }
  assert.equal(p.state.kind, 'lost'); assert.equal(audio.src, '');
});
test('a successful retry resets the backoff', (t) => {
  const { audio, p } = setup(t);
  p.tune(HTTPS); audio.fire('playing');
  audio.fire('error'); t.mock.timers.tick(1000); audio.fire('playing');
  assert.equal(p.state.kind, 'playing');
  const n = audio.plays; audio.fire('error'); t.mock.timers.tick(1000); assert.equal(audio.plays, n + 1);
});
test('play after giving up reconnects', (t) => {
  const { audio, p } = setup(t);
  p.tune(HTTPS); audio.fire('playing');
  for (let i = 0; i < 20 && p.state.kind !== 'lost'; i++) { audio.fire('error'); t.mock.timers.tick(15000); }
  p.resume(); assert.equal(audio.src, HTTPS.url); assert.equal(p.state.kind, 'tuning');
});
test('a stall of 10 s starts a retry; playing again cancels it', (t) => {
  const { audio, p } = setup(t);
  p.tune(HTTPS); audio.fire('playing');
  audio.fire('waiting'); t.mock.timers.tick(5000); audio.fire('playing'); t.mock.timers.tick(10000);
  assert.equal(p.state.kind, 'playing');
  audio.fire('waiting'); t.mock.timers.tick(9999); assert.equal(p.state.kind, 'playing');
  t.mock.timers.tick(1); assert.equal(p.state.kind, 'retrying');
});
test('stop pauses now and drops the connection after 30 s; resume goes live', (t) => {
  const { audio, p } = setup(t);
  p.tune(HTTPS); audio.fire('playing'); p.stop();
  assert.equal(audio.paused, true); assert.equal(audio.src, HTTPS.url); assert.equal(p.state.kind, 'off');
  audio.fire('error'); assert.equal(p.state.kind, 'off');
  t.mock.timers.tick(29999); assert.equal(audio.src, HTTPS.url);
  t.mock.timers.tick(1); assert.equal(audio.src, '');
  p.resume(); assert.equal(audio.src, HTTPS.url); assert.equal(p.state.kind, 'tuning');
});

// Beyond the brief: races found in self-review.
test('an error while waiting to retry is ignored, so only one attempt is ever pending', (t) => {
  const { audio, p } = setup(t);
  p.tune(HTTPS); audio.fire('playing'); audio.fire('error');
  const n = audio.plays; audio.fire('error'); audio.fire('ended');
  t.mock.timers.tick(1000); assert.equal(audio.plays, n + 1);
  t.mock.timers.tick(5000); assert.equal(audio.plays, n + 1);
});
test('a stream that comes back while waiting to retry is kept', (t) => {
  const { audio, p } = setup(t);
  p.tune(HTTPS); audio.fire('playing'); audio.fire('waiting'); t.mock.timers.tick(10000);
  const n = audio.plays; audio.fire('playing');
  assert.equal(p.state.kind, 'playing'); t.mock.timers.tick(60000); assert.equal(audio.plays, n);
});
test('a stalled event that buffered audio rides out ends the watch without reconnecting', (t) => {
  const { audio, p } = setup(t);
  p.tune(HTTPS); audio.fire('playing'); const n = audio.plays;
  audio.currentTime = 100; audio.fire('stalled'); audio.currentTime = 110;
  t.mock.timers.tick(10000); assert.equal(p.state.kind, 'playing');
  t.mock.timers.tick(120000); assert.equal(p.state.kind, 'playing'); assert.equal(audio.plays, n);
});
test('stalled, then the buffer plays on, then waiting: the retry starts 10 s after waiting', (t) => {
  const { audio, p } = setup(t);
  p.tune(HTTPS); audio.fire('playing');
  audio.currentTime = 100; audio.fire('stalled');
  t.mock.timers.tick(4000); audio.currentTime = 104; audio.fire('waiting');
  t.mock.timers.tick(9999); assert.equal(p.state.kind, 'playing');
  t.mock.timers.tick(1); assert.equal(p.state.kind, 'retrying');
});
test('a pause during a stall watch is not a stall, so the player never plays by itself', (t) => {
  const { audio, p } = setup(t);
  p.tune(HTTPS); audio.fire('playing');
  audio.currentTime = 0; audio.fire('stalled'); audio.pause(); const n = audio.plays;
  t.mock.timers.tick(10000); t.mock.timers.tick(110000); assert.equal(audio.plays, n); assert.equal(audio.paused, true);
});
// Ruling 12: a hands-free call often runs past 30 s, so an outside pause keeps src for 10 minutes.
test('an outside pause (phone call, Siri) goes off, drops after 10 minutes, and PLAY reconnects', (t) => {
  const { audio, kinds, p } = setup(t);
  p.tune(HTTPS); audio.fire('playing'); audio.fire('waiting');
  audio.pause(); audio.fire('pause');
  assert.equal(p.state.kind, 'off'); assert.deepEqual(kinds, ['tuning', 'playing', 'off']);
  const n = audio.plays;
  t.mock.timers.tick(30000); assert.equal(audio.src, HTTPS.url); // 0:30, where STOP would drop it
  t.mock.timers.tick(569000); assert.equal(audio.src, HTTPS.url); assert.equal(audio.plays, n); // 9:59
  t.mock.timers.tick(1000); assert.equal(audio.src, ''); // 10:00
  p.resume(); assert.equal(audio.src, HTTPS.url); assert.equal(p.state.kind, 'tuning');
});
test('when the phone resumes audio late in the 10 minutes, the radio is back on and stays', (t) => {
  const { audio, kinds, p } = setup(t);
  p.tune(HTTPS); audio.fire('playing'); audio.pause(); audio.fire('pause');
  t.mock.timers.tick(599000); audio.play(); audio.fire('playing');
  assert.equal(p.state.kind, 'playing'); assert.deepEqual(kinds, ['tuning', 'playing', 'off', 'playing']);
  t.mock.timers.tick(600000); assert.equal(audio.src, HTTPS.url); assert.equal(p.state.kind, 'playing');
});
test('when the phone resumes audio it paused (a call ends), the radio is back on', (t) => {
  const { audio, kinds, p } = setup(t);
  p.tune(HTTPS); audio.fire('playing'); audio.pause(); audio.fire('pause');
  t.mock.timers.tick(5000); audio.play(); audio.fire('playing');
  assert.equal(p.state.kind, 'playing'); assert.deepEqual(kinds, ['tuning', 'playing', 'off', 'playing']);
  t.mock.timers.tick(60000); assert.equal(audio.src, HTTPS.url);
  audio.fire('error'); assert.equal(p.state.kind, 'retrying');
});
// Safari won't resume after a call if the page paused the element during it, so the player
// leaves that pause to the phone.
test('when a call ends, Safari plays the radio again', (t) => {
  const { audio, kinds, p } = setup(t);
  p.tune(HTTPS); audio.fire('playing');
  audio.callStarts(); assert.equal(p.state.kind, 'off');
  t.mock.timers.tick(45000); audio.callEnds();
  assert.equal(p.state.kind, 'playing'); assert.deepEqual(kinds, ['tuning', 'playing', 'off', 'playing']);
});
test('STOP during a call keeps the radio off after it', (t) => {
  const { audio, p } = setup(t);
  p.tune(HTTPS); audio.fire('playing');
  audio.callStarts(); p.stop(); audio.callEnds();
  assert.equal(p.state.kind, 'off'); assert.equal(audio.paused, true);
});
test('a call longer than 10 minutes leaves the radio off', (t) => {
  const { audio, p } = setup(t);
  p.tune(HTTPS); audio.fire('playing');
  audio.callStarts(); t.mock.timers.tick(600000); audio.callEnds();
  assert.equal(p.state.kind, 'off'); assert.equal(audio.src, '');
});
test('after STOP, only the player turns the radio back on', (t) => {
  const { audio, p } = setup(t);
  p.tune(HTTPS); audio.fire('playing'); p.stop(); audio.play(); audio.fire('playing');
  assert.equal(p.state.kind, 'off');
});
test('pauses the player causes itself, and the pause before ended, are not outside pauses', (t) => {
  const { audio, p } = setup(t);
  p.tune(HTTPS); audio.fire('playing'); p.stop(); audio.fire('pause');
  t.mock.timers.tick(10000); p.resume(); audio.fire('pause'); assert.equal(p.state.kind, 'tuning');
  audio.fire('playing'); t.mock.timers.tick(25000); assert.equal(audio.src, HTTPS.url);
  audio.fire('error'); t.mock.timers.tick(1000); audio.fire('pause'); assert.equal(p.state.kind, 'retrying');
  audio.fire('playing'); audio.ended = true; audio.pause(); audio.fire('pause'); audio.fire('ended');
  assert.equal(p.state.kind, 'retrying');
  p.tune(HTTP); t.mock.timers.tick(8000); t.mock.timers.tick(8000); audio.fire('pause'); assert.equal(p.state.kind, 'unavailable');
});
const blocked = () => Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' }));
test('a play() blocked by autoplay rules goes off at once, without marking the station dead', async (t) => {
  const { audio, dead, kinds, p } = setup(t, { relayBase: null });
  audio.play = blocked;
  p.tune(HTTP); await null;
  assert.equal(p.state.kind, 'off'); assert.deepEqual(kinds, ['tuning', 'off']);
  t.mock.timers.tick(8000); assert.equal(p.state.kind, 'off'); assert.deepEqual(dead.added, []);
});
test('other play() rejections still wait for the tune timeout', async (t) => {
  const { audio, p } = setup(t);
  audio.play = () => Promise.reject(Object.assign(new Error('x'), { name: 'AbortError' }));
  p.tune(HTTPS); await null; assert.equal(p.state.kind, 'tuning');
  t.mock.timers.tick(8000); assert.equal(p.state.kind, 'unavailable');
});
test('a late NotAllowedError from an old tune leaves the current one alone', async (t) => {
  const { audio, p } = setup(t);
  const rejects = []; audio.play = () => new Promise((_, reject) => rejects.push(reject));
  p.tune(HTTPS); p.tune(HTTP);
  rejects[0](Object.assign(new Error('x'), { name: 'NotAllowedError' })); await null; await null;
  assert.equal(p.state.kind, 'tuning'); assert.equal(p.state.station.uuid, 'cia');
});
test('fast flips: a pending retry never touches the next station; stop then resume keeps it', (t) => {
  const { audio, p } = setup(t);
  p.tune(HTTPS); audio.fire('playing'); audio.fire('error');
  p.tune(HTTP); t.mock.timers.tick(1000);
  assert.equal(audio.src, HTTP_AS_HTTPS); assert.equal(p.state.kind, 'tuning');
  audio.fire('playing'); p.stop(); t.mock.timers.tick(10000); p.resume(); audio.fire('playing'); t.mock.timers.tick(25000);
  assert.equal(audio.src, HTTP_AS_HTTPS); assert.equal(p.state.kind, 'playing');
});
test('stop during a retry attempt ignores its late events and drops after 30 s', (t) => {
  const { audio, p } = setup(t);
  p.tune(HTTPS); audio.fire('playing'); audio.fire('error'); t.mock.timers.tick(1000);
  const n = audio.plays; p.stop(); audio.fire('error'); audio.fire('playing'); t.mock.timers.tick(200000);
  assert.equal(p.state.kind, 'off'); assert.equal(audio.src, ''); assert.equal(audio.plays, n);
});
// A station that played this session and now won't start is more likely a weak signal (a dead
// spot, or the minute after a call) than a dead station, so it keeps trying like a dropped stream.
test('a station that played this session retries instead of going unavailable', (t) => {
  const { audio, kinds, p } = setup(t);
  p.tune(HTTPS); audio.fire('playing'); p.stop();
  p.resume(); t.mock.timers.tick(8000);
  assert.equal(p.state.kind, 'retrying'); assert.deepEqual(kinds, ['tuning', 'playing', 'off', 'tuning', 'retrying']);
  const n = audio.plays; t.mock.timers.tick(1000); assert.equal(audio.plays, n + 1); assert.equal(audio.src, HTTPS.url);
  audio.fire('playing'); assert.equal(p.state.kind, 'playing');
});
test('the retry after a failed re-tune gives up at 2 minutes', (t) => {
  const { audio, p } = setup(t);
  p.tune(HTTP); audio.fire('error'); audio.fire('playing'); // played through the relay
  p.tune(HTTP); audio.fire('error'); audio.fire('error');
  assert.equal(p.state.kind, 'retrying');
  t.mock.timers.tick(1000); assert.equal(audio.src, RELAY + '/s/cia');
  t.mock.timers.tick(150000); assert.equal(p.state.kind, 'lost'); assert.equal(audio.src, ''); // the last attempt ends past 2 min
});
test('a station that never starts is paused, so a late connection stays silent, and dropped after 30 s', (t) => {
  const { audio, p } = setup(t);
  p.tune(HTTPS); t.mock.timers.tick(8000);
  assert.equal(p.state.kind, 'unavailable'); assert.equal(audio.paused, true);
  audio.fire('playing'); assert.equal(p.state.kind, 'unavailable');
  t.mock.timers.tick(30000); assert.equal(audio.src, '');
});

// Ruling 10: a bare IP skips https; the candidate that worked is tried first next time.
test('an http station on a bare IP goes straight to the relay', (t) => {
  const { audio, kinds, p } = setup(t);
  p.tune(IP); assert.equal(audio.src, RELAY + '/s/radcap');
  audio.fire('playing'); assert.deepEqual(kinds, ['tuning', 'playing']);
});
test('with no relay, a bare-IP station is unavailable at once, marked dead only while online', (t) => {
  const a = setup(t, { relayBase: null });
  a.p.tune(HTTPS); a.audio.fire('playing'); const n = a.audio.plays;
  a.p.tune(IP);
  assert.equal(a.p.state.kind, 'unavailable'); assert.equal(a.p.state.station.uuid, 'radcap');
  assert.deepEqual(a.kinds, ['tuning', 'playing', 'unavailable']);
  assert.equal(a.audio.paused, true); assert.equal(a.audio.plays, n); assert.deepEqual(a.dead.added, ['radcap']);
  a.audio.fire('playing'); assert.equal(a.p.state.kind, 'unavailable'); // the old stream stays silent
  a.p.tune(HTTPS); assert.equal(a.audio.src, HTTPS.url); assert.equal(a.p.state.kind, 'tuning');
  t.mock.timers.reset();
  const b = setup(t, { relayBase: null, online: () => false });
  b.p.tune(IP); assert.equal(b.p.state.kind, 'unavailable'); assert.deepEqual(b.dead.added, []);
});
test('the candidate that worked is tried first on the next tune of that station', (t) => {
  const { audio, p } = setup(t);
  p.tune(HTTP); audio.fire('error'); assert.equal(audio.src, RELAY + '/s/cia'); audio.fire('playing');
  p.tune(HTTPS); audio.fire('playing');
  p.tune(HTTP); assert.equal(audio.src, RELAY + '/s/cia');
  audio.fire('error'); assert.equal(audio.src, HTTP_AS_HTTPS); // if it fails, the others are still tried
  audio.fire('playing'); p.tune(HTTPS); p.tune(HTTP); assert.equal(audio.src, HTTP_AS_HTTPS);
  p.tune({ uuid: 'other', url: 'http://other.example.org/y' }); assert.equal(audio.src, 'https://other.example.org/y');
});
