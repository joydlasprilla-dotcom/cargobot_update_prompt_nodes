import "dotenv/config";
import { HappyRobotClient } from "@happyrobot-ai/sdk";
import { createInterface } from "node:readline/promises";

// Comandos de "salida a otros ambientes". sync-prompt.ts (dump/apply) NO cambia.
//   npm run inspect                              -> solo lectura
//   npm run pr -- [--target <branch>] [--title "..."]   -> abre PR (fork -> target)
//   npm run merge -- <numero|id del PR>          -> mergea (pide confirmación)
//   npm run deploy -- --env <production|staging|development>  -> simula (dry-run)
//   npm run deploy -- --env production --confirm -> despliega (pide confirmación)

const WORKFLOW = "ma3nwtzz0k5y";
const DEFAULT_TARGET_BRANCH = "development-branch";

const client = new HappyRobotClient({
  apiKey: process.env.HAPPYROBOT_API_KEY!,
  cluster: "us",
});

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : "true";
}

async function confirm(expected: string, why: string) {
  console.log(`\n⚠️  ${why}`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`Escribe "${expected}" para continuar: `)).trim();
  rl.close();
  if (answer !== expected) throw new Error("Cancelado: la confirmación no coincide.");
}

async function branchByName(name: string) {
  const branches = await client.branches.list(WORKFLOW);
  const b = branches.find((x) => x.name === name);
  if (!b) {
    throw new Error(
      `No existe la branch "${name}". Disponibles: ${branches.map((x) => x.name).join(", ")}`
    );
  }
  return b;
}

async function whoami() {
  const key = await client.apiKey.describe();
  console.log("== API KEY ==");
  console.log(`nombre: ${key.name}`);
  console.log(`termina en: ...${key.lastFour}`);
  console.log(`org de la key: ${key.orgId}`);
  console.log(`expira: ${key.expiresAt ?? "nunca"} | revocada: ${key.revokedAt ?? "no"}`);

  const branches = await client.branches.list(WORKFLOW);
  const first = branches[0];
  if (!first) throw new Error(`El workflow ${WORKFLOW} no tiene branches visibles con esta key.`);
  const state = await client.branches.getState(first.id);
  console.log("\n== WORKFLOW CONFIGURADO ==");
  console.log(`slug: ${WORKFLOW}`);
  console.log(`org del workflow: ${state.org_id}`);
  console.log(
    state.org_id === key.orgId
      ? "\n✅ La key y el workflow son de la MISMA organización."
      : "\n❌ La key y el workflow son de organizaciones DISTINTAS. No continúes."
  );
}

async function inspect() {
  const branches = await client.branches.list(WORKFLOW);
  console.log("\n== BRANCHES ==");
  for (const b of branches) {
    const s = await client.branches.getState(b.id);
    console.log(
      `- ${b.name}\n    id: ${b.id}\n    head: ${b.head_commit}\n    protegida: ${s.protected} | exige PR: ${s.requires_pull_request} | ambientes: [${s.deployment_environments.join(", ")}]`
    );
  }

  console.log("\n== DEPLOYMENT TARGETS (ambientes) ==");
  const { targets } = await client.deploymentTargets.list(WORKFLOW);
  for (const t of targets) {
    console.log(
      `- ${t.environment ?? "(custom)"} -> branch: ${t.branch_name} | head: ${t.head_commit_id}\n    id: ${t.id}\n    último deploy: ${t.latest ? `${t.latest.name} [${t.latest.status}]` : "ninguno"}`
    );
  }

  console.log("\n== PULL REQUESTS ==");
  const prs = await client.pullRequests.list(WORKFLOW);
  if (prs.length === 0) console.log("(ninguno)");
  for (const p of prs) {
    console.log(`- #${p.number} [${p.status}] ${p.source_branch_name} -> ${p.target_branch_name} :: ${p.title}  (id: ${p.id})`);
  }

  console.log(`\nFORK_BRANCH_ID actual: ${process.env.FORK_BRANCH_ID ?? "(no definido)"}`);
}

