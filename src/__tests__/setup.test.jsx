// Removed unused React import

import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

// A simple component to test
function TestComponent() {
  return <div>Test Component</div>;
}

describe("Testing Setup", () => {
  it("should render a test component", () => {
    render(<TestComponent />);
    expect(screen.getByText("Test Component")).toBeInTheDocument();
  });

  it("should pass a simple test", () => {
    expect(1 + 1).toBe(2);
  });
});
