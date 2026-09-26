import { z } from 'zod';

export const ACCOUNTS = [
  'cash',
  'equipment',
  'accumDepreciation',
  'loans',
  'ownerCapital',
  'salesRevenue',
  'otherIncome',
  'cogs',
  'wages',
  'rent',
  'utilities',
  'depreciation',
  'interest',
  'training',
  'repairs',
  'marketing',
  'otherExpense',
  'inventory',
  'farmland',
  'investments',
  'realEstate',
  'shareCapital',
  'dividends',
] as const;
export type Account = (typeof ACCOUNTS)[number];

const cents = z.number().int();

export const JournalLineSchema = z.object({
  account: z.enum(ACCOUNTS),
  amount: cents,
});

export const JournalEntrySchema = z.object({
  id: z.number().int().nonnegative(),
  hour: z.number().int().nonnegative(),
  memo: z.string(),
  kind: z.enum(['operating', 'investing', 'financing']),
  lines: z.array(JournalLineSchema).min(2),
  storeId: z.string().nullable(),
});

export const IncomeStatementSchema = z.object({
  revenue: cents,
  otherIncome: cents,
  cogs: cents,
  grossProfit: cents,
  wages: cents,
  rent: cents,
  utilities: cents,
  depreciation: cents,
  interest: cents,
  training: cents,
  repairs: cents,
  marketing: cents,
  otherExpense: cents,
  totalExpenses: cents,
  netIncome: cents,
});

export const BalanceSheetSchema = z.object({
  cash: cents,
  equipmentAtCost: cents,
  accumDepreciation: cents,
  inventory: cents.default(0),
  farmland: cents.default(0),
  investments: cents.default(0),
  realEstate: cents.default(0),
  totalAssets: cents,
  loans: cents,
  totalLiabilities: cents,
  ownerCapital: cents,
  shareCapital: cents.default(0),
  retainedEarnings: cents,
  totalEquity: cents,
});

export const CashFlowSchema = z.object({
  openingCash: cents,
  operating: cents,
  investing: cents,
  financing: cents,
  closingCash: cents,
});

export const WeekReportSchema = z.object({
  week: z.number().int().positive(),
  income: IncomeStatementSchema,
  balance: BalanceSheetSchema,
  cashFlow: CashFlowSchema,
  customersServed: z.number().int().nonnegative(),
  customersLost: z.number().int().nonnegative(),
  reputation: z.number(),
  stores: z.array(
    z.object({
      storeId: z.string(),
      lotId: z.string(),
      revenue: cents,
      netIncome: cents,
      served: z.number().int().nonnegative(),
      lost: z.number().int().nonnegative(),
      reputation: z.number(),
    }),
  ),
});

export const EquipmentSchema = z.object({
  id: z.string(),
  typeId: z.string(),
  cost: cents,
  depreciated: cents,
  broken: z.boolean(),
});

export const StaffSchema = z.object({
  id: z.string(),
  name: z.string(),
  skill: z.number().int().min(1).max(10),
  wage: cents,
  morale: z.number().min(0).max(100),
  hiredHour: z.number().int().nonnegative(),
  trainingUntilHour: z.number().int().nullable(),
  sickUntilHour: z.number().int().nullable(),
  look: z.number().int().nonnegative(),
});

export const CandidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  skill: z.number().int().min(1).max(10),
  askingWage: cents,
  look: z.number().int().nonnegative(),
});

export const MenuEntrySchema = z.object({
  enabled: z.boolean(),
  price: cents,
});

export const PendingIncidentSchema = z.object({
  id: z.string(),
  defId: z.string(),
  createdHour: z.number().int(),
  deadlineHour: z.number().int(),
  staffId: z.string().nullable(),
  storeId: z.string(),
});

export const ModifierSchema = z.object({
  storeId: z.string(),
  kind: z.enum(['supplierCost', 'qualityPenalty', 'trafficBoost']),
  value: z.number(),
  untilHour: z.number().int(),
});

export const LogEntrySchema = z.object({
  hour: z.number().int(),
  tone: z.enum(['info', 'good', 'bad']),
  text: z.string(),
});

export const HourStatsSchema = z.object({
  hour: z.number().int(),
  demand: z.number().int().nonnegative(),
  served: z.number().int().nonnegative(),
  revenue: cents,
});

