// V5670 replacement for the anonymous direct table join in HTML6.
(function installTggPublicDiscoveryAdapter() {
  'use strict';

  function normalizeRelease(row) {
    var artist = row && (row.artist || row.artists);
    var artistName = row && (row.artist_name || row.stage_name);
    if (!artistName && artist && typeof artist === 'object') {
      artistName = artist.stage_name || artist.name;
    }

    var tracks = Array.isArray(row && row.tracks) ? row.tracks : [];
    if (!tracks.length && row && row.first_track_id) {
      tracks = [{
        id: row.first_track_id,
        title: row.first_track_title || 'Track 1',
        track_number: 1
      }];
    }
    return {
      id: row && (row.id || row.mixtape_id || row.release_id),
      title: row && (row.title || row.release_title) || 'Untitled Release',
      genre: row && row.genre || '',
      description: row && row.description || '',
      cover_url: row && (row.cover_url || row.artwork_url) || '',
      release_date: row && row.release_date || '',
      featured: Boolean(row && row.featured),
      created_at: row && row.created_at || '',
      artists: { stage_name: artistName || 'Unknown Artist' },
      tracks: tracks
    };
  }

  async function loadPublicReleases(db, limit, query) {
    var result = await db.rpc('tgg_public_discovery_growth_feed', {
      p_limit: Number.isFinite(limit) ? limit : 10,
      p_query: query || null
    });
    if (result.error) throw result.error;

    var payload = result.data;
    if (!payload || payload.ok !== true || !Array.isArray(payload.items)) {
      throw new Error('Unexpected tgg_public_discovery_growth_feed response contract.');
    }
    var rows = payload.items;
    return rows.map(normalizeRelease).filter(function hasId(item) { return Boolean(item.id); });
  }

  async function loadFeaturedReleases(db, limit) {
    var result = await db.rpc('tgg_public_launch_mix', {
      p_release_limit: Number.isFinite(limit) ? limit : 10
    });
    if (result.error) throw result.error;
    var payload = result.data;
    if (!payload || payload.ok !== true || !Array.isArray(payload.releases)) {
      throw new Error('Unexpected tgg_public_launch_mix response contract.');
    }
    return payload.releases
      .filter(function featured(row) { return row.featured === true; })
      .map(normalizeRelease)
      .filter(function hasId(item) { return Boolean(item.id); });
  }

  async function queryPublicReleases(db, limit, query, options) {
    try {
      var rows = options && options.featuredOnly
        ? await loadFeaturedReleases(db, limit)
        : await loadPublicReleases(db, limit, query);
      return { data: rows, error: null };
    } catch (error) {
      return { data: null, error: error };
    }
  }

  window.TGGPublicDiscovery = Object.freeze({
    loadPublicReleases: loadPublicReleases,
    loadFeaturedReleases: loadFeaturedReleases,
    queryPublicReleases: queryPublicReleases,
    normalizeRelease: normalizeRelease
  });
})();
