export class FakeAudio extends EventTarget {
  src = ''; paused = true; plays = 0; loads = 0;
  play() { this.paused = false; this.plays++; return Promise.resolve(); }
  pause() { this.paused = true; }
  load() { this.loads++; }
  removeAttribute(name) { if (name === 'src') this.src = ''; }
  fire(type) { this.dispatchEvent(new Event(type)); }
}
