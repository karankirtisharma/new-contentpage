/**
 * Chapter copy — §3 and §7 of the plan.
 *
 * "Text is the enemy": each chapter puts a label, one headline, at most two sentences
 * and 6–8 capability chips on the canvas. The complete bullet list for every service
 * area lives in `groups` and is rendered into a drawer — in the DOM at all times for
 * SEO and completeness, off the canvas for legibility.
 */

export type ServiceGroup = {
  ref: string;
  title: string;
  items: string[];
};

export type Chapter = {
  id: string;
  index: number;
  label: string;
  headline: string;
  lede: string;
  chips: string[];
  groups: ServiceGroup[];
  /** t range, mirrors CHAPTER_RANGES. */
  range: [number, number];
};

export const CHAPTERS: Chapter[] = [
  {
    id: 'signal',
    index: 0,
    label: 'CYPHERNAUT / CONTENT',
    headline: 'What we make,\npeople see.',
    lede: 'Content creation and media production for protocols, exchanges and funds — from the first research doc to the last retention chart.',
    chips: [],
    groups: [],
    range: [0.0, 0.12],
  },
  {
    id: 'direct',
    index: 1,
    label: 'CHAPTER 01 — DIRECT',
    headline: 'Before the camera,\nthe decision.',
    lede: 'Every asset starts as a position: who you are talking to, what they already believe, and the one thing they should remember. We write that down before anything gets built.',
    chips: [
      'Content strategy',
      'Campaign concepts',
      'Editorial calendar',
      'Creative direction',
      'Storyboarding',
      'Key visuals',
      'Infographics',
      'Pitch decks',
    ],
    groups: [
      {
        ref: '7.1',
        title: 'Content Strategy & Creative Direction',
        items: [
          'Audience and market research across holders, traders, builders and institutions',
          'Positioning and messaging hierarchy — one core claim, three supporting proofs',
          'Narrative architecture for launches, migrations, rebrands and token events',
          'Content pillars mapped to funnel stage and platform',
          'Quarterly editorial calendars with owner, format and channel per slot',
          'Campaign concepting: big idea, mechanic, asset list, sequencing',
          'Creative direction and art direction across every downstream asset',
          'Tone-of-voice guides with worked before/after examples',
          'Competitive content audits and share-of-voice benchmarking',
          'Message testing against community sentiment before spend',
          'Launch playbooks: pre-announce, announce, sustain, post-mortem',
          'Crisis and incident communications templates, pre-approved',
          'Content governance — approval chains, legal review, disclaimer standards',
          'Workshop facilitation with founders and core contributors',
          'Documentation of the whole system so your team can run it without us',
        ],
      },
      {
        ref: '7.11',
        title: 'Graphic Design & Visual Content',
        items: [
          'Key visuals and campaign art direction',
          'Infographics that explain mechanism, not decoration',
          'Data visualisation for tokenomics, emissions and treasury',
          'Social templates per platform with locked type and spacing rules',
          'Pitch decks and investor one-pagers',
          'Litepaper and whitepaper layout and typesetting',
          'Brand illustration systems and icon sets',
          'Event collateral: booth graphics, banners, badges, print',
          'Merch and physical goods artwork prepared for production',
          'Thumbnail systems built and tested for click-through',
          'Storyboards and animatics ahead of production',
          'Design system extension — tokens, components, usage docs',
          'Figma libraries handed over with naming conventions intact',
          'Asset packaging and versioned handover to your team',
        ],
      },
    ],
    range: [0.12, 0.3],
  },
  {
    id: 'produce',
    index: 2,
    label: 'CHAPTER 02 — PRODUCE',
    headline: 'A studio,\nnot a render farm.',
    lede: 'Live sets, motion graphics, founder-facing camera work and full post. One team from the storyboard to the graded master, so nothing is lost in the handoff.',
    chips: [
      'Launch trailers',
      'Animated explainers',
      'Tokenomics animations',
      'Founder videos',
      'Podcast production',
      'Livestreams & AMAs',
      'UGC campaigns',
      'Colour, sound, VO',
    ],
    groups: [
      {
        ref: '7.2',
        title: 'Promotional & Advertising Content',
        items: [
          'Launch and mainnet trailers',
          'Product announcement films',
          'Paid social ad sets built as variants, not one-offs',
          'Pre-roll and bumper cuts at 6s / 15s / 30s',
          'Conference sizzle reels and event openers',
          'Partnership and integration announcement pieces',
          'Testimonial and case-study films',
          'Recruitment and culture videos',
          'Landing-page hero loops, silent-first',
          'App-store and marketplace preview videos',
        ],
      },
      {
        ref: '7.3',
        title: 'Motion Graphics & Animation',
        items: [
          '2D motion graphics and kinetic typography',
          '3D product and protocol visualisations',
          'Tokenomics and emission-schedule animations',
          'Mechanism walkthroughs — how the thing actually works',
          'Animated logo stings and brand idents',
          'UI motion demos and interaction reels',
          'Lower thirds, transitions and broadcast packages',
          'Character and mascot animation',
          'Looping ambient backgrounds for streams and stages',
          'Data-driven animation from live or snapshot figures',
        ],
      },
      {
        ref: '7.4',
        title: 'Educational & Explainer Content',
        items: [
          'Protocol explainers for non-technical audiences',
          '"How it works" series with a consistent visual grammar',
          'Onboarding and first-transaction walkthroughs',
          'Security and self-custody education',
          'Governance participation guides',
          'Glossary and concept micro-videos',
          'Comparison pieces framed on mechanism, not competitors',
          'Course-format series with assessments',
          'Interactive explainers and scrollytelling pages',
          'Accessibility-checked captions and transcripts on everything',
        ],
      },
      {
        ref: '7.12',
        title: 'Video Production & Post-Production',
        items: [
          'Pre-production: scripting, boards, shot lists, scheduling',
          'Studio and on-location shoots with full crew',
          'Multi-camera and remote-guest capture',
          'Directing talent who have never been on camera',
          'Editorial — assembly, rough, fine, lock',
          'Colour grading to a defined brand LUT',
          'Sound design, mix and mastering to broadcast loudness',
          'Voice-over casting, direction and recording',
          'Subtitling, captioning and burned-in variants',
          'Versioning per platform and aspect ratio',
          'Archive, proxy workflow and long-term asset storage',
          'Rights, releases and music licensing handled up front',
        ],
      },
      {
        ref: '7.8',
        title: 'Talking-Head & Founder Content',
        items: [
          'Founder positioning and personal narrative development',
          'Message coaching and on-camera direction',
          'Studio-quality remote capture kits shipped to the talent',
          'Teleprompter scripting written for the ear, not the page',
          'Recurring founder series with a repeatable set',
          'Thought-leadership shorts cut from long interviews',
          'Conference talk capture and repackaging',
          'Investor and press interview preparation',
          'Response and commentary content turned around same-day',
        ],
      },
      {
        ref: '7.9',
        title: 'Podcast Production',
        items: [
          'Format design, naming and season structure',
          'Guest sourcing, booking and briefing',
          'Remote and in-studio multitrack recording',
          'Editing, noise repair, levelling and mastering',
          'Show art, audiograms and episode graphics',
          'Video podcast multi-cam edits',
          'Distribution to every major audio platform with correct metadata',
          'Chapter markers, transcripts and show notes',
          'Clip strategy — three to six shorts per episode',
          'Listener growth reporting and format iteration',
        ],
      },
      {
        ref: '7.10',
        title: 'Livestreams & Virtual Events',
        items: [
          'AMA and town-hall production',
          'Multi-guest remote streaming with a live switcher',
          'Broadcast graphics packages and lower thirds',
          'Run-of-show scripting and rehearsal',
          'Moderation, queueing and question triage',
          'Simulcast to X, YouTube, Twitch and Discord stage',
          'Live captioning and accessibility',
          'Post-event highlight reels within 24 hours',
          'Virtual conference and demo-day production',
          'Recording archives cut into an evergreen library',
        ],
      },
      {
        ref: '7.7',
        title: 'UGC & Creator-Led Content',
        items: [
          'Creator sourcing, vetting and briefing',
          'UGC ad sets built for paid, not organic',
          'Ambassador and KOL programme design',
          'Community content contests with judging rubrics',
          'Whitelisting and usage-rights management',
          'Creator brief templates that survive contact with reality',
          'Performance tracking per creator and per hook',
          'Repurposing UGC into owned-channel assets',
        ],
      },
    ],
    range: [0.3, 0.55],
  },
  {
    id: 'multiply',
    index: 3,
    label: 'CHAPTER 03 — MULTIPLY',
    headline: 'One shoot.\nForty assets.',
    lede: 'Nothing is made once. Every long-form piece is designed from the storyboard to break into shorts, threads, carousels, newsletters and translated cuts.',
    chips: [
      'Shorts / Reels / TikTok',
      'X threads',
      'Carousels',
      'Newsletters',
      'Audiograms',
      'Blog & thought-leadership',
      'Whitepaper summaries',
      '10+ languages',
    ],
    groups: [
      {
        ref: '7.15',
        title: 'Content Repurposing & Atomisation',
        items: [
          'Atomisation maps drawn at the storyboard stage, not after the edit',
          'Long-form to short-form cutdowns with platform-native hooks',
          'Vertical reframing with subject tracking',
          'Audiograms and waveform clips from podcast and stream audio',
          'Quote cards and pull-out graphics',
          'Blog posts derived from video transcripts and rewritten, not pasted',
          'Thread and carousel adaptations of every long-form piece',
          'Newsletter sections assembled from the month\'s output',
          'Evergreen re-runs scheduled against a decay curve',
          'Asset libraries indexed so your team can find and reuse anything',
        ],
      },
      {
        ref: '7.5',
        title: 'Social Media Content',
        items: [
          'Short-form vertical video for TikTok, Reels and Shorts',
          'X / Twitter threads with a written hook discipline',
          'LinkedIn posts and long-form articles',
          'Instagram carousels and static sets',
          'Discord and Telegram announcement copy',
          'Farcaster and decentralised-social native posting',
          'Meme and reactive content with a same-day turnaround',
          'Community highlight and milestone posts',
          'Platform-specific hook libraries, tested and refreshed',
          'Full calendar operation and scheduling',
          'Reply-guy and engagement layer where it fits the brand',
        ],
      },
      {
        ref: '7.6',
        title: 'Long-Form Written Content',
        items: [
          'Thought-leadership essays under founder or team byline',
          'Technical deep-dives reviewed by your engineers',
          'Research reports and market analyses',
          'Whitepaper and litepaper writing and editing',
          'Whitepaper summaries for non-technical readers',
          'Documentation narrative and information architecture',
          'Case studies and integration stories',
          'Press releases and media kits',
          'Ghostwriting with a maintained voice profile',
          'Editorial review, fact-checking and source discipline',
          'SEO-aware structure without SEO-shaped prose',
        ],
      },
      {
        ref: '7.16',
        title: 'Localization & Regional Content',
        items: [
          'Translation into 10+ priority languages',
          'Cultural adaptation, not literal translation',
          'Native-speaker review on every locale',
          'Subtitles, captions and dubbed voice-over',
          'Region-specific creators and community managers',
          'Locale-aware imagery, examples and references',
          'Regional platform coverage — WeChat, Kakao, LINE, VK',
          'Right-to-left layout handling',
          'Per-region performance reporting',
          'Glossary and terminology management across all locales',
        ],
      },
    ],
    range: [0.55, 0.72],
  },
  {
    id: 'distribute',
    index: 4,
    label: 'CHAPTER 04 — DISTRIBUTE & MEASURE',
    headline: 'Published is not\nthe finish line.',
    lede: 'Assets go out on a schedule, against a hypothesis. What worked gets more budget, what did not gets rewritten. Every month, in writing.',
    chips: [
      'YouTube management',
      'Cross-platform scheduling',
      'Governance explainers',
      'Developer tutorials',
      'Watch-time analysis',
      'Hook & thumbnail testing',
      'Monthly reports',
      'Ongoing optimisation',
    ],
    groups: [
      {
        ref: '7.17',
        title: 'Distribution & Publishing',
        items: [
          'Full YouTube channel management — metadata, playlists, end screens',
          'Cross-platform scheduling from a single calendar',
          'Platform-native upload specs and encoding per destination',
          'Thumbnail and title systems with a testing loop',
          'SEO metadata, tags, chapters and descriptions',
          'Paid amplification setup and creative rotation',
          'Syndication to partner and ecosystem channels',
          'Press and media outreach with tailored assets',
          'Newsletter and email deployment',
          'Publishing runbooks so launches do not depend on one person',
        ],
      },
      {
        ref: '7.18',
        title: 'Analytics & Optimization',
        items: [
          'Watch-time and retention curve analysis, shot by shot',
          'Hook testing — first three seconds, isolated as a variable',
          'Thumbnail and title A/B programmes',
          'Funnel attribution from impression to on-chain action',
          'Cohort and audience-composition reporting',
          'Sentiment tracking across community channels',
          'Competitive benchmarking on a fixed cadence',
          'Monthly written reports with decisions, not just charts',
          'Quarterly strategy reviews and roadmap adjustment',
          'Dashboards your team can read without us in the room',
          'Documented experiments with a hypothesis and a verdict',
        ],
      },
      {
        ref: '7.13',
        title: 'Community & Ecosystem Content',
        items: [
          'Governance proposal explainers and voting guides',
          'Ecosystem and grantee spotlights',
          'Community newsletters and recaps',
          'Contributor onboarding material',
          'Ambassador programme content kits',
          'Event and IRL meetup coverage',
          'Milestone and roadmap communications',
          'Moderation guidance and canned-response libraries',
          'DAO documentation and decision archives',
          'Partner co-marketing packages',
        ],
      },
      {
        ref: '7.14',
        title: 'Developer & Technical Content',
        items: [
          'Developer documentation and quickstarts',
          'SDK and API tutorials with runnable examples',
          'Integration guides for partner teams',
          'Code walkthrough videos and screencasts',
          'Hackathon material, prompts and judging criteria',
          'Technical blog posts reviewed by your engineers',
          'Architecture diagrams and system explainers',
          'Audit summary communications for non-technical holders',
          'Release notes and changelog writing',
          'Sample apps and reference implementations documented end to end',
        ],
      },
    ],
    range: [0.72, 0.88],
  },
  {
    id: 'engine',
    index: 5,
    label: 'CHAPTER 05 — THE ENGINE',
    headline: 'Research. Strategy. Concept. Script.\nDesign. Production. Editing.\nPublishing. Distribution.\nAnalytics. Optimization.',
    lede: 'One line, end to end. You can take any single stage on its own — or plug into the whole engine and let it run.',
    chips: [],
    groups: [],
    range: [0.88, 1.0],
  },
];

/**
 * Illustrative figures. §12 of the plan lists real client numbers as an open item and
 * requires the same rule as the tokenomics page: either real, or clearly labelled.
 * The label below ships with them; swap `illustrative: false` once real data lands.
 */
export const COUNTERS_ARE_ILLUSTRATIVE = true;

export const COUNTERS = [
  { label: 'Assets shipped / month', value: 340, suffix: '+' },
  { label: 'Platforms managed', value: 12, suffix: '' },
  { label: 'Languages', value: 10, suffix: '+' },
  { label: 'Avg. retention lift', value: 38, suffix: '%' },
];

export const ENGINE_STAGES = [
  'Research',
  'Strategy',
  'Concept',
  'Script',
  'Design',
  'Production',
  'Editing',
  'Publishing',
  'Distribution',
  'Analytics',
  'Optimization',
];

/** Format labels that ignite along the machine's panel row, §6. */
export const MACHINE_PANELS = [
  'Shorts',
  'X thread',
  'Carousel',
  'Newsletter',
  'Audiogram',
  'Blog',
  'Reel',
  'Localised cut',
];

export function totalBullets(chapter: Chapter) {
  return chapter.groups.reduce((n, g) => n + g.items.length, 0);
}
