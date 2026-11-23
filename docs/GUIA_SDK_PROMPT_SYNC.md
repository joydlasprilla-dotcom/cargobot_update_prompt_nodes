# Guía: sincronizar el prompt del Chatbot Agent con el SDK de HappyRobot

> Para quién es: cualquier persona del equipo (técnica o no) que necesite entender cómo un prompt escrito en un archivo del repositorio termina viéndose en la interfaz de HappyRobot, y cómo llevarlo de forma segura a otros ambientes.
>
> Nota de honestidad: los comandos `dump` y `apply` de este proyecto están probados y funcionan. Los ejemplos de las secciones 8 y 9 (pull request, merge, deploy, inspección) están escritos a partir de las definiciones de tipos del SDK `0.2.9` y **no se han ejecutado todavía**: pruébalos primero con una branch de prueba.

---

## 1. La idea en 30 segundos

HappyRobot maneja los workflows **como si fueran código en Git**:

| En Git | En HappyRobot |
|---|---|
| Repositorio | **Workflow** (se identifica por un `slug`, p. ej. `ma3nwtzz0k5y`) |
| Branch | **Branch** (p. ej. `development-branch`) |
| Archivo | **Nodo** (Trigger, Prompt, acciones…) |
| `git commit` | **commit** (sella los cambios en una branch) |
| Pull request + merge | **Pull request + merge** |
| Subir a servidor | **Deploy** a un *deployment target* (production / staging / development) |

Este proyecto es un programa pequeño (un "script") que:

1. **Descarga** el texto del prompt desde HappyRobot a un archivo local (`dump`).
2. Tú **editas** ese archivo con tu editor favorito.
3. **Sube** el archivo editado de vuelta a HappyRobot y lo deja guardado (commit) en una branch (`apply`).

**Importante:** `apply` guarda el cambio en una branch de trabajo. **No publica ni despliega nada.** Los chats/llamadas reales no cambian hasta que alguien despliegue.

---

## 2. De dónde viene cada cosa (mapa del proyecto)

```
css-prompt-sync/
├── package.json            ← "receta" del proyecto: dependencias y comandos (npm run ...)
├── package-lock.json       ← versiones exactas instaladas (no editar a mano)
├── tsconfig.json           ← reglas de TypeScript
├── .env                    ← SECRETOS: API key y FORK_BRANCH_ID   (NUNCA subir a Git)
├── .gitignore              ← lista de lo que Git ignora (node_modules y .env)
├── node_modules/           ← librerías descargadas (se regenera con `npm install`)
├── src/
│   └── sync-prompt.ts      ← EL SCRIPT. Aquí está toda la lógica
└── prompts/
    └── chatbot-agent.prompt.md   ← EL PROMPT que tú editas
```

### Qué es "npm" y dónde verlo

- **npm** es el gestor de paquetes de Node.js. Descarga librerías de terceros y ejecuta comandos definidos en `package.json`.
- Las **dependencias** que usa este proyecto (sección `dependencies` y `devDependencies` de `package.json`):

| Paquete | Para qué sirve |
|---|---|
| `@happyrobot-ai/sdk` | **El SDK oficial.** Es el "control remoto" para hablar con la API de HappyRobot desde código |
| `dotenv` | Lee el archivo `.env` y pone sus valores en `process.env` |
| `tsx` | Ejecuta archivos TypeScript directamente, sin compilar |
| `typescript`, `@types/node` | Revisión de tipos (ayuda a detectar errores al escribir código) |

- **Comandos** (sección `scripts` de `package.json`):
  - `npm run dump`  → ejecuta `tsx src/sync-prompt.ts dump`
  - `npm run apply` → ejecuta `tsx src/sync-prompt.ts apply`

### Dónde ver qué hace el SDK (documentación real)

1. **Qué versión está instalada:**
   ```bash
   npm ls --depth=0
   ```
2. **Página pública del paquete:** https://www.npmjs.com/package/@happyrobot-ai/sdk
3. **README del SDK, ya descargado en tu máquina:** `node_modules/@happyrobot-ai/sdk/README.md`
4. **Los "contratos" exactos (qué métodos existen y qué datos aceptan)** están en archivos `.d.ts`:
   - `node_modules/@happyrobot-ai/sdk/resources/branches.d.ts` → métodos de branches (`fork`, `commit`, `applyOperation`…)
   - `node_modules/@happyrobot-ai/sdk/resources/pull-requests.d.ts` → pull requests y `merge`
   - `node_modules/@happyrobot-ai/sdk/resources/deployment-targets.d.ts` → `deploy` y ambientes
   - `node_modules/@happyrobot-ai/sdk/types/version-control.types.d.ts` → todas las operaciones y tipos de datos
