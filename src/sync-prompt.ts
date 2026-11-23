import "dotenv/config";
import { HappyRobotClient } from "@happyrobot-ai/sdk";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const client = new HappyRobotClient({
  apiKey: process.env.HAPPYROBOT_API_KEY!,
  cluster: "us",
});

const WORKFLOW = "ma3nwtzz0k5y"; //seleccionar wf a utilizar
const PROMPT_PERSISTENT_ID = "019d4fe0-b2ef-7ee7-bc6b-076e8aa618e9"; // imagen de referencia en readme
const PROMPT_FILE = "prompts/chatbot-agent.prompt.md";

// Mismo formato que guarda la UI: un solo párrafo con todo el markdown como texto.
function mdToRichText(md: string) {
  return [{ type: "paragraph", children: [{ text: md }] }];
}

function richTextToMd(rich: unknown): string {
  if (!Array.isArray(rich)) return "";
  return rich
    .map((p: { children?: { text?: string }[] }) =>
      (p.children ?? []).map((c) => c.text ?? "").join("")
    )
    .join("\n");
}

async function main() {
  const mode = process.argv[2];
  if (mode !== "dump" && mode !== "apply") {
    throw new Error("Usa: npm run dump   o   npm run apply");
  }

  const listed = await client.branches.list(WORKFLOW);
  const development = listed.find((b) => b.name === "development-branch");
  if (!development) throw new Error("No está development-branch");

  let branchId = process.env.FORK_BRANCH_ID;

  if (!branchId) {
    if (mode === "apply") {
      throw new Error("Falta FORK_BRANCH_ID en .env. Corre dump primero.");
    }
    const fork = await client.branches.fork(development.id, {
      name: `prompt-refactor-${new Date().toISOString().slice(0, 10)}`,
    });
    branchId = fork.id;
    console.log("Fork creado. Pega esto en .env:");
    console.log(`FORK_BRANCH_ID=${fork.id}`);
  }

  const branch = await client.branches.get(branchId);
  const promptNode = branch.nodes.find(
    (n) => n.type === "prompt" && n.persistent_id === PROMPT_PERSISTENT_ID
  );
  if (!promptNode) throw new Error("No está el nodo Prompt en esta branch");

  if (mode === "dump") {
    const md = String((promptNode as { prompt_md?: string }).prompt_md ?? "");
    if (!md) {
      console.log(JSON.stringify(promptNode, null, 2));
      throw new Error("No pude leer prompt_md");
    }
    const richMd = richTextToMd((promptNode as { prompt?: unknown }).prompt);
    if (richMd.trim() !== md.trim()) {
      console.warn("⚠️  prompt (lo que ve la UI) y prompt_md difieren; se usa prompt_md. El próximo apply los alinea.");
    }
    writeFileSync(PROMPT_FILE, md, "utf8");
    console.log(`Escrito ${PROMPT_FILE}. Edítalo y corre: npm run apply`);
    return;
  }

  if (!existsSync(PROMPT_FILE)) {
    throw new Error(`No existe ${PROMPT_FILE}. Corre npm run dump`);
  }

  const promptMd = readFileSync(PROMPT_FILE, "utf8").replace(/\r\n/g, "\n");


  await client.branches.applyOperation(branchId, {
    op: {
      type: "promptUpdated",
      nodeId: PROMPT_PERSISTENT_ID,
      update: { prompt: mdToRichText(promptMd), prompt_md: promptMd },
    },
    expected_node_counters: branch.node_counters,
  });

  await client.branches.commit(branchId, {
    message: "Refactor Chatbot Agent prompt from repo",
  });

  // Verificación: relee la branch y confirma que AMBOS campos quedaron iguales.
  const after = await client.branches.get(branchId);
  const saved = after.nodes.find(
    (n) => n.type === "prompt" && n.persistent_id === PROMPT_PERSISTENT_ID
  ) as { prompt?: unknown; prompt_md?: string } | undefined;
  const mdOk = (saved?.prompt_md ?? "").trim() === promptMd.trim();
  const richOk = richTextToMd(saved?.prompt).trim() === promptMd.trim();
  if (!mdOk || !richOk) {
    throw new Error(
      `Verificación falló (prompt_md ok=${mdOk}, prompt ok=${richOk}). La UI no reflejará el cambio.`
    );
  }

  console.log("Commit en", branchId, "— prompt y prompt_md verificados. No se publicó ni se desplegó.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
