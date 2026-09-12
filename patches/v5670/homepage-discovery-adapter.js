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
    var rows = Array.isArray(payload)
      ? payload
      : payload && Array.isArray(payload.releases)
        ? payload.releases
        : [];
    return rows.map(normalizeRelease).filter(function hasId(item) { return Boolean(item.id); });
  }

  async function queryPublicReleases(db, limit, query, options) {
    try {
      var rows = await loadPublicReleases(db, limit, query);
      if (options && options.featuredOnly) {
        rows = rows.filter(function featured(item) { return item.featured === true; });
      }
      return { data: rows, error: null };
    } catch (error) {
      return { data: null, error: error };
    }
  }

  window.TGGPublicDiscovery = Object.freeze({
    loadPublicReleases: loadPublicReleases,
    queryPublicReleases: queryPublicReleases,
    normalizeRelease: normalizeRelease
  });
})();