export const DayStatsSchema = z.object({
  served: z.number().int().nonnegative(),
  lost: z.number().int().nonnegative(),
  revenue: cents,
  cogs: cents,
  openHours: z.number().int().nonnegative(),
  qualitySum: z.number(),
  priceRatioSum: z.number(),
  capacitySum: z.number(),
  wagesAccrued: cents,
  marketingAccrued: cents,
  feesAccrued: cents.default(0),
});

export const BRAND_ICONS = ['cup', 'bean', 'leaf', 'moon', 'wave', 'star'] as const;
export type BrandIcon = (typeof BRAND_ICONS)[number];

const rating = z.number().min(0).max(1);

export const ManagerSchema = z.object({
  name: z.string(),
  look: z.number().int().nonnegative(),
  salary: cents,
  hiredHour: z.number().int().nonnegative(),
  lastAction: z.string().nullable(),
  lastActionHour: z.number().int().nullable(),
});

export const CellSchema = z.object({ x: z.number().int(), y: z.number().int() });

export const StoreSchema = z.object({
  id: z.string(),
  lotId: z.string(),
  openedHour: z.number().int().nonnegative(),
  open: z.boolean(),
  equipment: z.array(EquipmentSchema),
  layout: z.record(z.string(), CellSchema),
  menu: z.record(z.string(), MenuEntrySchema),
  reputation: z.number().min(0).max(100),
  satisfaction: z.number().min(0).max(100),
  ratings: z.object({ price: rating, product: rating, service: rating, atmosphere: rating }),
  reviews: z.number().int().nonnegative(),
  marketing: z.record(z.string(), z.number().int().nonnegative()),
  staff: z.array(StaffSchema),
  manager: ManagerSchema.nullable(),
  today: DayStatsSchema,
  yesterday: DayStatsSchema.nullable(),
  week: z.object({
    served: z.number().int().nonnegative(),
    lost: z.number().int().nonnegative(),
  }),
  lastHour: HourStatsSchema.nullable(),
});

export const RivalSchema = z.object({
  name: z.string(),
  stores: z.array(z.object({ lotId: z.string(), openedHour: z.number().int().nonnegative() })),
  priceIndex: z.number().min(0.5).max(2),
  stars: z.number().min(1).max(5),
});

export const CITY_IDS = ['seattle', 'portland', 'san-francisco'] as const;
export const DEPARTMENT_IDS = ['hr', 'finance', 'marketing', 'engineering', 'executive', 'investment'] as const;
export type DepartmentId = (typeof DEPARTMENT_IDS)[number];

export const ExecutiveSchema = z.object({
  name: z.string(),
  look: z.number().int().nonnegative(),
  salary: cents,
  hiredHour: z.number().int().nonnegative(),
});

const level = z.number().int().min(0).max(3);

export const HqSchema = z.object({
  open: z.boolean(),
  openedHour: z.number().int().nullable(),
  departments: z.object({ hr: level, finance: level, marketing: level, engineering: level, executive: level, investment: level }),
  executives: z.object({
    hr: ExecutiveSchema.nullable(),
    finance: ExecutiveSchema.nullable(),
    marketing: ExecutiveSchema.nullable(),
    engineering: ExecutiveSchema.nullable(),
    executive: ExecutiveSchema.nullable(),
    investment: ExecutiveSchema.nullable(),
  }),
});

export const BoardMeetingSchema = z.object({
  week: z.number().int().positive(),
  revenue: cents,
  netIncome: cents,
  targetRevenue: cents.nullable(),
  targetNetIncome: cents.nullable(),
  confidence: z.number().min(0).max(100),
  note: z.string(),
});

export const BoardSchema = z.object({
  confidence: z.number().min(0).max(100),
  targetRevenue: cents.nullable(),
  targetNetIncome: cents.nullable(),
  meetings: z.array(BoardMeetingSchema),
});

export const PlantationSchema = z.object({
  id: z.string(),
  regionId: z.string(),
  plots: z.number().int().min(1).max(8),
  mill: z.boolean(),
  cost: cents,
  boughtHour: z.number().int().nonnegative(),
  lastHarvestKg: z.number().nonnegative(),
  lastWeather: z.string(),
});

export const BeansSchema = z.object({
  kg: z.number().nonnegative(),
  value: cents.nonnegative(),
  quality: z.number().min(0).max(1),
});

const digits = z.string().regex(/^[0-9]+$/);

export const MarketSchema = z.object({
  beanPrice: cents.positive(),
  stocks: z.record(z.string(), z.object({ price: cents.positive(), prev: cents.positive() })),
  realEstateIndex: z.record(z.string(), z.number().positive()),
});

