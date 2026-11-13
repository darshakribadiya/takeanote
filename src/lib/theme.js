const KEY = "qn:theme";

// Runs inline in <head> before paint so dark mode never flashes light.
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem("${KEY}")||"system";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}`;

export function getTheme() {
  try {
    return localStorage.getItem(KEY) ?? "system";
  } catch {
    return "system";
  }
}

export function setTheme(theme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {}
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}
