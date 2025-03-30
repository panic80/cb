// Removed unused React import

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

import { parseApiResponse } from "../../utils/chatUtils";
import {
  createPrompt,
  getGenerationConfig,
  callGeminiViaProxy,
  callGeminiViaSDK,
  sendToGemini,
} from "../gemini";

// Mock the GoogleGenerativeAI module
vi.mock("@google/generative-ai", () => {
  const generativeContentMock = {
    response: {
      text: vi
        .fn()
        .mockReturnValue(
          "Reference: Section 1.1\nQuote: This is a quote\nAnswer: Test answer\nReason: Test reason"
        ),
    },
  };

  const generateContentMock = vi.fn().mockResolvedValue(generativeContentMock);

  const getGenerativeModelMock = vi.fn().mockReturnValue({
    generateContent: generateContentMock,
  });

  return {
    GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
      getGenerativeModel: getGenerativeModelMock,
    })),
  };
});

// Mock the chatUtils module
vi.mock("../../utils/chatUtils", () => ({
  parseApiResponse: vi.fn().mockImplementation((text, isSimplified) => ({
    text: isSimplified ? "Simple response" : "Detailed response with reason",
    sources: [{ text: "This is a quote", reference: "Section 1.1" }],
  })),
}));

// Mock global fetch
global.fetch = vi.fn();

