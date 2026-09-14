// ---------------------------------------------------------------------------
// Small color-math helpers. No dependencies — everything an accent color
// needs (hover, soft badge, soft text, contrast text) is derived from a
// single base hex at runtime, so a custom pick behaves as well as a preset.
// ---------------------------------------------------------------------------

export function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const int = parseInt(full, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

export function rgbToHex({ r, g, b }) {
  const toHex = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Blend `hex` toward `target` by `weight` (0 = hex, 1 = target).
export function mix(hex, target, weight) {
  const a = hexToRgb(hex);
  const b = hexToRgb(target);
  return rgbToHex({
    r: a.r + (b.r - a.r) * weight,
    g: a.g + (b.g - a.g) * weight,
    b: a.b + (b.b - a.b) * weight,
  });
}

export function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const chan = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

// Pick readable text (near-white or near-ink) for a background of `hex`.
export function contrastText(hex) {
  return relativeLuminance(hex) > 0.42 ? "#12130f" : "#ffffff";
}

// Given one base hex, derive the full set of accent CSS variables for a theme.
export function buildAccentVars(baseHex, theme) {
  const isDark = theme === "dark";
  return {
    "--accent": isDark ? mix(baseHex, "#ffffff", 0.12) : baseHex,
    "--accent-hover": isDark ? mix(baseHex, "#ffffff", 0.32) : mix(baseHex, "#000000", 0.22),
    "--accent-soft": isDark ? mix(baseHex, "#000000", 0.78) : mix(baseHex, "#ffffff", 0.88),
    "--accent-soft-text": isDark ? mix(baseHex, "#ffffff", 0.45) : mix(baseHex, "#000000", 0.35),
    "--accent-contrast": contrastText(isDark ? mix(baseHex, "#ffffff", 0.12) : baseHex),
  };
}

export function applyAccentColor(baseHex, theme) {
  const vars = buildAccentVars(baseHex, theme);
  const root = document.documentElement.style;
  Object.entries(vars).forEach(([k, v]) => root.setProperty(k, v));
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export const ACCENT_PRESETS = [
  { name: "Teal", hex: "#14b8a6" },
  { name: "Blue", hex: "#3b82f6" },
  { name: "Indigo", hex: "#6366f1" },
  { name: "Violet", hex: "#8b5cf6" },
  { name: "Rose", hex: "#f43f5e" },
  { name: "Amber", hex: "#f59e0b" },
  { name: "Emerald", hex: "#10b981" },
  { name: "Slate", hex: "#64748b" },
  { name: "Sky", hex: "#0ea5e9" },
  { name: "Lime", hex: "#84cc16" },
  { name: "Crimson", hex: "#dc2626" },
  { name: "Cyan", hex: "#06b6d4" },
  { name: "Magenta", hex: "#d946ef" },
  { name: "Mustard", hex: "#ca8a04" },
  { name: "Forest", hex: "#15803d" },
  { name: "Cocoa", hex: "#92400e" },
];

// ---------------------------------------------------------------------------
// SVG background generators. Everything below is authored as inline SVG and
// shipped as a data URI, so there are no binary assets to host — a "pattern"
// tiles a small motif edge-to-edge (like WhatsApp/Telegram doodle wallpapers),
// while a "scene" is one illustration stretched to cover the whole pane.
// ---------------------------------------------------------------------------

function svgToPatternUrl(svgMarkup) {
  return `url("data:image/svg+xml,${encodeURIComponent(svgMarkup)}")`;
}

function svgToSceneUrl(svgMarkup) {
  return `data:image/svg+xml,${encodeURIComponent(svgMarkup)}`;
}

// Build a small tiling SVG data-URI with a single emoji repeated across it —
// the same idea Telegram and WhatsApp use for their "doodle" chat wallpapers
// (a subtle, low-opacity icon motif repeated in a grid, tinted by a base
// color underneath).
function emojiTile(emoji, { tile = 48, size = 22, opacity = 0.5 } = {}) {
  return svgToPatternUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${tile}" height="${tile}"><text x="50%" y="58%" text-anchor="middle" dominant-baseline="middle" font-size="${size}" opacity="${opacity}">${emoji}</text></svg>`
  );
}

// Chat-area backgrounds, in the spirit of a messaging app's wallpaper picker.
// Each entry carries a `group` used to organize the picker into sections.
//
// Pruned the near-duplicate pastel tints/gradients and the generic emoji
// wallpapers that all read the same at a glance, and added a handful of
// higher-signature options (Matrix Rain, Terminal, Tokyo Nights, Northern
// Lights) that fit an AI/dev-tool audience and actually look distinct from
// one another in the picker.
export const BACKGROUND_PRESETS = [
  // --- Simple: flat tints and soft gradients -------------------------------
  { id: "none", label: "Default", type: "none", group: "Simple" },
  { id: "warm-sand", label: "Sand", type: "color", value: "#f1ece0", group: "Simple" },
  { id: "sky", label: "Sky", type: "color", value: "#e6eef7", group: "Simple" },
  {
    id: "dusk",
    label: "Dusk",
    type: "gradient",
    value: "linear-gradient(160deg, #eef2f1 0%, #dfe7ea 100%)",
    group: "Simple",
  },
  {
    id: "aurora",
    label: "Aurora",
    type: "gradient",
    value: "linear-gradient(135deg, #e0f7f5 0%, #e6e9fb 50%, #fbe8f2 100%)",
    group: "Simple",
  },
  {
    id: "grid",
    label: "Grid",
    type: "pattern",
    value:
      "linear-gradient(#00000014 1px, transparent 1px), linear-gradient(90deg, #00000014 1px, transparent 1px)",
    backgroundSize: "22px 22px",
    backgroundColor: "#f9f8f4",
    group: "Simple",
  },

  // --- Doodles: tiny repeating motifs (kept only the two that read as
  //     distinct from each other; the rest were the same dot-grid look) ----
  { id: "stars", label: "Stars", type: "pattern", value: emojiTile("✨"), backgroundSize: "48px 48px", backgroundColor: "#faf9f4", group: "Doodles" },
  { id: "coffee", label: "Coffee", type: "pattern", value: emojiTile("☕"), backgroundSize: "48px 48px", backgroundColor: "#f7f1e9", group: "Doodles" },

  // --- Nature: illustrated outdoor scenes and tiled motifs -----------------
  {
    id: "mountains",
    label: "Mountains",
    type: "scene",
    value: svgToSceneUrl(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 260">
        <defs><linearGradient id="sky1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ffe3d1"/><stop offset="1" stop-color="#dfe9f7"/>
        </linearGradient></defs>
        <rect width="400" height="260" fill="url(#sky1)"/>
        <circle cx="320" cy="58" r="26" fill="#ffd77a" opacity="0.9"/>
        <polygon points="0,260 0,175 70,95 140,180 190,125 260,195 320,140 400,195 400,260" fill="#b7c8d6" opacity="0.55"/>
        <polygon points="0,260 0,215 90,145 170,220 240,155 330,230 400,185 400,260" fill="#8fa6ba" opacity="0.85"/>
      </svg>`
    ),
    fit: "cover",
    group: "Nature",
  },
  {
    id: "forest",
    label: "Forest",
    type: "pattern",
    value: svgToPatternUrl(
      `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="80">
        <polygon points="30,10 15,40 45,40" fill="#5b8a63" opacity="0.4"/>
        <polygon points="30,25 12,55 48,55" fill="#4c7a55" opacity="0.4"/>
        <rect x="27" y="55" width="6" height="14" fill="#6b4f3a" opacity="0.4"/>
      </svg>`
    ),
    backgroundSize: "60px 80px",
    backgroundColor: "#eef4ec",
    group: "Nature",
  },
  {
    id: "ocean-waves",
    label: "Ocean Waves",
    type: "scene",
    value: svgToSceneUrl(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 260">
        <defs><linearGradient id="oc" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#bfe3f0"/><stop offset="1" stop-color="#8fd0e0"/>
        </linearGradient></defs>
        <rect width="400" height="260" fill="url(#oc)"/>
        <circle cx="60" cy="50" r="20" fill="#fff6da" opacity="0.9"/>
        <path d="M0 180 Q50 160 100 180 T200 180 T300 180 T400 180 V260 H0 Z" fill="#5fb8cf" opacity="0.6"/>
        <path d="M0 210 Q50 190 100 210 T200 210 T300 210 T400 210 V260 H0 Z" fill="#3f9db6" opacity="0.75"/>
      </svg>`
    ),
    fit: "cover",
    group: "Nature",
  },
  {
    id: "northern-lights",
    label: "Northern Lights",
    type: "scene",
    value: svgToSceneUrl(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 260">
        <defs><linearGradient id="nl" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#04070f"/><stop offset="1" stop-color="#0c1a2b"/>
        </linearGradient></defs>
        <rect width="400" height="260" fill="url(#nl)"/>
        <g fill="#ffffff">
          <circle cx="30" cy="30" r="1.3" opacity="0.8"/><circle cx="90" cy="20" r="1" opacity="0.6"/>
          <circle cx="160" cy="35" r="1.4" opacity="0.7"/><circle cx="250" cy="15" r="1" opacity="0.6"/>
          <circle cx="320" cy="40" r="1.3" opacity="0.7"/><circle cx="370" cy="20" r="1" opacity="0.5"/>
        </g>
        <path d="M0 120 Q100 60 200 110 T400 100" stroke="#4ee6a8" stroke-width="18" fill="none" opacity="0.35"/>
        <path d="M0 150 Q120 90 220 140 T400 130" stroke="#63c8ff" stroke-width="14" fill="none" opacity="0.3"/>
        <path d="M0 100 Q140 40 260 90 T400 70" stroke="#b98bff" stroke-width="10" fill="none" opacity="0.25"/>
        <polygon points="0,260 0,220 60,190 120,225 180,200 240,230 300,205 360,235 400,215 400,260" fill="#050a12" opacity="0.9"/>
      </svg>`
    ),
    fit: "cover",
    group: "Nature",
  },

  // --- Tech: circuit lines, retro synthwave, starfields, and a couple of
  //     dev-culture picks that fit an AI chat platform well -----------------
  {
    id: "circuit",
    label: "Circuit",
    type: "pattern",
    value: svgToPatternUrl(
      `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80">
        <path d="M0 20 H30 V0" stroke="#4fd1c5" stroke-width="2" fill="none" opacity="0.4"/>
        <path d="M50 80 V50 H80" stroke="#4fd1c5" stroke-width="2" fill="none" opacity="0.4"/>
        <path d="M0 60 H20 V80" stroke="#4fd1c5" stroke-width="2" fill="none" opacity="0.35"/>
        <circle cx="30" cy="0" r="3" fill="#4fd1c5" opacity="0.6"/>
        <circle cx="80" cy="50" r="3" fill="#4fd1c5" opacity="0.6"/>
        <circle cx="50" cy="80" r="3" fill="#4fd1c5" opacity="0.6"/>
      </svg>`
    ),
    backgroundSize: "80px 80px",
    backgroundColor: "#0f1620",
    group: "Tech",
  },
  {
    id: "synthwave",
    label: "Synthwave",
    type: "scene",
    value: svgToSceneUrl(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 260">
        <defs><linearGradient id="sw" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#2b1055"/><stop offset="1" stop-color="#6a3093"/>
        </linearGradient>
        <clipPath id="sunclip"><circle cx="200" cy="130" r="55"/></clipPath></defs>
        <rect width="400" height="260" fill="url(#sw)"/>
        <g clip-path="url(#sunclip)">
          <circle cx="200" cy="130" r="55" fill="#ff7ac6"/>
          <rect y="115" width="400" height="6" fill="#2b1055"/>
          <rect y="128" width="400" height="6" fill="#2b1055"/>
          <rect y="141" width="400" height="6" fill="#2b1055"/>
          <rect y="154" width="400" height="6" fill="#2b1055"/>
          <rect y="167" width="400" height="6" fill="#2b1055"/>
        </g>
        <g stroke="#ff7ac6" stroke-width="1.5" opacity="0.6">
          <line x1="0" y1="260" x2="150" y2="185"/>
          <line x1="60" y1="260" x2="180" y2="185"/>
          <line x1="130" y1="260" x2="200" y2="185"/>
          <line x1="200" y1="260" x2="200" y2="185"/>
          <line x1="270" y1="260" x2="220" y2="185"/>
          <line x1="340" y1="260" x2="240" y2="185"/>
          <line x1="400" y1="260" x2="250" y2="185"/>
          <line x1="0" y1="220" x2="400" y2="220"/>
          <line x1="0" y1="240" x2="400" y2="240"/>
        </g>
      </svg>`
    ),
    fit: "cover",
    group: "Tech",
  },
  {
    id: "constellation",
    label: "Constellation",
    type: "scene",
    value: svgToSceneUrl(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 260">
        <defs><radialGradient id="sp" cx="30%" cy="20%" r="90%">
          <stop offset="0" stop-color="#1b2450"/><stop offset="1" stop-color="#05070f"/>
        </radialGradient></defs>
        <rect width="400" height="260" fill="url(#sp)"/>
        <circle cx="300" cy="80" r="26" fill="#e8c07a"/>
        <ellipse cx="300" cy="80" rx="42" ry="10" fill="none" stroke="#e8c07a" stroke-width="3" opacity="0.7"/>
        <g fill="#ffffff">
          <circle cx="30" cy="40" r="1.6" opacity="0.9"/><circle cx="70" cy="90" r="1.2" opacity="0.7"/>
          <circle cx="120" cy="30" r="1.8" opacity="0.8"/><circle cx="160" cy="120" r="1.3" opacity="0.6"/>
          <circle cx="20" cy="150" r="1.5" opacity="0.7"/><circle cx="90" cy="180" r="1.2" opacity="0.6"/>
          <circle cx="220" cy="60" r="1.4" opacity="0.7"/><circle cx="250" cy="200" r="1.6" opacity="0.8"/>
          <circle cx="180" cy="220" r="1.2" opacity="0.6"/><circle cx="350" cy="180" r="1.4" opacity="0.7"/>
          <circle cx="380" cy="230" r="1.2" opacity="0.6"/><circle cx="60" cy="230" r="1.3" opacity="0.6"/>
        </g>
      </svg>`
    ),
    fit: "cover",
    group: "Tech",
  },
  {
    id: "matrix-rain",
    label: "Matrix Rain",
    type: "pattern",
    value: svgToPatternUrl(
      `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="100">
        <rect width="60" height="100" fill="#050806"/>
        <text x="6" y="16" font-family="monospace" font-size="13" fill="#3ddc72" opacity="0.55">01</text>
        <text x="30" y="30" font-family="monospace" font-size="13" fill="#3ddc72" opacity="0.35">1A</text>
        <text x="10" y="48" font-family="monospace" font-size="13" fill="#3ddc72" opacity="0.7">F0</text>
        <text x="34" y="64" font-family="monospace" font-size="13" fill="#3ddc72" opacity="0.3">01</text>
        <text x="4" y="82" font-family="monospace" font-size="13" fill="#3ddc72" opacity="0.5">C3</text>
        <text x="32" y="96" font-family="monospace" font-size="13" fill="#3ddc72" opacity="0.6">9E</text>
      </svg>`
    ),
    backgroundSize: "60px 100px",
    backgroundColor: "#050806",
    group: "Tech",
  },
  {
    id: "terminal",
    label: "Terminal",
    type: "scene",
    value: svgToSceneUrl(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 260">
        <defs>
          <pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse">
            <rect width="4" height="2" fill="#000000" opacity="0"/>
            <rect y="2" width="4" height="2" fill="#000000" opacity="0.4"/>
          </pattern>
        </defs>
        <rect width="400" height="260" fill="#0a0f0b"/>
        <text x="24" y="46" font-family="monospace" font-size="15" fill="#3ddc72">$ agenza --model gpt-oss-120b</text>
        <text x="24" y="74" font-family="monospace" font-size="15" fill="#2fae5c">&gt; session ready</text>
        <rect x="24" y="90" width="11" height="17" fill="#3ddc72" opacity="0.9"/>
        <rect width="400" height="260" fill="url(#scan)"/>
        <rect width="400" height="260" fill="none" stroke="#3ddc72" stroke-opacity="0.15" stroke-width="6"/>
      </svg>`
    ),
    fit: "cover",
    group: "Tech",
  },

  // --- Skylines: buildings and cityscapes -----------------------------------
  {
    id: "city-skyline",
    label: "Skyline",
    type: "scene",
    value: svgToSceneUrl(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 260">
        <defs><linearGradient id="dusk2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#f7c9a3"/><stop offset="1" stop-color="#c9d6f0"/>
        </linearGradient></defs>
        <rect width="400" height="260" fill="url(#dusk2)"/>
        <g fill="#3b3f57" opacity="0.85">
          <rect x="0" y="150" width="40" height="110"/>
          <rect x="45" y="110" width="30" height="150"/>
          <rect x="80" y="170" width="45" height="90"/>
          <rect x="130" y="90" width="35" height="170"/>
          <rect x="170" y="140" width="50" height="120"/>
          <rect x="225" y="60" width="30" height="200"/>
          <rect x="260" y="130" width="45" height="130"/>
          <rect x="310" y="100" width="35" height="160"/>
          <rect x="350" y="160" width="50" height="100"/>
        </g>
        <g fill="#ffe9a8" opacity="0.85">
          <rect x="8" y="165" width="6" height="8"/><rect x="22" y="185" width="6" height="8"/>
          <rect x="52" y="130" width="6" height="8"/><rect x="52" y="160" width="6" height="8"/>
          <rect x="138" y="115" width="6" height="8"/><rect x="150" y="145" width="6" height="8"/>
          <rect x="178" y="160" width="6" height="8"/><rect x="198" y="190" width="6" height="8"/>
          <rect x="233" y="85" width="6" height="8"/><rect x="233" y="120" width="6" height="8"/>
          <rect x="270" y="150" width="6" height="8"/><rect x="288" y="180" width="6" height="8"/>
          <rect x="318" y="120" width="6" height="8"/><rect x="360" y="180" width="6" height="8"/>
        </g>
      </svg>`
    ),
    fit: "cover",
    group: "Skylines",
  },
  {
    id: "tokyo-nights",
    label: "Tokyo Nights",
    type: "scene",
    value: svgToSceneUrl(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 260">
        <defs><linearGradient id="tn" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#1a1035"/><stop offset="1" stop-color="#3a1b52"/>
        </linearGradient></defs>
        <rect width="400" height="260" fill="url(#tn)"/>
        <circle cx="330" cy="50" r="30" fill="#ff6fd8" opacity="0.5"/>
        <g fill="#150a29" opacity="0.9">
          <rect x="0" y="160" width="35" height="100"/>
          <rect x="40" y="120" width="28" height="140"/>
          <rect x="75" y="175" width="40" height="85"/>
          <rect x="120" y="95" width="32" height="165"/>
          <rect x="160" y="150" width="45" height="110"/>
          <rect x="215" y="70" width="28" height="190"/>
          <rect x="250" y="135" width="40" height="125"/>
          <rect x="295" y="100" width="32" height="160"/>
          <rect x="335" y="165" width="45" height="95"/>
        </g>
        <g fill="#5ef1ff" opacity="0.8">
          <rect x="8" y="175" width="5" height="8"/><rect x="20" y="200" width="5" height="8"/>
          <rect x="48" y="140" width="5" height="8"/><rect x="48" y="170" width="5" height="8"/>
          <rect x="128" y="115" width="5" height="8"/><rect x="140" y="150" width="5" height="8"/>
        </g>
        <g fill="#ff6fd8" opacity="0.85">
          <rect x="168" y="165" width="5" height="8"/><rect x="188" y="200" width="5" height="8"/>
          <rect x="223" y="90" width="5" height="8"/><rect x="223" y="125" width="5" height="8"/>
          <rect x="258" y="155" width="5" height="8"/><rect x="278" y="190" width="5" height="8"/>
          <rect x="303" y="120" width="5" height="8"/><rect x="343" y="190" width="5" height="8"/>
        </g>
      </svg>`
    ),
    fit: "cover",
    group: "Skylines",
  },
];

export function backgroundToStyle(bg) {
  if (!bg || bg.type === "none") return {};
  if (bg.type === "image" || bg.type === "scene") {
    return {
      backgroundImage: `url(${bg.value})`,
      backgroundSize: bg.fit || "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      backgroundAttachment: "local",
    };
  }
  if (bg.type === "color") {
    return { backgroundColor: bg.value };
  }
  if (bg.type === "gradient") {
    return { backgroundImage: bg.value };
  }
  if (bg.type === "pattern") {
    return {
      backgroundImage: bg.value,
      backgroundSize: bg.backgroundSize || "auto",
      backgroundColor: bg.backgroundColor,
    };
  }
  return {};
}

export const ACCENT_STORAGE_KEY = "nova-accent-color";
export const BACKGROUND_STORAGE_KEY = "nova-chat-background";
export const SIDEBAR_STORAGE_KEY = "nova-sidebar-collapsed";

export function loadAccentColor() {
  if (typeof window === "undefined") return ACCENT_PRESETS[0].hex;
  return localStorage.getItem(ACCENT_STORAGE_KEY) || ACCENT_PRESETS[0].hex;
}

export function saveAccentColor(hex) {
  localStorage.setItem(ACCENT_STORAGE_KEY, hex);
}

export function loadChatBackground() {
  if (typeof window === "undefined") return BACKGROUND_PRESETS[0];
  try {
    const raw = localStorage.getItem(BACKGROUND_STORAGE_KEY);
    return raw ? JSON.parse(raw) : BACKGROUND_PRESETS[0];
  } catch {
    return BACKGROUND_PRESETS[0];
  }
}

export function saveChatBackground(bg) {
  localStorage.setItem(BACKGROUND_STORAGE_KEY, JSON.stringify(bg));
}