// Minimal additional coverage for edge cases
import { describe, expect, it } from "vitest";
import {
  ModbusCRCError,
  ModbusFrameError,
  ModbusLRCError,
} from "../src/errors.ts";

describe("Final Coverage", () => {
  describe("Error handling edge cases", () => {
    it("should exercise more error paths", async () => {
      // Create instances to exercise constructors
      const frameError = new ModbusFrameError("Test frame error");
      expect(frameError.message).toBe("Frame error: Test frame error");

      const crcError = new ModbusCRCError();
      expect(crcError.message).toBe("CRC error");

      const lrcError = new ModbusLRCError();
      expect(lrcError.message).toBe("LRC error");
    });
  });
});
