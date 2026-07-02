import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EchoSuppressor } from "../echo-suppressor.ts";

describe("EchoSuppressor", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("consumes a matching echo exactly once", () => {
    const echo = new EchoSuppressor();
    echo.expect("t1", "hello");
    expect(echo.consume("t1", "hello")).toBe(true);
    expect(echo.consume("t1", "hello")).toBe(false); // already consumed
  });

  it("does not suppress a different message on the same thread", () => {
    const echo = new EchoSuppressor();
    echo.expect("t1", "hello");
    expect(echo.consume("t1", "world")).toBe(false);
    expect(echo.consume("t1", "hello")).toBe(true); // untouched by the miss
  });

  it("scopes suppression per thread", () => {
    const echo = new EchoSuppressor();
    echo.expect("t1", "hi");
    expect(echo.consume("t2", "hi")).toBe(false);
  });

  it("expires entries after the TTL window", () => {
    const echo = new EchoSuppressor();
    echo.expect("t1", "hello");
    vi.advanceTimersByTime(15_001);
    expect(echo.consume("t1", "hello")).toBe(false);
  });

  it("handles duplicate identical sends (two echoes expected)", () => {
    const echo = new EchoSuppressor();
    echo.expect("t1", "ok");
    echo.expect("t1", "ok");
    expect(echo.consume("t1", "ok")).toBe(true);
    expect(echo.consume("t1", "ok")).toBe(true);
    expect(echo.consume("t1", "ok")).toBe(false);
  });
});
