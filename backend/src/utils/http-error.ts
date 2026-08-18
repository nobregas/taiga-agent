export class HttpError extends Error {
  readonly status: number;

  constructor(message: string, status = 500, options?: ErrorOptions) {
    super(message, options);
    this.name = 'HttpError';
    this.status = status;
  }
}
