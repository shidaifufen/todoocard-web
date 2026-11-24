import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const base = 'https://shidaifufen.github.io/todoocard-web/';
function worker(fetcher, entries = new Map()) {
  const events = {}, deleted = [];
  const cache = {
    match: async request => entries.get(typeof request === 'string' ? request : request.url),
    put: async (request, response) => entries.set(request.url, response),
  };
  vm.runInNewContext(source, {
    URL, Request, fetch: fetcher,
    self: { registration: { scope: base }, addEventListener: (name, fn) => { events[name] = fn; }, clients: { claim: async () => {} } },
    caches: { open: async () => cache, keys: async () => ['todo-shell-v1', 'todoocard-web-shell-v2', 'other-app-cache'], delete: async key => { deleted.push(key); } },
  });
  return { deleted, activate: async () => {
    let pending; events.activate({ waitUntil: promise => { pending = promise; } }); await pending;
  }, get: async (pathname, mode = 'cors') => {
    let pending; events.fetch({ request: { url: new URL(pathname, base).href, method: 'GET', mode }, respondWith: promise => { pending = promise; } });
    return pending;
  } };
}

test('online shell requests obtain fresh code instead of stale cache', async () => {
  const entries = new Map([[base + 'js/ble.js?v=new', new Response('old')]]);
  const sw = worker(async (_request, options) => {
    assert.equal(options.cache, 'no-cache');
    return new Response('fresh');
  }, entries);
  assert.equal(await (await sw.get('js/ble.js?v=new')).text(), 'fresh');
});

test('offline versioned module uses the shell cache, missing script never becomes HTML', async () => {
  const sw = worker(async () => { throw new Error('offline'); }, new Map([
    [base + 'js/ble.js', new Response('cached module')],
    [base + 'index.html', new Response('<html>offline page</html>')],
  ]));
  assert.equal(await (await sw.get('js/ble.js?v=new')).text(), 'cached module');
  await assert.rejects(sw.get('js/missing.js'), /offline/);
  assert.match(await (await sw.get('some-page', 'navigate')).text(), /offline page/);
});

test('activation removes only this app caches, and other project requests are ignored', async () => {
  const sw = worker(async () => new Response('fresh'));
  await sw.activate();
  assert.deepEqual(sw.deleted, ['todo-shell-v1', 'todoocard-web-shell-v2']);
  assert.equal(await sw.get('../another-project/js/app.js'), undefined);
});
