# Bug report: missing subpath type declarations in tekivex-ui@3.18.0

Copy-paste this into the GitHub issue tracker for `tekivex-ui`. Title and body below are launch-ready.

---

## Title

```
Subpath exports declared but .d.ts files missing from published tarball (v3.18.0)
```

## Body

```
**Package**: tekivex-ui
**Version**: 3.18.0 (published ~37 minutes before this report)
**Issue**: Eight subpath exports declare a `types` field in `package.json` `exports`,
           but the corresponding `.d.ts` files are not present in the published
           tarball. Consumers who import from these subpaths get correct runtime
           behavior but `tsc --noEmit` fails with TS2724
           "has no exported member named X".

## Affected subpaths

Per `package.json`, these subpaths declare a `types` field pointing at a file
that doesn't ship:

| Subpath              | Declared `types`           | Present in tarball? |
| -------------------- | -------------------------- | ------------------- |
| `tekivex-ui`         | `./dist/index.d.ts`        | ✅ yes               |
| `tekivex-ui/themes`  | `./dist/themes.d.ts`       | ❌ no                |
| `tekivex-ui/charts`  | `./dist/charts.d.ts`       | ❌ no                |
| `tekivex-ui/headless`| `./dist/headless.d.ts`     | ❌ no                |
| `tekivex-ui/i18n`    | `./dist/i18n.d.ts`         | ❌ no                |
| `tekivex-ui/quantum` | `./dist/quantum.d.ts`      | ❌ no                |
| `tekivex-ui/realtime`| `./dist/realtime.d.ts`     | ❌ no                |
| `tekivex-ui/agent`   | `./dist/agent.d.ts`        | ❌ no                |
| `tekivex-ui/experimental` | `./dist/experimental.d.ts` | ❌ no            |

Runtime files (`.js` and `.cjs`) are present for every subpath — only the type
declarations are missing.

## Repro

```bash
mkdir tkx-repro && cd tkx-repro
npm init -y
npm i tekivex-ui@3.18.0 typescript react react-dom @types/react @types/react-dom
echo '{"compilerOptions":{"moduleResolution":"bundler","module":"ESNext","jsx":"react-jsx","strict":true,"target":"ES2022"}}' > tsconfig.json
cat > test.ts <<'EOF'
import { TkxLineChart }   from 'tekivex-ui/charts';
import { Agent }          from 'tekivex-ui/agent';
import { quantumDark }    from 'tekivex-ui/themes';
console.log(TkxLineChart, Agent, quantumDark);
EOF
npx tsc --noEmit test.ts
```

**Expected:** Compiles cleanly.
**Actual:**
```
test.ts:1:33 - error TS2307: Cannot find module 'tekivex-ui/charts' or its corresponding type declarations.
test.ts:2:25 - error TS2307: Cannot find module 'tekivex-ui/agent' or its corresponding type declarations.
test.ts:3:28 - error TS2307: Cannot find module 'tekivex-ui/themes' or its corresponding type declarations.
```

(Runtime works — `node --loader tsx test.ts` succeeds. Only static type-checking
breaks.)

## Confirming what's in the tarball

```bash
$ ls node_modules/tekivex-ui/dist/
agent.cjs            charts.js              i18n.cjs           quantum.js          themes.cjs
agent.js             experimental.cjs       i18n.js            realtime.cjs        themes.js
charts.cjs           experimental.js        index.cjs          realtime.js
                     headless.cjs           index.d.ts         src/
                     headless.js            index.js           tekivex-ui.css
```

Only `index.d.ts` ships.

## Suggested fix

Either:

1. **Add the missing `.d.ts` files** to the build pipeline. If using `tsup` or a
   similar bundler with `dts: true`, ensure each entry in the `entry` config
   emits its declarations. For tsup:

   ```ts
   // tsup.config.ts
   export default defineConfig({
     entry: {
       index:        'src/index.ts',
       themes:       'src/themes/index.ts',
       charts:       'src/charts/index.ts',
       headless:     'src/headless/index.ts',
       i18n:         'src/i18n/index.ts',
       quantum:      'src/engine/quantum/index.ts',
       realtime:     'src/realtime/index.ts',
       agent:        'src/agent/index.ts',
       experimental: 'src/experimental/index.ts',
     },
     dts: true,  // emits a .d.ts for every entry
     // ...
   });
   ```

2. **Or remove the `types` field** from subpath exports that don't ship types,
   so TypeScript falls back to the main `index.d.ts` for symbol lookup
   (less ideal — subpath imports won't be type-safe).

## Impact

Anyone using `tekivex-ui` subpaths in a TypeScript codebase has to either:

- Add an `ambient.d.ts` with `declare module 'tekivex-ui/charts';` (loses all
  types — every import is `any`)
- Pin to a future version once fixed
- Re-route through the main `tekivex-ui` import (works for components re-exported
  from index, but `agent`, `realtime`, `quantum`, `experimental` subpaths
  appear to have unique exports unavailable from the main entry)

## Verified on

- Node 24.13.0
- pnpm 10.33.0
- TypeScript 5.6
- macOS / Windows / Linux (same tarball)

Happy to PR the tsup config change if it helps.
```

---

## Notes for filing

- Repo is presumably `github.com/tekivex/tekivex-ui` — verify the owner once you have the URL handy.
- If your CI has a release workflow that runs `tsup` (or whatever bundler), the fix is one line per subpath in the entry map; no source changes.
- The label set worth applying: `bug`, `build`, `release`, `types`.
- Once 3.18.1 ships with the fix, this demo can drop any ambient declarations and just `import { ... } from 'tekivex-ui/agent'` cleanly.