5. **A dónde se conecta realmente:** `https://platform.happyrobot.ai/api/v2` (cluster `us`) o `https://platform.eu.happyrobot.ai/api/v2` (cluster `eu`), autenticando con `Authorization: Bearer <API_KEY>`. El SDK solo es una capa cómoda sobre esa API.

> Consejo: cuando dudes de si algo "se puede hacer" con el SDK, busca en esos `.d.ts`. Si el método no está ahí, el SDK no lo soporta (por ejemplo, **`rebase` no existe** en la versión 0.2.9).

### El archivo `.env`

Contiene dos valores:

| Variable | Qué es |
|---|---|
| `HAPPYROBOT_API_KEY` | Tu credencial. Da acceso a la plataforma con tus permisos. **Trátala como una contraseña** |
| `FORK_BRANCH_ID` | El ID de la branch de trabajo donde `apply` guarda los cambios |

---

## 3. Conceptos que necesitas dominar

**Workflow.** El flujo completo del agente (Trigger → Inbound Text Agent → Prompt…). Constante `WORKFLOW` en el script.

**Branch.** Una línea de trabajo independiente del workflow. Cambiar algo en una branch **no afecta** a las demás. Este proyecto parte de `development-branch`.

**Nodo.** Cada bloque del workflow. El que nos interesa es el nodo de tipo `prompt`.

**`id` vs `persistent_id`.** Cada nodo tiene dos identificadores:
- `id`: cambia cada vez que se hace un commit (es la "revisión" actual).
- `persistent_id`: **no cambia nunca**. Es el que usamos (`PROMPT_PERSISTENT_ID`) para encontrar siempre el mismo nodo.

**Working tree vs commit.**
- *Working tree*: tus cambios todavía "en borrador" dentro de la branch.
- *Commit*: cambios **sellados** con un mensaje. Solo lo sellado cuenta para fork, merge y deploy.
  (El SDK lo dice explícito: `fork` copia "el HEAD committeado, excluyendo cambios sin commit").

**Fork.** Crear una branch nueva copiando el último commit de otra. Es tu "copia segura para experimentar".

**Pull request (PR) y merge.** Forma de **proponer** que los cambios de una branch (origen) entren en otra (destino). El `merge` los integra. Algunas branches pueden exigir revisión/aprobación antes del merge.

**Deployment target (ambiente).** Un destino de despliegue: `production`, `staging` o `development`. Cada target apunta a **una branch**; al hacer deploy se publica el **último commit (HEAD)** de esa branch.

**Deploy.** El paso que realmente hace que los cambios afecten a los usuarios de ese ambiente.

---

## 4. Qué hace el script, línea por línea

Archivo: `src/sync-prompt.ts`

### 4.1 Preparación

```ts
import "dotenv/config";                         // carga el .env
import { HappyRobotClient } from "@happyrobot-ai/sdk";
const client = new HappyRobotClient({ apiKey: process.env.HAPPYROBOT_API_KEY!, cluster: "us" });
```
Crea el "cliente": el objeto con el que se hacen todas las llamadas a la API.

```ts
const WORKFLOW = "ma3nwtzz0k5y";                 // slug del workflow
const PROMPT_PERSISTENT_ID = "019d4fe0-…-076e8aa618e9"; // nodo Prompt (id permanente)
const PROMPT_FILE = "prompts/chatbot-agent.prompt.md";  // archivo local
```
Son las "coordenadas" de qué tocar. Si el cliente usa otro workflow/nodo, **solo se cambian estas constantes**.

### 4.2 Elegir modo

```ts
const mode = process.argv[2];   // "dump" o "apply"
```
Lo que escribes después de `npm run dump` / `npm run apply`. Cualquier otro valor da error.

### 4.3 Localizar la branch de trabajo

```ts
const listed = await client.branches.list(WORKFLOW);
const development = listed.find(b => b.name === "development-branch");
let branchId = process.env.FORK_BRANCH_ID;
```
- Lista las branches del workflow y encuentra `development-branch` (la base).
- Lee `FORK_BRANCH_ID` del `.env`.

Si **no** hay `FORK_BRANCH_ID`:
- En `apply` → error ("corre dump primero"). Es una protección para no escribir a ciegas.
- En `dump` → **crea un fork** de `development-branch` llamado `prompt-refactor-AAAA-MM-DD`, e imprime el ID para que lo pegues en `.env`.

