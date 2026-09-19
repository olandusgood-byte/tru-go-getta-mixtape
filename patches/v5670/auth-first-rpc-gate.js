// V5670 review-only shared authentication gate.
(function installTggAuthFirstGate() {
  'use strict';

  async function resolveSession(db) {
    if (!db || !db.auth || typeof db.auth.getSession !== 'function') {
      return { session: null, error: new Error('Authentication client unavailable.') };
    }
    var result = await db.auth.getSession();
    return {
      session: result && result.data ? result.data.session : null,
      error: result ? result.error : new Error('Authentication session unavailable.')
    };
  }

  async function protectedRpc(db, functionName, args) {
    var auth = await resolveSession(db);
    if (auth.error) throw auth.error;
    if (!auth.session) {
      var signedOut = new Error('Sign in required.');
      signedOut.code = 'TGG_SIGN_IN_REQUIRED';
      throw signedOut;
    }
    return db.rpc(functionName, args || {});
  }

  window.TGGAuthFirst = Object.freeze({
    resolveSession: resolveSession,
    protectedRpc: protectedRpc
  });
})();
