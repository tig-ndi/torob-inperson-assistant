/** Cancellation plus generation guard: a transport may resolve after abort. */
export class RequestGate {
  private generation = 0;
  private controller: AbortController | null = null;
  begin() {
    this.controller?.abort();
    const controller = new AbortController(), generation = ++this.generation;
    this.controller = controller;
    return { signal: controller.signal, isCurrent: () => generation === this.generation && !controller.signal.aborted };
  }
  cancel() { this.generation++; this.controller?.abort(); this.controller = null; }
}
