import { useState, useEffect } from "react";

const THEME_KEY = "sovereign-shield-theme";

function getTheme(): "default" | "crt" {
  try {
    return (localStorage.getItem(THEME_KEY) as "crt") || "default";
  } catch { return "default"; }
}

function applyTheme(theme: "default" | "crt") {
  if (theme === "crt") {
    document.documentElement.setAttribute("data-theme", "crt");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<"default" | "crt">(getTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return (
    <button
      onClick={() => setTheme((t) => (t === "default" ? "crt" : "default"))}
      className="text-xs opacity-60 hover:opacity-100 px-2 py-1 rounded bg-slate-800"
      title={`Theme: ${theme}`}
    >
      {theme === "crt" ? "CRT" : "STD"}
    </button>
  );
}
