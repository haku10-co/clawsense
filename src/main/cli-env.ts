const CLI_PATH_DIRS: readonly string[] = [
  `${process.env.HOME ?? ""}/.local/bin`,
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/usr/bin",
  "/bin",
  "/usr/sbin",
  "/sbin"
];

export function cliEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const existingPath = extra.PATH ?? process.env.PATH ?? "";
  const pathValue = [...CLI_PATH_DIRS, existingPath].filter(Boolean).join(":");
  return {
    ...process.env,
    ...extra,
    PATH: pathValue
  };
}

export function cliPath(): string {
  return cliEnv().PATH ?? "";
}
