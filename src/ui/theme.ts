// The page's look ("theme"): remembered per device, like Performance mode, and not part of shared links.
// index.html applies the saved theme before the page is first drawn, so it doesn't flash the standard one.

export type Theme = 'standard' | 'ios6';

const STORAGE_KEY = 'crystalview.theme';

export function savedTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'ios6' ? 'ios6' : 'standard';
  } catch {
    return 'standard';
  }
}

export function setTheme(theme: Theme): void {
  if (theme === 'standard') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // private browsing or blocked storage: the choice just isn't remembered
  }
}
