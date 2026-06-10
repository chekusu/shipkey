export interface SecretRef {
  vault: string;
  provider: string;
  project: string;
  env: string;
  field: string;
}

export interface SecretEntry {
  ref: SecretRef;
  value: string;
}

export interface SecretBackend {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  checkStatus(): Promise<"not_installed" | "not_logged_in" | "ready">;
  read(ref: SecretRef): Promise<string>;
  write(entry: SecretEntry): Promise<void>;
  list(project?: string, env?: string, vault?: string): Promise<SecretRef[]>;
  /** Return an inline reference (e.g. op:// URI) for use in .envrc, or null if the backend doesn't support inline refs */
  buildInlineRef?(ref: SecretRef): string | null;
}
