/**
 * fetchNodes must send the user's token: command-center's GET /admin/nodes requires a JWT
 * and answers 401 without one, which used to leave the chat's node picker empty.
 */

import { fetchNodes } from "@/lib/api";

const NODE = {
  node_id: "n1",
  room: "kitchen",
  user: "default",
  voice_mode: "brief",
  household_id: "h1",
};

describe("fetchNodes", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("sends the access token as a bearer header", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => [NODE] });
    global.fetch = fetchMock as unknown as typeof fetch;

    const nodes = await fetchNodes("tok-123");

    expect(fetchMock).toHaveBeenCalledWith("/api/cc/admin/nodes", {
      headers: { Authorization: "Bearer tok-123" },
    });
    expect(nodes).toEqual([NODE]);
  });

  it("returns an empty list when the request is rejected", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 }) as unknown as typeof fetch;

    await expect(fetchNodes("expired")).resolves.toEqual([]);
  });
});
