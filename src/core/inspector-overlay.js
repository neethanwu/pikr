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
    shadow: "0 12px 40px rgba(28,25,23,0.2), 0 4px 12px rgba(28,25,23,0.1)",
    shadowSm: "0 2px 12px rgba(28,25,23,0.08), 0 1px 4px rgba(28,25,23,0.04)",
  };

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const dur = (ms) => (reducedMotion ? "0ms" : ms + "ms");
  const ease = reducedMotion ? "linear" : T.ease;
  const isMac = navigator.platform.indexOf("Mac") > -1;

  let inspectMode = false;
  let hoveredElement = null;
  let captureCount = 0;
  let hintShown = false;
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
  // --- Banner positioning: absolute top/left for free drag ---
  let posX = -1, posY = -1; // -1 = not yet positioned (use default)
  let isDragging = false;
  let dragStartX = 0, dragStartY = 0, dragPosX = 0, dragPosY = 0;
  var fullTransition = [
    "opacity " + dur(250) + " ease",
    "background-color " + dur(200) + " ease",
    "border-color " + dur(200) + " ease",
    "border-radius " + dur(200) + " ease",
  ].join(", ");

  Object.assign(banner.style, {
    position: "fixed",
    zIndex: "2147483647", borderRadius: "20px",
    fontFamily: T.font, fontSize: "13px",
    cursor: "grab", userSelect: "none",
    boxShadow: T.shadow,
    transition: fullTransition,
    opacity: "0",
    backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
  });
  document.documentElement.appendChild(banner);

  function setDefaultPosition() {
    // Restore position from sessionStorage (persists across navigation, not refresh)
    try {
      var saved = sessionStorage.getItem("__pikr_pos");
      if (saved) {
        var p = JSON.parse(saved);
        posX = p.x; posY = p.y; snappedEdge = p.edge || "bottom";
        clampPosition();
        applyPosition();
        return;
      }
    } catch {}
    // Default: center bottom
    var rect = banner.getBoundingClientRect();
    posX = (window.innerWidth - rect.width) / 2;
    posY = window.innerHeight - rect.height - 8;
    snappedEdge = "bottom";
    applyPosition();
  }

  function savePosition() {
    try {
      sessionStorage.setItem("__pikr_pos", JSON.stringify({ x: posX, y: posY, edge: snappedEdge }));
    } catch {}
  }

  function applyPosition(animate) {
    if (animate && !reducedMotion) {
      banner.style.transition = fullTransition + ", left 0.25s " + ease + ", top 0.25s " + ease;
    }
    banner.style.left = posX + "px";
    banner.style.top = posY + "px";
    if (animate && !reducedMotion) {
      // Remove position transition after it completes
      setTimeout(function () { banner.style.transition = fullTransition; }, 280);
    }
  }

  function clampPosition() {
    var w = banner.offsetWidth || 26;
    var h = banner.offsetHeight || 26;
    var vw = window.innerWidth, vh = window.innerHeight;
    var m = 8;
    posX = Math.max(m, Math.min(vw - w - m, posX));
    posY = Math.max(m, Math.min(vh - h - m, posY));
  }

  // Track which edge we're snapped to
  var snappedEdge = "bottom"; // "left" | "right" | "top" | "bottom"

  // Always snap to nearest edge
  function snapToEdge(animate) {
    var w = banner.offsetWidth || 26;
    var h = banner.offsetHeight || 26;
    var vw = window.innerWidth, vh = window.innerHeight;
    var m = 8;
    var cx = posX + w / 2, cy = posY + h / 2;
    var distL = cx, distR = vw - cx;
    var distT = cy, distB = vh - cy;
    var min = Math.min(distL, distR, distT, distB);
    if (min === distL) { posX = m; snappedEdge = "left"; }
    else if (min === distR) { posX = vw - w - m; snappedEdge = "right"; }
    else if (min === distT) { posY = m; snappedEdge = "top"; }
    else { posY = vh - h - m; snappedEdge = "bottom"; }
    applyPosition(animate);
    savePosition();
  }



  // Entrance
  requestAnimationFrame(function () {
    renderBanner();
    requestAnimationFrame(function () {
      setDefaultPosition();
      banner.style.opacity = "1";
    });
  });

  // --- Drag ---
  function onBannerPointerDown(e) {
    // Don't drag from the icon — that's the click-to-toggle target
    if (e.target.closest("svg")) return;
    isDragging = true;
    dragStartX = e.clientX; dragStartY = e.clientY;
    dragPosX = posX; dragPosY = posY;
    banner.style.cursor = "grabbing";
    banner.style.transition = fullTransition; // no position transition while dragging
    e.preventDefault();
    document.addEventListener("pointermove", onBannerPointerMove, true);
    document.addEventListener("pointerup", onBannerPointerUp, true);
  }

  function onBannerPointerMove(e) {
    if (!isDragging) return;
    posX = dragPosX + (e.clientX - dragStartX);
    posY = dragPosY + (e.clientY - dragStartY);
    clampPosition();
    applyPosition(false);
  }

  function onBannerPointerUp(e) {
    isDragging = false;
    banner.style.cursor = "grab";

    // Always snap to nearest edge with animation
    clampPosition();
    snapToEdge(true);

    document.removeEventListener("pointermove", onBannerPointerMove, true);
    document.removeEventListener("pointerup", onBannerPointerUp, true);

    // Suppress click if we actually dragged
    var dx = Math.abs(e.clientX - dragStartX), dy = Math.abs(e.clientY - dragStartY);
    if (dx > 4 || dy > 4) {
      var suppress = function (ev) { ev.stopPropagation(); ev.preventDefault(); };
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
    zIndex: "2147483647", padding: "10px 18px", borderRadius: "20px",
    fontFamily: T.font, fontSize: "13px", fontWeight: "500",
    color: "rgba(250,250,249,0.7)", backgroundColor: "rgba(28, 25, 23, 0.9)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
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
      '<circle cx="8" cy="8" r="7" stroke="' + T.success + '" stroke-width="1.5"/>' +
      '<path d="M5 8l2 2 4-4" stroke="' + T.success + '" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      '<span style="color:rgba(250,250,249,0.9);font-weight:600">Copied</span>' +
      '<span style="color:rgba(250,250,249,0.35);font-family:' + T.mono + ';font-size:11px">&lt;' + tagName + '&gt;</span>';
    toast.style.opacity = "1";
    toast.style.transform = "translateX(-50%) translateY(0) scale(1)";
    toastTimer = setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(-50%) translateY(-16px) scale(0.96)";
    }, 1400);
  }

  // --- Onboarding hints (two phases) ---
  var hint = document.createElement("div");
  hint.id = "__pikr-hint";
  function kbdHint(text) {
    return '<kbd style="font-family:' + T.mono + ';font-size:11px;padding:2px 6px;border-radius:4px;line-height:1.3;display:inline-block;background:rgba(250,250,249,0.1);border:1px solid rgba(250,250,249,0.12);color:rgba(250,250,249,0.6)">' + text + '</kbd>';
  }
  var hintBaseStyle = {
    position: "fixed",
    top: "20px",
    left: "50%",
    transform: "translateX(-50%) translateY(-16px) scale(0.96)",
    zIndex: "2147483647",
    padding: "10px 18px",
    borderRadius: "20px",
    fontFamily: T.font,
    fontSize: "13px",
    color: "rgba(250,250,249,0.7)",
    backgroundColor: "rgba(28, 25, 23, 0.9)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    boxShadow: T.shadow,
    opacity: "0",
    transition: "all " + dur(250) + " " + ease,
    pointerEvents: "none",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    whiteSpace: "nowrap",
  };
  Object.assign(hint.style, hintBaseStyle);
  document.documentElement.appendChild(hint);

  var hintTimer = null;

  function setHintContent(html) {
    hint.innerHTML = html;
  }

  function showHintWithContent(html, duration) {
    if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
    setHintContent(html);
    hint.style.opacity = "1";
    hint.style.transform = "translateX(-50%) translateY(0) scale(1)";
    if (duration) {
      hintTimer = setTimeout(dismissHint, duration);
    }
  }

  function dismissHint() {
    if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
    hint.style.opacity = "0";
    hint.style.transform = "translateX(-50%) translateY(-16px) scale(0.96)";
  }

  // Phase 1: Launch hint — "Click the pikr pill to start inspecting"
  var launchHintShown = false;
  try { launchHintShown = sessionStorage.getItem("__pikr_hint_done") === "1"; } catch {}
  function showLaunchHint() {
    if (launchHintShown || hintShown) return;
    launchHintShown = true;
    try { sessionStorage.setItem("__pikr_hint_done", "1"); } catch {}
    showHintWithContent(
      'Click the ' +
      '<span style="font-weight:700;color:rgba(250,250,249,0.9)">pikr</span>' +
      ' pill to start inspecting',
      5000
    );
  }

  // Phase 2: Inspect hint — "Click to capture · Esc to exit"
  try { if (sessionStorage.getItem("__pikr_inspect_done") === "1") hintShown = true; } catch {}
  function showInspectHint() {
    if (hintShown) return;
    hintShown = true;
    try { sessionStorage.setItem("__pikr_inspect_done", "1"); } catch {}
    showHintWithContent(
      '<span style="color:rgba(250,250,249,0.9)">Click</span> elements to select' +
      '<span style="opacity:0.25;margin:0 2px">\u00b7</span>' +
      kbdHint("Enter") +
      '<span>to send</span>' +
      '<span style="opacity:0.25;margin:0 2px">\u00b7</span>' +
      kbdHint("Esc") +
      '<span>to exit</span>',
      4000
    );
  }

  // Show launch hint after banner entrance animation
  setTimeout(showLaunchHint, reducedMotion ? 100 : 600);

  // --- Banner rendering (compact pill with Lucide square-mouse-pointer icon) ---
  function pickIcon(color) {
    return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;display:block;cursor:pointer">' +
      '<path d="M12.034 12.681a.498.498 0 0 1 .647-.647l9 3.5a.5.5 0 0 1-.033.943l-3.444 1.068a1 1 0 0 0-.66.66l-1.067 3.443a.5.5 0 0 1-.943.033z"/>' +
      '<path d="M21 11V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6"/></svg>';
  }

  function renderBanner() {

    // Dot, text, and icon all share the same 15px height lane for optical centering
    var dot = 'width:7px;height:7px;border-radius:50%;flex-shrink:0';
    var wm = 'font-size:13px;font-weight:700;letter-spacing:-0.03em;line-height:15px';
    var row = 'display:flex;align-items:center;gap:8px;padding:8px 14px';

    // Send icon (Lucide arrow-up-from-line)
    var sendIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;display:block;cursor:pointer">' +
      '<path d="m18 9-6-6-6 6"/><path d="M12 3v14"/><path d="M5 21h14"/></svg>';

    var selCount = selectedElements.length;

    if (inspectMode) {
      banner.style.backgroundColor = "rgba(28, 25, 23, 0.9)";
      banner.style.border = "1px solid rgba(255, 255, 255, 0.1)";
      banner.innerHTML =
        '<div style="' + row + '">' +
        '<div style="' + dot + ';background:' + T.accent + ';' +
        (reducedMotion ? '' : 'animation:__pikr-dot-pulse 2s ease infinite') + '"></div>' +
        '<span style="' + wm + ';color:rgba(250,250,249,0.85)">pikr</span>' +
        (selCount > 0
          ? '<span id="__pikr-send" style="display:flex;align-items:center;gap:4px;cursor:pointer;color:' + T.success + '">' +
            sendIcon +
            '<span style="font-size:11px;font-weight:600;font-feature-settings:\'tnum\'">' + selCount + '</span></span>'
          : pickIcon("rgba(250,250,249,0.6)")) +
        '</div>';
      // Attach send click handler
      var sendBtn = document.getElementById("__pikr-send");
      if (sendBtn) {
        sendBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          sendBatch();
        });
      }
    } else {
      banner.style.backgroundColor = "rgba(255, 252, 249, 0.92)";
      banner.style.border = "1px solid rgba(0, 0, 0, 0.08)";
      banner.innerHTML =
        '<div style="' + row + '">' +
        '<div style="' + dot + ';background:#d6d3d1"></div>' +
        '<span style="' + wm + ';color:#292524">pikr</span>' +
        pickIcon("rgba(41,37,36,0.5)") +
        '</div>';
    }
  }

  // --- Mode toggle ---
  function setInspectMode(enabled) {
    inspectMode = enabled;
    renderBanner();
    if (enabled) {
      document.documentElement.style.cursor = "crosshair";
      dismissHint(); // dismiss launch hint
      showInspectHint();
    } else {
      dismissHint();
      dismissCommentPopover();
      document.documentElement.style.cursor = "";
      highlightVisible = false;
      highlight.style.opacity = "0";
      label.style.opacity = "0";
      label.style.transform = "translateY(4px)";
      hoveredElement = null;
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
    dismissHint();
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

  // --- Multi-select ---
  var selectedElements = []; // { el, data, comment, badge }

  function createBadge(index, el) {
    var badge = document.createElement("div");
    badge.className = "__pikr-badge";
    Object.assign(badge.style, {
      position: "fixed",
      zIndex: "2147483646",
      width: "18px", height: "18px",
      borderRadius: "50%",
      background: T.accent,
      color: "#fff",
      fontFamily: T.mono,
      fontSize: "10px",
      fontWeight: "700",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      boxShadow: T.shadowSm,
      transition: "background " + dur(150) + " ease, transform " + dur(100) + " ease",
      pointerEvents: "auto",
    });
    badge.textContent = String(index + 1);
    positionBadge(badge, el);
    document.documentElement.appendChild(badge);

    // Click badge: if comment popover not open, toggle deselect
    badge.addEventListener("click", function (e) {
      e.stopPropagation();
      e.preventDefault();
      var idx = selectedElements.findIndex(function (s) { return s.badge === badge; });
      if (idx === -1) return;
      // If popover is open for this badge, don't deselect
      if (commentPopover.style.opacity === "1" && commentTarget === idx) {
        return;
      }
      // Show comment popover on first click, deselect on second
      if (!selectedElements[idx].popoverShown) {
        selectedElements[idx].popoverShown = true;
        showCommentPopover(idx);
      } else {
        deselectElement(idx);
      }
    });

    return badge;
  }

  function positionBadge(badge, el) {
    var rect = el.getBoundingClientRect();
    badge.style.top = (rect.top - 6) + "px";
    badge.style.left = (rect.right - 12) + "px";
  }

  function repositionAllBadges() {
    for (var i = 0; i < selectedElements.length; i++) {
      var s = selectedElements[i];
      if (s.el && s.badge) {
        positionBadge(s.badge, s.el);
      }
    }
  }

  function renumberBadges() {
    for (var i = 0; i < selectedElements.length; i++) {
      selectedElements[i].badge.textContent = String(i + 1);
    }
  }

  function addSelection(el) {
    // Check if already selected
    for (var i = 0; i < selectedElements.length; i++) {
      if (selectedElements[i].el === el) {
        deselectElement(i);
        return;
      }
    }

    var html = el.outerHTML;
    var maxLen = 2000;
    var data = {
      selector: getSelector(el),
      html: html.length > maxLen ? html.slice(0, maxLen) + "..." : html,
      ancestry: getAncestry(el),
      styles: getKeyStyles(el),
      tagName: el.tagName.toLowerCase(),
      textContent: (el.textContent || "").trim().slice(0, 200),
    };

    var badge = createBadge(selectedElements.length, el);
    selectedElements.push({ el: el, data: data, comment: "", badge: badge, popoverShown: false });
    renderBanner();
    showToast("+" + data.tagName);

    // Pulse highlight
    highlight.style.borderColor = T.success;
    highlight.style.backgroundColor = T.successBg;
    if (!reducedMotion) {
      scaleSpring.value = 1; scaleSpring.target = 0.97; scaleSpring.velocity = 0;
      startScaleSpring();
      setTimeout(function () { scaleSpring.target = 1; scaleSpring.velocity = 3; startScaleSpring(); }, 60);
    }
    setTimeout(function () {
      highlight.style.borderColor = T.accentBorder;
      highlight.style.backgroundColor = T.accentSoft;
    }, 350);
  }

  function deselectElement(index) {
    var entry = selectedElements[index];
    if (entry.badge) entry.badge.remove();
    selectedElements.splice(index, 1);
    renumberBadges();
    renderBanner();
    dismissCommentPopover();
  }

  function clearAllSelections() {
    for (var i = 0; i < selectedElements.length; i++) {
      if (selectedElements[i].badge) selectedElements[i].badge.remove();
    }
    selectedElements = [];
    dismissCommentPopover();
    renderBanner();
  }

  function sendBatch() {
    if (selectedElements.length === 0) return;
    var batch = [];
    for (var i = 0; i < selectedElements.length; i++) {
      var s = selectedElements[i];
      batch.push({
        index: i + 1,
        selector: s.data.selector,
        html: s.data.html,
        ancestry: s.data.ancestry,
        styles: s.data.styles,
        tagName: s.data.tagName,
        textContent: s.data.textContent,
        comment: s.comment || null,
      });
    }
    var count = batch.length;
    console.debug("__pikr__", JSON.stringify({ type: "batch", selections: batch }));
    captureCount += count;
    clearAllSelections();
    showToast(count + " elements");
    dismissHint();
  }

  // --- Comment popover ---
  var commentPopover = document.createElement("div");
  commentPopover.id = "__pikr-comment";
  Object.assign(commentPopover.style, {
    position: "fixed",
    zIndex: "2147483647",
    padding: "8px 12px",
    borderRadius: "20px",
    fontFamily: T.font,
    fontSize: "13px",
    backgroundColor: "rgba(28, 25, 23, 0.9)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    boxShadow: T.shadow,
    opacity: "0",
    transition: "all " + dur(150) + " " + ease,
    pointerEvents: "none",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    display: "flex",
    alignItems: "center",
    gap: "6px",
  });
  var commentInput = document.createElement("input");
  Object.assign(commentInput.style, {
    background: "transparent",
    border: "none",
    outline: "none",
    color: "rgba(250,250,249,0.9)",
    fontFamily: T.font,
    fontSize: "13px",
    width: "180px",
    padding: "0",
  });
  commentInput.placeholder = "Add a comment...";
  commentPopover.appendChild(commentInput);
  document.documentElement.appendChild(commentPopover);

  var commentTarget = -1;

  function showCommentPopover(index) {
    commentTarget = index;
    var entry = selectedElements[index];
    if (!entry) return;
    var rect = entry.badge.getBoundingClientRect();
    commentPopover.style.top = (rect.bottom + 8) + "px";
    commentPopover.style.left = rect.left + "px";
    // Clamp to viewport
    var vw = window.innerWidth;
    var popW = 220;
    if (rect.left + popW > vw - 12) {
      commentPopover.style.left = (vw - popW - 12) + "px";
    }
    commentInput.value = entry.comment || "";
    commentPopover.style.opacity = "1";
    commentPopover.style.pointerEvents = "auto";
    setTimeout(function () { commentInput.focus(); }, 50);
  }

  function dismissCommentPopover() {
    if (commentTarget >= 0 && commentTarget < selectedElements.length) {
      var val = commentInput.value.trim();
      selectedElements[commentTarget].comment = val;
      // Badge turns lime if commented
      if (val && selectedElements[commentTarget].badge) {
        selectedElements[commentTarget].badge.style.background = T.success;
      } else if (selectedElements[commentTarget].badge) {
        selectedElements[commentTarget].badge.style.background = T.accent;
      }
    }
    commentTarget = -1;
    commentPopover.style.opacity = "0";
    commentPopover.style.pointerEvents = "none";
    commentInput.blur();
  }

  commentInput.addEventListener("keydown", function (e) {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      dismissCommentPopover();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      commentInput.value = ""; // discard
      dismissCommentPopover();
    }
  });

  // Clicking outside popover dismisses it
  commentPopover.addEventListener("click", function (e) { e.stopPropagation(); });

  // --- Helpers ---
  function isPikrElement(el) {
    var cur = el;
    while (cur) {
      if (cur.id && cur.id.startsWith("__pikr")) return true;
      if (cur.className && typeof cur.className === "string" && cur.className.indexOf("__pikr") !== -1) return true;
      cur = cur.parentElement;
    }
    return false;
  }

  function getElementUnderCursor(e) {
    // Hide pikr elements so elementFromPoint pierces through
    var prev = highlight.style.display;
    highlight.style.display = "none";
    // Also hide badges temporarily
    var badgeDisplays = [];
    for (var i = 0; i < selectedElements.length; i++) {
      var b = selectedElements[i].badge;
      if (b) { badgeDisplays.push(b.style.display); b.style.display = "none"; }
    }
    var el = document.elementFromPoint(e.clientX, e.clientY);
    highlight.style.display = prev;
    for (var j = 0; j < selectedElements.length; j++) {
      var b2 = selectedElements[j].badge;
      if (b2 && badgeDisplays[j] !== undefined) b2.style.display = badgeDisplays[j];
    }
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
      }
      hoveredElement = null;
      return;
    }

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

    // Dismiss comment popover if open
    if (commentPopover.style.opacity === "1") {
      dismissCommentPopover();
      return;
    }

    var el = getElementUnderCursor(e);
    if (!el || isPikrElement(el)) return;
    addSelection(el);
    dismissHint();
  }

  function onKeyDown(e) {
    // Don't intercept keys when comment input is focused
    if (document.activeElement === commentInput) return;

    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "x") {
      e.preventDefault(); setInspectMode(!inspectMode); return;
    }
    // Enter sends batch
    if (e.key === "Enter" && inspectMode && selectedElements.length > 0) {
      e.preventDefault(); sendBatch(); return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      if (inspectMode) {
        clearAllSelections();
        setInspectMode(false);
      }
    }
  }

  // --- Exit ---
  function animateExit() {
    document.documentElement.style.cursor = "";
    banner.style.opacity = "0";
    highlight.style.opacity = "0"; highlightVisible = false;
    label.style.opacity = "0"; toast.style.opacity = "0";
    setTimeout(function () {
      console.debug("__pikr__", JSON.stringify({ type: "close" }));
      cleanup();
    }, reducedMotion ? 0 : 250);
  }

  function cleanup() {
    style.remove(); highlight.remove(); label.remove(); banner.remove(); toast.remove(); hint.remove(); commentPopover.remove();
    clearAllSelections();
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
    if (!inspectMode) return;
    if (highlightVisible && hoveredElement) {
      var rect = hoveredElement.getBoundingClientRect();
      positionHighlight(rect.top, rect.left, rect.width, rect.height);
      var labelH = 24, gap = 6;
      var labelTop = rect.top - labelH - gap;
      if (labelTop < 4) labelTop = rect.bottom + gap;
      label.style.top = labelTop + "px";
      label.style.left = rect.left + "px";
    }
    repositionAllBadges();
  }

  banner.addEventListener("click", function (e) { e.stopPropagation(); setInspectMode(!inspectMode); });
  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("scroll", onScroll, true);
}
