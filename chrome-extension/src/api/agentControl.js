import client from "./client";

export function resetAgentData() {
  return client.post("http://127.0.0.1:18565/agentsync/resetData", {}, {});
}
