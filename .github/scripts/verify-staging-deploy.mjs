const [repository, commitSha] = process.argv.slice(2);
const token = process.env.GITHUB_TOKEN;
const apiUrl = process.env.GITHUB_API_URL ?? "https://api.github.com";

if (!repository || !commitSha || !token) {
  throw new Error("Uso: verify-staging-deploy <owner/repository> <commit-sha>, com GITHUB_TOKEN.");
}

const endpoint = new URL(`${apiUrl}/repos/${repository}/actions/workflows/deploy-staging.yml/runs`);
endpoint.searchParams.set("head_sha", commitSha);
endpoint.searchParams.set("status", "success");
endpoint.searchParams.set("per_page", "1");

const response = await fetch(endpoint, {
  headers: {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28"
  }
});

if (!response.ok) throw new Error(`Não foi possível consultar staging: HTTP ${response.status}.`);
const payload = await response.json();
if (!Array.isArray(payload.workflow_runs) || payload.workflow_runs.length === 0) {
  throw new Error(`O commit ${commitSha} ainda não possui um deploy de staging bem-sucedido.`);
}

console.log(`Staging validado para o commit ${commitSha}.`);
