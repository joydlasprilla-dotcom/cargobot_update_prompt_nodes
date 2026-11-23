# Guía de uso: css-prompt-sync

Herramienta para editar el nodo prompt de un wf **como un archivo** y llevarlo a HappyRobot de forma controlada (editar → commit → PR → merge → deploy).

---

## 1. Requisitos

- Node.js 18 o superior (`node -v`)
- Una API key de HappyRobot con permisos sobre el workflow
- Acceso al workflow en la plataforma (para ver resultados y aprobar PRs)

## 2. Instalación

```bash
npm install
```

Crea el archivo `.env` en esta carpeta:

```
HAPPYROBOT_API_KEY=tu_api_key
```

(`FORK_BRANCH_ID` se agrega después, en el paso 3.) El archivo `.env` **nunca** se sube a Git ni se comparte.

## 3. Configuración del workflow

Las "coordenadas" están al inicio de los scripts:

| Constante | Archivo | Qué es |
|---|---|---|
| `WORKFLOW` | `src/sync-prompt.ts` y `src/release.ts` | Slug del workflow |
| `PROMPT_PERSISTENT_ID` | `src/sync-prompt.ts` | `persistent_id` del nodo Prompt |
| `PROMPT_FILE` | `src/sync-prompt.ts` | Archivo local del prompt |
| `DEFAULT_TARGET_BRANCH` | `src/release.ts` | Branch destino por defecto del PR |

Para otro workflow, cambia **`WORKFLOW` en los dos archivos** y `PROMPT_PERSISTENT_ID`. El `persistent_id` lo encuentras en el JSON que descargas de la plataforma, en el nodo con `"type": "prompt"`. O en plataforma con :
<img width="432" height="249" alt="image" src="https://github.com/user-attachments/assets/359af0ec-cadd-4895-8cb5-8eb9abdada61" />


---

## 4. Comandos

| Comando | Qué hace | ¿Escribe algo? |
|---|---|---|
| `npm run dump` | Baja el prompt a `prompts/chatbot-agent.prompt.md`. La primera vez crea el fork | Crea la branch fork (solo si no hay `FORK_BRANCH_ID`) |
| `npm run apply` | Sube el archivo, hace commit y verifica | Sí, en la branch fork |
| `npm run inspect` | Muestra branches, ambientes y PRs | No |
| `npm run pr -- --target <branch>` | Abre un pull request del fork al destino | Crea un PR |
| `npm run merge -- <n>` | Mergea el PR (pide confirmación) | Sí, en la branch destino |
| `npm run deploy -- --env <ambiente>` | Simula el despliegue (dry-run) | No |
| `npm run deploy -- --env <ambiente> --confirm` | Despliega (pide confirmación) | **Sí, afecta usuarios** |

Nota: lo que va después de `--` se pasa al script. Es obligatorio escribirlo.

---

## 5. Flujo completo paso a paso

### Paso 1. Bajar el prompt

```bash
npm run dump
```

- **Primera vez:** crea la branch `prompt-refactor-AAAA-MM-DD` y muestra una línea `FORK_BRANCH_ID=...`. **Cópiala al `.env`.**


### Paso 2. Editar

Abre `prompts/chatbot-agent.prompt.md` y cámbialo.

### Paso 3. Subir y guardar

```bash
npm run apply
```

### Paso 4. Ver el panorama (opcional pero recomendado)

```bash
npm run inspect
```

Muestra:
- **Branches**: id y último commit
- **Deployment targets**: qué branch alimenta cada ambiente y su último deploy
- **Pull requests**: abiertos, mergeados y cerrados

### Paso 5. Proponer el cambio (PR)

```bash
npm run pr -- --target development-branch --title "mensaje"
```

- Origen: tu fork (`FORK_BRANCH_ID`). Destino: la branch indicada.
- El script imprime el número del PR, si ya se puede mergear y qué lo bloquea.


### Paso 6. Merge

```bash
npm run merge -- 5      # 5 = número del PR
```

Sin número, lista los PRs abiertos. Pide escribir `merge`. Esto **integra** el cambio en la branch destino pero **no despliega**.

### Paso 7. Deploy

Primero simula:

```bash
npm run deploy -- --env staging
```

Muestra qué branch y qué commit se publicarían, el último deploy y si tienes permiso. **No despliega.** Cuando todo se vea bien:

```bash
npm run deploy -- --env staging --confirm
```

---

## 8. Mapa de archivos

```
css-prompt-sync/
├── .env                          # secretos 
├── package.json                  # comandos npm
├── prompts/chatbot-agent.prompt.md   # el prompt que editas
├── src/sync-prompt.ts            # dump y apply
├── src/release.ts                # inspect, pr, merge, deploy
└── docs/
    ├── GUIA_DE_USO.md            # esta guía (el "cómo")
```
