import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  FolderOpen, SkipBack, SkipForward, Gauge,Wifi
} from 'lucide-react';
import { useRoom } from '../../contexts/RoomContext';
import { motion, AnimatePresence } from 'framer-motion';

function formatTime(s: number) {
  if (isNaN(s) || s < 0 || !isFinite(s)) return '--:--';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

interface VideoPlayerProps {
  /** Controlled from RoomPage via single-tap */
  showControls?: boolean;
  /** @deprecated legacy prop — use showControls */
  videoControlsVisible?: boolean;
  onVideoInteraction?: () => void;
}

export default function VideoPlayer({ showControls: showControlsProp, videoControlsVisible, onVideoInteraction }: VideoPlayerProps) {
  // showControls can be driven externally (single tap) OR internally (mouse move)
  const externallyControlled = showControlsProp !== undefined;
  const {
    videoState, isHost,
    emitPlay, emitPause, emitSeek, emitRate,
    localMovieUrl, hasMovie, movieName,
    selectMovie, changeQuality,
    movieStream,
    movieCodecError,
  } = useRoom() as any;

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [volume, setVolume] = useState(1);
  const [isMutedLocal, setIsMutedLocal] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [showControlsInternal, setShowControlsInternal] = useState(true);
  const showControls = showControlsInternal || !!showControlsProp;

  // When RoomPage single-tap fires showControlsProp=true, show for 4s
  useEffect(() => {
    if (showControlsProp) {
      setShowControlsInternal(true);
      clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setShowControlsInternal(false), 4000);
    }
  }, [showControlsProp]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [showFlash, setShowFlash] = useState<'play' | 'pause' | null>(null);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [currentQuality, setCurrentQuality] = useState<'480p' | '720p' | '1080p'>('720p');
  const [guestBuffering, setGuestBuffering] = useState(false);
  const qualityMenuRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();
  const speedMenuRef = useRef<HTMLDivElement>(null);
  const syncAnchorRef = useRef({ time: 0, at: 0, playing: false });
  const pendingSeekRef = useRef(0);

  const playbackRate = videoState.playbackRate ?? 1;

  // ── Set video source ──────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isHost && localMovieUrl) {
      // Host plays from local file blob URL
      if (video.src !== localMovieUrl) {
        video.src = localMovieUrl;
        video.srcObject = null;
        video.load();
      }
    } else if (!isHost && movieStream) {
      // Guest plays from WebRTC stream
      if (video.srcObject !== movieStream) {
        video.srcObject = movieStream;
        video.src = '';
        video.play().catch(() => {});
      }
    }
  }, [isHost, localMovieUrl, movieStream]);

  // Anchor for guest progress bar (stream has no reliable timeline)
  useEffect(() => {
    syncAnchorRef.current = {
      time: videoState.currentTime,
      at: performance.now(),
      playing: videoState.isPlaying,
    };
    if (!isHost) setCurrentTime(videoState.currentTime);
  }, [videoState.currentTime, videoState.isPlaying, isHost]);

  useEffect(() => {
    if (isHost) return;
    const tick = () => {
      const { time, at, playing } = syncAnchorRef.current;
      if (playing) {
        setCurrentTime(time + ((performance.now() - at) / 1000) * playbackRate);
      } else {
        setCurrentTime(time);
      }
    };
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [isHost, videoState.isPlaying, playbackRate]);

  // ── Sync play/pause/seek/rate from shared room state ──────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video || isSeeking) return;

    if (video.playbackRate !== playbackRate) video.playbackRate = playbackRate;

    if (isHost) {
      const diff = Math.abs(video.currentTime - videoState.currentTime);
      if (diff > 0.5) video.currentTime = videoState.currentTime;
    }

    if (videoState.isPlaying && video.paused) {
      video.play().catch(() => {});
    } else if (!videoState.isPlaying && !video.paused) {
      video.pause();
    }
  }, [videoState.isPlaying, videoState.currentTime, playbackRate, isSeeking, isHost]);

  // ── Close speed menu on outside click ────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (speedMenuRef.current && !speedMenuRef.current.contains(e.target as Node)) {
        setShowSpeedMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const flash = (type: 'play' | 'pause') => {
    setShowFlash(type);
    setTimeout(() => setShowFlash(null), 700);
  };

  const getEmitTime = useCallback(() => {
    if (isHost && videoRef.current) return videoRef.current.currentTime;
    const { time, at, playing } = syncAnchorRef.current;
    const rate = videoState.playbackRate ?? 1;
    return playing ? time + ((performance.now() - at) / 1000) * rate : time;
  }, [isHost, videoState.playbackRate]);

  const handlePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const t = getEmitTime();
    if (videoState.isPlaying) {
      emitPause(t);
      flash('pause');
    } else {
      emitPlay(t);
      flash('play');
    }
    onVideoInteraction?.();
  }, [videoState.isPlaying, getEmitTime, emitPlay, emitPause, onVideoInteraction]);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = parseFloat(e.target.value);
    pendingSeekRef.current = t;
    setCurrentTime(t);
    if (isHost && videoRef.current) videoRef.current.currentTime = t;
  };

  const finishSeek = () => {
    setIsSeeking(false);
    emitSeek(pendingSeekRef.current);
  };

  const skip = (secs: number) => {
    const base = isHost && videoRef.current
      ? videoRef.current.currentTime
      : getEmitTime();
    const newTime = Math.max(0, Math.min(duration || Infinity, base + secs));
    setCurrentTime(newTime);
    if (isHost && videoRef.current) videoRef.current.currentTime = newTime;
    emitSeek(newTime);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (videoRef.current) videoRef.current.volume = v;
    setIsMutedLocal(v === 0);
  };

  const toggleMuteLocal = () => {
    if (!videoRef.current) return;
    const m = !isMutedLocal;
    setIsMutedLocal(m);
    videoRef.current.muted = m;
    if (!m && volume === 0) { setVolume(0.5); videoRef.current.volume = 0.5; }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const handleSpeedChange = (s: number) => {
    setShowSpeedMenu(false);
    emitRate(s);
  };

  const showControlsFor = () => {
    setShowControlsInternal(true);
    onVideoInteraction?.();
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (videoState.isPlaying) setShowControlsInternal(false);
    }, 3000);
  };

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => {
      document.removeEventListener('fullscreenchange', handler);
      clearTimeout(hideTimer.current);
    };
  }, []);

  const progress = duration ? (currentTime / duration) * 100 : 0;

  // Host sees video when localMovieUrl is set
  // Guest sees video when movieStream is received
  const showVideo = isHost ? !!localMovieUrl : !!movieStream;

  // ── No movie yet ─────────────────────────────────────────────
  if (!showVideo) {
    return (
      <div className="flex-1 flex items-center justify-center bg-black">
        {isHost ? (
          <div className="text-center">
            <input
              ref={fileInputRef} type="file" accept="video/*,.mkv"
              className="hidden"
              onClick={e => { (e.target as HTMLInputElement).value = ''; }}
              onChange={e => { const f = e.target.files?.[0]; if (f) selectMovie(f); }}
            />
            {videoState.hasMovie && videoState.movieName && (
              <p className="text-netflix-red text-sm mb-4 animate-pulse">
                🎬 {videoState.movieName} — select again to resume stream
              </p>
            )}
            <motion.button
              whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center gap-4 bg-netflix-red/10 hover:bg-netflix-red/20 border-2 border-dashed border-netflix-red/40 hover:border-netflix-red rounded-2xl px-12 py-10 transition-all"
            >
              <FolderOpen className="w-14 h-14 text-netflix-red" />
              <div>
                <p className="text-white font-semibold text-lg">Select Movie From Device</p>
                <p className="text-netflix-gray text-sm mt-1">MP4, MKV, WebM — streams to all participants</p>
              </div>
            </motion.button>
          </div>
        ) : (
          <div className="text-center text-netflix-gray">
            <div className="text-6xl mb-4 animate-pulse">🎬</div>
            <p className="text-lg font-medium text-white/60">
              {videoState.hasMovie
                ? 'Connecting movie stream...'
                : 'Waiting for host to select a movie...'}
            </p>
            {videoState.movieName && (
              <p className="text-sm mt-2 text-netflix-red animate-pulse">
                🎬 {videoState.movieName}
              </p>
            )}
            {videoState.hasMovie && !movieStream && !movieCodecError && (
              <p className="text-xs mt-3 text-white/30">
                Stream connecting via WebRTC — please wait a moment
              </p>
            )}
            {movieCodecError && (
              <div className="mt-4 bg-red-900/40 border border-red-500/40 rounded-xl px-4 py-3 max-w-md mx-auto">
                <p className="text-red-200 text-sm font-medium">⚠️ {movieCodecError}</p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative flex-1 bg-black flex items-center justify-center overflow-hidden"
      onMouseMove={showControlsFor}
      onMouseLeave={() => videoState.isPlaying && setShowControlsInternal(false)}
    >
      <video
        ref={videoRef}
        className="max-h-full max-w-full w-full"
        onClick={handlePlayPause}
        onTimeUpdate={e => {
          if (isHost && !isSeeking) setCurrentTime((e.target as HTMLVideoElement).currentTime);
        }}
        onDurationChange={e => setDuration((e.target as HTMLVideoElement).duration)}
        onEnded={() => emitPause(0)}
        onWaiting={() => !isHost && setGuestBuffering(true)}
        onPlaying={() => setGuestBuffering(false)}
        playsInline
        autoPlay={!isHost}
      />

      {/* Codec error banner (host) */}
      {isHost && movieCodecError && (
        <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-center px-4 pt-4 pointer-events-none">
          <div className="bg-red-900/90 border border-red-500/50 rounded-xl px-4 py-3 max-w-xl text-center pointer-events-auto">
            <p className="text-red-200 text-sm font-medium">⚠️ {movieCodecError}</p>
          </div>
        </div>
      )}

      {/* Guest buffering indicator */}
      {!isHost && guestBuffering && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-black/70 rounded-full p-4">
            <div className="w-8 h-8 border-3 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        </div>
      )}

      {/* Stream badge for guests */}
      <div className="absolute top-3 right-3 bg-black/50 rounded-lg px-2.5 py-1 text-xs pointer-events-none flex items-center gap-1.5">
        <div className={`w-1.5 h-1.5 rounded-full ${videoState.isPlaying ? 'bg-green-400 animate-pulse' : 'bg-netflix-gray'}`} />
        <span className={isHost ? 'text-yellow-400/90' : 'text-netflix-gray'}>
          {isHost ? 'Broadcasting to room' : 'Synced with room'}
        </span>
      </div>

      {/* Flash indicator */}
      <AnimatePresence>
        {showFlash && (
          <motion.div
            initial={{ opacity: 0.8, scale: 0.8 }}
            animate={{ opacity: 0, scale: 1.3 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            <div className="bg-black/50 rounded-full p-5">
              {showFlash === 'play'
                ? <Play className="w-10 h-10 text-white fill-white" />
                : <Pause className="w-10 h-10 text-white fill-white" />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 via-black/50 to-transparent px-4 pb-8 pt-10"
          >
            {movieName && (
              <p className="text-white/50 text-xs mb-2 truncate">{movieName}</p>
            )}

            <div className="mb-3">
              <input
                type="range" min={0} max={duration || 100} step={0.5}
                value={currentTime}
                onChange={handleSeek}
               onMouseDown={() => setIsSeeking(true)}
onMouseUp={finishSeek}
onTouchStart={() => setIsSeeking(true)}
onTouchMove={(e) => {
  const input = e.target as HTMLInputElement;
  const rect = input.getBoundingClientRect();
  const touch = e.touches[0];
  const ratio = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
  const newTime = ratio * (duration || 0);
  if (videoRef.current) videoRef.current.currentTime = newTime;
  setCurrentTime(newTime);
}}
onTouchEnd={finishSeek}
style={{
  background: `linear-gradient(to right,#E50914 ${progress}%,rgba(255,255,255,0.2) ${progress}%)`,
  width: '100%',
  height: '20px',
  WebkitAppearance: 'none',
  appearance: 'none',
  borderRadius: '9999px',
  cursor: 'pointer',
  touchAction: 'none',
}}
              />
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={() => skip(-10)}
                className="text-white/70 hover:text-white transition-colors" title="Back 10s">
                <SkipBack className="w-4 h-4" />
              </button>

              <button onClick={handlePlayPause}
                className="text-white hover:text-netflix-red transition-colors">
                {videoState.isPlaying
                  ? <Pause className="w-5 h-5 fill-current" />
                  : <Play className="w-5 h-5 fill-current" />}
              </button>

              <button onClick={() => skip(10)}
                className="text-white/70 hover:text-white transition-colors" title="Forward 10s">
                <SkipForward className="w-4 h-4" />
              </button>

              {/* Volume */}
              <div className="flex items-center gap-2 group">
                <button onClick={toggleMuteLocal}
                  className="text-white hover:text-netflix-red transition-colors">
                  {isMutedLocal || volume === 0
                    ? <VolumeX className="w-4 h-4" />
                    : <Volume2 className="w-4 h-4" />}
                </button>
                <input
                  type="range" min={0} max={1} step={0.05}
                  value={isMutedLocal ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-0 group-hover:w-16 transition-all duration-200 h-1 appearance-none rounded-full cursor-pointer overflow-hidden"
                  style={{ background: `linear-gradient(to right,white ${(isMutedLocal ? 0 : volume) * 100}%,rgba(255,255,255,0.3) ${(isMutedLocal ? 0 : volume) * 100}%)` }}
                />
              </div>

              {/* Time */}
              <span className="text-white text-xs font-mono">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>

              <div className="flex-1" />

              <div ref={speedMenuRef} className="relative">
                <button
                  onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-white hover:text-netflix-red transition-colors bg-white/10 hover:bg-white/20 px-2.5 py-1.5 rounded-lg"
                  title="Playback speed (synced for everyone)"
                >
                  <Gauge className="w-3.5 h-3.5" />
                  <span>{playbackRate === 1 ? 'Speed' : `${playbackRate}x`}</span>
                </button>

                <AnimatePresence>
                  {showSpeedMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute bottom-full right-0 mb-2 bg-surface-overlay border border-white/10 rounded-xl overflow-hidden shadow-2xl z-50"
                      style={{ minWidth: 110 }}
                    >
                      <div className="px-3 py-2 border-b border-white/10">
                        <p className="text-[10px] text-netflix-gray font-medium uppercase tracking-wider">Playback Speed</p>
                      </div>
                      {SPEEDS.map(s => (
                        <button
                          key={s}
                          onClick={() => handleSpeedChange(s)}
                          className={`w-full flex items-center justify-between px-3 py-2 text-sm transition-colors hover:bg-white/10 ${playbackRate === s
                            ? 'text-netflix-red font-semibold bg-netflix-red/10'
                            : 'text-white'
                            }`}
                        >
                          <span>{s === 1 ? 'Normal' : `${s}x`}</span>
                          {playbackRate === s && (
                            <div className="w-1.5 h-1.5 rounded-full bg-netflix-red" />
                          )}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Change movie (host only) */}
              {isHost && (
                <>
                  <input ref={fileInputRef} type="file" accept="video/*,.mkv" className="hidden"
                    onClick={e => { (e.target as HTMLInputElement).value = ''; }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) selectMovie(f); }} />
                  <button onClick={() => fileInputRef.current?.click()}
                    className="text-white/50 hover:text-white text-xs flex items-center gap-1 transition-colors">
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>Change</span>
                  </button>
                </>
              )}

              {/* Quality (host only) */}
              {isHost && (
                <div ref={qualityMenuRef} className="relative">
                  <button
                    onClick={() => setShowQualityMenu(!showQualityMenu)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-white hover:text-netflix-red transition-colors bg-white/10 hover:bg-white/20 px-2.5 py-1.5 rounded-lg"
                  >
                    <Wifi className="w-3.5 h-3.5" />
                    <span>{currentQuality}</span>
                  </button>
                  <AnimatePresence>
                    {showQualityMenu && (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute bottom-full right-0 mb-2 bg-surface-overlay border border-white/10 rounded-xl overflow-hidden shadow-2xl z-50"
                        style={{ minWidth: 110 }}
                      >
                        <div className="px-3 py-2 border-b border-white/10">
                          <p className="text-[10px] text-netflix-gray font-medium uppercase tracking-wider">Stream Quality</p>
                        </div>
                        {(['480p', '720p', '1080p'] as const).map(q => (
                          <button
                            key={q}
                            onClick={() => {
                              changeQuality(q);
                              setCurrentQuality(q);
                              setShowQualityMenu(false);
                            }}
                            className={`w-full flex items-center justify-between px-3 py-2 text-sm transition-colors hover:bg-white/10 ${
                              currentQuality === q
                                ? 'text-netflix-red font-semibold bg-netflix-red/10'
                                : 'text-white'
                            }`}
                          >
                            <span>{q}</span>
                            {currentQuality === q && (
                              <div className="w-1.5 h-1.5 rounded-full bg-netflix-red" />
                            )}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              <div className={`flex items-center gap-1 text-xs ${videoState.isPlaying ? 'text-green-400' : 'text-netflix-gray'}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${videoState.isPlaying ? 'bg-green-400 animate-pulse' : 'bg-netflix-gray'}`} />
                {videoState.isPlaying ? 'Synced' : 'Paused'}
              </div>

              {/* Fullscreen */}
              <button onClick={toggleFullscreen}
                className="text-white hover:text-netflix-red transition-colors">
                {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
