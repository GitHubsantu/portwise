import { PortwiseError } from './errors';

/** Instance-owned serialization; one failed mutation never poisons the queue. */
export class OperationQueue {
  private tail: Promise<void> = Promise.resolve();
  private disposed = false;
  run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(() => {
      if (this.disposed) throw new PortwiseError('Portwise is shutting down. Retry after reloading the window.', 'operation_cancelled');
      return operation();
    });
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }
  dispose(): void { this.disposed = true; }
}
