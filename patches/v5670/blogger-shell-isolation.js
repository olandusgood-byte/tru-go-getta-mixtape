// V5670 review-only patch module.
// Preferred template fix: add cond='data:view.isHomepage' to Blogger widget HTML6.
(function tggIsolateCustomApplicationPages() {
  'use strict';

  var path = window.location.pathname || '/';
  var isCustomApplication = path.indexOf('/p/') === 0 && path !== '/p/homepage.html';
  if (!isCustomApplication) return;

  document.documentElement.classList.add('tgg-app-route');

  function isolate() {
    // HTML6 is the live homepage widget currently appended to every custom page.
    var homepageWidget = document.getElementById('HTML6');
    if (homepageWidget) homepageWidget.remove();

    // Keep the application post body; remove only Blogger page chrome.
    [
      '.post-title.entry-title',
      '.post-header',
      '.post-footer',
      '.comments',
      '.blog-pager',
      '.feed-links'
    ].forEach(function hideBloggerChrome(selector) {
      document.querySelectorAll(selector).forEach(function hide(element) {
        element.hidden = true;
        element.setAttribute('aria-hidden', 'true');
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', isolate, { once: true });
  } else {
    isolate();
  }
})();
