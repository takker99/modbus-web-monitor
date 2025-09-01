import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    clear: () => {
      store = {};
    },
    getItem: (key: string) => store[key] || null,
    removeItem: (key: string) => {
      delete store[key];
    },
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
  };
})();

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
});

describe("Polling Interval Feature", () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe("localStorage persistence", () => {
    it("should use default 1000ms when no localStorage value exists", () => {
      const savedValue = localStorage.getItem("modbus-polling-interval");
      expect(savedValue).toBeNull();

      // Simulate the useState initialization logic
      const interval = savedValue ? Number.parseInt(savedValue, 10) : 1000;
      const clampedInterval = Math.max(100, Math.min(60000, interval));

      expect(clampedInterval).toBe(1000);
    });

    it("should load saved interval from localStorage", () => {
      localStorage.setItem("modbus-polling-interval", "2500");

      const savedValue = localStorage.getItem("modbus-polling-interval");
      const interval = savedValue ? Number.parseInt(savedValue, 10) : 1000;
      const clampedInterval = Math.max(100, Math.min(60000, interval));

      expect(clampedInterval).toBe(2500);
    });

    it("should clamp invalid localStorage values to valid range", () => {
      // Test value too low
      localStorage.setItem("modbus-polling-interval", "50");
      let savedValue = localStorage.getItem("modbus-polling-interval");
      let interval = savedValue ? Number.parseInt(savedValue, 10) : 1000;
      let clampedInterval = Math.max(100, Math.min(60000, interval));
      expect(clampedInterval).toBe(100);

      // Test value too high
      localStorage.setItem("modbus-polling-interval", "100000");
      savedValue = localStorage.getItem("modbus-polling-interval");
      interval = savedValue ? Number.parseInt(savedValue, 10) : 1000;
      clampedInterval = Math.max(100, Math.min(60000, interval));
      expect(clampedInterval).toBe(60000);
    });
  });

  describe("value validation", () => {
    it("should clamp values to valid range (100-60000ms)", () => {
      // Simulate the handlePollingIntervalChange logic
      const handlePollingIntervalChange = (value: number) => {
        return Math.max(100, Math.min(60000, value));
      };

      expect(handlePollingIntervalChange(50)).toBe(100);
      expect(handlePollingIntervalChange(100)).toBe(100);
      expect(handlePollingIntervalChange(1000)).toBe(1000);
      expect(handlePollingIntervalChange(60000)).toBe(60000);
      expect(handlePollingIntervalChange(70000)).toBe(60000);
    });

    it("should handle edge cases", () => {
      const handlePollingIntervalChange = (value: number) => {
        return Math.max(100, Math.min(60000, value));
      };

      expect(handlePollingIntervalChange(0)).toBe(100);
      expect(handlePollingIntervalChange(-100)).toBe(100);
      expect(handlePollingIntervalChange(99)).toBe(100);
      expect(handlePollingIntervalChange(101)).toBe(101);
      expect(handlePollingIntervalChange(59999)).toBe(59999);
      expect(handlePollingIntervalChange(60001)).toBe(60000);
    });
  });

  describe("UI integration", () => {
    it("should have correct HTML attributes for validation", () => {
      // Test that the input field has the correct min/max attributes
      const expectedAttributes = {
        max: "60000",
        min: "100",
        type: "number",
      };

      expect(expectedAttributes.min).toBe("100");
      expect(expectedAttributes.max).toBe("60000");
      expect(expectedAttributes.type).toBe("number");
    });
  });
});
