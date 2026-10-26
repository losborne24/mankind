/**
 * Presentational full-surface overlays for loading / error / WebGL-unavailable
 * states. Pure, stateless components kept apart from the renderer and UI logic.
 */

function Scrim({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="mx-6 max-w-md text-center">{children}</div>
    </div>
  );
}

export function LoadingOverlay() {
  return (
    <Scrim>
      <div className="flex flex-col items-center gap-4">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-accent"
          aria-hidden
        />
        <p className="text-sm tracking-wide text-white/70">Charting the world…</p>
      </div>
    </Scrim>
  );
}

export function ErrorOverlay({ message }: { message: string }) {
  return (
    <Scrim>
      <h2 className="mb-2 text-lg font-semibold text-white">
        The globe could not be loaded
      </h2>
      <p className="text-sm leading-relaxed text-white/70">{message}</p>
      <p className="mt-4 text-xs text-white/40">
        Reload to try again. If the problem persists, the application&apos;s
        geography resources may be unavailable.
      </p>
    </Scrim>
  );
}

export function WebGLUnavailableOverlay() {
  return (
    <Scrim>
      <h2 className="mb-2 text-lg font-semibold text-white">
        WebGL 2 is not available
      </h2>
      <p className="text-sm leading-relaxed text-white/70">
        This experience renders a 3D globe and requires a browser with WebGL 2
        enabled and hardware acceleration available.
      </p>
      <p className="mt-4 text-xs text-white/40">
        Try a recent version of Chrome, Firefox, Edge, or Safari with hardware
        acceleration turned on.
      </p>
    </Scrim>
  );
}
