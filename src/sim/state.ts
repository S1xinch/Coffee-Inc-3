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
  totalAssets: cents,
  loans: cents,
  totalLiabilities: cents,
  ownerCapital: cents,
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
});

export const ModifierSchema = z.object({
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
});

export const BRAND_ICONS = ['cup', 'bean', 'leaf', 'moon', 'wave', 'star'] as const;
export type BrandIcon = (typeof BRAND_ICONS)[number];

const rating = z.number().min(0).max(1);

export const GameStateSchema = z.object({
  companyName: z.string().min(1).max(40),
  brand: z.object({
    icon: z.enum(BRAND_ICONS),
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
  }),
  neighborhoodId: z.string(),
  hour: z.number().int().nonnegative(),
  rng: z.number().int().nonnegative(),
  nextId: z.number().int().nonnegative(),
  store: z.object({
    open: z.boolean(),
    equipment: z.array(EquipmentSchema),
    menu: z.record(z.string(), MenuEntrySchema),
    reputation: z.number().min(0).max(100),
    satisfaction: z.number().min(0).max(100),
    ratings: z.object({ price: rating, product: rating, service: rating, atmosphere: rating }),
    reviews: z.number().int().nonnegative(),
    marketing: z.record(z.string(), z.number().int().nonnegative()),
  }),
  staff: z.array(StaffSchema),
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
  today: DayStatsSchema,
  week: z.object({
    served: z.number().int().nonnegative(),
    lost: z.number().int().nonnegative(),
  }),
  lastHour: HourStatsSchema.nullable(),
  yesterday: DayStatsSchema.nullable(),
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
});
