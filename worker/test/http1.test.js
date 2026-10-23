import test from 'node:test';
import assert from 'node:assert/strict';
import { isUuid, buildRequest, findHeadEnd, parseHead, resolveLocation, safeAudioType } from '../src/http1.js';

const enc = (s) => new TextEncoder().encode(s);

test('isUuid accepts only Radio Browser uuids', () => {
  assert.equal(isUuid('ac497573-a6c5-4505-9086-2a905134abb5'), true);
  assert.equal(isUuid('ac497573'), false);
  assert.equal(isUuid('../etc/passwd'), false);
});
test('buildRequest writes a plain HTTP/1.0 GET', () => {
  assert.equal(buildRequest(new URL('http://79.120.39.202:8000/noiserock')),
    'GET /noiserock HTTP/1.0\r\nHost: 79.120.39.202:8000\r\nUser-Agent: Radiotext-relay/1.0\r\nAccept: */*\r\nIcy-MetaData: 0\r\nConnection: close\r\n\r\n');
  assert.match(buildRequest(new URL('http://culturefailure.com:8000/;')), /^GET \/; HTTP\/1\.0\r\nHost: culturefailure\.com:8000\r\n/);
  assert.match(buildRequest(new URL('http://a.example/x?y=1')), /^GET \/x\?y=1 HTTP\/1\.0\r\nHost: a\.example\r\n/);
});
test('findHeadEnd finds CRLF and bare-LF blank lines', () => {
  assert.deepEqual(findHeadEnd(enc('HTTP/1.0 200 OK\r\nA: b\r\n\r\nBODY')), { headEnd: 21, bodyStart: 25 });
  assert.deepEqual(findHeadEnd(enc('ICY 200 OK\nx: y\n\nZ')), { headEnd: 15, bodyStart: 17 });
  assert.equal(findHeadEnd(enc('HTTP/1.0 200 OK\r\nA: b\r\n')), null);
});
test('parseHead reads HTTP and ICY status lines', () => {
  assert.deepEqual(parseHead('HTTP/1.1 200 OK\r\nContent-Type: audio/aacp\r\nicy-br:320'), { status: 200, headers: { 'content-type': 'audio/aacp', 'icy-br': '320' } });
  assert.equal(parseHead('ICY 200 OK\r\ncontent-type: audio/mpeg').status, 200);
  assert.equal(parseHead('HTTP/1.0 302 Found\r\nLocation: http://b/x').headers.location, 'http://b/x');
  assert.equal(parseHead('garbage').status, 0);
});
test('resolveLocation handles relative and absolute redirects', () => {
  assert.equal(resolveLocation('http://a:8000/x', '/y'), 'http://a:8000/y');
  assert.equal(resolveLocation('http://a/x', 'https://b/z'), 'https://b/z');
});
test('safeAudioType keeps audio types and maps everything else to audio/mpeg', () => {
  assert.equal(safeAudioType('audio/aacp'), 'audio/aacp');
  assert.equal(safeAudioType('application/ogg'), 'application/ogg');
  assert.equal(safeAudioType('audio/mpeg; charset=x'), 'audio/mpeg');
  assert.equal(safeAudioType(' Audio/OGG;codecs=opus'), 'audio/ogg');
  for (const bad of ['text/html', 'image/svg+xml', 'application/xml', 'text/xml', 'text/plain', 'application/octet-stream',
    '', undefined, null, 'audio/', 'audio/mpeg\r\nX-Evil: 1', 'audio/mp\u00e9g', 'text/html; x=audio/mpeg']) {
    assert.equal(safeAudioType(bad), 'audio/mpeg', `for ${JSON.stringify(bad)}`);
  }
});
