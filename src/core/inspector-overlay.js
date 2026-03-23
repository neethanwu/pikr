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
    cursor: "pointer", userSelect: "none",
    boxShadow: T.shadow,
    transition: fullTransition,
    opacity: "0",
    backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
  });
  document.documentElement.appendChild(banner);

  function setDefaultPosition() {
    var rect = banner.getBoundingClientRect();
    // Center horizontally, then snap to bottom edge (same margin as snapToEdge)
    posX = (window.innerWidth - rect.width) / 2;
    posY = window.innerHeight - rect.height - 8;
    snappedEdge = "bottom";
    applyPosition();
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
    banner.style.cursor = "pointer";

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

  // --- Banner rendering (compact pill with Lucide square-mouse-pointer icon) ---
  function pickIcon(color) {
    return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;display:block">' +
      '<path d="M12.034 12.681a.498.498 0 0 1 .647-.647l9 3.5a.5.5 0 0 1-.033.943l-3.444 1.068a1 1 0 0 0-.66.66l-1.067 3.443a.5.5 0 0 1-.943.033z"/>' +
      '<path d="M21 11V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6"/></svg>';
  }

  function renderBanner() {

    // Dot, text, and icon all share the same 15px height lane for optical centering
    var dot = 'width:7px;height:7px;border-radius:50%;flex-shrink:0';
    var wm = 'font-size:13px;font-weight:700;letter-spacing:-0.03em;line-height:15px';
    var row = 'display:flex;align-items:center;gap:8px;padding:8px 14px;height:15px';

    if (inspectMode) {
      banner.style.backgroundColor = "rgba(28, 25, 23, 0.9)";
      banner.style.border = "1px solid rgba(255, 255, 255, 0.1)";
      banner.innerHTML =
        '<div style="' + row + '">' +
        '<div style="' + dot + ';background:' + T.accent + ';' +
        (reducedMotion ? '' : 'animation:__pikr-dot-pulse 2s ease infinite') + '"></div>' +
        '<span style="' + wm + ';color:rgba(250,250,249,0.85)">pikr</span>' +
        pickIcon("rgba(250,250,249,0.6)") +
        '</div>';
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
    } else {
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
    var el = getElementUnderCursor(e);
    if (!el || isPikrElement(el)) return;
    captureElement(el);
  }

  function onKeyDown(e) {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "x") {
      e.preventDefault(); setInspectMode(!inspectMode); return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      if (inspectMode) {
        setInspectMode(false); // ESC exits inspect mode, not pikr
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