### 4.4 Leer el nodo Prompt

```ts
const branch = await client.branches.get(branchId);
const promptNode = branch.nodes.find(n => n.type === "prompt" && n.persistent_id === PROMPT_PERSISTENT_ID);
```
Descarga el grafo completo de **esa branch** y busca el nodo prompt por su `persistent_id`.

### 4.5 Modo `dump` (bajar)

Toma `prompt_md` del nodo y lo escribe en `prompts/chatbot-agent.prompt.md`. Además avisa con una advertencia si lo que ve la UI (`prompt`) difiere de `prompt_md`.

### 4.6 Modo `apply` (subir)

1. Lee el archivo local (normalizando saltos de línea `\r\n` → `\n`).
2. Envía **una operación** `promptUpdated` con **dos** campos:
   - `prompt`: formato "rich text" → **lo que muestra la UI**
   - `prompt_md`: markdown plano
3. Envía `expected_node_counters`: un "contador de versión" de cada nodo. Si alguien más modificó el nodo mientras tú trabajabas, el contador no coincide y la API **rechaza** la operación en lugar de pisar su trabajo (control de concurrencia).
4. Hace `commit` con el mensaje `"Refactor Chatbot Agent prompt from repo"`.
5. **Verifica**: vuelve a leer la branch y comprueba que `prompt` y `prompt_md` quedaron idénticos al archivo. Si no, falla con error.

### 4.7 ¿Por qué hay DOS campos (`prompt` y `prompt_md`)? (el bug que se corrigió)

| Campo | Formato | Quién lo usa |
|---|---|---|
| `prompt` | Rich text (lista de párrafos) | **La interfaz de HappyRobot** |
| `prompt_md` | Markdown | Nuestro `dump` y herramientas externas |

La API **no sincroniza uno desde el otro**. La versión anterior del script solo enviaba `prompt_md`: el commit se hacía y parecía exitoso, pero la UI seguía mostrando el texto viejo porque leía `prompt`. Ahora se envían ambos y se verifica.

---

## 5. El flujo de trabajo: `dump` → editar → `apply`

```bash
npm run dump     # 1. baja el prompt actual a prompts/chatbot-agent.prompt.md
# 2. edita el archivo con tu editor
npm run apply    # 3. sube y hace commit en la branch de trabajo
```

Detalles:

- **Primera vez**: `dump` crea el fork y te imprime `FORK_BRANCH_ID=...`. Pégalo en `.env`.
- **Siguientes veces**: como `FORK_BRANCH_ID` ya existe, **se reutiliza la misma branch**. Cada `apply` agrega un commit más a ella.
- ⚠️ `dump` lee de la **branch fork** (no de `development-branch`). Si entretanto alguien cambió `development-branch`, tu fork **no** lo ve (ver sección 8.3).
- Para empezar de cero con una branch nueva: borra la línea `FORK_BRANCH_ID` del `.env` y corre `npm run dump`.

---

## 6. "Solo está acotado a ese ambiente": qué significa realmente

Aclaración importante: el script **no** está acotado a un *ambiente* (production/staging/development); está acotado a **una branch** (el fork).

```
development-branch  ──fork──►  prompt-refactor-2026-11-23   ◄── aquí escribe `apply`
      (intacta)                      (cambios + commits)
```

Consecuencias:

| Pregunta | Respuesta |
|---|---|
| ¿Cambia `development-branch`? | **No.** Solo cambia el fork |
| ¿Cambia producción / staging? | **No** |
| ¿Se ve en los chats reales? | **No**, nada se despliega |
| ¿Dónde lo veo en la UI? | Abre el workflow y **selecciona la branch** `prompt-refactor-AAAA-MM-DD` |

El mensaje final del script lo dice: *"no se publicó ni se desplegó"*. Esto es **intencional**: es una red de seguridad.

---

## 7. Mapa de decisiones: ¿hasta dónde quiero llevar el cambio?

```
Editar archivo ─► apply (commit en fork) ─┬─► [A] Quedarme aquí (probar en la branch del fork)
                                          ├─► [B] PR + merge a development-branch
                                          ├─► [C] PR + merge a la branch de producción ─► deploy
                                          └─► [D] Mi fork quedó desactualizado ─► rebase / re-fork
```

