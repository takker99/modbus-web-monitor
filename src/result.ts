// Result type for better error handling
// Provides a functional approach to error handling without throwing exceptions

export type Result<T, E = Error> = Ok<T> | Err<E>;

export interface Ok<T> {
  readonly success: true;
  readonly data: T;
}

export interface Err<E> {
  readonly success: false;
  readonly error: E;
}

// Constructors
export function ok<T>(data: T): Ok<T> {
  return { data, success: true };
}

export function err<E>(error: E): Err<E> {
  return { error, success: false };
}

// Type guards
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.success;
}

export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.success;
}

// Utility functions
export function unwrap<T, E>(result: Result<T, E>): T {
  if (isOk(result)) {
    return result.data;
  }
  throw result.error;
}

export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  return isOk(result) ? result.data : defaultValue;
}

export function map<T, U, E>(
  result: Result<T, E>,
  fn: (data: T) => U,
): Result<U, E> {
  return isOk(result) ? ok(fn(result.data)) : result;
}

export function mapErr<T, E, F>(
  result: Result<T, E>,
  fn: (error: E) => F,
): Result<T, F> {
  return isErr(result) ? err(fn(result.error)) : result;
}

export function andThen<T, U, E>(
  result: Result<T, E>,
  fn: (data: T) => Result<U, E>,
): Result<U, E> {
  return isOk(result) ? fn(result.data) : result;
}

// Convert Promise<T> to Promise<Result<T, Error>>
export async function fromPromise<T>(
  promise: Promise<T>,
): Promise<Result<T, Error>> {
  try {
    const data = await promise;
    return ok(data);
  } catch (error) {
    return err(error as Error);
  }
}

// Convert Result<T, E> to Promise<T>
export function toPromise<T, E>(result: Result<T, E>): Promise<T> {
  return isOk(result)
    ? Promise.resolve(result.data)
    : Promise.reject(result.error);
}

// Combine multiple results
export function combine<T extends readonly unknown[], E>(
  results: { [K in keyof T]: Result<T[K], E> },
): Result<T, E> {
  const values: unknown[] = [];

  for (const result of results) {
    if (isErr(result)) {
      return result;
    }
    values.push(result.data);
  }

  return ok(values as unknown as T);
}

// Async version of map
export async function mapAsync<T, U, E>(
  result: Result<T, E>,
  fn: (data: T) => Promise<U>,
): Promise<Result<U, E>> {
  if (isErr(result)) {
    return result;
  }

  try {
    const data = await fn(result.data);
    return ok(data);
  } catch (error) {
    return err(error as E);
  }
}
