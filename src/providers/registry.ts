import type { ProviderDefinition } from "./types";
import type { ProviderConfig } from "../config";

export const PROVIDERS: ProviderDefinition[] = [
  // --- AI ---
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
    name: "Anthropic",
    patterns: [/ANTHROPIC/i, /CLAUDE_API/i],
    guide_url: "https://console.anthropic.com/settings/keys",
    guide: "Anthropic Console → Settings → API Keys → Create Key",
  },
  {
    name: "Google AI",
    patterns: [/GEMINI/i, /GOOGLE_AI/i, /GOOGLE_GENERATIVE/i],
    guide_url: "https://aistudio.google.com/apikey",
    guide: "Google AI Studio → Get API key → Create API key",
  },
  {
    name: "Replicate",
    patterns: [/REPLICATE/i],
    guide_url: "https://replicate.com/account/api-tokens",
    guide: "Replicate → Account → API Tokens",
  },
  {
    name: "Hugging Face",
    patterns: [/HUGGING_?FACE/i, /^HF_/i],
    guide_url: "https://huggingface.co/settings/tokens",
    guide: "Hugging Face → Settings → Access Tokens → New token",
  },
  {
    name: "fal.ai",
    patterns: [/FAL/i],
    guide_url: "https://fal.ai/dashboard/keys",
    guide: "fal.ai → Dashboard → Keys",
  },
  // --- Payments ---
  {
    name: "Stripe",
    patterns: [/STRIPE/i],
    guide_url: "https://dashboard.stripe.com/apikeys",
    guide: "Stripe Dashboard → Developers → API Keys",
  },
  // --- Social / OAuth ---
  {
    name: "GitHub OAuth",
    patterns: [/GITHUB/i],
    guide_url: "https://github.com/settings/developers",
    guide: "GitHub → Settings → Developer settings → OAuth Apps",
  },
  {
    name: "Reddit",
    patterns: [/REDDIT/i],
    guide_url: "https://www.reddit.com/prefs/apps",
    guide: "Reddit → Preferences → Apps → Create app",
  },
  {
    name: "Product Hunt",
    patterns: [/PRODUCTHUNT/i, /PRODUCT_HUNT/i, /^PH_/i],
    guide_url: "https://www.producthunt.com/v2/oauth/applications",
    guide: "Product Hunt → API Dashboard → Add an Application",
  },
  {
    name: "Discord",
    patterns: [/DISCORD/i],
    guide_url: "https://discord.com/developers/applications",
    guide: "Discord Developer Portal → Applications → Bot → Token",
  },
  {
    name: "Slack",
    patterns: [/SLACK/i],
    guide_url: "https://api.slack.com/apps",
    guide: "Slack API → Your Apps → Create New App → OAuth Tokens",
  },
  {
    name: "Google",
    patterns: [/GOOGLE/i, /^GCP_/i, /^GCLOUD_/i],
    guide_url: "https://console.cloud.google.com/apis/credentials",
    guide: "Google Cloud Console → APIs & Services → Credentials",
  },
  // --- Auth ---
  {
    name: "Clerk",
    patterns: [/CLERK/i],
    guide_url: "https://dashboard.clerk.com",
    guide: "Clerk Dashboard → API Keys",
  },
  {
    name: "Auth0",
    patterns: [/AUTH0/i],
    guide_url: "https://manage.auth0.com/dashboard",
    guide: "Auth0 Dashboard → Applications → Settings",
  },
  // --- Communication ---
  {
    name: "Twilio",
    patterns: [/TWILIO/i],
    guide_url: "https://console.twilio.com",
    guide: "Twilio Console → Account → API keys & tokens",
  },
  {
    name: "SendGrid",
    patterns: [/SENDGRID/i],
    guide_url: "https://app.sendgrid.com/settings/api_keys",
    guide: "SendGrid → Settings → API Keys → Create API Key",
  },
  {
    name: "Resend",
    patterns: [/RESEND/i],
    guide_url: "https://resend.com/api-keys",
    guide: "Resend → API Keys → Create API Key",
  },
  // --- Databases ---
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
    name: "Upstash",
    patterns: [/UPSTASH/i],
    guide_url: "https://console.upstash.com",
    guide: "Upstash Console → Database → REST API credentials",
  },
  {
    name: "Neon",
    patterns: [/NEON/i],
    guide_url: "https://console.neon.tech",
    guide: "Neon Console → Project → Connection Details",
  },
  {
    name: "Database",
    patterns: [/DATABASE/i, /^DB_/i],
  },
  {
    name: "Redis",
    patterns: [/REDIS/i],
  },
  // --- Infrastructure ---
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
    name: "Sentry",
    patterns: [/SENTRY/i],
    guide_url: "https://sentry.io/settings/account/api/auth-tokens/",
    guide: "Sentry → Settings → Auth Tokens → Create New Token",
  },
  // --- Misc ---
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

export function groupByProvider(
  envKeys: string[]
): Record<string, ProviderConfig> {
  const result: Record<string, ProviderConfig> = {};

  for (const key of envKeys) {
    const providerName = guessProvider(key);

    if (!result[providerName]) {
      const def = PROVIDERS.find((p) => p.name === providerName);
      result[providerName] = {
        fields: [],
        ...(def?.guide_url && { guide_url: def.guide_url }),
        ...(def?.guide && { guide: def.guide }),
      };
    }

    result[providerName].fields.push(key);
  }

  return result;
}
