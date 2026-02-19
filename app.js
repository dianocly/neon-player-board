// app.js
(() => {
  const STORAGE_KEY = "neon_player_board_v1";

  const els = {
    appRoot: document.getElementById("appRoot"),
    panel: document.getElementById("panel"),
    togglePanel: document.getElementById("togglePanel"),
    boardExport: document.getElementById("boardExport"),
    board: document.getElementById("board"),
    boardMeta: document.getElementById("boardMeta"),
    playerList: document.getElementById("playerList"),
    addPlayer: document.getElementById("addPlayer"),
    tileSize: document.getElementById("tileSize"),
    tileSizeValue: document.getElementById("tileSizeValue"),
    compactMode: document.getElementById("compactMode"),
    hideEliminated: document.getElementById("hideEliminated"),
    exportPng: document.getElementById("exportPng"),
    exportJson: document.getElementById("exportJson"),
    importJsonFile: document.getElementById("importJsonFile"),
    resetApp: document.getElementById("resetApp"),
  };

  /** ---------------------------
   * State
   * --------------------------*/
  let state = loadState() ?? defaultState();
  let saveTimer = null;

  function defaultState() {
    const sample = [];
    for (let i = 0; i < 8; i++) {
      const n = String(101 + i);
      sample.push({
        id: uid(),
        number: n,
        name: `Player ${n}`,
        imageDataUrl: makePlaceholderDataUrl(n),
        eliminated: false,
      });
    }
    return {
      version: 1,
      selectedId: sample[0]?.id ?? null,
      settings: {
        tileSize: 160,
        compactMode: false,
        hideEliminated: false,
      },
      players: sample,
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return sanitizeImportedState(parsed);
    } catch {
      return null;
    }
  }

  function saveStateDebounced() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (e) {
        // storage quota likely exceeded
        alert(
          "Save failed (storage quota). Try using smaller images, or Export JSON as backup.\n\nDetails: " +
            (e?.message ?? e)
        );
      }
    }, 180);
  }

  function sanitizeImportedState(obj) {
    if (!obj || typeof obj !== "object") return null;

    const players = Array.isArray(obj.players) ? obj.players : [];
    const safePlayers = players
      .filter((p) => p && typeof p === "object")
      .map((p) => ({
        id: typeof p.id === "string" && p.id ? p.id : uid(),
        number: typeof p.number === "string" || typeof p.number === "number" ? String(p.number) : "",
        name: typeof p.name === "string" ? p.name : "",
        imageDataUrl: typeof p.imageDataUrl === "string" && p.imageDataUrl.startsWith("data:")
          ? p.imageDataUrl
          : makePlaceholderDataUrl(typeof p.number === "string" || typeof p.number === "number" ? String(p.number) : "000"),
        eliminated: Boolean(p.eliminated),
      }));

    const settings = obj.settings && typeof obj.settings === "object" ? obj.settings : {};
    const safeSettings = {
      tileSize: clamp(Number(settings.tileSize ?? 160) || 160, 90, 220),
      compactMode: Boolean(settings.compactMode),
      hideEliminated: Boolean(settings.hideEliminated),
    };

    const selectedId =
      typeof obj.selectedId === "string" && safePlayers.some((p) => p.id === obj.selectedId)
        ? obj.selectedId
        : safePlayers[0]?.id ?? null;

    return {
      version: 1,
      selectedId,
      settings: safeSettings,
      players: safePlayers,
    };
  }

  /** ---------------------------
   * Rendering
   * --------------------------*/
  function applyTheme() {
    document.documentElement.style.setProperty("--tileSize", `${state.settings.tileSize}px`);
    els.tileSizeValue.textContent = `${state.settings.tileSize}px`;
    document.body.classList.toggle("compact", state.settings.compactMode);

    els.tileSize.value = String(state.settings.tileSize);
    els.compactMode.checked = state.settings.compactMode;
    els.hideEliminated.checked = state.settings.hideEliminated;

    const total = state.players.length;
    const visible = state.settings.hideEliminated
      ? state.players.filter((p) => !p.eliminated).length
      : total;
    const elim = state.players.filter((p) => p.eliminated).length;

    els.boardMeta.textContent = `${visible} shown • ${elim} eliminated • ${total} total`;
  }

  function visiblePlayers() {
    return state.settings.hideEliminated
      ? state.players.filter((p) => !p.eliminated)
      : state.players;
  }

  function renderBoard() {
    const vis = visiblePlayers();

    const frag = document.createDocumentFragment();
    for (const p of vis) {
      const tile = document.createElement("div");
      tile.className = "tile";
      tile.dataset.id = p.id;
      tile.draggable = true;

      if (p.id === state.selectedId) tile.classList.add("is-selected");
      if (p.eliminated) tile.classList.add("is-elim");

      tile.innerHTML = `
        <div class="tile__inner">
          <img class="tile__img" alt="" src="${escapeAttr(p.imageDataUrl)}" />
          <div class="tile__hud">
            <div class="tile__numWrap"><div class="tile__num">${escapeHtml(p.number || "")}</div></div>
            ${p.name ? `<div class="tile__name" title="${escapeAttr(p.name)}">${escapeHtml(p.name)}</div>` : `<div></div>`}
          </div>
          <div class="tile__elimStamp">ELIMINATED</div>
          <div class="tile__x" aria-hidden="true"></div>
        </div>
      `;
      frag.appendChild(tile);
    }

    els.board.replaceChildren(frag);
  }

  // ADD: compute a staggered “diamond lattice” layout and set board height
