/* Renovo v2 Firebase bridge with graceful fallback */
(function () {
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyAkVidPhtpX-o2gGlvTkdbYLQ7CJmMl3fs",
    authDomain: "ambiente-renovo.firebaseapp.com",
    projectId: "ambiente-renovo",
    storageBucket: "ambiente-renovo.firebasestorage.app",
    messagingSenderId: "520918200219",
    appId: "1:520918200219:web:318dfff7bf0060318abb3e",
  };

  function buildResult(status, detail, extra) {
    return Object.assign({ status, detail, db: null }, extra || {});
  }

  async function init() {
    if (!window.firebase || typeof window.firebase.initializeApp !== "function") {
      return buildResult("warn", "SDK do Firebase nao carregou. A v2 segue em modo local.");
    }

    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(FIREBASE_CONFIG);
      }
    } catch (error) {
      return buildResult("danger", "Falha ao iniciar Firebase: " + (error?.message || error));
    }

    if (typeof firebase.firestore !== "function") {
      return buildResult("warn", "Firebase ativo, mas Firestore nao esta disponivel.");
    }

    try {
      const db = firebase.firestore();
      return buildResult("ok", "Firebase e Firestore iniciados com fallback seguro.", { db });
    } catch (error) {
      return buildResult("warn", "Firestore nao respondeu. A base segue em modo local.");
    }
  }

  window.RenovoV2Firebase = {
    init,
  };
})();
