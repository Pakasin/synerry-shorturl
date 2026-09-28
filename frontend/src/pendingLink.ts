const STORAGE_KEY = 'synerry.pendingUrl';

export function savePendingUrl(url: string) {
  try {
    sessionStorage.setItem(STORAGE_KEY, url);
  } catch {}
}

export function takePendingUrl(): string | null {
  try {
    const url = sessionStorage.getItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    return url;
  } catch {
    return null;
  }
}

export function clearPendingUrl() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
}
