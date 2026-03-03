import { supabase } from "@/integrations/supabase/client";
import { ExpenseCategory, EXPENSE_CATEGORIES } from "@/types/tax";

export interface CategorizationResult {
  id: string;
  category: string;
  confidence: number;
  source: "rule" | "keyword";
}

interface CategorizeInput {
  id: string;
  description: string;
  originalDescription?: string;
  type: "income" | "expense";
}

let cachedRules: { vendor_pattern: string; category: string; type: string }[] | null = null;
let rulesCacheTime = 0;
let rulesCacheUserId: string | null = null;
const RULES_CACHE_TTL = 60_000;

async function fetchRules() {
  const { data: authData } = await supabase.auth.getUser();
  const currentUserId = authData.user?.id ?? null;

  if (
    cachedRules &&
    rulesCacheUserId === currentUserId &&
    Date.now() - rulesCacheTime < RULES_CACHE_TTL
  ) {
    return cachedRules;
  }

  const { data } = await supabase
    .from("categorization_rules")
    .select("*")
    .order("priority", { ascending: false });

  cachedRules = data || [];
  rulesCacheTime = Date.now();
  rulesCacheUserId = currentUserId;
  return cachedRules;
}

export function invalidateRulesCache() {
  cachedRules = null;
  rulesCacheTime = 0;
  rulesCacheUserId = null;
  sessionCache.clear();
}

