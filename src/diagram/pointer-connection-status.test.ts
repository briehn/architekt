import { describe, expect, it } from "vitest";

import {
  getPendingPointerConnectionStatus,
  getPointerConnectionSuccessAnnouncement,
} from "./architecture-editor";

describe("pointer connection feedback", () => {
  it("describes the pending source and successful canonical direction", () => {
    expect(getPendingPointerConnectionStatus("Service")).toBe(
      "Connecting from Service. Choose a destination.",
    );
    expect(getPointerConnectionSuccessAnnouncement("Service", "Cache")).toBe(
      "Connected Service to Cache.",
    );
  });
});
