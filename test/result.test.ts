// Tests for Result type utilities
import { describe, expect, it } from "vitest";
import {
  andThen,
  combine,
  err,
  fromPromise,
  isErr,
  isOk,
  map,
  mapAsync,
  mapErr,
  ok,
  type Result,
  toPromise,
  unwrap,
  unwrapOr,
} from "../src/result.ts";

describe("Result Type", () => {
  describe("Constructors", () => {
    it("should create Ok result", () => {
      const result = ok(42);
      expect(result.success).toBe(true);
      expect(result.data).toBe(42);
    });

    it("should create Err result", () => {
      const error = new Error("test error");
      const result = err(error);
      expect(result.success).toBe(false);
      expect(result.error).toBe(error);
    });
  });

  describe("Type Guards", () => {
    it("should identify Ok results", () => {
      const result = ok(42);
      expect(isOk(result)).toBe(true);
      expect(isErr(result)).toBe(false);
    });

    it("should identify Err results", () => {
      const result = err(new Error("test"));
      expect(isOk(result)).toBe(false);
      expect(isErr(result)).toBe(true);
    });
  });

  describe("Unwrapping", () => {
    it("should unwrap Ok result", () => {
      const result = ok(42);
      expect(unwrap(result)).toBe(42);
    });

    it("should throw when unwrapping Err result", () => {
      const error = new Error("test error");
      const result = err(error);
      expect(() => unwrap(result)).toThrow("test error");
    });

    it("should unwrap with default value", () => {
      const okResult = ok(42);
      const errResult = err(new Error("test"));

      expect(unwrapOr(okResult, 0)).toBe(42);
      expect(unwrapOr(errResult, 0)).toBe(0);
    });
  });

  describe("Mapping", () => {
    it("should map Ok result", () => {
      const result = ok<number>(5);
      const mapped = map(result, (x: number) => x * 2);

      expect(isOk(mapped)).toBe(true);
      if (isOk(mapped)) {
        expect(mapped.data).toBe(10);
      }
    });

    it("should not map Err result", () => {
      const error = new Error("test");
      const result = err(error);
      const mapped = map(result, (x: number) => x * 2);

      expect(isErr(mapped)).toBe(true);
      if (isErr(mapped)) {
        expect(mapped.error).toBe(error);
      }
    });

    it("should map error in Err result", () => {
      const result = err("original error");
      const mapped = mapErr(result, (e) => new Error(`Wrapped: ${e}`));

      expect(isErr(mapped)).toBe(true);
      if (isErr(mapped)) {
        expect(mapped.error.message).toBe("Wrapped: original error");
      }
    });

    it("should not map error in Ok result", () => {
      const result = ok(42);
      const mapped = mapErr(result, (e) => new Error(`Wrapped: ${e}`));

      expect(isOk(mapped)).toBe(true);
      if (isOk(mapped)) {
        expect(mapped.data).toBe(42);
      }
    });
  });

  describe("Chaining", () => {
    it("should chain Ok results", () => {
      const result = ok<number>(5);
      const chained = andThen(result, (x: number) => ok(x * 2));

      expect(isOk(chained)).toBe(true);
      if (isOk(chained)) {
        expect(chained.data).toBe(10);
      }
    });

    it("should not chain Err results", () => {
      const error = new Error("test");
      const result = err(error);
      const chained = andThen(result, (x: number) => ok(x * 2));

      expect(isErr(chained)).toBe(true);
      if (isErr(chained)) {
        expect(chained.error).toBe(error);
      }
    });

    it("should handle failure in chain", () => {
      const result = ok(5);
      const chainError = new Error("chain failed");
      const chained = andThen(result, (_) => err(chainError));

      expect(isErr(chained)).toBe(true);
      if (isErr(chained)) {
        expect(chained.error).toBe(chainError);
      }
    });
  });

  describe("Promise Integration", () => {
    it("should convert successful promise to Ok result", async () => {
      const promise = Promise.resolve(42);
      const result = await fromPromise(promise);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data).toBe(42);
      }
    });

    it("should convert failed promise to Err result", async () => {
      const error = new Error("promise failed");
      const promise = Promise.reject(error);
      const result = await fromPromise(promise);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe(error);
      }
    });

    it("should convert Ok result to successful promise", async () => {
      const result = ok(42);
      const value = await toPromise(result);
      expect(value).toBe(42);
    });

    it("should convert Err result to failed promise", async () => {
      const error = new Error("test error");
      const result = err(error);

      await expect(toPromise(result)).rejects.toBe(error);
    });
  });

  describe("Async Mapping", () => {
    it("should map Ok result with async function", async () => {
      const result = ok<number>(5);
      const mapped = await mapAsync(result, async (x: number) => x * 2);

      expect(isOk(mapped)).toBe(true);
      if (isOk(mapped)) {
        expect(mapped.data).toBe(10);
      }
    });

    it("should not map Err result with async function", async () => {
      const error = new Error("test");
      const result = err(error);
      const mapped = await mapAsync(result, async (x: number) => x * 2);

      expect(isErr(mapped)).toBe(true);
      if (isErr(mapped)) {
        expect(mapped.error).toBe(error);
      }
    });

    it("should handle async function errors", async () => {
      const result = ok(5);
      const asyncError = new Error("async error");
      const mapped = await mapAsync(result, async (_) => {
        throw asyncError;
      });

      expect(isErr(mapped)).toBe(true);
      if (isErr(mapped)) {
        expect(mapped.error).toBe(asyncError);
      }
    });
  });

  describe("Combining Results", () => {
    it("should combine successful results", () => {
      const results = [ok(1), ok(2), ok(3)] as const;
      const combined = combine(results);

      expect(isOk(combined)).toBe(true);
      if (isOk(combined)) {
        expect(combined.data).toEqual([1, 2, 3]);
      }
    });

    it("should fail if any result is Err", () => {
      const error = new Error("test error");
      const results = [ok(1), err(error), ok(3)] as const;
      const combined = combine(results);

      expect(isErr(combined)).toBe(true);
      if (isErr(combined)) {
        expect(combined.error).toBe(error);
      }
    });

    it("should return first error when multiple failures", () => {
      const error1 = new Error("first error");
      const error2 = new Error("second error");
      const results = [ok(1), err(error1), err(error2)] as const;
      const combined = combine(results);

      expect(isErr(combined)).toBe(true);
      if (isErr(combined)) {
        expect(combined.error).toBe(error1);
      }
    });
  });

  describe("Type Safety", () => {
    it("should maintain type safety with different data types", () => {
      const stringResult: Result<string, Error> = ok("hello");
      const numberResult: Result<number, Error> = ok(42);
      const booleanResult: Result<boolean, Error> = ok(true);

      expect(isOk(stringResult) && stringResult.data).toBe("hello");
      expect(isOk(numberResult) && numberResult.data).toBe(42);
      expect(isOk(booleanResult) && booleanResult.data).toBe(true);
    });

    it("should handle custom error types", () => {
      class CustomError {
        constructor(
          public code: number,
          public message: string,
        ) {}
      }

      const result: Result<string, CustomError> = err(
        new CustomError(404, "Not found"),
      );

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe(404);
        expect(result.error.message).toBe("Not found");
      }
    });
  });
});
