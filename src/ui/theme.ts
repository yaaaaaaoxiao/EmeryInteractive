// The page's look ("theme"): skeuomorphic unless the standard one was chosen. Remembered per device, like Performance
// mode, and not part of shared links. index.html applies a saved choice before the page is first drawn, so the
// page doesn't flash the other theme.

export type Theme = 'standard' | 'skeuomorphic';

const STORAGE_KEY = 'crystalview.theme';

export function savedTheme(): Theme {
  try {
    // (anything else, such as "ios6", the skeuomorphic theme's first name, is the default)
    return localStorage.getItem(STORAGE_KEY) === 'standard' ? 'standard' : 'skeuomorphic';
  } catch {
    return 'skeuomorphic';
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
