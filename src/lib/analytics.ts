export function analyticsEvent(
  data: { event: string } & Record<string, unknown>,
): void {
  window.dataLayer?.push(data);
}
