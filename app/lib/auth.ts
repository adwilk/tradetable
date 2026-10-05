export function getOAuthReturnUrl() {
  if (typeof window === "undefined") return undefined;
  return `${window.location.origin}${window.location.pathname}${window.location.search}`;
}
