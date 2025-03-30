import { describe, it, expect } from "vitest";

import {
  generateMessageId,
  formatText,
  parseApiResponse,
  formatDate,
  formatMessageTime,
} from "../chatUtils";

describe("chatUtils", () => {
  describe("generateMessageId", () => {
    it("should generate unique message IDs", () => {
      const id1 = generateMessageId();
      const id2 = generateMessageId();

      expect(id1).not.toEqual(id2);
      expect(id1).toContain("msg-");
      expect(typeof id1).toBe("string");
    });
  });

  describe("formatText", () => {
    it("should handle empty or null input", () => {
      expect(formatText("")).toBe("");
      expect(formatText(null)).toBe("");
      expect(formatText(undefined)).toBe("");
    });

    it("should remove empty lines and trim", () => {
      const input = `
        Line 1
        
        Line 2  
      `;
      expect(formatText(input)).toBe("Line 1\nLine 2");
    });
  });

  describe("parseApiResponse", () => {
    it("should throw error for invalid input", () => {
      expect(() => parseApiResponse("")).toThrow(
        "Invalid response format from API"
      );
      expect(() => parseApiResponse(null)).toThrow(
        "Invalid response format from API"
      );
    });

    it("should throw error when answer section is missing", () => {
      const input = "Reference: Section 1.2\nQuote: Some quote";
      expect(() => parseApiResponse(input)).toThrow(
        "Response missing required answer section"
      );
    });

    it("should parse simple response correctly", () => {
      const input =
        "Reference: Section 1.2\nQuote: Some quote\nAnswer: Simple answer";
      const expected = {
        text: "Simple answer",
        sources: [{ text: "Some quote", reference: "Section 1.2" }],
      };

      expect(parseApiResponse(input, true)).toEqual(expected);
    });

    it("should include reason for non-simplified responses", () => {
      const input =
        "Reference: Section 1.2\nQuote: Some quote\nAnswer: Simple answer\nReason: Detailed explanation";
      const expected = {
        text: "Simple answer\n\nReason: Detailed explanation",
        sources: [{ text: "Some quote", reference: "Section 1.2" }],
      };

      expect(parseApiResponse(input, false)).toEqual(expected);
    });

    it("should handle missing sources", () => {
      const input = "Answer: Simple answer";
      const expected = {
        text: "Simple answer",
        sources: [],
      };

      expect(parseApiResponse(input)).toEqual(expected);
    });
  });

  describe("formatDate", () => {
    it("should handle invalid dates", () => {
      expect(formatDate("invalid-date")).toBe("Recent");
      expect(formatDate(null)).toBe("Recent");
    });

    it('should return "Today" for current date', () => {
      const today = new Date();
      expect(formatDate(today)).toBe("Today");
    });

    it('should return "Yesterday" for yesterday', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      expect(formatDate(yesterday)).toBe("Yesterday");
    });

    it("should format other dates correctly", () => {
      // This test is more for documentation since we can't easily test
      // the exact output as it depends on the locale and date
      const pastDate = new Date("2023-01-01");
      const result = formatDate(pastDate);

      expect(typeof result).toBe("string");
      expect(result).not.toEqual("Today");
      expect(result).not.toEqual("Yesterday");
      expect(result).not.toEqual("Recent");
    });
  });

  describe("formatMessageTime", () => {
    it("should handle invalid timestamps", () => {
      expect(formatMessageTime(null)).toBe("");
      expect(formatMessageTime("invalid")).toBe("");
    });

    it("should format time correctly", () => {
      // Create a date at 10:30 AM
      const date = new Date();
      date.setHours(10, 30, 0);

      const result = formatMessageTime(date.getTime());

      // Check that it's formatted as time
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(3);
      expect(result).toMatch(/^\d{1,2}:\d{2}|^\d{1,2}[:.]\d{2}/);
    });
  });
});
