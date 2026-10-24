export function requestSignal(timeoutMs: number, external?: AbortSignal) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (external?.aborted) cancel();
  else external?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(cancel, timeoutMs);
  return { signal: controller.signal, dispose() { clearTimeout(timer); external?.removeEventListener("abort", cancel); } };
}