describe("gemini module", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    // Setup fetch mock
    global.fetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: "Reference: Section 1.1\nQuote: This is a quote\nAnswer: Test answer\nReason: Test reason",
                },
              ],
            },
          },
        ],
      }),
    });

    // Mock import.meta.env
    vi.stubGlobal("import.meta", {
      env: {
        VITE_GEMINI_API_KEY: "test-api-key",
        DEV: true,
      },
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("createPrompt", () => {
    it("should create a simplified prompt when isSimplified is true", () => {
      const prompt = createPrompt("Test question", true, "Test instructions");

      expect(prompt).toContain("Test question");
      expect(prompt).toContain("Test instructions");
      expect(prompt).toContain(
        "Answer: <provide a concise answer in no more than two sentences>"
      );
      expect(prompt).not.toContain("Reason:");
    });

    it("should create a detailed prompt when isSimplified is false", () => {
      const prompt = createPrompt("Test question", false, "Test instructions");

      expect(prompt).toContain("Test question");
      expect(prompt).toContain("Test instructions");
      expect(prompt).toContain(
        "Answer: <provide a succinct one-sentence reply>"
      );
      expect(prompt).toContain("Reason: <provide a comprehensive explanation");
    });
  });

  describe("getGenerationConfig", () => {
    it("should return the expected configuration", () => {
      const config = getGenerationConfig();

      expect(config).toEqual({
        temperature: 0.1,
        topP: 0.1,
        topK: 1,
        maxOutputTokens: 2048,
      });
    });
  });

  /* Commenting out tests for deprecated client-side proxy call
  describe("callGeminiViaProxy", () => {
    it("should call the proxy endpoint correctly", async () => {
      const result = await callGeminiViaProxy(
        "Test question",
        false,
        "models/gemini-2.0-flash-001",
        "Test instructions"
      );

      // Check that fetch was called with the right URL
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/gemini/generateContent?key=test-api-key",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
        })
      );

      // Check that the body contains the expected data
      const requestBody = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(requestBody.model).toBe("gemini-2.0-flash");
      expect(requestBody.prompt).toContain("Test question");
      expect(requestBody.generationConfig).toEqual(getGenerationConfig());

      // Check that the response is processed correctly
      expect(parseApiResponse).toHaveBeenCalledWith(
        "Reference: Section 1.1\nQuote: This is a quote\nAnswer: Test answer\nReason: Test reason",
        false
      );
      expect(result).toEqual({
        text: "Detailed response with reason",
        sources: [{ text: "This is a quote", reference: "Section 1.1" }],
      });
    });

    it("should handle API errors", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      await expect(
        callGeminiViaProxy(
          "Test question",
          false,
          "models/gemini-2.0-flash-001",
          "Test instructions"
        )
      ).rejects.toThrow(
        "Failed to fetch from Gemini API: 500 Internal Server Error"
      );
    });

    it("should handle invalid response format", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          // Invalid format without candidates
          result: "something else",
        }),
      });

      await expect(
        callGeminiViaProxy(
          "Test question",
          false,
          "models/gemini-2.0-flash-001",
          "Test instructions"
        )
      ).rejects.toThrow("Invalid response format from Gemini API");
    });
  */

  describe("callGeminiViaSDK", () => {
    it("should call the Google Generative AI SDK correctly", async () => {
      const { GoogleGenerativeAI } = await import("@google/generative-ai");

      const result = await callGeminiViaSDK(
        "Test question",
        true,
        "models/gemini-2.0-flash-001",
        "Test instructions"
      );

      // Check that SDK was initialized correctly
      expect(GoogleGenerativeAI).toHaveBeenCalledWith("test-api-key");

      // Check that the model was created correctly
      const mockGAI = GoogleGenerativeAI.mock.results[0].value;
      expect(mockGAI.getGenerativeModel).toHaveBeenCalledWith({
        model: "gemini-2.0-flash",
      });

      // Check that generateContent was called with the right parameters
      const mockModel = mockGAI.getGenerativeModel.mock.results[0].value;
      expect(mockModel.generateContent).toHaveBeenCalledWith(
        expect.stringContaining("Test question"),
        getGenerationConfig()
      );

      // Check that the response is processed correctly
      expect(parseApiResponse).toHaveBeenCalledWith(
        "Reference: Section 1.1\nQuote: This is a quote\nAnswer: Test answer\nReason: Test reason",
        true
      );

      expect(result).toEqual({
        text: "Simple response",
        sources: [{ text: "This is a quote", reference: "Section 1.1" }],
      });
    });
  });

  describe("sendToGemini", () => {
    it("should throw an error if instructions are not provided", async () => {
      await expect(sendToGemini("Test question")).rejects.toThrow(
        "Travel instructions not loaded"
      );
    });

    it("should use the proxy in development mode", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});

      const spy = vi.spyOn(global, "callGeminiViaProxy").mockResolvedValue({
        text: "Proxy response",
        sources: [],
      });

      const result = await sendToGemini(
        "Test question",
        false,
        "models/gemini-2.0-flash-001",
        "Test instructions"
      );

      expect(spy).toHaveBeenCalled();
      expect(result).toEqual({ text: "Proxy response", sources: [] });
    });

    it("should fallback to SDK if proxy fails", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});

      const proxySpy = vi
        .spyOn(global, "callGeminiViaProxy")
        .mockRejectedValue(new Error("Proxy error"));
      const sdkSpy = vi.spyOn(global, "callGeminiViaSDK").mockResolvedValue({
        text: "SDK response",
        sources: [],
      });

      const result = await sendToGemini(
        "Test question",
        false,
        "models/gemini-2.0-flash-001",
        "Test instructions"
      );

      expect(proxySpy).toHaveBeenCalled();
      expect(sdkSpy).toHaveBeenCalled();
      expect(result).toEqual({ text: "SDK response", sources: [] });
    });

    it("should use SDK directly in production mode", async () => {
      // Set to production mode
      vi.stubGlobal("import.meta", {
        env: {
          VITE_GEMINI_API_KEY: "test-api-key",
          DEV: false,
        },
      });

      const proxySpy = vi.spyOn(global, "callGeminiViaProxy");
      const sdkSpy = vi.spyOn(global, "callGeminiViaSDK").mockResolvedValue({
        text: "SDK response",
        sources: [],
      });

      const result = await sendToGemini(
        "Test question",
        false,
        "models/gemini-2.0-flash-001",
        "Test instructions"
      );

      expect(proxySpy).not.toHaveBeenCalled();
      expect(sdkSpy).toHaveBeenCalled();
      expect(result).toEqual({ text: "SDK response", sources: [] });
    });
  });
});
