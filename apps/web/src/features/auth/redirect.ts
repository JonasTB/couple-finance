/** Only same-app paths are accepted, so `?redirect=` cannot become an open redirect. */
export function safeRedirectPath(value: string | null): string {
  if (!value?.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return '/';
  }
  return value;
}
