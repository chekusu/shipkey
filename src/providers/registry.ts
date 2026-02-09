import type { ProviderDefinition } from "./types";
import type { ProviderConfig } from "../config";

export const PROVIDERS: ProviderDefinition[] = [
  {
    name: "OpenRouter",
    patterns: [/OPENROUTER/i],
    guide_url: "https://openrouter.ai/keys",
    guide: "OpenRouter → Keys → Create Key",
  },
  {
    name: "OpenAI",
    patterns: [/OPENAI/i],
    guide_url: "https://platform.openai.com/api-keys",
    guide: "OpenAI Platform → API Keys → Create new secret key",
  },
  {
    name: "Stripe",
    patterns: [/STRIPE/i],
    guide_url: "https://dashboard.stripe.com/apikeys",
    guide: "Stripe Dashboard → Developers → API Keys",
  },
  {
    name: "GitHub OAuth",
    patterns: [/GITHUB/i],
    guide_url: "https://github.com/settings/developers",
    guide: "GitHub → Settings → Developer settings → OAuth Apps",
  },
  {
    name: "fal.ai",
    patterns: [/FAL/i],
    guide_url: "https://fal.ai/dashboard/keys",
    guide: "fal.ai → Dashboard → Keys",
  },
  {
    name: "Database",
    patterns: [/DATABASE/i, /^DB_/i],
  },
  {
    name: "Redis",
    patterns: [/REDIS/i],
  },
  {
    name: "Cloudflare",
    patterns: [/CLOUDFLARE/i],
    guide_url: "https://dash.cloudflare.com/profile/api-tokens",
    guide: "Cloudflare Dashboard → Profile → API Tokens → Create Token",
  },
  {
    name: "npm",
    patterns: [/^NPM/i],
    guide_url: "https://www.npmjs.com/settings/~/tokens",
    guide: "npmjs.com → Access Tokens → Generate New Token (Classic) → Publish",
  },
  {
    name: "Resend",
    patterns: [/RESEND/i],
    guide_url: "https://resend.com/api-keys",
    guide: "Resend → API Keys → Create API Key",
  },
  {
    name: "AWS",
    patterns: [/^AWS/i],
    guide_url: "https://console.aws.amazon.com/iam/",
    guide: "AWS Console → IAM → Users → Security credentials",
  },
  {
    name: "Vercel",
    patterns: [/VERCEL/i],
    guide_url: "https://vercel.com/account/tokens",
    guide: "Vercel → Account Settings → Tokens",
  },
  {
    name: "Fly",
    patterns: [/FLY/i],
    guide_url: "https://fly.io/user/personal_access_tokens",
    guide: "Fly.io → Account → Access Tokens",
  },
  {
    name: "Supabase",
    patterns: [/SUPABASE/i],
    guide_url: "https://supabase.com/dashboard/project/_/settings/api",
    guide: "Supabase → Project Settings → API",
  },
  {
    name: "Turso",
    patterns: [/TURSO/i],
    guide_url: "https://turso.tech/app",
    guide: "Turso → Dashboard → Database → Create Token",
  },
  {
    name: "Session",
    patterns: [/SESSION/i],
  },
];

export function guessProvider(key: string): string {
  for (const provider of PROVIDERS) {
    if (provider.patterns.some((p) => p.test(key))) {
      return provider.name;
    }
  }
  return "General";
}

export function envKeyToField(key: string): string {
  return key.toLowerCase().replace(/_/g, "-");
}

export function groupByProvider(
  envKeys: string[]
): Record<string, ProviderConfig> {
  const result: Record<string, ProviderConfig> = {};

  for (const key of envKeys) {
    const providerName = guessProvider(key);
    const field = envKeyToField(key);

    if (!result[providerName]) {
      const def = PROVIDERS.find((p) => p.name === providerName);
      result[providerName] = {
        fields: [],
        env_map: {},
        ...(def?.guide_url && { guide_url: def.guide_url }),
        ...(def?.guide && { guide: def.guide }),
      };
    }

    result[providerName].fields.push(field);
    result[providerName].env_map[field] = key;
  }

  return result;
}
