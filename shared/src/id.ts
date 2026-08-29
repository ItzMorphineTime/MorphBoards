/** Short unique id (works in browser and Node). */
export function newId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}
