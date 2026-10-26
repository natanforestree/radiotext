export class FakeAudio extends EventTarget {
  src = ''; paused = true; plays = 0; loads = 0;
  // Safari's rule for a phone call (WebKit PlatformMediaSession): it pauses the element, and when
  // the call ends it plays it again, unless the page called pause() during the call.
  inCall = false; pausedInCall = false;
  play() { this.paused = false; this.plays++; return Promise.resolve(); }
  pause() { this.paused = true; if (this.inCall) this.pausedInCall = true; }
  load() { this.loads++; }
  removeAttribute(name) { if (name === 'src') this.src = ''; }
  fire(type) { this.dispatchEvent(new Event(type)); }
  callStarts() { this.inCall = true; this.pausedInCall = false; this.paused = true; this.fire('pause'); }
  callEnds() {
    this.inCall = false;
    if (this.pausedInCall) return;
    this.play();
    this.fire('playing');
  }
}
