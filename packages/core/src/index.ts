// Backends
export type {
  SecretRef,
  SecretEntry,
  SecretBackend,
} from "./backends/types";
export { getBackend, listBackends } from "./backends/index";
export { OnePasswordBackend } from "./backends/onepassword";
export { BitwardenBackend } from "./backends/bitwarden";

// Providers
export type {
  ProviderDefinition,
  MatchedProvider,
  ProviderConfig,
} from "./providers/types";
export {
  PROVIDERS,
  guessProvider,
  groupByProvider,
} from "./providers/registry";

// Utilities
export { exec, execShell } from "./exec";
