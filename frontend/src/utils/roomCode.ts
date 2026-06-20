/** Extract a 6-character room code from bare code, invite URL, or /room/ URL */
export function parseRoomCode(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  const fromPath = raw.match(/\/(?:join|room)\/([A-Za-z0-9]{6})\b/i);
  if (fromPath) return fromPath[1].toUpperCase();

  const alnum = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (alnum.length === 6) return alnum;

  return null;
}

export function normalizeRoomCode(code: string): string {
  return parseRoomCode(code) ?? code.trim().toUpperCase();
}
