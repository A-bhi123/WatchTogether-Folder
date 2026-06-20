/** Persists host movie across leave/rejoin within the same browser session */
export type HostMovieCache = {
  roomCode: string;
  blobUrl: string;
  movieName: string;
};

let cache: HostMovieCache | null = null;

export const saveHostMovie = (roomCode: string, blobUrl: string, movieName: string) => {
  cache = { roomCode: roomCode.toUpperCase(), blobUrl, movieName };
};

export const getHostMovie = (roomCode: string): HostMovieCache | null => {
  if (!cache || cache.roomCode !== roomCode.toUpperCase()) return null;
  return cache;
};

export const clearHostMovie = () => {
  if (cache?.blobUrl) URL.revokeObjectURL(cache.blobUrl);
  cache = null;
};
