(() => {
  const STORAGE_KEY = "squid_panel_board_v2";

  const els = {
    board: document.getElementById("board"),
    boardExport: document.getElementById("boardExport"),
    boardMeta: document.getElementById("boardMeta"),

    playerList: document.getElementById("playerList"),

    addPlayerBtn: document.getElementById("addPlayerBtn"),
    diamondSizeSlider: document.getElementById("diamondSizeSlider"),
    diamondSizeLabel: document.getElementById("diamondSizeLabel"),
    compactToggle: document.getElementById("compactToggle"),
    hideElimToggle: document.getElementById("hideElimToggle"),

    exportPngBtn: document.getElementById("exportPngBtn"),
    exportJsonBtn: document.getElementById("exportJsonBtn"),
    importJsonFile: document.getElementById("importJsonFile"),
    resetBtn: document.getElementById("resetBtn"),
  };

  // ---------- State ----------
  let state = loadState() ?? defaultState();
  let saveTimer = null;

  function defaultState() {
    const players = [];
    for (let i = 0; i < 12; i++) {
      const n = String(101 + i);
      players.push({
        id: uid(),
        number: n,
        name: `Player ${n}`,
        imageDataUrl: placeholderDataUrl(n),
        eliminated: false,
      });
    }
    return {
      version: 2,
      selectedId: players[0]?.id ?? null,
      settings: {
        diamondSize: 160,     // visible diamond size D
        compact: false,
        hideEliminated: false, // board only
      },
      players,
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return sanitizeState(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  function sanitizeState(obj) {
    if (!obj || typeof obj !== "object") return null;
    const playersIn = Array.isArray(obj.players) ? obj.players : [];

    const players = playersIn
      .filter(p => p && typeof p === "object")
      .map(p => ({
        id: typeof p.id === "string" && p.id ? p.id : uid(),
        number: (typeof p.number === "string" || typeof p.number === "number") ? String(p.number) : "",
        name: typeof p.name === "string" ? p.name : "",
        imageDataUrl: (typeof p.imageDataUrl === "string" && p.imageDataUrl.startsWith("data:"))
          ? p.imageDataUrl
          : placeholderDataUrl((typeof p.number === "string" || typeof p.number === "number") ? String(p.number) : "000"),
        eliminated: Boolean(p.eliminated),
      }));

    const settingsIn = obj.settings && typeof obj.settings === "object" ? obj.settings : {};
    const settings = {
      diamondSize: clamp(Number(settingsIn.diamondSize ?? settingsIn.tileSize ?? 160) || 160, 90, 220),
      compact: Boolean(settingsIn.compact ?? settingsIn.compactMode),
      hideEliminated: Boolean(settingsIn.hideEliminated),
    };

    const selectedId =
      typeof obj.selectedId === "string" && players.some(p => p.id === obj.selectedId)
        ? obj.selectedId
        : players[0]?.id ?? null;

    return { version: 2, selectedId, settings, players };
  }

  function saveDebounced() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (e) {
        alert("Save failed (storage quota). Use smaller photos or Export JSON.\n\n" + (e?.message ?? e));
      }
    }, 180);
  }

  // ---------- Settings / Theme ----------
  function applyTheme() {
    const D = state.settings.diamondSize;               // visible diamond size
    const a = Math.round(D / Math.SQRT2);               // square side

    document.documentElement.style.setProperty("--diamond", `${D}px`);
    document.documentElement.style.setProperty("--square", `${a}px`);

    document.body.classList.toggle("compact", state.settings.compact);

    els.diamondSizeSlider.value = String(D);
    els.diamondSizeLabel.textContent = `${D}px`;
    els.compactToggle.checked = state.settings.compact;
    els.hideElimToggle.checked = state.settings.hideEliminated;

    const total = state.players.length;
    const elim = state.players.filter(p => p.eliminated).length;
    const shown = state.settings.hideEliminated ? total - elim : total;

    els.boardMeta.textContent = `${shown} shown • ${elim} eliminated • ${total} total`;
  }

  // ---------- Rendering ----------
  function visiblePlayersForBoard() {
    return state.settings.hideEliminated
      ? state.players.filter(p => !p.eliminated)
      : state.players;
  }

  function renderBoard() {
    const players = visiblePlayersForBoard();
    const frag = document.createDocumentFragment();

    for (const p of players) {
      const tile = document.createElement("div");
      tile.className = "tile";
      tile.dataset.id = p.id;
      tile.draggable = true;

      if (p.id === state.selectedId) tile.classList.add("selected");
      if (p.eliminated) tile.classList.add("elim");

      tile.innerHTML = `
        <div class="tile__inner">
          <img class="tile__img" alt="" src="${escAttr(p.imageDataUrl)}" />
          <div class="tile__hud">
            <div class="tile__numWrap"><div class="tile__num">${escHtml(p.number || "")}</div></div>
            ${p.name ? `<div class="tile__name" title="${escAttr(p.name)}">${escHtml(p.name)}</div>` : `<div></div>`}
          </div>
          <div class="tile__stamp">ELIMINATED</div>
          <div class="tile__x"></div>
        </div>
      `;
      frag.appendChild(tile);
    }

    els.board.replaceChildren(frag);
  }

  function renderPlayerList() {
    const frag = document.createDocumentFragment();

    for (const p of state.players) {
      const row = document.createElement("div");
      row.className = "playerRow";
      row.dataset.id = p.id;
      if (p.id === state.selectedId) row.classList.add("selected");

      row.innerHTML = `
        <div class="playerRow__top">
          <button class="thumb" type="button" data-action="select" aria-label="Select">
            <img alt="" src="${escAttr(p.imageDataUrl)}" />
          </button>

          <div class="fields">
            <div class="row1">
              <label class="smallLabel">
                No.
                <input type="text" value="${escAttr(p.number)}" data-field="number" inputmode="numeric" />
              </label>

              <label class="smallLabel">
                Name
                <input type="text" value="${escAttr(p.name)}" data-field="name" />
              </label>
            </div>

            <div class="row2">
              <label class="btn btnMini btn--ghost" role="button" tabindex="0">
                Photo
                <input type="file" accept="image/*" data-action="upload" hidden />
              </label>

              <label class="pill">
                <input type="checkbox" data-field="eliminated" ${p.eliminated ? "checked" : ""} />
                Eliminated
              </label>

              <button class="btn btnMini" type="button" data-action="up" title="Move up">↑</button>
              <button class="btn btnMini" type="button" data-action="down" title="Move down">↓</button>
              <button class="btn btnMini btn--danger" type="button" data-action="delete">Delete</button>
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

    // Layout must happen AFTER tiles exist and board has width
    requestAnimationFrame(() => layoutBoard());

    renderPlayerList();
    saveDebounced();
  }

  // ---------- Diamond lattice layout (robust) ----------
  function layoutBoard() {
    const tiles = Array.from(els.board.querySelectorAll(".tile"));
    const n = tiles.length;

    if (!n) {
      els.board.style.height = "160px";
      return;
    }

    const rect = els.board.getBoundingClientRect();
    const W = rect.width;

    // If board isn't measurable yet (rare on first paint), retry
    if (W < 50) {
      requestAnimationFrame(() => layoutBoard());
      return;
    }

    const style = getComputedStyle(els.board);
    const padL = parseFloat(style.paddingLeft) || 0;
    const padR = parseFloat(style.paddingRight) || 0;
    const padT = parseFloat(style.paddingTop) || 0;
    const padB = parseFloat(style.paddingBottom) || 0;
    const innerW = Math.max(50, W - padL - padR);

    const D = state.settings.diamondSize;
    const compact = state.settings.compact;

    // Tuned to look like the show: slight overlap horizontally + more overlap vertically
    const g = compact ? 4 : 8;           // extra spacing (small)
    const dx = D * (compact ? 0.88 : 0.92) + g;
    const dy = D * (compact ? 0.62 : 0.68) + g;
    const offset = dx / 2;

    // compute columns that fit including stagger width
    // approx content width: (cols-1)*dx + D + offset
    let cols = Math.floor((innerW - D - offset) / dx) + 1;
    cols = clamp(cols, 1, n);

    const contentW = (cols - 1) * dx + D + offset;
    const marginX = Math.max(0, (innerW - contentW) / 2);

    const xStart = padL + marginX + D / 2;
    const yStart = padT + D / 2;

    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / cols);
      const c = i % cols;

      const cx = xStart + c * dx + (r % 2) * offset;
      const cy = yStart + r * dy;

      // Write actual left/top per tile so nothing can "pile"
      tiles[i].style.left = `${cx}px`;
      tiles[i].style.top = `${cy}px`;
      tiles[i].style.zIndex = String(1000 - r);
    }

    const rows = Math.ceil(n / cols);
    const contentH = D + (rows - 1) * dy;
    const totalH = yStart + (rows - 1) * dy + D / 2 + padB;

    els.board.style.height = `${Math.ceil(totalH)}px`;
  }

  // ---------- Events ----------
  els.addPlayerBtn.addEventListener("click", () => {
    const next = nextNumberSuggestion();
    const p = {
      id: uid(),
      number: next,
      name: "",
      imageDataUrl: placeholderDataUrl(next),
      eliminated: false,
    };
    state.players.push(p);
    state.selectedId = p.id;
    renderAll();
  });

  els.diamondSizeSlider.addEventListener("input", () => {
    state.settings.diamondSize = clamp(Number(els.diamondSizeSlider.value) || 160, 90, 220);
    applyTheme();
    layoutBoard();
    saveDebounced();
  });

  els.compactToggle.addEventListener("change", () => {
    state.settings.compact = els.compactToggle.checked;
    renderAll();
  });

  els.hideElimToggle.addEventListener("change", () => {
    state.settings.hideEliminated = els.hideElimToggle.checked;
    renderAll();
  });

  // Board click select
  els.board.addEventListener("click", (e) => {
    const tile = e.target.closest(".tile");
    if (!tile) return;
    state.selectedId = tile.dataset.id;
    renderAll();
  });

  // Drag/drop reorder on board
  let draggingId = null;

  els.board.addEventListener("dragstart", (e) => {
    const tile = e.target.closest(".tile");
    if (!tile) return;
    draggingId = tile.dataset.id;
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", draggingId); } catch {}
  });

  els.board.addEventListener("dragover", (e) => {
    if (!draggingId) return;
    e.preventDefault();
  });

  els.board.addEventListener("drop", (e) => {
    if (!draggingId) return;
    e.preventDefault();

    const target = e.target.closest(".tile");
    const targetId = target?.dataset?.id ?? null;

    reorderById(draggingId, targetId);
    draggingId = null;
    renderAll();
  });

  els.board.addEventListener("dragend", () => {
    draggingId = null;
  });

  // Player list interactions
  els.playerList.addEventListener("click", (e) => {
    const row = e.target.closest(".playerRow");
    if (!row) return;

    const id = row.dataset.id;
    const actionEl = e.target.closest("[data-action]");
    const action = actionEl?.dataset?.action ?? null;

    if (action === "select") {
      state.selectedId = id;
      renderAll();
      return;
    }

    if (action === "delete") {
      const idx = state.players.findIndex(p => p.id === id);
      if (idx >= 0) {
        state.players.splice(idx, 1);
        if (state.selectedId === id) {
          state.selectedId = state.players[Math.max(0, idx - 1)]?.id ?? state.players[0]?.id ?? null;
        }
        renderAll();
      }
      return;
    }

    if (action === "up") {
      moveByDelta(id, -1);
      renderAll();
      return;
    }

    if (action === "down") {
      moveByDelta(id, +1);
      renderAll();
      return;
    }
  });

  els.playerList.addEventListener("input", (e) => {
    const row = e.target.closest(".playerRow");
    if (!row) return;

    const id = row.dataset.id;
    const p = state.players.find(x => x.id === id);
    if (!p) return;

    const field = e.target.dataset.field;
    if (field === "number") p.number = String(e.target.value ?? "");
    if (field === "name") p.name = String(e.target.value ?? "");

    state.selectedId = id;
    renderAll();
  });

  els.playerList.addEventListener("change", async (e) => {
    const row = e.target.closest(".playerRow");
    if (!row) return;

    const id = row.dataset.id;
    const p = state.players.find(x => x.id === id);
    if (!p) return;

    // elimination toggle
    const field = e.target.dataset.field;
    if (field === "eliminated") {
      p.eliminated = Boolean(e.target.checked);
      renderAll();
      return;
    }

    // upload
    const action = e.target.dataset.action;
    if (action === "upload") {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        setBusy(true, "Processing…");
        const dataUrl = await fileToCompressedDataUrl(file, 900, 0.82);
        p.imageDataUrl = dataUrl;
        renderAll();
      } catch (err) {
        alert("Failed to process image: " + (err?.message ?? err));
      } finally {
        setBusy(false);
        e.target.value = "";
      }
    }
  });

  // Export JSON
  els.exportJsonBtn.addEventListener("click", () => {
    const payload = JSON.stringify(state, null, 2);
    if (payload.length > 4_500_000) {
      const ok = confirm("This JSON is large (images). Continue export?");
      if (!ok) return;
    }
    downloadBlob(new Blob([payload], { type: "application/json" }), `panel-board-${stamp()}.json`);
  });

  // Import JSON
  els.importJsonFile.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const txt = await file.text();
      const parsed = JSON.parse(txt);
      const sanitized = sanitizeState(parsed);
      if (!sanitized) throw new Error("Invalid board JSON.");
      state = sanitized;
      renderAll();
    } catch (err) {
      alert("Import failed: " + (err?.message ?? err));
    } finally {
      e.target.value = "";
    }
  });

  // Export PNG
  els.exportPngBtn.addEventListener("click", async () => {
    try {
      setBusy(true, "Rendering…");
      const scale = Math.min(2, window.devicePixelRatio || 1);
      const canvas = await html2canvas(els.boardExport, {
        backgroundColor: null,
        scale,
        logging: false,
        useCORS: true,
      });

      await new Promise((resolve) => {
        canvas.toBlob((blob) => {
          if (!blob) {
            downloadDataUrl(canvas.toDataURL("image/png"), `panel-board-${stamp()}.png`);
            resolve();
            return;
          }
          downloadBlob(blob, `panel-board-${stamp()}.png`);
          resolve();
        }, "image/png");
      });
    } catch (err) {
      alert("PNG export failed: " + (err?.message ?? err));
    } finally {
      setBusy(false);
    }
  });

  // Reset
  els.resetBtn.addEventListener("click", () => {
    const ok = confirm("Reset clears saved state in this browser. Continue?");
    if (!ok) return;
    localStorage.removeItem(STORAGE_KEY);
    state = defaultState();
    renderAll();
  });

  // Keep layout correct on resize
  const ro = new ResizeObserver(() => layoutBoard());
  ro.observe(els.board);

  window.addEventListener("resize", () => layoutBoard());

  // ---------- Helpers ----------
  function uid() {
    return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function stamp() {
    const d = new Date();
    const pad = (x) => String(x).padStart(2, "0");
    return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  }

  function escHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
  function escAttr(s) {
    return escHtml(s).replaceAll("\n", " ");
  }

  function nextNumberSuggestion() {
    let max = 0;
    for (const p of state.players) {
      const n = parseInt(String(p.number).replace(/[^\d]/g, ""), 10);
      if (Number.isFinite(n)) max = Math.max(max, n);
    }
    return max ? String(max + 1) : "001";
  }

  function moveByDelta(id, delta) {
    const idx = state.players.findIndex(p => p.id === id);
    if (idx < 0) return;
    const j = idx + delta;
    if (j < 0 || j >= state.players.length) return;
    const [it] = state.players.splice(idx, 1);
    state.players.splice(j, 0, it);
  }

  function reorderById(fromId, toId) {
    const fromIdx = state.players.findIndex(p => p.id === fromId);
    if (fromIdx < 0) return;

    if (!toId) {
      const [it] = state.players.splice(fromIdx, 1);
      state.players.push(it);
      return;
    }

    const toIdx = state.players.findIndex(p => p.id === toId);
    if (toIdx < 0 || toIdx === fromIdx) return;

    const [it] = state.players.splice(fromIdx, 1);
    const insertIdx = fromIdx < toIdx ? toIdx - 1 : toIdx;
    state.players.splice(insertIdx, 0, it);
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

  function setBusy(isBusy, label) {
    els.exportPngBtn.disabled = isBusy;
    els.exportJsonBtn.disabled = isBusy;
    els.addPlayerBtn.disabled = isBusy;
    els.resetBtn.disabled = isBusy;

    els.exportPngBtn.textContent = isBusy ? label : "Export PNG";
  }

  // ---------- Image compression ----------
  function supportsWebP() {
    try {
      const c = document.createElement("canvas");
      return c.toDataURL("image/webp").startsWith("data:image/webp");
    } catch {
      return false;
    }
  }

  async function fileToCompressedDataUrl(file, maxSide = 900, quality = 0.82) {
    const mime = supportsWebP() ? "image/webp" : "image/jpeg";
    const decoded = await decodeImage(file);

    const w0 = decoded.width;
    const h0 = decoded.height;

    const scale = Math.min(1, maxSide / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * scale));
    const h = Math.max(1, Math.round(h0 * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(decoded, 0, 0, w, h);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Image encode failed."))), mime, quality);
    });

    if (decoded && typeof decoded.close === "function") decoded.close();

    return blobToDataUrl(blob);
  }

  async function decodeImage(file) {
    if ("createImageBitmap" in window) {
      try {
        return await createImageBitmap(file, { imageOrientation: "from-image" });
      } catch {}
      try {
        return await createImageBitmap(file);
      } catch {}
    }
    return htmlImgFromFile(file);
  }

  function htmlImgFromFile(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Failed to decode image.")); };
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

  // ---------- Placeholders ----------
  function placeholderDataUrl(label) {
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
        <text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle"
          font-family="Arial, sans-serif" font-size="120"
          fill="#4cff6a" opacity="0.30" letter-spacing="8">${escXml(safe)}</text>
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

  function escXml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }

  // ---------- Init ----------
  renderAll();
})();
