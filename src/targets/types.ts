export type TargetStatus = "not_installed" | "not_authenticated" | "ready";

export interface SyncTarget {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  checkStatus(): Promise<TargetStatus>;
  installHint(): string;
  sync(
    secrets: { name: string; value: string }[],
    destination: string
  ): Promise<SyncResult>;
}

export interface SyncResult {
  success: string[];
  failed: { name: string; error: string }[];
}
