// V5670 targeted replacement for the corrupted Creator Store loader block.
(function installCreatorStoreLoaders() {
  'use strict';

  function byId(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>\"]/g, function escape(character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character];
    });
  }

  function publicProductCard(product) {
    var sold = product.inventory != null && Number(product.inventory) <= 0;
    var image = product.image_url
      ? '<img class="shopimg" src="' + escapeHtml(product.image_url) + '" alt="' + escapeHtml(product.title) + '">'
      : '<div class="shopimg"></div>';
    return '<div class="shopitem" data-shop-id="' + escapeHtml(product.id) + '">' +
      image +
      '<strong>' + escapeHtml(product.title) + '</strong>' +
      '<div class="m">' + escapeHtml(product.creator_name || 'TGG Creator') + '</div>' +
      '<div class="shopprice">$' + ((Number(product.price_cents) || 0) / 100).toFixed(2) + '</div>' +
      '<button class="btn shopBuy" type="button"' + (sold ? ' disabled' : '') + '>' +
      (sold ? 'Sold Out' : 'Buy') + '</button></div>';
  }

  async function loadPublicShop(db) {
    var result = await db.rpc('tgg_public_final_bundle');
    if (result.error) throw result.error;
    var products = result.data && Array.isArray(result.data.merch) ? result.data.merch : [];
    window.TGG_SHOP_PRODUCTS = products;

    var list = byId('publicShopList');
    var message = byId('publicShopMsg');
    if (!list || !message) return;
    list.innerHTML = products.map(publicProductCard).join('');
    message.textContent = products.length ? 'Secure checkout ready.' : 'No published products yet.';
  }

  async function loadCreatorShop(db) {
    var result = await window.TGGAuthFirst.protectedRpc(db, 'tgg_creator_store_bundle');
    if (result.error) throw result.error;
    return result.data || { counts: {}, products: [] };
  }

  window.TGGCreatorStore = Object.freeze({
    loadPublicShop: loadPublicShop,
    loadCreatorShop: loadCreatorShop,
    publicProductCard: publicProductCard
  });
})();