function layoutBoard() {
  const tiles = Array.from(els.board.querySelectorAll(".tile"));
  const n = tiles.length;

  if (!n) {
    els.board.style.height = "0px";
    return;
  }

    const size = state.settings.tileSize;
  const compact = state.settings.compactMode;

  // REPLACE: true diamond lattice spacing
  // tileSize is the diamond's bounding box (width/height). For a rotated square,
  // edge-to-edge tiling happens at bbox / sqrt(2).
  const base = size / Math.SQRT2; // ~0.707 * size

  // Small extra spacing so it doesn't look cramped (tuneable)
  const pad = compact ? 2 : 6;

  const stepX = base + pad;       // horizontal center-to-center
  const stepY = base + pad;       // vertical center-to-center
  const offsetX = stepX / 2;      // odd-row stagger

  const boardW = els.board.clientWidth;


  // columns that fit (account for the half-step offset on odd rows)
    let cols = Math.max(2, Math.floor((boardW - size - offsetX) / stepX) + 1);
  cols = Math.min(cols, n);

  const contentW = (cols - 1) * stepX + size + offsetX;
  const x0 = Math.max(0, (boardW - contentW) / 2);

  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;

    const x = x0 + c * stepX + (r % 2) * offsetX;
    const y = r * stepY;


    tiles[i].style.setProperty("--x", `${x}px`);
    tiles[i].style.setProperty("--y", `${y}px`);

    // upper rows visually on top (nice overlap ordering)
    tiles[i].style.zIndex = String(1000 - r);
  }

  const rows = Math.ceil(n / cols);
  const h = (rows - 1) * stepY + size;
  els.board.style.height = `${Math.ceil(h)}px`;
}


  function renderPlayerList() {
    const frag = document.createDocumentFragment();

    for (const p of state.players) {
      const row = document.createElement("div");
      row.className = "player-row";
      row.dataset.id = p.id;
      if (p.id === state.selectedId) row.classList.add("is-selected");

      row.innerHTML = `
        <div class="player-row__top">
          <button class="thumb" type="button" data-action="select" aria-label="Select player">
            <img alt="" src="${escapeAttr(p.imageDataUrl)}" />
          </button>

          <div class="fields">
            <div class="row1">
              <label class="small">
                No.
                <input type="text" value="${escapeAttr(p.number)}" data-field="number" inputmode="numeric" />
              </label>

              <label class="small">
                Name
                <input type="text" value="${escapeAttr(p.name)}" data-field="name" />
              </label>
            </div>

            <div class="row2">
              <label class="btn btn-mini btn--ghost" role="button" tabindex="0">
                Photo
                <input type="file" accept="image/*" data-action="upload" hidden />
              </label>

              <label class="pill">
                <input type="checkbox" data-field="eliminated" ${p.eliminated ? "checked" : ""} />
                Eliminated
              </label>

              <button class="btn btn-mini" type="button" data-action="up" title="Move up">↑</button>
              <button class="btn btn-mini" type="button" data-action="down" title="Move down">↓</button>
              <button class="btn btn-mini btn--danger" type="button" data-action="delete">Delete</button>
            </div>
          </div>
        </div>
      `;

      frag.appendChild(row);
    }

    els.playerList.replaceChildren(frag);
  }

function renderAll() {
  applyTheme();
  renderBoard();

  // REPLACE: layout after the browser computes sizes
  requestAnimationFrame(() => layoutBoard());

  renderPlayerList();
}


  // ADD: keep layout correct when the viewport changes
