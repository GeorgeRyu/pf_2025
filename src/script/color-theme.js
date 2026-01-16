const STORAGE_KEY = "pf-color-theme";

const THEMES = [
  { name: "white", base: "#FFFFFF", accent: "#000000" },
  { name: "yellow", base: "#F5CF39", accent: "#2E2F00" },
  { name: "blue", base: "#4E9FF6", accent: "#6C2EAF" },
  { name: "green", base: "#58AF48", accent: "#CE5316" },
  { name: "black", base: "#1B1A1A", accent: "#B22123" },
];

const THEME_CHANGE_EVENT = "pf:color-theme-change";

export class ColorTheme {
  constructor() {
    this.buttons = Array.from(document.querySelectorAll(".js-color-theme"));
    if (this.buttons.length === 0) return;

    this.root = document.documentElement;

    const initial = this.readStoredThemeName() || this.readCurrentThemeName() || "white";
    this.applyByName(initial);

    this.buttons.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        this.cycle();
      });
    });
  }

  cycle() {
    const currentName = this.readStoredThemeName() || this.readCurrentThemeName() || "white";
    const idx = Math.max(0, THEMES.findIndex((t) => t.name === currentName));
    const next = THEMES[(idx + 1) % THEMES.length];
    this.apply(next);
  }

  applyByName(name) {
    const theme = THEMES.find((t) => t.name === name) || THEMES[0];
    this.apply(theme);
  }

  apply(theme) {
    this.root.style.setProperty("--c-base", theme.base);
    this.root.style.setProperty("--c-accent", theme.accent);
    this.root.dataset.colorTheme = theme.name;

    this.buttons.forEach((btn) => {
      const label = btn.querySelector('[data-name="colorName"]');
      if (label) label.textContent = theme.name;
    });

    try {
      localStorage.setItem(STORAGE_KEY, theme.name);
    } catch {
      // ignore (private mode, etc.)
    }

    window.dispatchEvent(
      new CustomEvent(THEME_CHANGE_EVENT, {
        detail: { name: theme.name, base: theme.base, accent: theme.accent },
      }),
    );
  }

  readStoredThemeName() {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return v && THEMES.some((t) => t.name === v) ? v : null;
    } catch {
      return null;
    }
  }

  readCurrentThemeName() {
    const v = this.root.dataset.colorTheme;
    return v && THEMES.some((t) => t.name === v) ? v : null;
  }
}

