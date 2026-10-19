/**
 * AI crawlers kept off the gorbital sites: bots that fetch pages in bulk to
 * train models or to build an AI search index. Each demo's robots.txt
 * disallows them. The same list is in gorbital-web, where the www worker
 * also refuses them with a 403.
 *
 * Search engines (Googlebot, Bingbot) are not here: blocking them would drop
 * the sites from search. Google-Extended and Applebot-Extended are robots.txt
 * tokens that opt out of AI training without affecting search.
 *
 * Not blocked: fetchers that read one page when a person asks a chatbot about
 * gorbital (ChatGPT-User, Claude-User, Perplexity-User, MistralAI-User,
 * meta-externalfetcher, DuckAssistBot). They are light and help people find
 * the docs. Add them here to block them too.
 */
export const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-Web",
  "anthropic-ai",
  "CCBot",
  "Google-Extended",
  "Applebot-Extended",
  "PerplexityBot",
  "Bytespider",
  "Amazonbot",
  "meta-externalagent",
  "FacebookBot",
  "cohere-ai",
  "cohere-training-data-crawler",
  "Diffbot",
  "ImagesiftBot",
  "Omgilibot",
  "omgili",
  "YouBot",
  "Timpibot",
  "AI2Bot",
  "Ai2Bot-Dolma",
  "PanguBot",
  "Kangaroo Bot",
  "img2dataset",
  "iaskspider",
  "Webzio-Extended",
  "VelenPublicWebCrawler",
] as const;

/** robots.txt groups: AI crawlers disallowed everywhere, everyone else allowed. */
export function robotsRules(): { userAgent: string | string[]; allow?: string; disallow?: string }[] {
  return [
    { userAgent: [...AI_CRAWLERS], disallow: "/" },
    { userAgent: "*", allow: "/" },
  ];
}

const pattern = new RegExp(AI_CRAWLERS.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i");

/** Whether a User-Agent header belongs to one of the AI crawlers. */
export function isAICrawler(userAgent: string | null): boolean {
  return !!userAgent && pattern.test(userAgent);
}
