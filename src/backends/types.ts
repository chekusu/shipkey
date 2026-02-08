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
  read(ref: SecretRef): Promise<string>;
  write(entry: SecretEntry): Promise<void>;
  list(project?: string, env?: string): Promise<SecretRef[]>;
}
