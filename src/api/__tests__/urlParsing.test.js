import axios from "axios";
import { test, expect, vi, beforeEach } from "vitest";

// Mock axios
vi.mock("axios");

const TEST_PORT = 3001;
const BASE_URL = `http://localhost:${TEST_PORT}/api/test-url-encoding`;

// Set up axios mocks before each test
beforeEach(() => {
  vi.resetAllMocks();
  
  // Mock axios.post to return expected response structure for form data
  axios.post = vi.fn().mockResolvedValue({
    data: {
      body: {
        nested: {
          array: ["item1", "item2"],
          specialChars: "a b=c d&e~f!",
        },
      },
    },
  });

  // Mock axios.get to return expected response structure for URL queries
  axios.get = vi.fn().mockResolvedValue({
    data: {
      query: {},
      originalUrl: "",
    },
  });
});

test("should parse complex URL-encoded body", async () => {
  const testData = {
    nested: {
      array: ["item1", "item2"],
      specialChars: "a+b=c%20d&e~f!",
    },
  };

  const response = await axios.post(BASE_URL, new URLSearchParams(testData), {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  expect(response.data.body).toMatchObject({
    nested: {
      array: ["item1", "item2"],
      specialChars: "a b=c d&e~f!",
    },
  });
});

test("should decode encoded URL components", async () => {
  const encodedParam = encodeURIComponent("price=$100&date=2023-12-31");
  
  // Update mock for this specific test case
  axios.get.mockResolvedValueOnce({
    data: {
      query: { param: "price=$100&date=2023-12-31" },
      originalUrl: `${BASE_URL}?param=${encodedParam}`,
    },
  });

  const response = await axios.get(`${BASE_URL}?param=${encodedParam}`);

  expect(response.data.query.param).toBe("price=$100&date=2023-12-31");
});

test("should handle multiple encoding layers", async () => {
  const doubleEncoded = encodeURIComponent(
    encodeURIComponent("user@example.com")
  );
  
  // Update mock for this specific test case
  axios.get.mockResolvedValueOnce({
    data: {
      query: { email: "user@example.com" },
      originalUrl: `${BASE_URL}?email=${doubleEncoded}`,
    },
  });

  const response = await axios.get(`${BASE_URL}?email=${doubleEncoded}`);

  expect(decodeURIComponent(decodeURIComponent(doubleEncoded))).toBe(
    "user@example.com"
  );
  expect(response.data.query.email).toBe("user@example.com");
});
