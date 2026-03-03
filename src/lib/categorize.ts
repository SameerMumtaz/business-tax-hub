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
  type: "income" | "expense";
}

let cachedRules: { vendor_pattern: string; category: string; type: string }[] | null = null;
let rulesCacheTime = 0;
const RULES_CACHE_TTL = 60_000;

async function fetchRules() {
  if (cachedRules && Date.now() - rulesCacheTime < RULES_CACHE_TTL) return cachedRules;
  const { data } = await supabase
    .from("categorization_rules")
    .select("*")
    .order("priority", { ascending: false });
  cachedRules = data || [];
  rulesCacheTime = Date.now();
  return cachedRules;
}

export function invalidateRulesCache() {
  cachedRules = null;
  rulesCacheTime = 0;
}

function matchRule(
  description: string,
  type: string,
  rules: { vendor_pattern: string; category: string; type: string }[]
): string | null {
  const lower = description.toLowerCase();
  for (const rule of rules) {
    if (rule.type === type && lower.includes(rule.vendor_pattern.toLowerCase())) {
      return rule.category;
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

function cleanForMatching(description: string): string {
  return description
    .toLowerCase()
    .replace(/\d{10,}/g, "")
    .replace(/#\d+/g, "")
    .replace(/\bxxxx+\w*/gi, "")
    .replace(/\bckcd\s*\d*/gi, "")
    .replace(/\b\d{4}\s+\d{4}\s+\d{4}\s+\d{4}\b/g, "")
    .replace(/\bconfirmation#?\s*\S+/gi, "")
    .replace(/\bconf#?\s*\S+/gi, "")
    .replace(/\bID:\s*\S+/gi, "")
    .replace(/\bCO\s*ID:\S+/gi, "")
    .replace(/\bINDN:\S+/gi, "")
    .replace(/\bDES:\S+/gi, "")
    .replace(/\bPPD\b|\bCCD\b|\bCTX\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function matchKeyword(description: string, type: string): { category: string; confidence: number } | null {
  const lower = cleanForMatching(description);
  const dict = type === "expense" ? EXPENSE_KEYWORDS : INCOME_KEYWORDS;

  let bestMatch: { category: string; matchLen: number } | null = null;

  for (const [category, keywords] of Object.entries(dict)) {
    for (const kw of keywords) {
      if (lower.includes(kw) && (!bestMatch || kw.length > bestMatch.matchLen)) {
        bestMatch = { category, matchLen: kw.length };
      }
    }
  }

  if (bestMatch) {
    const confidence = Math.min(0.85, 0.6 + bestMatch.matchLen * 0.02);
    return { category: bestMatch.category, confidence };
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
  const rules = await fetchRules();
  const results: CategorizationResult[] = [];

  for (const item of items) {
    const ck = cacheKey(item.description, item.type);
    const cached = sessionCache.get(ck);
    if (cached) {
      results.push({ ...cached, id: item.id });
      continue;
    }

    const ruleMatch = matchRule(item.description, item.type, rules);
    if (ruleMatch) {
      const r: CategorizationResult = { id: item.id, category: ruleMatch, confidence: 1, source: "rule" };
      results.push(r);
      sessionCache.set(ck, r);
      continue;
    }

    const kwMatch = matchKeyword(item.description, item.type);
    if (kwMatch) {
      const r: CategorizationResult = { id: item.id, category: kwMatch.category, confidence: kwMatch.confidence, source: "keyword" };
      results.push(r);
      sessionCache.set(ck, r);
      continue;
    }

    results.push({ id: item.id, category: "Other", confidence: 0, source: "keyword" });
  }

  return results;
}
