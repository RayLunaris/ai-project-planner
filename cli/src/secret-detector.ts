const SECRET_PATTERNS = [
  // OpenAI API Key (sk-... and sk-proj-...)
  {
    regex: /\b(sk-[a-zA-Z0-9]{32,}|sk-proj-[a-zA-Z0-9_-]{20,})\b/g,
    replacement: "[REDACTED_OPENAI_KEY]",
  },
  // Google API Key (AIza...)
  {
    regex: /\b(AIza[0-9A-Za-z_-]{35})\b/g,
    replacement: "[REDACTED_GOOGLE_API_KEY]",
  },
  // AWS Access Key ID
  {
    regex: /\b((?:AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16})\b/g,
    replacement: "[REDACTED_AWS_ACCESS_KEY]",
  },
  // AWS Secret Access Key (heuristics: aws_secret... = value)
  {
    regex: /(aws_secret_access_key\s*[:=]\s*["']?)([A-Za-z0-9\/+=]{40})(["']?)/gi,
    replacement: "$1[REDACTED_AWS_SECRET]$3",
  },
  // GitHub Personal Access Token (ghp_, github_pat_...)
  {
    regex: /\b(ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{82})\b/g,
    replacement: "[REDACTED_GITHUB_TOKEN]",
  },
  // Generic Bearer Token (must be at least 15 chars to avoid matching 'Bearer Token' text)
  {
    regex: /(Bearer\s+)([A-Za-z0-9\-\._~+\/]{15,})/g,
    replacement: "$1[REDACTED_BEARER_TOKEN]",
  },
  // Connection String Passwords (mysql, postgres, mongodb, redis)
  // Format: protocol://user:password@host
  {
    regex: /((?:mysql|postgresql|postgres|mongodb|redis|amqp|postgresql\+asyncpg):\/\/[^:\/\s]+:)([^@\/\s]+)(@)/gi,
    replacement: "$1[REDACTED_DB_PASSWORD]$3",
  },
  // Private Key Blocks
  {
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
    replacement: "[REDACTED_PRIVATE_KEY]",
  },
  // Stripe API keys
  {
    regex: /\b(sk_live_[a-zA-Z0-9]{24,}|rk_live_[a-zA-Z0-9]{24,})\b/g,
    replacement: "[REDACTED_STRIPE_KEY]",
  },
  // Slack Tokens
  {
    regex: /\b(xox[baprs]-[a-zA-Z0-9\-]+)\b/g,
    replacement: "[REDACTED_SLACK_TOKEN]",
  },
  // OpenRouter API Key
  {
    regex: /\b(sk-or-v1-[a-fA-F0-9]{40,})\b/g,
    replacement: "[REDACTED_OPENROUTER_KEY]",
  },
  // JWT-style Token (e.g. Supabase anon/service_role keys)
  {
    regex: /\b(eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)\b/g,
    replacement: "[REDACTED_JWT_TOKEN]",
  },
  // Generic Fallback for variables containing KEY, SECRET, TOKEN, PASSWORD
  // Matches variableName = "RandomStringNoSpacesWithAtLeast20Chars"
  {
    regex: /([a-zA-Z0-9_]*(?:key|secret|token|password)[a-zA-Z0-9_]*\s*[:=]\s*["'])([a-zA-Z0-9\-_=!@#$%^&*+?]{20,})(["'])/gi,
    replacement: "$1[REDACTED_GENERIC_SECRET]$3",
  },
];

/**
 * Redacts common secrets (API keys, passwords, private keys) from a given string.
 * @param content The original text content
 * @returns The redacted text content
 */
export function redact(content: string): string {
  if (!content) return content;

  let redactedContent = content;

  for (const pattern of SECRET_PATTERNS) {
    redactedContent = redactedContent.replace(pattern.regex, pattern.replacement);
  }

  return redactedContent;
}
