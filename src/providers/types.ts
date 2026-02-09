export interface ProviderDefinition {
  name: string;
  patterns: RegExp[];
  guide_url?: string;
  guide?: string;
}

export interface MatchedProvider {
  name: string;
  fields: string[];
  env_map: Record<string, string>; // field → ENV_KEY
  guide_url?: string;
  guide?: string;
}
