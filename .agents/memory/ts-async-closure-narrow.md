---
name: TypeScript async-closure narrowing trap
description: Why `let x: T | null = null` stays `never` after a throw guard when assigned inside an awaited callback.
---

Pattern that LOOKS fine but doesn't typecheck:

```ts
let result: { state: GameState; playerIndex: number } | null = null;
await withRoomLock(code, async () => { result = doThing(); });
if (!result) throw new Error("failed");
const { state, playerIndex } = result;   // TS error: 'players' on type 'never'
```

TS does not track assignments performed inside an async callback closure for control-flow narrowing. After the `!result` guard, the compiler narrows `result` to `null` and then to `never` on the next use.

**Fixes that work, ranked:**
1. Cast at the destructure: `const { state, playerIndex } = result as { state: GameState; playerIndex: number };` — survives across more TS versions than `result!` at the same site.
2. Have the callback return the value and assign at the await:
   ```ts
   const r = await withRoomLock(code, async () => doThing());
   if (!r) throw ...;
   ```
3. As a last resort, `state!` at every subsequent use.

**Why:** sometimes you genuinely need the outer-scope assignment (e.g. you also want to swallow lock errors via a separate try/catch). In that case use option 1. For new code prefer option 2 — the callback's return type narrows naturally.
