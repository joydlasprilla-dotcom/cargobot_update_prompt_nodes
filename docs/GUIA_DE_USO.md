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

Abre `prompts/chatbot-agent.prompt.md` y cámbialo. Antes de seguir, revisa que no haya contradicciones (por ejemplo, el nombre del agente distinto en la introducción y en las instrucciones).

### Paso 3. Subir y guardar

```bash
npm run apply
```

Éxito = ves `prompt y prompt_md verificados`. Si el script termina con `Verificación falló`, **no confíes en la UI**; reintenta.

Qué comprobar: en la plataforma, abre el workflow y **selecciona la branch del fork** (no `development-branch`). El prompt nuevo se ve ahí. Nada se ha desplegado.

### Paso 4. Ver el panorama (opcional pero recomendado)

```bash
npm run inspect
```

Muestra:
- **Branches**: id, último commit, si está protegida, si exige PR y a qué ambientes está ligada
- **Deployment targets**: qué branch alimenta cada ambiente y su último deploy
- **Pull requests**: abiertos, mergeados y cerrados

### Paso 5. Proponer el cambio (PR)

```bash
npm run pr -- --target development-branch --title "Actualiza saludo del agente"
```

- Origen: tu fork (`FORK_BRANCH_ID`). Destino: la branch indicada.
- El script imprime el número del PR, si ya se puede mergear y qué lo bloquea.

### Paso 6. Aprobación (si aplica)

Si hay bloqueos de aprobación, **otra persona con permisos aprueba el PR desde la plataforma**. El SDK no tiene método para aprobar; esto es intencional como control.

### Paso 7. Merge

```bash
npm run merge -- 5      # 5 = número del PR
```

Sin número, lista los PRs abiertos. Pide escribir `merge`. Esto **integra** el cambio en la branch destino pero **no despliega**.

### Paso 8. Deploy

Primero simula:

```bash
npm run deploy -- --env staging
```

Muestra qué branch y qué commit se publicarían, el último deploy y si tienes permiso. **No despliega.** Cuando todo se vea bien:

```bash
npm run deploy -- --env staging --confirm
```

Te pide escribir el nombre del ambiente. Repite el proceso con `production` solo cuando staging esté validado.

---

## 6. Qué comando usar según el objetivo

| Objetivo | Hasta dónde llegar |
|---|---|
| Probar un cambio sin riesgo | Pasos 1 a 3 |
| Compartirlo con el equipo | Pasos 1 a 7 (merge a `development-branch`) |
| Que lo vean usuarios reales | Pasos 1 a 8 (merge a la branch del ambiente + deploy) |
| Empezar de cero | Borra la línea `FORK_BRANCH_ID` del `.env` y corre `npm run dump` |

---

## 7. Reglas de seguridad

1. **Producción siempre con doble llave:** PR aprobado por otra persona y deploy consciente (`--confirm` + escribir el ambiente).
2. **Dry-run primero.** `deploy` sin `--confirm` nunca despliega.
3. **Nunca pegues la API key** en chats, tickets o capturas. Si se filtra, rótala en la plataforma.
4. **Forks cortos:** haz dump, edita, apply y PR el mismo día para evitar quedar desactualizado.
5. **El SDK no tiene `rebase` ni `revert`.** Si tu fork quedó atrasado, haz un fork nuevo (sección 6) o usa el rebase de la plataforma.

---

## 8. Errores frecuentes

| Mensaje | Qué significa | Solución |
|---|---|---|
| `Falta FORK_BRANCH_ID en .env` | No hay branch de trabajo | `npm run dump` y pega el ID en `.env` |
| `No está development-branch` | La branch base se llama distinto | Revisa nombres con `npm run inspect` y ajusta el script |
| `No está el nodo Prompt en esta branch` | `PROMPT_PERSISTENT_ID` incorrecto | Copia el `persistent_id` del JSON de la plataforma |
| `Verificación falló` | La plataforma no guardó algún campo | Reintenta `apply`; si persiste, reporta el mensaje completo |
| Error por contadores o conflicto | Alguien editó el nodo mientras trabajabas | `npm run dump`, reaplica tu edición y `apply` |
| `No existe la branch "..."` | El destino del PR no existe | El mensaje lista las disponibles |
| `No se puede mergear aún. Bloqueos: ...` | Falta aprobación u otro requisito | Resuélvelo en la plataforma y repite `merge` |
| `No puedes desplegar ahora (motivo: ...)` | Permiso, ventana horaria o lista permitida | Revisa el motivo que imprime el comando |
| `apply` funcionó pero no veo cambios | Estás viendo otra branch | Selecciona el fork en la UI |
| 401 / 403 | API key inválida o sin permisos | Revisa `HAPPYROBOT_API_KEY` y tu rol |

---

## 9. Mapa de archivos

```
css-prompt-sync/
├── .env                          # secretos (no compartir)
├── package.json                  # comandos npm
├── prompts/chatbot-agent.prompt.md   # el prompt que editas
├── src/sync-prompt.ts            # dump y apply
├── src/release.ts                # inspect, pr, merge, deploy
└── docs/
    ├── GUIA_DE_USO.md            # esta guía (el "cómo")
    └── GUIA_SDK_PROMPT_SYNC.md   # conceptos (el "por qué")
```
