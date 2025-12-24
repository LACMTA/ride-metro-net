export function getData<T = any>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Data element with id "${id}" not found`);
  }
  return JSON.parse(element.textContent || "{}");
}
