const loadingScreen = document.getElementById("loading-screen");
const loadingStatus = document.getElementById("loading-status");
const appShell = document.getElementById("app-shell");
const alertBanner = document.getElementById("alert-banner");
const logOutput = document.getElementById("log-output");
const installButton = document.getElementById("install-button");
const refreshButton = document.getElementById("refresh-button");
const clearCacheButton = document.getElementById("clear-cache-button");

const statusNodes = new Map(
  Array.from(document.querySelectorAll("[data-status-key]")).map((card) => [
    card.dataset.statusKey,
    {
      card,
      value: card.querySelector(".status-value"),
      detail: card.querySelector(".status-detail"),
    },
  ])
);

let deferredInstallPrompt = null;

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  bootstrap();
});

function bindEvents() {
  refreshButton?.addEventListener("click", () => bootstrap());
  clearCacheButton?.addEventListener("click", clearV2Cache);
  installButton?.addEventListener("click", handleInstallClick);

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installButton.hidden = false;
    appendLog("Instalacao PWA disponivel para este dispositivo.");
    setStatus("install", "Instalavel", "Voce pode instalar esta v2 direto do navegador.", "ok");
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    installButton.hidden = true;
    appendLog("Aplicativo instalado com sucesso.");
    setStatus("install", "Instalado", "Esta v2 foi instalada neste dispositivo.", "ok");
  });

  window.addEventListener("online", () => {
    setStatus("network", "Online", "Conexao com a internet ativa.", "ok");
    appendLog("Rede restaurada.");
  });

  window.addEventListener("offline", () => {
    setStatus("network", "Offline", "Sem internet. A v2 segue em modo local.", "warn");
    appendLog("Rede indisponivel. Mantendo modo local.");
  });

  window.addEventListener("error", (event) => {
    showBanner("Erro capturado em runtime: " + (event.message || "falha desconhecida"));
    appendLog("Erro global: " + (event.message || "falha desconhecida"), "danger");
  });

  window.addEventListener("unhandledrejection", (event) => {
    const message =
      (event.reason && typeof event.reason === "object" && "message" in event.reason && event.reason.message) ||
      String(event.reason || "promessa rejeitada");
    showBanner("Promessa rejeitada: " + message);
    appendLog("Promessa rejeitada: " + message, "danger");
  });
}

async function bootstrap() {
  resetUiForBootstrap();
  setLoading("Montando diagnostico da v2...");
  appendLog("Boot iniciado em " + new Date().toLocaleString("pt-BR") + ".");
  setStatus("boot", "Iniciando", "Preparando verificacoes principais.", "warn");
  setStatus("network", navigator.onLine ? "Online" : "Offline", navigator.onLine ? "Conexao ativa." : "Sem internet.", navigator.onLine ? "ok" : "warn");
  setStatus("install", isStandalone() ? "Instalado" : "Navegador", isStandalone() ? "Rodando em modo app." : "Rodando no navegador.", isStandalone() ? "ok" : "warn");

  try {
    const bootResult = await Promise.race([
      runDiagnostics(),
      new Promise((_, reject) => {
        window.setTimeout(() => reject(new Error("Tempo limite excedido na inicializacao da v2.")), 7000);
      }),
    ]);

    setStatus("boot", bootResult.degraded ? "Pronto com fallback" : "Pronto", bootResult.message, bootResult.degraded ? "warn" : "ok");

    if (bootResult.degraded) {
      showBanner("A v2 abriu em modo seguro. Consulte o log abaixo antes de migrar as telas.");
    }
  } catch (error) {
    showBanner("A v2 abriu com erro de bootstrap: " + (error?.message || error));
    setStatus("boot", "Erro", "A inicializacao travou antes de concluir.", "danger");
    appendLog("Bootstrap falhou: " + (error?.message || error), "danger");
  } finally {
    appShell.hidden = false;
    loadingScreen.hidden = true;
  }
}

