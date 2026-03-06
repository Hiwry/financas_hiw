const readViteEnv = (key: string): string => {
  const maybeEnv = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env;
  const value = maybeEnv?.[key];
  return typeof value === 'string' ? value.trim() : '';
};

const readNodeEnv = (key: string): string => {
  if (typeof process === 'undefined' || !process?.env) return '';
  const value = process.env[key];
  return typeof value === 'string' ? value.trim() : '';
};

export const getEnv = (...keys: string[]): string => {
  for (const key of keys) {
    const fromVite = readViteEnv(key);
    if (fromVite) return fromVite;

    const fromNode = readNodeEnv(key);
    if (fromNode) return fromNode;
  }

  return '';
};
