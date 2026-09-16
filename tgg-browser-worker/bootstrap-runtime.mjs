export function scheduleBootstrapLoop(runLoop) {
  queueMicrotask(() => { void runLoop(); });
}