| Objetivo | Operación | ¿Está en el SDK 0.2.9? |
|---|---|---|
| Probar sin riesgo | Solo `commit` en el fork (lo que hace `apply`) | ✅ |
| Integrar a otra branch | Pull request + `merge` | ✅ `client.pullRequests` |
| Hacerlo "real" en un ambiente | `deploy` del deployment target | ✅ `client.deploymentTargets` |
| Actualizar mi fork con novedades de la base | `rebase` | ❌ **No** (en el SDK). Existe en la herramienta MCP de HappyRobot (`preview_rebase` / `rebase_branch`) y en la plataforma |
| Deshacer un commit | `revert` | ❌ No en el SDK. Existe en la herramienta MCP (`revert_commit`) |

---

## 8. Cómo cambiar de ambiente, hacer merge, rebase y deploy

### 8.1 Primero: descubre qué hay (solo lectura, no cambia nada)

Ya existe como comando, sin crear archivos:

```bash
npm run inspect
```

Está implementado en `src/release.ts` (función `inspect`). Muestra las branches (con si están protegidas o exigen PR), los ambientes con su branch y último deploy, y los pull requests. Con esto verás **qué branch alimenta producción** y si exige pull request. Detalle de uso en `GUIA_DE_USO.md`.

### 8.2 Cambiar de "ambiente"

No hay un interruptor global de ambiente. Cambiar de ambiente significa **apuntar a otra branch**:

| Quiero trabajar sobre… | Hago… |
|---|---|
| Mi fork (actual) | Dejo `FORK_BRANCH_ID` como está |
| Otra branch existente | Pongo su ID en `FORK_BRANCH_ID` (obtenido con `inspect.ts`) |
| Una branch nueva desde otra base | Cambio `"development-branch"` en el script por la base deseada, borro `FORK_BRANCH_ID` y corro `dump` |

> ⚠️ **Escribir directo sobre la branch de producción** (poniendo su ID en `FORK_BRANCH_ID`) es técnicamente posible si tus permisos lo permiten, pero **no se recomienda**: se salta la revisión. Si la branch es `protected` / `requires_pull_request`, la plataforma debería exigir un PR.

### 8.3 Llevar el cambio a `development-branch` (merge)

```ts
const base = branches.find(b => b.name === "development-branch")!;

const pr = await client.pullRequests.create(WORKFLOW, {
  source_branch_id: process.env.FORK_BRANCH_ID!,   // de dónde vienen los cambios
  target_branch_id: base.id,                       // a dónde van
  title: "Refactor prompt Chatbot Agent",
  description: "Actualiza el prompt (prompt y prompt_md).",
});

// Opcional pero recomendado: revisar si se puede mergear y qué lo bloquea
const review = await client.pullRequests.getReviewStatus(WORKFLOW, pr.id);
console.log(review.can_merge, review.merge_blockers, review.missing_approval);

// Solo si can_merge === true:
await client.pullRequests.merge(WORKFLOW, pr.id);
```

Notas:
- Si `missing_approval` es `true`, **otra persona con permisos debe aprobar** el PR (desde la UI) antes de poder mergear.
- Mergear **no despliega**. Solo integra los commits en la branch destino.

### 8.4 Llevar el cambio a producción

Son **dos pasos separados**, y es bueno que lo sean:

**Paso 1 — Integrar** (igual que 8.3 pero con `target_branch_id` = la branch que usa producción, según `inspect.ts`).

**Paso 2 — Desplegar** el deployment target de producción:

```ts
const { targets } = await client.deploymentTargets.list(WORKFLOW);
const prod = targets.find(t => t.environment === "production")!;

// ¿Tengo permiso y estoy dentro de la ventana de despliegue?
const access = await client.deploymentTargets.getDeployAccess(WORKFLOW, prod.id);
console.log(access);

if (access.can_deploy) {
  const result = await client.deploymentTargets.deploy(WORKFLOW, prod.id);
  console.log(result.warnings);
}
```

Puntos clave del SDK:
- `deploy` publica **el commit HEAD de la branch del target**, no un commit arbitrario.
- Puede haber **ventanas horarias** (`outside_window`), **permisos** (`permission`) o **listas permitidas** (`allow_list`) que bloqueen el deploy; `getDeployAccess` te dice el motivo.
- Un deployment puede pasar por estados `checks_in_progress` → `published`, o `checks_failed`/`failed`. Revisa con `getLatestDeployment` / `listDeployments`.
- Existe `updateTrafficSplit`: reparte el tráfico entre deployments (p. ej. 10% nuevo / 90% anterior) para un **despliegue gradual**.

### 8.5 Rebase (mi fork quedó atrasado)