function matchRule(
  description: string,
  type: string,
  rules: { vendor_pattern: string; category: string; type: string }[]
): string | null {
  const cleaned = cleanForMatching(description);
  const fuzzy = normalizeForFuzzy(cleaned);
  const lower = description.toLowerCase();

  for (const rule of rules) {
    if (rule.type !== type) continue;
    const pattern = rule.vendor_pattern.toLowerCase().trim();
    if (!pattern) continue;

    // Match against raw, cleaned, and fuzzy versions
    if (lower.includes(pattern) || cleaned.includes(pattern) || fuzzy.includes(pattern)) {
      return rule.category;
    }

    // Try pattern with punctuation normalized too
    const fuzzyPattern = pattern.replace(/[-'*_.\/\\]/g, " ").replace(/\s+/g, " ").trim();
    if (fuzzyPattern !== pattern && (fuzzy.includes(fuzzyPattern) || cleaned.includes(fuzzyPattern))) {
      return rule.category;
    }

    // Word-boundary matching for short patterns to avoid false positives
    if (pattern.length <= 3) {
      const wordRegex = new RegExp(`\\b${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (wordRegex.test(lower) || wordRegex.test(cleaned)) {
        return rule.category;
      }
    }
  }
  return null;
}

/**
 * Built-in keyword dictionary for instant categorization without AI.
 * Maps common vendor/description keywords to categories.
 */
const EXPENSE_KEYWORDS: Record<string, string[]> = {
  "Office Supplies": [
    "staples", "office depot", "officemax", "office max", "paper", "toner", "ink cartridge",
    "pens", "folders", "binder", "post-it", "sharpie", "avery", "scotch tape", "envelopes",
    "label maker", "filing cabinet", "desk organizer", "sticky notes", "whiteboard",
    "dry erase", "clipboard", "notebook", "stationery", "stamps", "usps", "fedex office",
    "ups store", "shipping supplies", "bubble wrap", "packing", "copy paper", "laminator",
    "paper shredder", "rubber bands", "paper clips", "scissors", "glue", "marker",
    "wal-mart", "walmart", "wm supercenter", "sam's club", "sams club",
    "dollar general", "dollar tree", "family dollar", "five below", "target",
    "action cleaning", "cleaning systems", "cleaning supplies", "janitorial",
  ],
   "Travel": [
    "airline", "airbnb", "hotel", "marriott", "hilton", "hyatt", "sheraton", "westin",
    "holiday inn", "best western", "hampton inn", "courtyard", "residence inn", "fairfield",
    "united air", "delta air", "southwest", "american air", "jetblue", "spirit air",
    "frontier air", "alaska air", "hawaiian air", "british air", "air canada", "lufthansa",
    "expedia", "booking.com", "hotels.com", "priceline", "kayak", "travelocity", "orbitz",
    "uber", "lyft", "taxi", "cab fare", "rental car", "hertz", "avis", "enterprise rent",
    "budget rent", "national car", "alamo rent", "dollar rent", "thrifty",
    "parking", "toll", "flight", "boarding pass", "baggage", "checked bag", "tsa precheck",
    "global entry", "lounge access", "train", "amtrak", "greyhound", "bus ticket",
    "mileage", "gas station", "shell", "chevron", "exxon", "bp ", "mobil", "sunoco",
    "speedway", "wawa", "quiktrip", "circle k", "pilot flying", "loves travel",
    "turnpike", "ez pass", "fastrak", "sunpass", "toll road",
    "qt ", "qt outside", "qt inside", "racetrac", "race trac", "oncue", "on cue",
    "buc-ee", "buc ee", "bucee", "love's", "loves ", "jump start",
    "casey", "caseys", "kwik shop", "murphy express", "murphy oil",
    "7-eleven", "7 eleven", "seven eleven", "sam's mart",
    "kroger fuel", "texaco", "conoco", "phillips 66", "valero", "citgo",
    "nte ", "ntte", "kta auto", "e-zpass",
    "la quinta", "red roof", "super 8", "motel 6", "comfort inn", "days inn",
    "baymont", "wyndham", "mainstay", "extended stay", "studio 6",
    "5 star travel", "studios & suites",
  ],
  "Software & SaaS": [
    "adobe", "microsoft", "office 365", "microsoft 365", "google workspace", "google cloud",
    "slack", "zoom", "zoom.us", "dropbox", "github", "gitlab", "bitbucket",
    "aws", "amazon web services", "azure", "heroku", "vercel", "netlify", "digitalocean",
    "linode", "cloudflare", "godaddy", "namecheap", "squarespace", "wix",
    "figma", "sketch", "invision", "notion", "jira", "atlassian", "confluence",
    "trello", "asana", "monday.com", "clickup", "basecamp", "linear",
    "salesforce", "hubspot", "mailchimp", "sendgrid", "twilio", "stripe fee",
    "shopify", "bigcommerce", "woocommerce", "magento",
    "canva", "openai", "anthropic", "chatgpt", "copilot",
    "quickbooks", "xero", "freshbooks", "wave accounting", "sage",
    "docusign", "hellosign", "pandadoc",
    "intercom", "zendesk", "freshdesk", "drift", "crisp",
    "datadog", "new relic", "sentry", "logrocket", "mixpanel", "amplitude", "segment",
    "airtable", "coda", "supabase", "firebase", "mongodb atlas", "planetscale",
    "1password", "lastpass", "dashlane", "bitwarden",
    "loom", "calendly", "typeform", "surveymonkey", "google forms",
    "zapier", "make.com", "ifttt", "n8n", "workato",
    "grammarly", "jasper ai", "copy.ai", "writesonic",
    "webflow", "bubble.io", "retool", "appsmith",
    "semrush", "ahrefs", "moz", "screaming frog",
    "postman", "insomnia", "ngrok",
    "npm", "yarn", "docker", "kubernetes",
    "snowflake", "databricks", "tableau", "power bi", "looker",
    "okta", "auth0", "clerk",
    "twitch", "spotify for business", "pandora business",
    "ring central", "grasshopper", "dialpad", "vonage",
    "software", "saas", "cloud service", "api", "platform fee", "tech subscription",
    "domain", "hosting", "ssl cert", "cdn",
  ],
  "Marketing": [
    "facebook ads", "google ads", "meta ads", "linkedin ads", "twitter ads", "tiktok ads",
    "instagram ads", "pinterest ads", "snapchat ads", "reddit ads", "youtube ads",
    "bing ads", "microsoft ads", "apple search ads", "amazon ads",
    "advertising", "campaign", "promotion", "social media", "seo", "marketing",
    "pr agency", "public relations", "press release", "media buy", "ad spend",
    "influencer", "sponsorship", "brand ambassador", "affiliate marketing",
    "trade show", "conference booth", "expo", "banner", "signage", "flyer", "brochure",
    "business cards", "branded merch", "swag", "promotional item",
    "email campaign", "newsletter", "drip campaign", "lead gen", "lead generation",
    "content marketing", "copywriting", "blog post", "ghostwriter",
    "video production", "podcast", "webinar", "event marketing",
    "google analytics", "facebook pixel", "conversion tracking",
    "vistaprint", "moo.com", "printful", "custom ink",
    "hootsuite", "buffer", "sprout social", "later.com", "planoly",
  ],
  "Professional Services": [
    "legal", "attorney", "lawyer", "law firm", "law office", "legal fee", "retainer",
    "accountant", "accounting", "cpa", "tax preparation", "tax prep", "tax filing",
    "consulting", "consultant", "advisory", "advisor", "bookkeeping", "bookkeeper",
    "audit fee", "compliance", "notary", "paralegal", "mediation", "arbitration",
    "architect", "engineering", "surveyor", "appraiser", "inspector",
    "hr consulting", "recruiter", "staffing agency", "headhunter", "temp agency",
    "freelancer", "contractor", "subcontractor", "1099 worker",
    "graphic design", "web design", "web develop", "app develop", "it consult",
    "cybersecurity", "penetration test", "security audit",
    "translation", "interpreter", "transcription",
    "photography", "videograph", "editing service",
    "coaching", "mentor", "training", "workshop", "seminar",
    "deloitte", "kpmg", "pwc", "ernst & young", "ey ", "accenture", "mckinsey", "bain",
    "bcg", "booz allen",
  ],
  "Utilities": [
    "electric", "electricity", "power bill", "energy bill", "water bill", "sewer",
    "gas bill", "natural gas", "propane", "heating",
    "internet", "broadband", "fiber", "wifi", "isp",
    "comcast", "xfinity", "verizon", "at&t", "t-mobile", "sprint", "spectrum",
    "cox comm", "centurylink", "lumen", "windstream", "frontier comm", "optimum",
    "google fiber", "starlink",
    "phone bill", "cell phone", "mobile phone", "telephone", "landline",
    "utility", "municipal", "city of ", "town of ", "county of ",
    "waste management", "trash", "garbage", "recycling", "sanitation",
    "duke energy", "dominion energy", "southern company", "exelon", "pg&e",
    "con edison", "national grid", "entergy", "ameren", "xcel energy",
    "first energy", "dte energy", "consumers energy", "ppl electric",
  ],
  "Insurance": [
    "insurance", "insur", "geico", "state farm", "allstate", "progressive",
    "nationwide", "liberty mutual", "farmers", "travelers", "usaa", "erie insurance",
    "hartford", "chubb", "aig", "zurich", "lloyds",
    "premium", "coverage", "policy", "deductible", "copay",
    "health insurance", "dental insurance", "vision insurance", "life insurance",
    "disability insurance", "workers comp", "liability insurance", "e&o insurance",
    "d&o insurance", "cyber insurance", "property insurance", "fire insurance",
    "flood insurance", "auto insurance", "vehicle insurance", "commercial auto",
    "umbrella policy", "general liability", "professional liability", "malpractice",
    "bonding", "surety bond", "fidelity bond",
    "blue cross", "blue shield", "aetna", "cigna", "united health", "humana", "kaiser",
    "anthem", "metlife", "prudential", "aflac", "guardian", "lincoln financial",
    "principal financial", "mutual of omaha",
  ],
  "Meals & Entertainment": [
    "restaurant", "cafe", "coffee", "starbucks", "dunkin", "peet's", "tim horton",
    "mcdonald", "burger king", "wendy", "chick-fil-a", "popeyes", "kfc", "taco bell",
    "subway", "jimmy john", "jersey mike", "firehouse sub", "panera", "chipotle",
    "five guys", "in-n-out", "shake shack", "whataburger", "jack in the box",
    "panda express", "noodles", "olive garden", "applebee", "chili's", "outback",
    "red lobster", "longhorn", "texas roadhouse", "cracker barrel", "ihop", "denny",
    "waffle house", "bob evans", "perkins",
    "doordash", "grubhub", "uber eats", "postmates", "caviar", "seamless",
    "instacart", "gopuff",
    "lunch", "dinner", "breakfast", "brunch", "catering", "food delivery",
    "meal", "dining", "eatery", "pizz", "sushi", "thai", "chinese food", "indian food",
    "mexican food", "italian food", "deli", "bakery", "bagel",
    "bar ", "pub ", "tavern", "brewery", "winery", "wine bar", "cocktail",
    "happy hour", "drinks", "nightclub",
    "movie", "cinema", "theater", "theatre", "concert", "ticket", "ticketmaster",
    "stubhub", "live nation", "eventbrite", "amusement", "bowling", "golf", "spa",
    "gym", "fitness", "recreation", "entertainment", "netflix", "hulu", "disney+",
    "spotify", "apple music", "audible",
  ],
  "Equipment": [
    "computer", "laptop", "desktop", "workstation", "monitor", "display", "screen",
    "keyboard", "mouse", "trackpad", "webcam", "headset", "headphones", "microphone",
    "printer", "scanner", "copier", "fax", "shredder",
    "hardware", "apple store", "apple.com", "best buy", "dell", "lenovo", "hp ",
    "hewlett packard", "asus", "acer", "samsung", "lg electronics", "logitech",
    "razer", "corsair", "microsoft surface", "thinkpad",
    "server", "rack", "ups battery", "surge protector", "power strip",
    "cable", "adapter", "dongle", "usb hub", "docking station", "kvm switch",
    "router", "modem", "switch", "access point", "network equipment",
    "external hard drive", "ssd", "nas", "memory", "ram", "gpu",
    "projector", "smart board", "interactive display",
    "office furniture", "standing desk", "ergonomic chair", "herman miller",
    "steelcase", "ikea business",
    "phone system", "voip", "conference phone", "video conferenc",
    "security camera", "access control", "alarm system", "safe", "lock",
    "forklift", "hand truck", "dolly", "shelving", "racking",
    "tool", "drill", "saw", "compressor", "generator",
    "vehicle", "truck", "van", "fleet",
    "b&h photo", "adorama", "newegg", "micro center", "cdw",
    "home depot", "the home depot", "lowe's", "lowes", "menards",
    "harbor freight", "ace hardware", "ace mart", "true value",
    "autozone", "auto zone", "o'reilly", "oreilly", "napa auto",
    "advance auto", "pep boys", "jiffy lube", "valvoline", "midas",
    "tire shop", "tire center", "discount tire", "firestone",
    "pressure washer", "barton solvents", "icon collision",
    "match auto", "dee's tire", "dees auto",
    "car wash", "launch pad car", "soapy suds",
  ],
  "Rent": [
    "rent", "lease", "office space", "wework", "regus", "coworking", "co-working",
    "industrious", "spaces", "knotel", "convene",
    "commercial lease", "retail space", "warehouse", "storage unit", "self storage",
    "public storage", "extra space", "cubesmart", "life storage", "u-haul storage",
    "property management", "building maintenance", "common area", "cam charge",
    "real estate", "sublease", "tenant", "landlord",
    "parking space", "reserved parking", "garage rental",
    "mailbox rental", "po box", "virtual office",
  ],
  "Payroll": [
    "payroll", "salary", "wages", "adp", "gusto", "paychex", "paylocity", "paycom",
    "ceridian", "dayforce", "rippling", "justworks", "zenefits", "bamboohr",
    "bonus", "commission", "overtime", "pto payout", "severance",
    "direct deposit", "paycheck", "pay stub", "w-2", "w2",
    "benefits", "401k", "retirement", "pension", "hsa", "fsa",
    "employer tax", "fica", "suta", "futa", "medicare", "social security",
    "workers compensation", "work comp",
    "employee", "staff", "personnel", "labor",
  ],
  "Other": [
    "bank fee", "bank charge", "overdraft", "nsf fee", "wire fee", "transfer fee",
    "atm fee", "service charge", "monthly fee", "annual fee", "maintenance fee",
    "late fee", "penalty", "fine", "citation",
    "tax payment", "irs", "federal tax", "state tax", "sales tax", "property tax",
    "excise tax", "estimated tax", "quarterly tax",
    "donation", "charity", "nonprofit", "contribution", "sponsorship",
    "dues", "membership", "association", "chamber of commerce",
    "license fee", "permit", "registration", "filing fee", "renewal",
    "depreciation", "amortization", "write-off",
    "refund", "credit", "adjustment", "chargeback", "dispute",
    "loan payment", "interest payment", "principal payment", "mortgage",
    "line of credit", "credit card payment", "finance charge",
    "miscellaneous", "sundry", "general expense", "other expense",
  ],
};

const INCOME_KEYWORDS: Record<string, string[]> = {
  "Product Sales": [
    "product sale", "merchandise", "inventory sale", "retail sale", "shopify payout",
    "amazon payout", "ebay payout", "etsy payout", "walmart payout",
    "wholesale", "distribution", "resale", "goods sold", "unit sold",
    "pos sale", "point of sale", "register sale", "cash sale",
    "online sale", "ecommerce", "e-commerce", "storefront",
    "order fulfillment", "shipping revenue", "delivery fee",
    "square payout", "clover payout", "toast payout",
    "product revenue", "sales revenue", "gross sale",
  ],
  "Service Revenue": [
    "service", "project fee", "client payment", "invoice payment", "professional fee",
    "billable hour", "hourly rate", "flat fee", "retainer fee", "engagement",
    "contract payment", "milestone payment", "progress payment",
    "maintenance fee", "support fee", "managed service",
    "implementation fee", "setup fee", "onboarding fee",
    "training fee", "workshop fee", "session fee",
    "repair", "installation", "service call", "labor charge",
    "design fee", "development fee", "creative fee",
    "service income", "service revenue", "fee income",
  ],
  "Consulting": [
    "consulting", "advisory fee", "engagement fee", "strategy fee",
    "management consulting", "it consulting", "business consulting",
    "consulting income", "consulting revenue", "consultant fee",
    "expert fee", "specialist fee", "analysis fee", "assessment fee",
    "audit fee", "review fee", "evaluation fee",
    "coaching fee", "mentoring fee",
  ],
  "Subscription": [
    "subscription", "recurring", "monthly fee", "annual fee", "membership",
    "subscription revenue", "recurring revenue", "mrr", "arr",
    "plan upgrade", "plan renewal", "auto-renew",
    "premium plan", "pro plan", "enterprise plan", "basic plan",
    "subscriber", "member payment",
    "saas revenue", "platform fee", "access fee",
  ],
  "Licensing": [
    "license", "licensing", "royalt", "intellectual property", "ip license",
    "patent", "trademark", "copyright", "usage rights", "distribution rights",
    "franchise fee", "licensing fee", "license revenue",
    "content license", "music license", "image license", "software license",
    "white label", "oem", "reseller",
  ],
  "Affiliate": [
    "affiliate", "referral", "commission", "partner payout", "rev share",
    "revenue share", "finder's fee", "introduction fee",
    "affiliate income", "referral bonus", "referral income",
    "partner commission", "reseller commission", "agent commission",
    "cpa payout", "cpl payout", "lead bounty",
    "amazon associate", "clickbank", "shareasale", "cj affiliate",
    "rakuten", "impact radius", "partnerstack",
  ],
  "Interest": [
    "interest", "dividend", "yield", "savings", "interest income",
    "interest earned", "interest received", "accrued interest",
    "bond interest", "cd interest", "money market",
    "investment income", "capital gain", "realized gain",
    "stock dividend", "preferred dividend", "distribution",
    "reit dividend", "mutual fund", "etf distribution",
    "treasury", "t-bill", "note interest",
  ],
  "Other": [
    "income", "revenue", "receipt", "deposit", "credit",
    "refund received", "reimbursement", "rebate", "cashback",
    "insurance proceeds", "claim payment", "settlement",
    "grant", "award", "prize", "stipend", "scholarship",
    "rental income", "lease income", "tenant payment",
    "sale of asset", "equipment sale", "vehicle sale",
    "miscellaneous income", "other income", "sundry income",
  ],
};

/**
 * Aggressively clean bank descriptions for matching.
 * Strips transaction prefixes, merchant platform prefixes, trailing
 * location info, reference numbers, and normalizes punctuation.
 */
function cleanForMatching(description: string): string {
  let s = description.toLowerCase();

  // Strip common transaction type prefixes
  s = s.replace(/^(pos\s*(purchase|debit|refund|withdrawal)?|debit\s*card\s*(purchase)?|visa\s*(purchase)?|mastercard\s*(purchase)?|ach\s*(payment|debit|credit|transfer)?|wire\s*(transfer)?|check\s*\d*|electronic\s*(payment|transfer)?|recurring\s*(payment)?|autopay\s*(payment)?|online\s*(payment|transfer)?|mobile\s*(payment)?|bill\s*pay(ment)?|pre-?auth(orized)?)\s*/i, "");

  // Strip merchant platform prefixes (SQ *, TST*, SP *, PAYPAL *, etc.)
  s = s.replace(/^(sq\s*\*|tst\s*\*|sp\s*\*|paypal\s*\*|pp\s*\*|amzn\s*\*|amazon\s*\*|google\s*\*|apple\s*\*|msft\s*\*|shopify\s*\*|stripe\s*\*|venmo\s*\*|zelle\s*\*|cash\s*app\s*\*|chk?\s*card\s*)\s*/i, "");

  // Strip trailing location info (city, state, zip patterns)
  s = s.replace(/\s+[A-Z]{2}\s*\d{5}(-\d{4})?\s*$/i, "");
  s = s.replace(/\s+(#\d+\s+)?[a-z]{2,20}\s+[a-z]{2}\s*$/i, "");

  // Strip reference/card numbers and banking codes
  s = s.replace(/\d{10,}/g, "");
  s = s.replace(/#\s*\d+/g, "");
  s = s.replace(/\bxxxx+\w*/gi, "");
  s = s.replace(/\bx{4,}\d*/gi, "");
  s = s.replace(/\bckcd\s*\d*/gi, "");
  s = s.replace(/\b\d{4}\s+\d{4}\s+\d{4}\s+\d{4}\b/g, "");
  s = s.replace(/\bconfirmation#?\s*\S+/gi, "");
  s = s.replace(/\bconf#?\s*\S+/gi, "");
  s = s.replace(/\bref#?\s*\S+/gi, "");
  s = s.replace(/\btrace#?\s*\S+/gi, "");
  s = s.replace(/\bauth#?\s*\S+/gi, "");
  s = s.replace(/\bID:\s*\S+/gi, "");
  s = s.replace(/\bCO\s*ID:\S+/gi, "");
  s = s.replace(/\bINDN:\S+/gi, "");
  s = s.replace(/\bDES:\S+/gi, "");
  s = s.replace(/\bSEC:\S+/gi, "");
  s = s.replace(/\bPPD\b|\bCCD\b|\bCTX\b|\bWEB\b|\bTEL\b/gi, "");
  s = s.replace(/\bcard\s*\d+/gi, "");

  // Normalize punctuation: replace * - _ / with spaces
  s = s.replace(/[*_\/\\]+/g, " ");
  s = s.replace(/-{2,}/g, " ");

  // Collapse whitespace
  s = s.replace(/\s+/g, " ").trim();

  return s;
}

/**
 * Also produce a "normalized" version with all punctuation
 * removed and hyphens converted to spaces for fuzzy matching.
 */
function normalizeForFuzzy(cleaned: string): string {
  return cleaned
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Pre-build flat keyword maps for O(1)-ish lookup (built once, reused)
let expenseKeywordList: { keyword: string; category: string }[] | null = null;
let incomeKeywordList: { keyword: string; category: string }[] | null = null;

function getKeywordList(type: string): { keyword: string; category: string }[] {
  if (type === "expense") {
    if (!expenseKeywordList) {
      expenseKeywordList = [];
      for (const [cat, kws] of Object.entries(EXPENSE_KEYWORDS)) {
        for (const kw of kws) expenseKeywordList.push({ keyword: kw, category: cat });
      }
      // Sort by keyword length descending so longest match wins first
      expenseKeywordList.sort((a, b) => b.keyword.length - a.keyword.length);
    }
    return expenseKeywordList;
  }
  if (!incomeKeywordList) {
    incomeKeywordList = [];
    for (const [cat, kws] of Object.entries(INCOME_KEYWORDS)) {
      for (const kw of kws) incomeKeywordList.push({ keyword: kw, category: cat });
    }
    incomeKeywordList.sort((a, b) => b.keyword.length - a.keyword.length);
  }
  return incomeKeywordList;
}

function matchKeyword(description: string, type: string): { category: string; confidence: number } | null {
  const cleaned = cleanForMatching(description);
  const fuzzy = normalizeForFuzzy(cleaned);
  const kwList = getKeywordList(type);

  for (const { keyword, category } of kwList) {
    // Try against cleaned version first, then fuzzy (no punctuation)
    if (cleaned.includes(keyword) || fuzzy.includes(keyword)) {
      const confidence = Math.min(0.85, 0.6 + keyword.length * 0.02);
      return { category, confidence };
    }
    // For multi-word keywords, also try with hyphens removed from source
    if (keyword.includes("-") || keyword.includes("'")) {
      const altKw = keyword.replace(/[-']/g, " ").replace(/\s+/g, " ");
      if (fuzzy.includes(altKw)) {
        const confidence = Math.min(0.85, 0.6 + keyword.length * 0.02);
        return { category, confidence };
      }
    }
  }

  return null;
}

const sessionCache = new Map<string, CategorizationResult>();

function cacheKey(desc: string, type: string) {
  return `${type}:${desc.toLowerCase().trim()}`;
}

/**
 * Categorize transactions using rules + keywords only. No AI.
 * Priority: Session cache → Custom rules → Keyword dictionary → "Other"
 */
export async function categorizeTransactions(
  items: CategorizeInput[],
): Promise<CategorizationResult[]> {
  // Always clear session cache before categorizing to ensure fresh rule matches
  sessionCache.clear();
  const rules = await fetchRules();
  const results: CategorizationResult[] = [];

  for (const item of items) {
    const ck = cacheKey(item.description, item.type);
    const cached = sessionCache.get(ck);
    if (cached) {
      results.push({ ...cached, id: item.id });
      continue;
    }

    // Try matching rules against both cleaned description and original description
    const ruleMatch = matchRule(item.description, item.type, rules) 
      || (item.originalDescription ? matchRule(item.originalDescription, item.type, rules) : null);
    if (ruleMatch) {
      const r: CategorizationResult = { id: item.id, category: ruleMatch, confidence: 1, source: "rule" };
      results.push(r);
      sessionCache.set(ck, r);
      continue;
    }

    // Also try keyword matching against both descriptions
    const kwMatch = matchKeyword(item.description, item.type)
      || (item.originalDescription ? matchKeyword(item.originalDescription, item.type) : null);
    if (kwMatch) {
      const r: CategorizationResult = { id: item.id, category: kwMatch.category, confidence: kwMatch.confidence, source: "keyword" };
      results.push(r);
      sessionCache.set(ck, r);
      continue;
    }

    // Don't cache "Other" — allows re-categorization to work if rules are added later
    results.push({ id: item.id, category: "Other", confidence: 0, source: "keyword" });
  }

  return results;
}

/**
 * Apply all rules + keyword dictionary to uncategorized ("Other") transactions in the DB.
 * Returns the count of transactions that were re-categorized.
 */
export async function applyRulesToUncategorized(userId: string): Promise<{ expenseCount: number; salesCount: number }> {
  invalidateRulesCache();
  
  // Fetch all "Other" expenses and sales for this user
  const [{ data: otherExpenses }, { data: otherSales }] = await Promise.all([
    supabase.from("expenses").select("id, vendor, description").eq("user_id", userId).in("category", ["Other", "other"]),
    supabase.from("sales").select("id, client, description").eq("user_id", userId).in("category", ["Other", "other"]),
  ]);

  let expenseCount = 0;
  let salesCount = 0;

  // Re-categorize expenses
  if (otherExpenses && otherExpenses.length > 0) {
    const items: CategorizeInput[] = otherExpenses.map((e: any) => ({
      id: e.id,
      description: e.vendor || e.description || "",
      originalDescription: e.description || "",
      type: "expense" as const,
    }));
    const results = await categorizeTransactions(items);
    for (const r of results) {
      if (r.category !== "Other") {
        await supabase.from("expenses").update({ category: r.category }).eq("id", r.id);
        expenseCount++;
      }
    }
  }

  // Re-categorize sales
  if (otherSales && otherSales.length > 0) {
    const items: CategorizeInput[] = otherSales.map((s: any) => ({
      id: s.id,
      description: s.client || s.description || "",
      originalDescription: s.description || "",
      type: "income" as const,
    }));
    const results = await categorizeTransactions(items);
    for (const r of results) {
      if (r.category !== "Other") {
        await supabase.from("sales").update({ category: r.category }).eq("id", r.id);
        salesCount++;
      }
    }
  }

  return { expenseCount, salesCount };
}