async function runDiagnostics() {
  let degraded = false;
  let detail = "Base nova pronta para receber as proximas migracoes.";

  setLoading("Checando Firebase...");
  const firebaseApi = window.RenovoV2Firebase;
  if (!firebaseApi || typeof firebaseApi.init !== "function") {
    degraded = true;
    setStatus("firebase", "Indisponivel", "Bridge local do Firebase nao foi carregada.", "danger");
    appendLog("Bridge do Firebase nao encontrada.", "danger");
  } else {
    const firebaseResult = await firebaseApi.init();
    setStatus("firebase", mapStatusLabel(firebaseResult.status), firebaseResult.detail, firebaseResult.status);
    appendLog("Firebase: " + firebaseResult.detail, firebaseResult.status);
    if (firebaseResult.status !== "ok") {
      degraded = true;
    }
  }

  setLoading("Registrando cache offline...");
  const swResult = await registerServiceWorker();
  setStatus("serviceWorker", swResult.label, swResult.detail, swResult.tone);
  appendLog("Service worker: " + swResult.detail, swResult.tone);
  if (swResult.tone !== "ok") {
    degraded = true;
  }

  setLoading("Finalizando...");
  if (!navigator.onLine) {
    degraded = true;
    detail = "Rede offline detectada. A v2 segue pronta para testes locais.";
  } else if (degraded) {
    detail = "Alguns modulos cairam em fallback seguro, mas a base nova esta no ar.";
  }

  return { degraded, message: detail };
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return {
      label: "Sem suporte",
      detail: "Este navegador nao suporta service worker.",
      tone: "warn",
    };
  }

  try {
    const registration = await navigator.serviceWorker.register("./service-worker.js?v=1");
    await registration.update();
    return {
      label: "Ativo",
      detail: "Cache offline da v2 registrado com sucesso.",
      tone: "ok",
    };
  } catch (error) {
    return {
      label: "Falhou",
      detail: "Nao foi possivel registrar o cache offline: " + (error?.message || error),
      tone: "danger",
    };
  }
}

async function clearV2Cache() {
  appendLog("Limpando caches e registros da v2...");

  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations
          .filter((registration) => {
            try {
              return new URL(registration.scope).pathname.includes("/renovo/v2/");
            } catch {
              return false;
            }
          })
          .map((registration) => registration.unregister())
      );
    }

    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith("renovo-v2-")).map((key) => caches.delete(key)));
    }

    appendLog("Cache da v2 limpo. Recarregando pagina...");
    window.setTimeout(() => window.location.reload(), 600);
  } catch (error) {
    showBanner("Falha ao limpar cache da v2: " + (error?.message || error));
    appendLog("Falha ao limpar cache: " + (error?.message || error), "danger");
  }
}

async function handleInstallClick() {
  if (!deferredInstallPrompt) {
    showBanner("O navegador nao liberou instalacao automatica ainda.");
    appendLog("Instalacao manual necessaria. Abra o menu do navegador.", "warn");
    return;
  }

  deferredInstallPrompt.prompt();
  const choice = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installButton.hidden = true;

  if (choice.outcome === "accepted") {
    appendLog("Instalacao aceita pelo usuario.", "ok");
    setStatus("install", "Instalando", "Confirme a instalacao no navegador.", "ok");
    return;
  }

  appendLog("Instalacao cancelada pelo usuario.", "warn");
  setStatus("install", "Cancelado", "A instalacao foi cancelada.", "warn");
}

function resetUiForBootstrap() {
  hideBanner();
  clearLog();
  installButton.hidden = deferredInstallPrompt ? false : true;
}

function setLoading(message) {
  if (loadingStatus) {
    loadingStatus.textContent = message;
  }
}

function showBanner(message) {
  if (!alertBanner) return;
  alertBanner.hidden = false;
  alertBanner.textContent = message;
}

function hideBanner() {
  if (!alertBanner) return;
  alertBanner.hidden = true;
  alertBanner.textContent = "";
}

function clearLog() {
  if (!logOutput) return;
  logOutput.textContent = "";
}

function appendLog(message, tone) {
  if (!logOutput) return;
  const prefix =
    tone === "danger" ? "[erro]" :
    tone === "warn" ? "[alerta]" :
    tone === "ok" ? "[ok]" :
    "[info]";

  const current = logOutput.textContent ? logOutput.textContent + "\n" : "";
  logOutput.textContent = current + prefix + " " + message;
}

function setStatus(key, label, detail, tone) {
  const node = statusNodes.get(key);
  if (!node) return;
  node.card.dataset.tone = tone || "warn";
  if (node.value) node.value.textContent = label;
  if (node.detail) node.detail.textContent = detail;
}

function mapStatusLabel(status) {
  if (status === "ok") return "Pronto";
  if (status === "warn") return "Fallback";
  if (status === "danger") return "Erro";
  return "Info";
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}