export const SharesSchema = z.object({
  // Share counts are whole numbers kept as decimal strings and handled as BigInt, so they stay exact
  // however many splits happen. Coffee Inc 2 crashed once share counts got very large.
  total: digits,
  owner: digits,
  listed: z.boolean(),
  price: cents.positive(),
  listedHour: z.number().int().nullable(),
  history: z.array(z.object({ week: z.number().int().nonnegative(), price: cents.positive() })),
});

export const GameStateSchema = z.object({
  companyName: z.string().min(1).max(40),
  brand: z.object({
    icon: z.enum(BRAND_ICONS),
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
  }),
  hour: z.number().int().nonnegative(),
  rng: z.number().int().nonnegative(),
  nextId: z.number().int().nonnegative(),
  stores: z.array(StoreSchema).min(1),
  candidates: z.array(CandidateSchema),
  ledger: z.object({
    broughtForward: z.record(z.string(), cents),
    journal: z.array(JournalEntrySchema),
    weekOpeningCash: cents,
  }),
  reports: z.array(WeekReportSchema),
  distressWeeks: z.number().int().nonnegative(),
  bankrupt: z.boolean(),
  incidents: z.array(PendingIncidentSchema),
  modifiers: z.array(ModifierSchema),
  log: z.array(LogEntrySchema),
  rival: RivalSchema,
  cities: z.array(z.enum(CITY_IDS)).min(1),
  hq: HqSchema,
  board: BoardSchema,
  plantations: z.array(PlantationSchema),
  beans: BeansSchema,
  market: MarketSchema,
  holdings: z.record(z.string(), z.object({ shares: z.number().int().nonnegative(), cost: cents.nonnegative() })),
  properties: z.array(z.object({ propertyId: z.string(), cost: cents.nonnegative(), boughtHour: z.number().int().nonnegative() })),
  shares: SharesSchema,
  owner: z.object({ cash: cents.nonnegative() }),
  settings: z.object({ politics: z.boolean() }),
  lifetime: z.object({
    served: z.number().int().nonnegative(),
    revenue: cents,
    incidentsAutoResolved: z.number().int().nonnegative(),
    staffQuit: z.number().int().nonnegative(),
  }),
  lastSeenReportWeek: z.number().int().nonnegative(),
});

export type JournalLine = z.infer<typeof JournalLineSchema>;
export type JournalEntry = z.infer<typeof JournalEntrySchema>;
export type IncomeStatement = z.infer<typeof IncomeStatementSchema>;
export type BalanceSheet = z.infer<typeof BalanceSheetSchema>;
export type CashFlow = z.infer<typeof CashFlowSchema>;
export type WeekReport = z.infer<typeof WeekReportSchema>;
export type Equipment = z.infer<typeof EquipmentSchema>;
export type Staff = z.infer<typeof StaffSchema>;
export type Candidate = z.infer<typeof CandidateSchema>;
export type MenuEntry = z.infer<typeof MenuEntrySchema>;
export type PendingIncident = z.infer<typeof PendingIncidentSchema>;
export type Modifier = z.infer<typeof ModifierSchema>;
export type LogEntry = z.infer<typeof LogEntrySchema>;
export type DayStats = z.infer<typeof DayStatsSchema>;
export type HourStats = z.infer<typeof HourStatsSchema>;
export type GameState = z.infer<typeof GameStateSchema>;
export type Store = z.infer<typeof StoreSchema>;
export type Manager = z.infer<typeof ManagerSchema>;
export type Cell = z.infer<typeof CellSchema>;
export type Rival = z.infer<typeof RivalSchema>;
export type Executive = z.infer<typeof ExecutiveSchema>;
export type Hq = z.infer<typeof HqSchema>;
export type BoardMeeting = z.infer<typeof BoardMeetingSchema>;
export type Plantation = z.infer<typeof PlantationSchema>;
export type Beans = z.infer<typeof BeansSchema>;
export type Shares = z.infer<typeof SharesSchema>;

export const emptyDayStats = (): DayStats => ({
  served: 0,
  lost: 0,
  revenue: 0,
  cogs: 0,
  openHours: 0,
  qualitySum: 0,
  priceRatioSum: 0,
  capacitySum: 0,
  wagesAccrued: 0,
  marketingAccrued: 0,
  feesAccrued: 0,
});
