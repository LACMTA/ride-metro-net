export function analyticsEvent(eventName: string): void {
  window.gtag?.("event", eventName);
}
