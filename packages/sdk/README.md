# InkForum extension kit

This package is not published to npm. Forum admins download everything from their own forum:
**Admin → Extensions → Develop → Download starter kit**.

| Folder | |
|---|---|
| `src/` | Types (`ExtensionContext`, `defineExtension`, `html` …). Built into `dist/*.d.ts` and shipped inside the starter kit as `node_modules/@inkforum/sdk` so editors understand extension code. At runtime the forum provides the same module itself. |
| `starter/` | Template of the starter kit (`__ID__`, `__NAME__`, `__TABLE__` are filled in on download). |
| `examples/` | Ready-made extensions listed under *Admin → Extensions → Ready-made extensions* (one-click install or download). |
| `bin/inkforum-ext.mjs` | `validate`, `pack`, `build` and `init` tool, shipped in the starter kit as `tools/inkforum-ext.mjs`. |

The release build copies `starter/`, `examples/`, the tool and the type definitions to `release/inkforum/sdk/`.
