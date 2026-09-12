import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

async function adapter() {
  const source = await readFile('patches/v5670/homepage-discovery-adapter.js', 'utf8');
  const context = vm.createContext({ window: {} });
  new vm.Script(source).runInContext(context);
  return context.window.TGGPublicDiscovery;
}

const growthItem = {
  release_id: 'release-1',
  title: 'Bowser On It',
  genre: 'Rap',
  description: 'Bowser Drops A New Mixtape',
  cover_url: 'https://example.test/cover.jpg',
  stage_name: 'Tru Go Getta Mixtapes',
  first_track_id: 'track-1',
  first_track_title: 'Lets Get It',
  first_track_audio_url: 'https://should-not-reach-the-client.test/audio.mp3'
};

test('maps the exact GROWTH-005 items contract', async () => {
  const api = await adapter();
  const db = {
    rpc: async (name, args) => {
      assert.equal(name, 'tgg_public_discovery_growth_feed');
      assert.equal(JSON.stringify(args), JSON.stringify({ p_limit: 10, p_query: null }));
      return { data: { ok: true, version: 'GROWTH-005', items: [growthItem] }, error: null };
    }
  };
  const rows = await api.loadPublicReleases(db, 10, null);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'release-1');
  assert.equal(rows[0].artists.stage_name, 'Tru Go Getta Mixtapes');
  assert.equal(
    JSON.stringify(rows[0].tracks),
    JSON.stringify([{ id: 'track-1', title: 'Lets Get It', track_number: 1 }])
  );
  assert.equal('audio_url' in rows[0].tracks[0], false);
});

test('contract drift fails closed instead of rendering an empty success', async () => {
  const api = await adapter();
  const db = { rpc: async () => ({ data: { ok: true, releases: [growthItem] }, error: null }) };
  await assert.rejects(() => api.loadPublicReleases(db, 10, null), /Unexpected tgg_public_discovery_growth_feed/);
});

test('featured mode uses the public launch mix contract', async () => {
  const api = await adapter();
  const calls = [];
  const db = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      return {
        data: {
          ok: true,
          version: 'PUBLIC-LAUNCH-MIX-1.1',
          releases: [
            { release_id: 'featured-1', title: 'Featured', stage_name: 'Artist', featured: true },
            { release_id: 'regular-1', title: 'Regular', stage_name: 'Artist', featured: false }
          ]
        },
        error: null
      };
    }
  };
  const result = await api.queryPublicReleases(db, 4, null, { featuredOnly: true });
  assert.equal(result.error, null);
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].id, 'featured-1');
  assert.equal(
    JSON.stringify(calls),
    JSON.stringify([{ name: 'tgg_public_launch_mix', args: { p_release_limit: 4 } }])
  );
});

test('RPC errors remain explicit', async () => {
  const api = await adapter();
  const db = { rpc: async () => ({ data: null, error: new Error('permission denied') }) };
  const result = await api.queryPublicReleases(db, 10, null);
  assert.equal(result.data, null);
  assert.match(result.error.message, /permission denied/);
});
