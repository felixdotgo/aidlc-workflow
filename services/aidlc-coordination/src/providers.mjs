const required = (value, message) => { if (!value) throw new Error(message); return value; };
const providerRequest = (provider, reference, operation, payload = {}) => {
  if (provider === "jira") {
    const baseUrl = required(process.env.JIRA_BASE_URL, "JIRA_BASE_URL is required"); const token = required(process.env.JIRA_TOKEN, "JIRA_TOKEN is required");
    return { url: `${baseUrl.replace(/\/$/, "")}/rest/api/3/issue/${encodeURIComponent(reference)}${operation === "comment" ? "/comment" : ""}`, method: operation === "get" ? "GET" : "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: operation === "comment" ? { body: payload.comment } : payload };
  }
  if (provider === "trello") {
    const key = required(process.env.TRELLO_KEY, "TRELLO_KEY is required"); const token = required(process.env.TRELLO_TOKEN, "TRELLO_TOKEN is required");
    return { url: `https://api.trello.com/1/cards/${encodeURIComponent(reference)}?key=${encodeURIComponent(key)}&token=${encodeURIComponent(token)}`, method: operation === "get" ? "GET" : "PUT", headers: { "Content-Type": "application/json" }, body: payload };
  }
  if (provider === "github-issues") {
    const token = required(process.env.GITHUB_TOKEN, "GITHUB_TOKEN is required"); const [owner, repo, number] = reference.split("/"); if (!owner || !repo || !number) throw new Error("GitHub reference must be owner/repo/issue-number");
    return { url: `https://api.github.com/repos/${owner}/${repo}/issues/${number}${operation === "comment" ? "/comments" : ""}`, method: operation === "get" ? "GET" : operation === "comment" ? "POST" : "PATCH", headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" }, body: operation === "comment" ? { body: payload.comment } : payload };
  }
  throw new Error(`Unsupported work-item provider: ${provider}`);
};

/** Return a credential-free, auditable preflight for an external operation. */
export const providerPreflight = (provider, reference, operation, payload = {}) => {
  const request = providerRequest(provider, reference, operation, payload);
  const credentialEnv = provider === "jira" ? ["JIRA_BASE_URL", "JIRA_TOKEN"] : provider === "trello" ? ["TRELLO_KEY", "TRELLO_TOKEN"] : ["GITHUB_TOKEN"];
  return { provider, reference, operation, ready: true, credentialEnv, target: new URL(request.url).origin, payloadFields: Object.keys(payload).sort() };
};