window.addEventListener("resize", () => layoutBoard());


  /** ---------------------------
   * Events
   * --------------------------*/
  els.togglePanel.addEventListener("click", () => {
    // simple mobile UX: scroll panel into view if stacked; otherwise no-op
    els.panel.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  els.tileSize.addEventListener("input", () => {
  state.settings.tileSize = clamp(Number(els.tileSize.value), 90, 220);
  applyTheme();
  layoutBoard(); // ADD: reposition tiles immediately
});

  els.tileSize.addEventListener("change", () => saveStateDebounced());

  els.compactMode.addEventListener("change", () => {
    state.settings.compactMode = els.compactMode.checked;
    renderAll();
    saveStateDebounced();
  });

  els.hideEliminated.addEventListener("change", () => {
    state.settings.hideEliminated = els.hideEliminated.checked;
    renderAll();
    saveStateDebounced();
  });

  els.addPlayer.addEventListener("click", () => {
    const next = nextNumberSuggestion();
    state.players.push({
      id: uid(),
      number: next,
      name: "",
      imageDataUrl: makePlaceholderDataUrl(next),
      eliminated: false,
    });
    state.selectedId = state.players[state.players.length - 1].id;
    renderAll();
    saveStateDebounced();
  });

  // Board: select + drag/drop reorder (event delegation)
  let draggingId = null;
  let dropTargetId = null;

  els.board.addEventListener("click", (e) => {
    const tile = e.target.closest(".tile");
    if (!tile) return;
    const id = tile.dataset.id;
    state.selectedId = id;
    renderAll();
    saveStateDebounced();
  });

  els.board.addEventListener("dragstart", (e) => {
    const tile = e.target.closest(".tile");
    if (!tile) return;
    draggingId = tile.dataset.id;
    dropTargetId = null;
    e.dataTransfer.effectAllowed = "move";
    try {
      e.dataTransfer.setData("text/plain", draggingId);
    } catch {}
  });

  els.board.addEventListener("dragover", (e) => {
    if (!draggingId) return;
    e.preventDefault();
    const tile = e.target.closest(".tile");
    const targetId = tile?.dataset?.id ?? null;

    if (dropTargetId !== targetId) {
      // clear previous highlight
      for (const el of els.board.querySelectorAll(".tile.is-drop-target")) {
        el.classList.remove("is-drop-target");
      }
      dropTargetId = targetId;
      if (tile) tile.classList.add("is-drop-target");
    }
  });

  els.board.addEventListener("drop", (e) => {
    if (!draggingId) return;
    e.preventDefault();

    const tile = e.target.closest(".tile");
    const targetId = tile?.dataset?.id ?? null;

    // remove highlight
    for (const el of els.board.querySelectorAll(".tile.is-drop-target")) {
      el.classList.remove("is-drop-target");
    }

    reorderById(draggingId, targetId);
    draggingId = null;
    dropTargetId = null;

    renderAll();
    saveStateDebounced();
  });

  els.board.addEventListener("dragend", () => {
    draggingId = null;
    dropTargetId = null;
    for (const el of els.board.querySelectorAll(".tile.is-drop-target")) {
      el.classList.remove("is-drop-target");
    }
  });

  // Player list: select/edit/upload/delete/reorder (event delegation)
  els.playerList.addEventListener("click", async (e) => {
    const row = e.target.closest(".player-row");
    if (!row) return;
    const id = row.dataset.id;

    const actionBtn = e.target.closest("[data-action]");
    const action = actionBtn?.dataset?.action ?? null;

    if (action === "select") {
      state.selectedId = id;
      renderAll();
      saveStateDebounced();
      return;
    }

    if (action === "delete") {
      const idx = state.players.findIndex((p) => p.id === id);
      if (idx >= 0) {
        state.players.splice(idx, 1);
        if (state.selectedId === id) {
          state.selectedId = state.players[Math.max(0, idx - 1)]?.id ?? state.players[0]?.id ?? null;
        }
        renderAll();
        saveStateDebounced();
      }
      return;
    }

    if (action === "up") {
      moveByDelta(id, -1);
      renderAll();
      saveStateDebounced();
      return;
    }

    if (action === "down") {
      moveByDelta(id, +1);
      renderAll();
      saveStateDebounced();
      return;
    }
  });

  els.playerList.addEventListener("input", (e) => {
    const row = e.target.closest(".player-row");
    if (!row) return;
    const id = row.dataset.id;
    const field = e.target.dataset.field;
    if (!field) return;

    const p = state.players.find((x) => x.id === id);
    if (!p) return;

    if (field === "number") {
      p.number = String(e.target.value ?? "");
    } else if (field === "name") {
      p.name = String(e.target.value ?? "");
    }

    // keep selection in sync when editing
    state.selectedId = id;
    renderAll();
    saveStateDebounced();
  });

  els.playerList.addEventListener("change", async (e) => {
    const row = e.target.closest(".player-row");
    if (!row) return;
    const id = row.dataset.id;

    const field = e.target.dataset.field;
    const action = e.target.dataset.action;

    const p = state.players.find((x) => x.id === id);
    if (!p) return;

    if (field === "eliminated") {
      p.eliminated = Boolean(e.target.checked);
      state.selectedId = id;
      renderAll();
      saveStateDebounced();
      return;
    }

    if (action === "upload") {
      const file = e.target.files?.[0];
      if (!file) return;

      // simple UX: select immediately
      state.selectedId = id;
      renderAll();

      try {
        setBusy(true, "Processing image…");
        const dataUrl = await fileToCompressedDataUrl(file, 800, 0.82);
        p.imageDataUrl = dataUrl;
        renderAll();
        saveStateDebounced();
      } catch (err) {
        alert("Failed to process image: " + (err?.message ?? err));
      } finally {
        setBusy(false);
        // allow re-upload of same file later
        e.target.value = "";
      }
    }
  });

  // Export JSON
  els.exportJson.addEventListener("click", () => {
    const payload = JSON.stringify(state, null, 2);
    if (payload.length > 4_500_000) {
      const ok = confirm(
        "Warning: This JSON looks large. If you have many images, file size can get big.\n\nContinue export?"
      );
      if (!ok) return;
    }
    downloadBlob(new Blob([payload], { type: "application/json" }), `player-board-${stamp()}.json`);
  });

  // Import JSON
  els.importJsonFile.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const sanitized = sanitizeImportedState(parsed);
      if (!sanitized) throw new Error("Invalid JSON format for this app.");

      state = sanitized;
      renderAll();
      saveStateDebounced();
    } catch (err) {
      alert("Import failed: " + (err?.message ?? err));
    } finally {
      e.target.value = "";
    }
  });

  // Export PNG
  els.exportPng.addEventListener("click", async () => {
    try {
      setBusy(true, "Rendering PNG…");
      const scale = Math.min(2, window.devicePixelRatio || 1);
      const canvas = await html2canvas(els.boardExport, {
        backgroundColor: null,
        scale,
        logging: false,
        useCORS: true,
      });

      await new Promise((resolve) => {
        if (canvas.toBlob) {
          canvas.toBlob((blob) => {
            if (!blob) {
              const dataUrl = canvas.toDataURL("image/png");
              downloadDataUrl(dataUrl, `player-board-${stamp()}.png`);
              resolve();
              return;
            }
            downloadBlob(blob, `player-board-${stamp()}.png`);
            resolve();
          }, "image/png");
        } else {
          const dataUrl = canvas.toDataURL("image/png");
          downloadDataUrl(dataUrl, `player-board-${stamp()}.png`);
          resolve();
        }
      });
    } catch (err) {
      alert("PNG export failed: " + (err?.message ?? err));
    } finally {
      setBusy(false);
    }
  });

  // Reset
  els.resetApp.addEventListener("click", () => {
    const ok = confirm("Reset will clear saved state in this browser. Continue?");
    if (!ok) return;
    localStorage.removeItem(STORAGE_KEY);
    state = defaultState();
    renderAll();
    saveStateDebounced();
  });

  /** ---------------------------
   * Helpers
   * --------------------------*/
  function uid() {
    return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function stamp() {
    const d = new Date();
    const pad = (x) => String(x).padStart(2, "0");
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttr(s) {
    return escapeHtml(s).replaceAll("\n", " ");
  }

  function nextNumberSuggestion() {
    // pick next integer above max numeric number; fallback "001"
    let max = 0;
    for (const p of state.players) {
      const n = parseInt(String(p.number).replace(/[^\d]/g, ""), 10);
      if (Number.isFinite(n)) max = Math.max(max, n);
    }
    const next = max ? String(max + 1) : "001";
    return next;
  }

  function moveByDelta(id, delta) {
    const idx = state.players.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const next = idx + delta;
    if (next < 0 || next >= state.players.length) return;
    const [item] = state.players.splice(idx, 1);
    state.players.splice(next, 0, item);
  }

  function reorderById(fromId, toId) {
    const fromIdx = state.players.findIndex((p) => p.id === fromId);
    if (fromIdx < 0) return;

    // If dropping on empty area, move to end.
    if (!toId) {
      const [item] = state.players.splice(fromIdx, 1);
      state.players.push(item);
      return;
    }

    const toIdx = state.players.findIndex((p) => p.id === toId);
    if (toIdx < 0 || toIdx === fromIdx) return;

    const [item] = state.players.splice(fromIdx, 1);
    const insertIdx = fromIdx < toIdx ? toIdx - 1 : toIdx;
    state.players.splice(insertIdx, 0, item);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2500);
  }

  function downloadDataUrl(dataUrl, filename) {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function setBusy(isBusy, msg = "") {
    els.exportPng.disabled = isBusy;
    els.exportJson.disabled = isBusy;
    els.addPlayer.disabled = isBusy;
    els.resetApp.disabled = isBusy;

    els.exportPng.textContent = isBusy ? (msg || "Working…") : "Export PNG";
  }

  /** ---------------------------
   * Image compression
   * --------------------------*/
  function supportsWebP() {
    try {
      const c = document.createElement("canvas");
      return c.toDataURL("image/webp").startsWith("data:image/webp");
    } catch {
      return false;
    }
  }

  async function fileToCompressedDataUrl(file, maxSide = 800, quality = 0.82) {
    const mime = supportsWebP() ? "image/webp" : "image/jpeg";

    const decoded = await decodeImage(file); // ImageBitmap or HTMLImageElement
    const w0 = decoded.width;
    const h0 = decoded.height;

    const scale = Math.min(1, maxSide / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * scale));
    const h = Math.max(1, Math.round(h0 * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { alpha: false });

    // mild sharpening-ish: draw white then image; keeps consistent background when exporting
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);

    ctx.drawImage(decoded, 0, 0, w, h);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Image encode failed."))),
        mime,
        quality
      );
    });

    // cleanup ImageBitmap
    if (decoded && typeof decoded.close === "function") decoded.close();

    return blobToDataUrl(blob);
  }

  async function decodeImage(file) {
    // Best-effort EXIF orientation support
    if ("createImageBitmap" in window) {
      try {
        return await createImageBitmap(file, { imageOrientation: "from-image" });
      } catch {}
      try {
        return await createImageBitmap(file);
      } catch {}
    }
    return htmlImageFromFile(file);
  }

  function htmlImageFromFile(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to decode image."));
      };
      img.src = url;
    });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(new Error("Failed to read encoded image."));
      fr.readAsDataURL(blob);
    });
  }

  /** ---------------------------
   * Placeholder images
   * --------------------------*/
  function makePlaceholderDataUrl(label) {
    const safe = String(label ?? "").slice(0, 10) || "000";
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="900" height="900">
        <defs>
          <radialGradient id="g" cx="35%" cy="25%" r="75%">
            <stop offset="0%" stop-color="#ff3e9c" stop-opacity="0.55"/>
            <stop offset="45%" stop-color="#2a1031" stop-opacity="0.95"/>
            <stop offset="100%" stop-color="#08060b" stop-opacity="1"/>
          </radialGradient>
          <linearGradient id="g2" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#4cff6a" stop-opacity="0.10"/>
            <stop offset="100%" stop-color="#ff3e9c" stop-opacity="0.10"/>
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#g)"/>
        <rect width="100%" height="100%" fill="url(#g2)"/>
        <circle cx="210" cy="220" r="180" fill="#ff3e9c" opacity="0.16"/>
        <circle cx="690" cy="240" r="230" fill="#ff3e9c" opacity="0.10"/>
        <circle cx="560" cy="710" r="280" fill="#4cff6a" opacity="0.06"/>

        <g opacity="0.10">
          ${Array.from({ length: 120 }).map((_, i) => {
            const x = (i * 73) % 900;
            const y = (i * 41) % 900;
            return `<rect x="${x}" y="${y}" width="2" height="2" fill="#ffffff"/>`;
          }).join("")}
        </g>

        <text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle"
          font-family="Arial, sans-serif" font-size="120"
          fill="#4cff6a" opacity="0.30" letter-spacing="8">${escapeXml(safe)}</text>
      </svg>
    `.trim();

    const encoded = encodeURIComponent(svg)
      .replaceAll("%0A", "")
      .replaceAll("%20", " ")
      .replaceAll("%3D", "=")
      .replaceAll("%3A", ":")
      .replaceAll("%2F", "/");

    return `data:image/svg+xml;charset=utf-8,${encoded}`;
  }

  function escapeXml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }

  /** ---------------------------
   * Init
   * --------------------------*/
  renderAll();
  saveStateDebounced();
})();
