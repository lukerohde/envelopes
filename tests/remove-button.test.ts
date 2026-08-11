import { afterEach, describe, expect, it, vi } from "vitest";
import { confirmRemove } from "../src/ui/remove-button";

describe("delete confirmation", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks the browser before deleting a named row", () => {
    const confirm = vi.fn().mockReturnValue(true);
    vi.stubGlobal("window", { confirm });

    expect(confirmRemove("mortgage")).toBe(true);
    expect(confirm).toHaveBeenCalledWith("Are you sure you want to delete “mortgage”?");
  });

  it("passes through a cancellation", () => {
    vi.stubGlobal("window", { confirm: vi.fn().mockReturnValue(false) });
    expect(confirmRemove("mortgage")).toBe(false);
  });
});
