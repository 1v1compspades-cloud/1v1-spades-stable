---
name: Expo useColors() dark-key cast gotcha
description: Adding a real `dark` palette to the Expo scaffold's constants/colors.ts breaks the default useColors() cast (TS2352).
---

# Expo scaffold `useColors()` breaks when you add a real `dark` key

The Expo scaffold ships `constants/colors.ts` as `{ light, radius }` and `hooks/useColors.ts`
does `(colors as Record<string, typeof colors.light>).dark` guarded by `"dark" in colors`.

The moment you add a real `dark` palette key (e.g. for a themed app), that cast fails to
typecheck: `radius` is a `number`, so `colors` is no longer assignable to
`Record<string, <palette>>` → **TS2352** ("neither type sufficiently overlaps").

**Fix:** simplify the hook to a direct branch once both palettes exist:
```ts
const palette = scheme === "dark" ? colors.dark : colors.light;
return { ...palette, radius: colors.radius };
```

**Why:** the scaffold's defensive cast only made sense while `dark` was absent; with both
keys present the cast is both unnecessary and ill-typed.

**Also:** `expo-clipboard` is NOT in the default scaffold deps — install with
`pnpm --filter <app> exec expo install expo-clipboard` to get an SDK-compatible version.