async function openPr() {
  const sourceId = process.env.FORK_BRANCH_ID;
  if (!sourceId) throw new Error("Falta FORK_BRANCH_ID en .env (corre npm run dump primero).");
  const target = await branchByName(flag("target") ?? DEFAULT_TARGET_BRANCH);
  if (target.id === sourceId) throw new Error("Origen y destino son la misma branch.");

  const title = flag("title") ?? "Refactor Chatbot Agent prompt";
  const pr = await client.pullRequests.create(WORKFLOW, {
    source_branch_id: sourceId,
    target_branch_id: target.id,
    title,
    description: "Actualiza prompt y prompt_md del nodo Prompt (creado desde css-prompt-sync).",
  });
  console.log(`PR #${pr.number} creado: ${pr.source_branch_name} -> ${pr.target_branch_name}`);
  console.log(`id: ${pr.id}`);

  const review = await client.pullRequests.getReviewStatus(WORKFLOW, pr.id);
  console.log("¿Se puede mergear ya?", review.can_merge);
  if (review.merge_blockers.length) console.log("Bloqueos:", review.merge_blockers);
  console.log(`Siguiente paso: npm run merge -- ${pr.number}`);
}

async function mergePr() {
  const ref = process.argv[3];
  const prs = await client.pullRequests.list(WORKFLOW);
  if (!ref) {
    console.log("Indica el PR. Abiertos:");
    for (const p of prs.filter((x) => x.status === "open")) {
      console.log(`  #${p.number} ${p.source_branch_name} -> ${p.target_branch_name} :: ${p.title}`);
    }
    throw new Error("Uso: npm run merge -- <numero|id>");
  }
  const pr = prs.find((p) => String(p.number) === ref || p.id === ref);
  if (!pr) throw new Error(`No encontré el PR "${ref}".`);
  if (pr.status !== "open") throw new Error(`El PR #${pr.number} está ${pr.status}.`);

  const review = await client.pullRequests.getReviewStatus(WORKFLOW, pr.id);
  console.log(`PR #${pr.number}: ${pr.source_branch_name} -> ${pr.target_branch_name}`);
  console.log("can_merge:", review.can_merge, "| falta aprobación:", review.missing_approval);
  if (!review.can_merge) {
    throw new Error(`No se puede mergear aún. Bloqueos: ${JSON.stringify(review.merge_blockers)}`);
  }

  await confirm("merge", `Vas a integrar "${pr.source_branch_name}" en "${pr.target_branch_name}". Esto NO despliega.`);
  const merged = await client.pullRequests.merge(WORKFLOW, pr.id);
  console.log(`Merge OK. Commit: ${merged.merged_commit_id}. No se desplegó nada.`);
}

async function deploy() {
  const env = flag("env");
  if (env !== "production" && env !== "staging" && env !== "development") {
    throw new Error("Uso: npm run deploy -- --env <production|staging|development> [--confirm]");
  }
  const { targets } = await client.deploymentTargets.list(WORKFLOW);
  const target = targets.find((t) => t.environment === env);
  if (!target) throw new Error(`No hay deployment target para "${env}".`);

  const access = await client.deploymentTargets.getDeployAccess(WORKFLOW, target.id);
  console.log(`Ambiente: ${env}`);
  console.log(`Branch que se desplegará: ${target.branch_name}`);
  console.log(`Commit HEAD a publicar: ${target.head_commit_id}`);
  console.log(`Último deploy: ${target.latest ? `${target.latest.name} [${target.latest.status}]` : "ninguno"}`);
  console.log("Acceso:", JSON.stringify(access));

  if (!access.can_deploy) throw new Error(`No puedes desplegar ahora (motivo: ${access.reason}).`);

  if (flag("confirm") !== "true") {
    console.log("\nDRY-RUN: no se desplegó nada. Repite con --confirm para desplegar.");
    return;
  }

  await confirm(env, `Vas a DESPLEGAR a ${env}. Afecta a los usuarios de ese ambiente.`);
  const result = await client.deploymentTargets.deploy(WORKFLOW, target.id);
  console.log(`Deploy iniciado: ${result.name} (commit ${result.commit_id})`);
  if (result.warnings.length) console.log("Avisos:", result.warnings);

  const { deployment } = await client.deploymentTargets.getLatestDeployment(WORKFLOW, target.id);
  console.log("Estado actual:", deployment?.status ?? "desconocido");
}

async function main() {
  const cmd = process.argv[2];
  if (cmd === "whoami") return whoami();
  if (cmd === "inspect") return inspect();
  if (cmd === "pr") return openPr();
  if (cmd === "merge") return mergePr();
  if (cmd === "deploy") return deploy();
  throw new Error("Usa: whoami | inspect | pr | merge | deploy");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
