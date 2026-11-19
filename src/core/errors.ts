export type ErrorHop = 'extension' | 'gateway' | 'upstream';

/** A typed, user-safe error emitted by Portwise boundaries. */
export class PortwiseError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly hop: ErrorHop = 'extension',
    readonly hint?: string,
  ) {
    super(message);
    this.name = 'PortwiseError';
  }
}

export class PathValidationError extends PortwiseError {
  constructor(message: string) {
    super(message, 'path_invalid', 'extension');
    this.name = 'PathValidationError';
  }
}

export class UrlValidationError extends PortwiseError {
  constructor(message: string) {
    super(message, 'provider_url_invalid', 'extension');
    this.name = 'UrlValidationError';
  }
}

export class AtomicWriteError extends PortwiseError {
  constructor(message: string) {
    super(message, 'atomic_write_failed', 'extension');
    this.name = 'AtomicWriteError';
  }
}
