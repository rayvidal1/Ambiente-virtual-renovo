/* firebase-db.js — integração Firestore para o Ambiente Renovo */
(function () {
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyAkVidPhtpX-o2gGlvTkdbYLQ7CJmMl3fs",
    authDomain: "ambiente-renovo.firebaseapp.com",
    projectId: "ambiente-renovo",
    storageBucket: "ambiente-renovo.firebasestorage.app",
    messagingSenderId: "520918200219",
    appId: "1:520918200219:web:318dfff7bf0060318abb3e",
  };

  try {
    firebase.initializeApp(FIREBASE_CONFIG);
  } catch (_) {
    // já inicializado
  }

  const db = firebase.firestore();

  // Remove dados binários pesados antes de salvar no Firestore
  // (imagens base64 ficam no localStorage do dispositivo)
  function stripHeavyData(state) {
    if (!state || typeof state !== "object") return state;
    const out = Object.assign({}, state);
    if (Array.isArray(out.reports)) {
      out.reports = out.reports.map((r) => Object.assign({}, r, { images: [] }));
    }
    if (Array.isArray(out.studies)) {
      out.studies = out.studies.map((s) => Object.assign({}, s, { pdfDataUrl: "" }));
    }
    return out;
  }

  // Carrega todos os dados do Firestore de uma vez
  window.fsLoadAll = async function () {
    try {
      const [stateDoc, usersDoc, visitantesDoc] = await Promise.all([
        db.collection("renovo").doc("state").get(),
        db.collection("renovo").doc("users").get(),
        db.collection("renovo").doc("visitantes").get(),
      ]);
      return {
        state: stateDoc.exists ? stateDoc.data() : null,
        users: usersDoc.exists ? (usersDoc.data().list || null) : null,
        visitantes: visitantesDoc.exists ? (visitantesDoc.data().list || null) : null,
      };
    } catch (e) {
      console.warn("[Firebase] Falha ao carregar dados:", e.message);
      return { state: null, users: null, visitantes: null };
    }
  };

  // Salva estado da aplicação (células, relatórios, estudos)
  window.fsSaveState = function (nextState) {
    db.collection("renovo")
      .doc("state")
      .set(stripHeavyData(nextState))
      .catch((e) => console.warn("[Firebase] saveState:", e.message));
  };

  // Salva usuários
  window.fsSaveUsers = function (nextUsers) {
    db.collection("renovo")
      .doc("users")
      .set({ list: nextUsers })
      .catch((e) => console.warn("[Firebase] saveUsers:", e.message));
  };

  // Salva visitantes da igreja
  window.fsSaveVisitantes = function (list) {
    db.collection("renovo")
      .doc("visitantes")
      .set({ list })
      .catch((e) => console.warn("[Firebase] saveVisitantes:", e.message));
  };
})();