Escenario: creaste el fork el lunes; el martes alguien cambió `development-branch`. Tu fork **no tiene** ese cambio y al hacer PR puede haber conflictos.

- **El SDK 0.2.9 no tiene `rebase`.** Opciones:
  1. Hacer el rebase desde la plataforma (herramientas de HappyRobot: `preview_rebase` para previsualizar y `rebase_branch` para aplicar).
  2. **Re-fork limpio**: borra `FORK_BRANCH_ID`, corre `npm run dump` (fork nuevo desde la base actualizada), vuelve a pegar tus cambios en el `.md` y `npm run apply`. Es lo más simple cuando solo cambiaste el prompt.
- Regla práctica: **forks cortos**. Haz dump → editar → apply → PR el mismo día y evitas la mayoría de conflictos.

### 8.6 ¿Merge, rebase o solo commit? Guía rápida

| Situación | Usa |
|---|---|
| Estoy probando, nadie más depende de esto | **Solo commit** (`apply`) |
| Ya validé el prompt y quiero que el equipo lo tenga | **PR + merge** a `development-branch` |
| Mi fork lleva días y la base cambió | **Rebase** (plataforma) o **re-fork** |
| Quiero que usuarios reales lo vean | **Merge a la branch de producción + deploy** |
| Quiero exponerlo a poco tráfico primero | **Deploy + `updateTrafficSplit`** |

---

## 9. Buenas prácticas y seguridad

1. **API key**: vive solo en `.env`. `.gitignore` ya excluye `.env`; verifica que nunca aparezca en un commit de Git. Si se filtró, **rótala** en la plataforma.
2. **Principio de mínimo privilegio**: usa una API key con los permisos justos. Una key que solo trabaje con branches no debería poder desplegar a producción.
3. **Nunca despliegues sin probar**: usa la branch del fork para pruebas (tests de nodo, northstars, e2e de `client.branches.*`) antes del PR.
4. **Un cambio = un commit con mensaje claro**. Edita `message` en `commit` para describir qué cambió (hoy es fijo).
5. **Revisa el diff** antes de hacer PR (comparando en la UI la branch fork vs la base).
6. **Cuidado con el contenido del prompt**: el archivo es la fuente de verdad. Revisa que no queden contradicciones (por ejemplo, el nombre del agente distinto en la intro y en las instrucciones).
7. **Producción siempre con doble llave**: PR aprobado por otra persona + deploy consciente.

---

## 10. Solución de problemas

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| `Falta FORK_BRANCH_ID en .env. Corre dump primero.` | No hay branch de trabajo | `npm run dump`, pega el ID en `.env` |
| `No está development-branch` | La branch base se llama distinto o no existe | Usa `inspect.ts` y ajusta el nombre en el script |
| `No está el nodo Prompt en esta branch` | `PROMPT_PERSISTENT_ID` incorrecto o nodo eliminado | Verifica el ID en el JSON descargado de la UI (`persistent_id`) |
| Error de conflicto / contadores | Alguien modificó el nodo mientras trabajabas | Vuelve a correr `dump`, reaplica tu edición, `apply` |
| `Verificación falló (prompt_md ok=…, prompt ok=…)` | La plataforma no guardó alguno de los dos campos | No confíes en la UI; reintenta y reporta con el mensaje exacto |
| Hago `apply` y no veo nada en la UI | Estás mirando otra branch (p. ej. `development-branch`) | Selecciona la branch fork en la UI |
| Veo el cambio en el fork pero no en el chat real | No se ha mergeado/desplegado | Sección 8.3 y 8.4 |
| 401 / 403 | API key inválida o sin permiso | Revisa `HAPPYROBOT_API_KEY` y rol |

---

## 11. Glosario

- **API key**: credencial secreta para usar la API.
- **Branch**: línea de trabajo independiente.
- **Commit**: cambios sellados con mensaje.
- **Deploy**: publicar el HEAD de una branch en un ambiente.
- **Deployment target**: destino de despliegue (production/staging/development).
- **Fork**: copiar una branch a una nueva.
- **HEAD**: el último commit de una branch.
- **Merge**: integrar los commits de una branch en otra.
- **Nodo**: bloque de un workflow.
- **`persistent_id`**: ID permanente de un nodo (no cambia entre commits).
- **Pull request**: propuesta formal de merge, con posible revisión.
- **Rebase**: reubicar tus commits sobre la versión más nueva de la base.
- **Rich text (`prompt`)**: formato interno que renderiza la UI.
- **SDK**: librería que facilita llamar a la API desde código.
- **Working tree**: cambios aún sin commit.
