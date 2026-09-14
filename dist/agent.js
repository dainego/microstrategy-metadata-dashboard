/* Cliente del chat. La clave de Gemini no llega nunca al navegador. */
(() => {
  const APP_NAME = "catalog_agent";
  const API_BASE = "/agent";
  const SESSION_KEY = "metadata-catalog-agent-session";
  const USER_KEY = "metadata-catalog-agent-user";

  const $ = id => document.getElementById(id);
  const newId = () =>
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const userId = sessionStorage.getItem(USER_KEY) || `browser-${newId()}`;
  const sessionId = sessionStorage.getItem(SESSION_KEY) || `session-${newId()}`;
  sessionStorage.setItem(USER_KEY, userId);
  sessionStorage.setItem(SESSION_KEY, sessionId);

  let sessionPromise;

  function setOpen(isOpen) {
    const panel = $("catalogAgent");
    const toggle = $("catalogAgentToggle");
    panel.hidden = !isOpen;
    toggle.setAttribute("aria-expanded", String(isOpen));
    if (isOpen) $("catalogAgentQuestion").focus();
  }

  function appendMessage(role, text, pending = false) {
    const messages = $("catalogAgentMessages");
    const message = document.createElement("article");
    message.className = "catalog-agent-message";
    message.dataset.role = role;
    if (pending) message.dataset.pending = "true";
    message.textContent = text;
    messages.append(message);
    messages.scrollTop = messages.scrollHeight;
    return message;
  }

  function addReferences(references) {
    const valid = [...references.values()].slice(0, 6);
    if (!valid.length || typeof window.openMetadataObject !== "function") return;

    const container = document.createElement("div");
    container.className = "catalog-agent-references";
    for (const reference of valid) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `Abrir ${reference.name || reference.key}`;
      button.title = reference.key;
      button.addEventListener("click", () => window.openMetadataObject(reference.key));
      container.append(button);
    }
    $("catalogAgentMessages").append(container);
    $("catalogAgentMessages").scrollTop = $("catalogAgentMessages").scrollHeight;
  }

  function extractResponse(events) {
    const texts = [];
    const references = new Map();
    for (const event of Array.isArray(events) ? events : []) {
      for (const part of event?.content?.parts || []) {
        if (typeof part.text === "string" && part.text.trim()) texts.push(part.text.trim());

        const response = part.functionResponse?.response;
        const candidates = [
          ...(Array.isArray(response?.matches) ? response.matches : []),
          ...(response?.object ? [response.object] : []),
        ];
        for (const item of candidates) {
          if (item?.key) references.set(item.key, item);
        }
      }
    }
    return {
      text: texts.at(-1) || "El agente no devolvió una respuesta legible.",
      references,
    };
  }

  async function readError(response) {
    try {
      const body = await response.json();
      return body.detail || body.message || JSON.stringify(body);
    } catch {
      return response.statusText || `HTTP ${response.status}`;
    }
  }

  async function ensureSession() {
    if (sessionPromise) return sessionPromise;
    sessionPromise = fetch(
      `${API_BASE}/apps/${encodeURIComponent(APP_NAME)}/users/${encodeURIComponent(userId)}/sessions/${encodeURIComponent(sessionId)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      },
    ).then(async response => {
      // Al recargar la página, la sesión en memoria puede existir todavía.
      if (response.ok || response.status === 409) return;
      const detail = await readError(response);
      if (response.status === 400 && /session already exists/i.test(String(detail))) return;
      throw new Error(detail);
    });
    return sessionPromise;
  }

  async function ask(question) {
    const input = $("catalogAgentQuestion");
    const submit = $("catalogAgentSend");
    appendMessage("user", question);
    const pending = appendMessage("assistant", "Consultando el catálogo…", true);
    input.disabled = true;
    submit.disabled = true;

    try {
      await ensureSession();
      const response = await fetch(`${API_BASE}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appName: APP_NAME,
          userId,
          sessionId,
          newMessage: { role: "user", parts: [{ text: question }] },
        }),
      });
      if (!response.ok) throw new Error(await readError(response));

      const result = extractResponse(await response.json());
      pending.remove();
      appendMessage("assistant", result.text);
      addReferences(result.references);
    } catch (error) {
      pending.remove();
      appendMessage(
        "error",
        "No se pudo consultar el asistente. Verificá que el contenedor catalog-agent esté iniciado y revisá sus logs.",
      );
      console.error("Error al consultar el agente del catálogo:", error);
      sessionPromise = undefined;
    } finally {
      input.disabled = false;
      submit.disabled = false;
      input.focus();
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("catalogAgentToggle").addEventListener("click", () => setOpen($("catalogAgent").hidden));
    $("catalogAgentClose").addEventListener("click", () => setOpen(false));
    $("catalogAgentForm").addEventListener("submit", event => {
      event.preventDefault();
      const input = $("catalogAgentQuestion");
      const question = input.value.trim();
      if (!question) return;
      input.value = "";
      ask(question);
    });
  });
})();
