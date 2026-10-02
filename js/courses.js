/* ECAP course catalog — single source of truth for programmes.html and register.html.
   "core" = mandatory for every participant. "elective" = choose at least one. */
const ECAP_COURSES = [
  // --- CORE (mandatory) ---
  { id: "leadership", group: "core", title: "Leadership & People Management",
    summary: "Develop authentic, resilient leaders who inspire teams and navigate change with confidence.",
    outline: ["Foundations of authentic leadership", "Leading through organisational change", "Coaching and feedback for performance", "Building high-trust teams"] },
  { id: "entrepreneurship", group: "core", title: "Entrepreneurship & Innovation",
    summary: "Foster creativity, opportunity recognition and agile business development.",
    outline: ["Opportunity recognition & validation", "Lean business model design", "Innovation frameworks", "Pitching & resource mobilisation"] },
  { id: "org-dev", group: "core", title: "Organisational Development",
    summary: "Build strong cultures, manage transformation and enhance team effectiveness.",
    outline: ["Culture diagnostics", "Change management models", "Team effectiveness audits", "Structuring for growth"] },
  { id: "hr", group: "core", title: "Human Resources Development",
    summary: "Master talent acquisition, performance management, succession planning and employee well-being.",
    outline: ["Talent acquisition strategy", "Performance management systems", "Succession planning", "Employee well-being & retention"] },
  { id: "digital", group: "core", title: "Digital Literacy & Data Analytics",
    summary: "Harness AI, big data and digital tools to make smarter, faster decisions.",
    outline: ["AI tools for the modern office", "Reading & presenting data", "Digital workflow automation", "Data-driven decision making"] },
  { id: "eq", group: "core", title: "Emotional Intelligence & Cross-Cultural Communication",
    summary: "Strengthen interpersonal skills and thrive in diverse, multicultural environments.",
    outline: ["Self-awareness & regulation", "Communicating across cultures", "Conflict resolution", "Building psychological safety"] },
  { id: "pm", group: "core", title: "Project Management & Agile Methodologies",
    summary: "Deliver results efficiently using Scrum, Kanban, Lean and other modern frameworks.",
    outline: ["Scrum & Kanban fundamentals", "Agile planning & estimation", "Risk & stakeholder management", "Lean delivery practices"] },

  // --- ELECTIVE (choose at least one) ---
  { id: "marketing", group: "elective", title: "Marketing & Trading",
    summary: "Develop market-entry strategies, brand building and cross-border trade expertise.",
    outline: ["Market-entry strategy", "Brand building for African markets", "Cross-border trade essentials", "Digital marketing fundamentals"] },
  { id: "hse", group: "elective", title: "Health, Safety & Environmental Management",
    summary: "Ensure compliance, mitigate risks and champion sustainability.",
    outline: ["HSE compliance frameworks", "Risk assessment", "Sustainability reporting", "Incident response planning"] },
  { id: "banking", group: "elective", title: "Banking & Financial Services",
    summary: "Navigate capital markets, fintech innovations and regulatory landscapes.",
    outline: ["Capital markets overview", "Fintech & digital banking", "Regulatory landscape", "Risk & compliance in banking"] },
  { id: "accounting", group: "elective", title: "Accounting & Financial Analysis",
    summary: "Strengthen financial reporting, budgeting, auditing and strategic planning.",
    outline: ["Financial reporting standards", "Budgeting & forecasting", "Internal audit practices", "Financial strategic planning"] },
  { id: "supply-chain", group: "elective", title: "Supply Chain & Logistics Management",
    summary: "Optimise global supply chains, procurement and distribution networks.",
    outline: ["Global supply chain design", "Procurement strategy", "Distribution network optimisation", "China–Africa trade logistics"] },
  { id: "negotiation", group: "elective", title: "Strategic Negotiation & Stakeholder Engagement",
    summary: "Build win-win partnerships and manage complex stakeholder ecosystems.",
    outline: ["Negotiation frameworks", "Stakeholder mapping", "Managing multi-party deals", "Cross-cultural negotiation"] },
  { id: "governance", group: "elective", title: "Corporate Governance & Ethics",
    summary: "Promote transparency, accountability and ethical leadership at the highest levels.",
    outline: ["Board governance structures", "Ethics & compliance frameworks", "Transparency & reporting", "Accountability systems"] },
];

/* ECAP runs three cohorts a year. "month" is 1-indexed (Jan = 1). */
const ECAP_COHORTS = [
  { code: "CN", country: "China", month: 10, monthName: "October" },
  { code: "UK", country: "United Kingdom", month: 2, monthName: "February" },
  { code: "GH", country: "Ghana", month: 6, monthName: "June" },
];

/* The next calendar year this cohort's month will run in (this year if it
   hasn't happened yet, otherwise next year). */
function ecapNextCohortYear(month) {
  const now = new Date();
  const year = now.getFullYear();
  const monthNow = now.getMonth() + 1;
  return month >= monthNow ? year : year + 1;
}

// Lets the serverless functions require() this file; a no-op in the browser.
if (typeof module !== "undefined" && module.exports) {
  module.exports = { ECAP_COURSES, ECAP_COHORTS, ecapNextCohortYear };
}
