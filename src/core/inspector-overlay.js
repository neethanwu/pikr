// pikr inspector overlay — injected into target page via CDP
// Communicates back to Node via console.debug('__pikr__', JSON.stringify(data))
(function () {
  if (window.__pikrOverlay) return;
  window.__pikrOverlay = true;

  if (document.documentElement) {
    _initOverlay();
  } else {
    document.addEventListener("DOMContentLoaded", _initOverlay);
  }
})();

function _initOverlay() {
  if (document.getElementById("__pikr-highlight")) return;

  // --- Design tokens ---
  const T = {
    accent: "#ff6b56",
    accentSoft: "rgba(255, 107, 86, 0.07)",
    accentBorder: "rgba(255, 107, 86, 0.45)",
    success: "#a3e635",
    successBg: "rgba(163, 230, 53, 0.1)",
    successGlow: "rgba(163, 230, 53, 0.35)",
    surface: "#1c1917",
    surfaceLight: "rgba(255, 252, 249, 0.92)",
    textDark: "#292524",
    radius: "12px",
    radiusSm: "8px",
    // #4 — optimized font stacks: ui-monospace resolves to SF Mono (Mac) / Cascadia (Win)
    font: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    mono: 'ui-monospace, "SF Mono", "Cascadia Mono", "Fira Code", Menlo, Consolas, monospace',
    ease: "cubic-bezier(0.16, 1, 0.3, 1)",
    shadow: "0 8px 32px rgba(28,25,23,0.14), 0 2px 8px rgba(28,25,23,0.08)",
    shadowSm: "0 2px 12px rgba(28,25,23,0.08), 0 1px 4px rgba(28,25,23,0.04)",
  };

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const dur = (ms) => (reducedMotion ? "0ms" : ms + "ms");
  const ease = reducedMotion ? "linear" : T.ease;
  const isMac = navigator.platform.indexOf("Mac") > -1;

  let inspectMode = false;
  let hoveredElement = null;
  let captureCount = 0;
  let bannerCollapsed = false;
  let collapseTimer = null;

  // --- Keyframes ---
  const style = document.createElement("style");
  style.id = "__pikr-styles";
  style.textContent = `
    @keyframes __pikr-dot-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(255,107,86,0.4); }
      50% { box-shadow: 0 0 0 5px rgba(255,107,86,0); }
    }
    @keyframes __pikr-capture-ring {
      0% { box-shadow: 0 0 0 0 ${T.successGlow}; }
      100% { box-shadow: 0 0 0 8px rgba(163,230,53,0); }
    }
  `;
  document.documentElement.appendChild(style);

  // --- Scale spring (capture pulse only) ---
  function createSpring(v) { return { value: v, target: v, velocity: 0 }; }
  function stepSpring(s, tension, damping, dt) {
    s.velocity = (s.velocity + (s.target - s.value) * tension * dt) * damping;
    s.value += s.velocity * dt;
    return Math.abs(s.target - s.value) > 0.005 || Math.abs(s.velocity) > 0.005;
  }
  const scaleSpring = createSpring(1);
  let scaleAnimating = false;
  let highlightVisible = false;

  function tickScale() {
    const moving = stepSpring(scaleSpring, 160, 0.6, 1 / 60);
    highlight.style.transform = "scale(" + scaleSpring.value.toFixed(4) + ")";
    if (moving) requestAnimationFrame(tickScale);
    else scaleAnimating = false;
  }
  function startScaleSpring() {
    if (!scaleAnimating) { scaleAnimating = true; requestAnimationFrame(tickScale); }
  }

  function positionHighlight(top, left, width, height) {
    highlight.style.top = top + "px";
    highlight.style.left = left + "px";
    highlight.style.width = width + "px";
    highlight.style.height = height + "px";
  }

  // --- Highlight ---
  const highlight = document.createElement("div");
  highlight.id = "__pikr-highlight";
  Object.assign(highlight.style, {
    position: "fixed", pointerEvents: "none", zIndex: "2147483645",
    border: "1.5px solid " + T.accentBorder, backgroundColor: T.accentSoft,
    borderRadius: "3px",
    transition: "opacity " + dur(80) + " ease, border-color " + dur(150) + " ease, background-color " + dur(150) + " ease, box-shadow " + dur(250) + " ease",
    opacity: "0", boxShadow: "none", transformOrigin: "center center",
  });
  document.documentElement.appendChild(highlight);

  // --- Label ---
  const label = document.createElement("div");
  label.id = "__pikr-label";
  Object.assign(label.style, {
    position: "fixed", pointerEvents: "none", zIndex: "2147483646",
    padding: "3px 8px", borderRadius: "6px",
    fontFamily: T.mono, fontSize: "11px", fontWeight: "500", letterSpacing: "0.01em",
    color: "#fff", backgroundColor: T.accent, boxShadow: T.shadowSm,
    opacity: "0", transition: "opacity " + dur(80) + " ease, transform " + dur(80) + " " + ease,
    transform: "translateY(4px)", whiteSpace: "nowrap",
  });
  document.documentElement.appendChild(label);

  // --- Banner ---
  const banner = document.createElement("div");
  banner.id = "__pikr-toggle";
  // #5 — banner position stored for drag
  let bannerX = 0; // offset from center (0 = centered)
  let bannerY = 0; // offset from bottom (0 = 20px from bottom)
  let isDragging = false;
  let dragStartX = 0, dragStartY = 0, dragBannerX = 0, dragBannerY = 0;

  Object.assign(banner.style, {
    position: "fixed", bottom: (20 + bannerY) + "px", left: "50%",
    transform: "translateX(calc(-50% + " + bannerX + "px)) translateY(80px)",
    zIndex: "2147483647", borderRadius: T.radius,
    fontFamily: T.font, fontSize: "13px",
    cursor: "grab", userSelect: "none",
    boxShadow: T.shadow,
    // #3 — smooth transitions for all shape properties
    transition: [
      "transform " + dur(350) + " " + ease,
      "opacity " + dur(250) + " ease",
      "background-color " + dur(200) + " ease",
      "width " + dur(250) + " " + ease,
      "height " + dur(250) + " " + ease,
      "border-radius " + dur(200) + " ease",
      "padding " + dur(200) + " ease",
    ].join(", "),
    opacity: "0", overflow: "hidden",
    backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
  });
  document.documentElement.appendChild(banner);

  function updateBannerPosition() {
    if (isDragging) return;
    banner.style.bottom = (20 + bannerY) + "px";
    banner.style.transform = "translateX(calc(-50% + " + bannerX + "px)) translateY(0)";
  }

  // Entrance
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      banner.style.transform = "translateX(calc(-50% + " + bannerX + "px)) translateY(0)";
      banner.style.opacity = "1";
      renderBanner();
    });
  });

  // #5 — Drag handlers
  function onBannerPointerDown(e) {
    if (e.target.closest("kbd")) return; // don't drag from kbd
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragBannerX = bannerX;
    dragBannerY = bannerY;
    banner.style.cursor = "grabbing";
    banner.style.transition = "background-color " + dur(200) + " ease"; // disable position transitions while dragging
    e.preventDefault();
    document.addEventListener("pointermove", onBannerPointerMove, true);
    document.addEventListener("pointerup", onBannerPointerUp, true);
  }

  function clampBannerPosition() {
    var vh = window.innerHeight;
    var vw = window.innerWidth;
    var rect = banner.getBoundingClientRect();
    var maxX = (vw / 2) - rect.width / 2 - 12;
    var minY = -vh + rect.height + 32; // can't drag above viewport
    var maxY = -12; // can't drag below bottom edge (20px base + this)
    bannerX = Math.max(-maxX, Math.min(maxX, bannerX));
    bannerY = Math.max(minY, Math.min(maxY + 20, bannerY));
  }

  function onBannerPointerMove(e) {
    if (!isDragging) return;
    bannerX = dragBannerX + (e.clientX - dragStartX);
    bannerY = dragBannerY - (e.clientY - dragStartY);
    clampBannerPosition();
    banner.style.bottom = (20 + bannerY) + "px";
    banner.style.transform = "translateX(calc(-50% + " + bannerX + "px)) translateY(0)";
  }

  function onBannerPointerUp(e) {
    isDragging = false;
    banner.style.cursor = "grab";
    banner.style.transition = [
      "transform " + dur(350) + " " + ease,
      "opacity " + dur(250) + " ease",
      "background-color " + dur(200) + " ease",
      "width " + dur(250) + " " + ease,
      "height " + dur(250) + " " + ease,
      "border-radius " + dur(200) + " ease",
      "padding " + dur(200) + " ease",
    ].join(", ");

    // Clamp + snap to nearest edge if dragged far left/right
    clampBannerPosition();
    var vw = window.innerWidth;
    var rect = banner.getBoundingClientRect();
    var centerX = rect.left + rect.width / 2;
    if (centerX < 100) {
      bannerX = -(vw / 2) + rect.width / 2 + 20;
    } else if (centerX > vw - 100) {
      bannerX = (vw / 2) - rect.width / 2 - 20;
    }
    updateBannerPosition();

    document.removeEventListener("pointermove", onBannerPointerMove, true);
    document.removeEventListener("pointerup", onBannerPointerUp, true);

    // Suppress the click that follows pointerup if we actually dragged
    const dx = Math.abs(e.clientX - dragStartX);
    const dy = Math.abs(e.clientY - dragStartY);
    if (dx > 4 || dy > 4) {
      const suppress = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
      banner.addEventListener("click", suppress, { once: true, capture: true });
    }
  }

  banner.addEventListener("pointerdown", onBannerPointerDown);

  // --- Toast ---
  const toast = document.createElement("div");
  toast.id = "__pikr-toast";
  Object.assign(toast.style, {
    position: "fixed", top: "20px", left: "50%",
    transform: "translateX(-50%) translateY(-16px) scale(0.96)",
    zIndex: "2147483647", padding: "10px 18px", borderRadius: T.radiusSm,
    fontFamily: T.font, fontSize: "13px", fontWeight: "500",
    color: "#4d7c0f", backgroundColor: T.surfaceLight,
    border: "1px solid rgba(163, 230, 53, 0.25)",
    boxShadow: T.shadow, opacity: "0",
    transition: "all " + dur(200) + " " + ease,
    pointerEvents: "none",
    backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
    display: "flex", alignItems: "center", gap: "8px",
  });
  document.documentElement.appendChild(toast);

  let toastTimer = null;
  function showToast(tagName) {
    if (toastTimer) clearTimeout(toastTimer);
    toast.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="flex-shrink:0">' +
      '<circle cx="8" cy="8" r="7" stroke="#65a30d" stroke-width="1.5"/>' +
      '<path d="M5 8l2 2 4-4" stroke="#65a30d" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      '<span style="color:' + T.textDark + ';font-weight:600">Copied</span>' +
      '<span style="color:rgba(41,37,36,0.35);font-family:' + T.mono + ';font-size:11px">&lt;' + tagName + '&gt;</span>';
    toast.style.opacity = "1";
    toast.style.transform = "translateX(-50%) translateY(0) scale(1)";
    toastTimer = setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(-50%) translateY(-16px) scale(0.96)";
    }, 1400);
  }

  // --- Banner rendering ---
  // #6 — clean hotkey rendering: separate modifier and key into distinct badges
  function kbd(keys, dark) {
    const bg = dark ? "rgba(250,250,249,0.1)" : "rgba(28,25,23,0.06)";
    const border = dark ? "rgba(250,250,249,0.12)" : "rgba(28,25,23,0.1)";
    const color = dark ? "rgba(250,250,249,0.55)" : "rgba(41,37,36,0.5)";
    const s = "font-family:" + T.mono + ";font-size:11px;padding:1px 5px;border-radius:3px;" +
      "line-height:1.4;display:inline-block;background:" + bg + ";border:1px solid " + border + ";color:" + color;
    return keys.map(function (k) { return '<kbd style="' + s + '">' + k + '</kbd>'; }).join('<span style="opacity:0.3;margin:0 1px">+</span>');
  }
  function sep() { return '<span style="opacity:0.2;margin:0 4px">\u00b7</span>'; }

  // #3 — smooth collapse: fade content, THEN resize shape
  function collapseBanner() {
    if (bannerCollapsed) return;
    bannerCollapsed = true;
    // First: fade out the inner content
    const inner = banner.firstElementChild;
    if (inner) inner.style.opacity = "0";
    // Then: after fade, swap to dot and resize
    setTimeout(function () {
      banner.innerHTML = '<div style="width:10px;height:10px;border-radius:50%;background:' + T.accent + ';' +
        (reducedMotion ? '' : 'animation:__pikr-dot-pulse 2s ease infinite') + '"></div>';
      banner.style.borderRadius = "50%";
      banner.style.padding = "8px";
    }, reducedMotion ? 0 : 120);
  }

  // #3 — smooth expand: resize shape first, THEN fade in content
  function expandBanner() {
    if (!bannerCollapsed) return;
    bannerCollapsed = false;
    banner.style.borderRadius = T.radius;
    banner.style.padding = "0";
    // After shape transition, render content and fade in
    setTimeout(function () {
      renderBanner();
      const inner = banner.firstElementChild;
      if (inner) {
        inner.style.opacity = "0";
        inner.style.transition = "opacity " + dur(150) + " ease";
        requestAnimationFrame(function () { if (inner) inner.style.opacity = "1"; });
      }
    }, reducedMotion ? 0 : 150);
  }

  function renderBanner() {
    if (bannerCollapsed) return;

    // Wordmark: system sans-serif bold (not mono) — more recognizable
    var wm = '<span style="font-size:14px;font-weight:700;letter-spacing:-0.03em;';
    // Hotkeys: text labels, not Unicode symbols (⇧⌘ render poorly in mono fonts)
    var toggleKeys = isMac ? ["Cmd", "Shift", "X"] : ["Ctrl", "Shift", "X"];

    if (inspectMode) {
      banner.style.backgroundColor = "rgba(28, 25, 23, 0.9)";
      banner.style.border = "1px solid rgba(255, 255, 255, 0.1)";
      banner.innerHTML =
        '<div style="display:flex;align-items:center;gap:6px;padding:10px 16px;font-size:13px;color:rgba(168,162,158,0.5)">' +
        '<div style="width:8px;height:8px;border-radius:50%;background:' + T.accent + ';flex-shrink:0;' +
        (reducedMotion ? '' : 'animation:__pikr-dot-pulse 2s ease infinite') + '"></div>' +
        wm + 'color:' + T.accent + '">pikr</span>' +
        sep() +
        '<span style="color:rgba(250,250,249,0.65)">Click to pick</span>' +
        sep() +
        kbd(toggleKeys, true) +
        '<span style="font-size:12px;margin-left:3px;color:rgba(250,250,249,0.35)">browse</span>' +
        sep() +
        kbd(["Esc"], true) +
        '<span style="font-size:12px;margin-left:3px;color:rgba(250,250,249,0.35)">close</span>' +
        '</div>';
    } else {
      banner.style.backgroundColor = "rgba(255, 252, 249, 0.92)";
      banner.style.border = "1px solid rgba(0, 0, 0, 0.08)";
      banner.innerHTML =
        '<div style="display:flex;align-items:center;gap:6px;padding:10px 16px;font-size:13px;color:rgba(120,113,108,0.5)">' +
        '<div style="width:8px;height:8px;border-radius:50%;background:#d6d3d1;flex-shrink:0"></div>' +
        wm + 'color:#292524">pikr</span>' +
        sep() +
        '<span style="color:rgba(41,37,36,0.4)">Browse mode</span>' +
        sep() +
        kbd(toggleKeys, false) +
        '<span style="font-size:12px;margin-left:3px;color:rgba(41,37,36,0.3)">inspect</span>' +
        sep() +
        kbd(["Esc"], false) +
        '<span style="font-size:12px;margin-left:3px;color:rgba(41,37,36,0.3)">close</span>' +
        '</div>';
    }
  }

  // --- Mode toggle ---
  function setInspectMode(enabled) {
    inspectMode = enabled;
    if (!bannerCollapsed) renderBanner();
    if (enabled) {
      document.documentElement.style.cursor = "crosshair";
    } else {
      document.documentElement.style.cursor = "";
      highlightVisible = false;
      highlight.style.opacity = "0";
      label.style.opacity = "0";
      label.style.transform = "translateY(4px)";
      hoveredElement = null;
      expandBanner();
    }
  }

  // --- Element data extraction ---
  function getSelector(el) {
    if (el.id) return "#" + el.id;
    const parts = [];
    let cur = el;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      let part = cur.tagName.toLowerCase();
      if (cur.id) { parts.unshift("#" + cur.id); break; }
      if (cur.className && typeof cur.className === "string") {
        const cls = cur.className.trim().split(/\s+/).filter(function (c) { return c && !c.startsWith("__pikr"); }).slice(0, 3);
        if (cls.length) part += "." + cls.join(".");
      }
      const parent = cur.parentElement;
      if (parent) {
        const sibs = Array.from(parent.children).filter(function (s) { return s.tagName === cur.tagName; });
        if (sibs.length > 1) part += ":nth-of-type(" + (sibs.indexOf(cur) + 1) + ")";
      }
      parts.unshift(part);
      cur = cur.parentElement;
    }
    return parts.join(" > ");
  }

  function getAncestry(el) {
    const parts = [];
    let cur = el.parentElement, d = 0;
    while (cur && cur !== document.body && d < 3) {
      let part = cur.tagName.toLowerCase();
      if (cur.id) part += "#" + cur.id;
      else if (cur.className && typeof cur.className === "string") {
        const cls = cur.className.trim().split(/\s+/).filter(function (c) { return c && !c.startsWith("__pikr"); }).slice(0, 2);
        if (cls.length) part += "." + cls.join(".");
      }
      parts.unshift(part);
      cur = cur.parentElement; d++;
    }
    parts.push("[this]");
    return parts.join(" > ");
  }

  // Convert rgb(r, g, b) to #hex for conciseness
  function rgbToHex(rgb) {
    var m = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    if (!m) return rgb;
    return "#" + ((1 << 24) + (+m[1] << 16) + (+m[2] << 8) + +m[3]).toString(16).slice(1);
  }

  // Round pixel values: 277.336px → 277px
  function cleanValue(v) {
    return v.replace(/(\d+\.\d+)px/g, function (_, n) { return Math.round(+n) + "px"; });
  }

  function getKeyStyles(el) {
    var computed = window.getComputedStyle(el);
    var styles = {};
    var body = window.getComputedStyle(document.body);
    var pairs = [
      // Only authored/meaningful styles — skip defaults and layout-computed values
      ["background-color", function (v) { return v !== "rgba(0, 0, 0, 0)" && v !== "transparent"; }],
      ["color", function (v) { return v !== body.color; }], // skip if same as body
      ["font-size", function (v) { return v !== body.fontSize && v !== "16px"; }], // skip default
      ["font-weight", function (v) { return v !== "400" && v !== "normal"; }],
      ["padding", function (v) { return v !== "0px"; }],
      ["border-radius", function (v) { return v !== "0px"; }],
      ["display", function (v) { return v !== "block" && v !== "inline"; }],
      ["position", function (v) { return v !== "static"; }],
      ["gap", function (v) { return v !== "normal" && v !== "0px"; }],
      ["opacity", function (v) { return v !== "1"; }],
      // Skip: margin (usually layout), width/height (computed, not authored)
    ];
    for (var i = 0; i < pairs.length; i++) {
      var v = computed.getPropertyValue(pairs[i][0]);
      if (v && pairs[i][1](v)) {
        // Clean up values
        v = cleanValue(v);
        if (pairs[i][0] === "background-color" || pairs[i][0] === "color") v = rgbToHex(v);
        styles[pairs[i][0]] = v;
      }
    }
    return styles;
  }

  // --- Capture ---
  function captureElement(el) {
    var html = el.outerHTML;
    var maxLen = 2000;
    var data = {
      type: "selection",
      selector: getSelector(el),
      html: html.length > maxLen ? html.slice(0, maxLen) + "..." : html,
      ancestry: getAncestry(el),
      styles: getKeyStyles(el),
      tagName: el.tagName.toLowerCase(),
      textContent: (el.textContent || "").trim().slice(0, 200),
    };
    captureCount++;
    console.debug("__pikr__", JSON.stringify(data));
    showToast(data.tagName);

    highlight.style.borderColor = T.success;
    highlight.style.backgroundColor = T.successBg;
    if (!reducedMotion) {
      scaleSpring.value = 1; scaleSpring.target = 0.97; scaleSpring.velocity = 0;
      startScaleSpring();
      setTimeout(function () { scaleSpring.target = 1; scaleSpring.velocity = 3; startScaleSpring(); }, 60);
      highlight.style.animation = "__pikr-capture-ring 0.35s ease forwards";
    }
    setTimeout(function () {
      highlight.style.borderColor = T.accentBorder;
      highlight.style.backgroundColor = T.accentSoft;
      highlight.style.animation = "none";
      highlight.style.boxShadow = "none";
    }, 350);
  }

  // --- Helpers ---
  function isPikrElement(el) {
    var cur = el;
    while (cur) {
      if (cur.id && cur.id.startsWith("__pikr")) return true;
      cur = cur.parentElement;
    }
    return false;
  }

  function getElementUnderCursor(e) {
    var prev = highlight.style.display;
    highlight.style.display = "none";
    var el = document.elementFromPoint(e.clientX, e.clientY);
    highlight.style.display = prev;
    return el;
  }

  // --- Events ---
  function onMouseMove(e) {
    if (!inspectMode || isDragging) return;
    var el = getElementUnderCursor(e);
    if (!el || isPikrElement(el)) {
      if (highlightVisible) {
        highlightVisible = false;
        highlight.style.opacity = "0";
        label.style.opacity = "0";
        label.style.transform = "translateY(4px)";
        expandBanner();
      }
      hoveredElement = null;
      return;
    }

    collapseBanner();
    hoveredElement = el;
    var rect = el.getBoundingClientRect();
    var w = Math.round(rect.width);
    var h = Math.round(rect.height);

    positionHighlight(rect.top, rect.left, rect.width, rect.height);
    highlight.style.opacity = "1";
    highlightVisible = true;

    var tag = el.tagName.toLowerCase();
    var id = el.id ? "#" + el.id : "";
    var cls = (!id && el.className && typeof el.className === "string")
      ? "." + el.className.trim().split(/\s+/).filter(function (c) { return !c.startsWith("__pikr"); }).slice(0, 2).join(".") : "";
    label.innerHTML =
      '<span style="font-weight:600">' + tag + id + cls + '</span>' +
      '<span style="opacity:0.5;font-weight:400;margin-left:6px;font-feature-settings:\'tnum\'">' + w + "\u00d7" + h + '</span>';

    var labelH = 24, gap = 6;
    var labelTop = rect.top - labelH - gap;
    if (labelTop < 4) labelTop = rect.bottom + gap;
    Object.assign(label.style, { opacity: "1", transform: "translateY(0)", top: labelTop + "px", left: rect.left + "px" });
  }

  function onClick(e) {
    if (!inspectMode) return;
    if (isPikrElement(e.target)) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    var el = getElementUnderCursor(e);
    if (!el || isPikrElement(el)) return;
    captureElement(el);
  }

  function onKeyDown(e) {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "x") {
      e.preventDefault(); setInspectMode(!inspectMode); return;
    }
    if (e.key === "Escape") { e.preventDefault(); animateExit(); }
  }

  // --- Exit ---
  function animateExit() {
    document.documentElement.style.cursor = "";
    banner.style.transform = "translateX(calc(-50% + " + bannerX + "px)) translateY(80px)";
    banner.style.opacity = "0";
    highlight.style.opacity = "0"; highlightVisible = false;
    label.style.opacity = "0"; toast.style.opacity = "0";
    setTimeout(function () {
      console.debug("__pikr__", JSON.stringify({ type: "close" }));
      cleanup();
    }, reducedMotion ? 0 : 250);
  }

  function cleanup() {
    style.remove(); highlight.remove(); label.remove(); banner.remove(); toast.remove();
    document.documentElement.style.cursor = "";
    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("scroll", onScroll, true);
    document.removeEventListener("pointermove", onBannerPointerMove, true);
    document.removeEventListener("pointerup", onBannerPointerUp, true);
    window.__pikrOverlay = false;
  }

  // Re-position highlight on scroll (element moves but mouse doesn't)
  function onScroll() {
    if (!inspectMode || !highlightVisible || !hoveredElement) return;
    var rect = hoveredElement.getBoundingClientRect();
    positionHighlight(rect.top, rect.left, rect.width, rect.height);
    var labelH = 24, gap = 6;
    var labelTop = rect.top - labelH - gap;
    if (labelTop < 4) labelTop = rect.bottom + gap;
    label.style.top = labelTop + "px";
    label.style.left = rect.left + "px";
  }

  banner.addEventListener("click", function (e) { e.stopPropagation(); setInspectMode(!inspectMode); });
  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("scroll", onScroll, true);
}
