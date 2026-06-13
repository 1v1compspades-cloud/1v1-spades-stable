export function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    clear() {
      values.clear();
    }
  };
}

export function listFixturePresetNames(presets) {
  return Object.keys(presets ?? {});
}

export function requireFixturePreset(presets, name) {
  const preset = presets?.[name];
  if (!preset) {
    throw new Error(`Unknown manual fixture preset: ${name}`);
  }
  return preset;
}

export function selectFixtureView(views, view = "host") {
  return views?.[view] ?? views?.host ?? null;
}
