import { useState, type ReactNode } from 'react';
import { CITIES, city } from '../sim/city';
import {
  BOARD_MEETING_WEEKS,
  DEPARTMENTS,
  HQ_MIN_STORES,
  HQ_OPEN_COST,
  MAX_DEPARTMENT_LEVEL,
  canHireChief,
  deptLevel,
  hqWeeklyCost,
} from '../sim/hq';
import { balanceSheet, cashBalance } from '../sim/ledger';
import {
  IPO_FEE,
  IPO_PERCENTS,
  PROPERTIES,
  SPLIT_MIN_PRICE,
  STOCKS,
  formatBigMoney,
  formatShares,
  ipoBlocker,
  marketCap,
  ownerShares,
  ownerStakePercent,
  ownerStakeValue,
  personalWealth,
  sharePrice,
  propertyDef,
  propertyValue,
  shareCount,
  storeBuildingId,
  type PropertyDef,
} from '../sim/markets';
import { dollars, formatMoney } from '../sim/money';
import { MAX_PLOTS, MILL_COST, MILL_QUALITY_BONUS, plantationExpectedKg, plantationQuality, plantationWeeklyCost } from '../sim/plantations';
import { REGIONS, regionById, type Region } from '../sim/regions';
import type { DepartmentId } from '../sim/state';
import { Portrait } from './Brand';
import { CloseIcon } from './Icons';
import { SpeedControls } from './StoreScreen';
import { Card, Meter, Money, plural } from './bits';
import { useGameUi } from './context';
import type { Speed } from '../sim/clock';

type HqTab = 'departments' | 'board' | 'farms' | 'investments';

const Glyph = ({ children }: { children: ReactNode }) => (
  <svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

const TABS: { id: HqTab; label: string; icon: ReactNode }[] = [
  {
    id: 'departments',
    label: 'Departments',
    icon: (
      <Glyph>
        <path d="M4 21V5l8-3 8 3v16" />
        <path d="M9 21v-4h6v4M8 8h2M14 8h2M8 12h2M14 12h2" />
      </Glyph>
    ),
  },
  {
    id: 'board',
    label: 'Board',
    icon: (
      <Glyph>
        <rect x="3" y="10" width="18" height="4" rx="1" />
        <circle cx="7" cy="6" r="2" />
        <circle cx="12" cy="6" r="2" />
        <circle cx="17" cy="6" r="2" />
        <path d="M6 14v6M18 14v6" />
      </Glyph>
    ),
  },
  {
    id: 'farms',
    label: 'Farms',
    icon: (
      <Glyph>
        <path d="M12 21V9" />
        <path d="M12 13c-4 0-6-3-6-6 3 0 6 2 6 6zM12 11c0-4 3-6 6-6 0 3-2 6-6 6z" />
        <circle cx="8.5" cy="17" r="1.3" />
        <circle cx="15.5" cy="17" r="1.3" />
      </Glyph>
    ),
  },
  {
    id: 'investments',
    label: 'Investments',
    icon: (
      <Glyph>
        <path d="M3 20h18" />
        <path d="M4 16l5-5 4 3 7-8" />
        <path d="M15 6h5v5" />
      </Glyph>
    ),
  },
];

// A painted hillside farm in the region's colors. Built only from the region's validated palette,
// with the fallback region's palette underneath, so it always draws.
export function RegionArt({ region, size = 88 }: { region: Region; size?: number }) {
  const p = region.palette;
  return (
    <svg width={size} height={size * 0.62} viewBox="0 0 100 62" preserveAspectRatio="xMidYMid slice" role="img" aria-label={`Coffee farm in ${region.name}, ${region.country}`} className="region-art">
      <rect width="100" height="62" fill={p.sky} />
      <path d="M0 40 Q25 18 50 32 T100 26 V62 H0z" fill={p.hill} />
      <path d="M0 50 Q30 34 60 46 T100 42 V62 H0z" fill={p.soil} opacity="0.55" />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <g key={i} transform={`translate(${8 + i * 13} ${46 - (i % 2) * 3})`}>
          <ellipse cx="0" cy="0" rx="6" ry="5" fill={p.leaf} />
          <circle cx="-2" cy="1" r="1.1" fill={p.cherry} />
          <circle cx="2" cy="-1" r="1.1" fill={p.cherry} />
        </g>
      ))}
    </svg>
  );
}

function Stars({ value }: { value: number }) {
  return <span className="num">{(1 + value * 4).toFixed(1)} / 5</span>;
}

function OpenHq() {
  const { state, act } = useGameUi();
  const short = state.stores.length < HQ_MIN_STORES;
  return (
    <Card title="Open headquarters">
      <p>
        Headquarters is where a chain becomes a company. Build departments that help every store, hire executives, meet with the board, buy coffee farms, invest, and eventually go
        public.
      </p>
      <p className="muted small">
        Costs <Money cents={HQ_OPEN_COST} /> to set up and <Money cents={dollars(1_500)} /> a week in office rent. Needs at least {HQ_MIN_STORES} stores.
      </p>
      <div className="row-actions">
        <button className="btn btn-primary" disabled={short} onClick={() => act({ type: 'openHq' })}>
          {short ? `Run ${HQ_MIN_STORES} stores first` : 'Open headquarters'}
        </button>
      </div>
    </Card>
  );
}

function DepartmentsTab() {
  const { state, act, confirm } = useGameUi();
  return (
    <div className="stack">
      <p className="muted">
        Headquarters costs <Money cents={hqWeeklyCost(state)} /> a week, including rent, department budgets, and executive salaries. A chief counts as one extra level for their
        department.
      </p>
      {DEPARTMENTS.map((d) => {
        const built = state.hq.departments[d.id];
        const working = deptLevel(state, d.id);
        const chief = state.hq.executives[d.id];
        const blocker = canHireChief(state, d.id);
        return (
          <Card
            key={d.id}
            title={d.name}
            aside={
              <span className={`tag ${built > 0 ? 'good' : ''}`}>
                Level {built} of {MAX_DEPARTMENT_LEVEL}
                {chief ? ' + chief' : ''}
              </span>
            }
          >
            <p className="muted small">{d.blurb}</p>
            <p>{working > 0 ? d.effect(working) : 'Not built yet.'}</p>
            {built < MAX_DEPARTMENT_LEVEL && <p className="muted small">Next level: {d.effect(working + 1)}.</p>}
            <div className="row-actions">
              {built < MAX_DEPARTMENT_LEVEL && (
                <button className="btn btn-small btn-primary" onClick={() => act({ type: 'upgradeDepartment', departmentId: d.id })}>
                  {built === 0 ? 'Build' : 'Upgrade'} <Money cents={d.upgradeCost[built]!} />
                </button>
              )}
              <span className="muted small">
                Budget <Money cents={d.weeklyPerLevel} /> a week per level
              </span>
            </div>
            <div className="exec-row">
              {chief ? (
                <>
                  <Portrait look={chief.look} size={40} apron={state.brand.color} />
                  <div>
                    <strong>{chief.name}</strong>
                    <p className="muted small">
                      {d.chiefTitle} · <Money cents={chief.salary} /> a week
                    </p>
                  </div>
                  <button
                    className="btn btn-small btn-danger"
                    onClick={async () => {
                      if (await confirm({ title: `Let ${chief.name} go?`, body: `The ${d.name} department loses its extra level.`, confirmLabel: 'Let go', danger: true })) {
                        await act({ type: 'fireChief', departmentId: d.id });
                      }
                    }}
                  >
                    Let go
                  </button>
                </>
              ) : (
                <>
                  <span className="muted small">{blocker && built > 0 ? blocker : `No ${d.chiefTitle}.`}</span>
                  <button className="btn btn-small" disabled={!!blocker} onClick={() => act({ type: 'hireChief', departmentId: d.id as DepartmentId })}>
                    Hire for <Money cents={d.chiefSalary} /> a week
                  </button>
                </>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

const DIVIDEND_STEPS = [1, 5, 10, 50, 100];

function BoardTab() {
  const { state, act } = useGameUi();
  const b = state.board;
  const weekNow = Math.floor(state.hour / (24 * 7));
  const nextMeeting = BOARD_MEETING_WEEKS - (weekNow % BOARD_MEETING_WEEKS);
  const last = b.meetings.at(-1);
  const retained = balanceSheet(state).retainedEarnings;
  const [perShare, setPerShare] = useState(DIVIDEND_STEPS[0]!);
  const shares = shareCount(state.shares);
  const payout = BigInt(perShare) * shares;
  const toYou = BigInt(perShare) * ownerShares(state.shares);

  return (
    <div className="stack">
      <Card title="Board of directors">
        <div className="meter-row">
          <span>Confidence</span>
          <Meter value={b.confidence} label="Board confidence" />
          <span className="num">{Math.round(b.confidence)}</span>
        </div>
        <p className="muted small">
          The board meets every {BOARD_MEETING_WEEKS} weeks. Next meeting in {plural(nextMeeting, 'week')}.
          {b.targetRevenue !== null && (
            <>
              {' '}
              Targets for this quarter: <Money cents={b.targetRevenue} /> in revenue and <Money cents={b.targetNetIncome ?? 0} /> in net income.
            </>
          )}
          {state.shares.listed ? ' Confidence moves the share price.' : ' Once the company is public, confidence moves the share price.'}
        </p>
        {last && <p>{last.note}</p>}
        {b.meetings.length > 0 && (
          <table className="fin">
            <thead>
              <tr>
                <th scope="col">Quarter to week</th>
                <th scope="col">Revenue</th>
                <th scope="col">Net income</th>
                <th scope="col">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {[...b.meetings].reverse().map((m) => (
                <tr key={m.week}>
                  <th scope="row">Week {m.week}</th>
                  <td>{formatMoney(m.revenue)}</td>
                  <td>{formatMoney(m.netIncome)}</td>
                  <td>{Math.round(m.confidence)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Dividends">
        <p className="muted small">
          Pay shareholders out of retained earnings ({formatMoney(retained)}). You own {ownerStakePercent(state.shares)}% of the company, so that share of every dividend comes to you
          personally.
        </p>
        <div className="segmented" role="radiogroup" aria-label="Dividend per share">
          {DIVIDEND_STEPS.map((c) => (
            <button key={c} role="radio" aria-checked={perShare === c} className={perShare === c ? 'on' : ''} onClick={() => setPerShare(c)}>
              {formatMoney(c, true)}
            </button>
          ))}
        </div>
        <p className="small">
          {formatMoney(perShare, true)} a share on {formatShares(shares)} shares pays out {formatBigMoney(payout)}, of which {formatBigMoney(toYou)} is yours.
        </p>
        <div className="row-actions">
          <button className="btn btn-small btn-primary" onClick={() => act({ type: 'payDividend', perShare })}>
            Pay dividend
          </button>
        </div>
      </Card>

      <Card title="Your own money">
        <table className="fin">
          <tbody>
            <tr>
              <th scope="row">Personal cash</th>
              <td>
                <Money cents={state.owner.cash} />
              </td>
            </tr>
            <tr>
              <th scope="row">Your shares</th>
              <td>
                {formatShares(ownerShares(state.shares))} ({ownerStakePercent(state.shares)}%)
              </td>
            </tr>
            <tr>
              <th scope="row">Worth</th>
              <td>{formatBigMoney(ownerStakeValue(state))}</td>
            </tr>
            <tr className="total">
              <th scope="row">Net worth</th>
              <td>{formatBigMoney(personalWealth(state))}</td>
            </tr>
          </tbody>
        </table>
        <p className="muted small">Your personal money is kept apart from the company's. Dividends and share sales move money to you.</p>
        {!state.shares.listed && state.owner.cash >= dollars(10_000) && (
          <div className="row-actions">
            <button className="btn btn-small" onClick={() => act({ type: 'investPersonal', amount: dollars(10_000) })}>
              Put <Money cents={dollars(10_000)} /> back into the company
            </button>
          </div>
        )}
      </Card>

      <Card title="Company policy">
        <label className="setting">
          <input type="checkbox" checked={state.settings.politics} onChange={(e) => act({ type: 'setPolitics', on: e.target.checked })} />
          <span>Local politics: cities can fine your stores</span>
        </label>
        <p className="muted small">With politics off, no city fines are charged anywhere. Business licenses and cup fees are laws and always apply.</p>
      </Card>
    </div>
  );
}

function FarmsTab() {
  const { state, act, confirm } = useGameUi();
  const b = state.beans;
  const owned = new Set(state.plantations.map((p) => p.regionId));
  return (
    <div className="stack">
      <Card title="Bean warehouse">
        <table className="fin">
          <tbody>
            <tr>
              <th scope="row">In stock</th>
              <td className="num">{Math.round(b.kg).toLocaleString('en-US')} kg</td>
            </tr>
            <tr>
              <th scope="row">Cost per kilo</th>
              <td>{b.kg > 0 ? formatMoney(Math.round(b.value / b.kg), true) : '-'}</td>
            </tr>
            <tr>
              <th scope="row">Quality</th>
              <td>{b.kg > 0 ? <Stars value={b.quality} /> : '-'}</td>
            </tr>
            <tr>
              <th scope="row">Market price per kilo</th>
              <td>{formatMoney(state.market.beanPrice, true)}</td>
            </tr>
          </tbody>
        </table>
        <p className="muted small">
          Stores use beans from your own farms first. Beans better than the market average make better coffee. When the warehouse is empty, stores buy beans at the market price.
        </p>
        {b.kg >= 1 && (
          <div className="row-actions">
            <button className="btn btn-small" onClick={() => act({ type: 'sellBeans', kg: Math.floor(b.kg / 4) || b.kg })}>
              Sell a quarter
            </button>
            <button className="btn btn-small" onClick={() => act({ type: 'sellBeans', kg: b.kg })}>
              Sell all at <Money cents={Math.round(state.market.beanPrice * 0.9)} withCents />
              /kg
            </button>
          </div>
        )}
      </Card>

      {state.plantations.map((p) => {
        const region = regionById(p.regionId);
        return (
          <Card key={p.id} title={`${region.name}, ${region.country}`} aside={<span className="tag good">{plural(p.plots, 'plot')}</span>}>
            <div className="farm-row">
              <RegionArt region={region} />
              <div>
                <p className="small">
                  About {Math.round(plantationExpectedKg(p))} kg a week for <Money cents={plantationWeeklyCost(p)} />. Quality <Stars value={plantationQuality(p)} />.
                </p>
                <p className="muted small">
                  Last harvest: {p.lastHarvestKg > 0 ? `${Math.round(p.lastHarvestKg)} kg` : 'none yet'} ({p.lastWeather.toLowerCase()}).
                </p>
              </div>
            </div>
            <div className="row-actions">
              {p.plots < MAX_PLOTS && (
                <button className="btn btn-small btn-primary" onClick={() => act({ type: 'addPlot', plantationId: p.id })}>
                  Add a plot <Money cents={region.plotPrice} />
                </button>
              )}
              {!p.mill && (
                <button className="btn btn-small" onClick={() => act({ type: 'buildMill', plantationId: p.id })}>
                  Build a mill <Money cents={MILL_COST} /> (+{Math.round(MILL_QUALITY_BONUS * 100)} quality)
                </button>
              )}
              <button
                className="btn btn-small btn-danger"
                onClick={async () => {
                  if (await confirm({ title: `Sell the farm in ${region.name}?`, body: 'Farmland sells for 85% of what you paid.', confirmLabel: 'Sell', danger: true })) {
                    await act({ type: 'sellPlantation', plantationId: p.id });
                  }
                }}
              >
                Sell
              </button>
            </div>
          </Card>
        );
      })}

      <h2 className="section-title">Growing regions</h2>
      <div className="region-grid">
        {REGIONS.filter((r) => !owned.has(r.id)).map((r) => (
          <article key={r.id} className="region-card">
            <RegionArt region={r} size={120} />
            <h3>
              {r.name}, {r.country}
            </h3>
            <p className="muted small">{r.blurb}</p>
            <p className="small">
              {r.yieldKgPerPlot} kg a week per plot · quality <Stars value={r.quality} /> · weather risk {Math.round(r.weatherRisk * 100)}%
            </p>
            <button className="btn btn-small btn-primary" onClick={() => act({ type: 'buyPlantation', regionId: r.id })}>
              Buy a plot <Money cents={r.plotPrice} />
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}

function PropertyRow({ def }: { def: PropertyDef }) {
  const { state, act } = useGameUi();
  const owned = state.properties.find((p) => p.propertyId === def.id);
  const value = propertyValue(state, def);
  return (
    <li className="shop-item">
      <div>
        <div className="shop-name">
          {def.name}
          {owned && <span className="tag good">Owned</span>}
        </div>
        <p className="muted small">
          {def.address}, {city(def.cityId).name} ·{' '}
          {def.lotId ? (
            <>
              saves <Money cents={def.weeklyRent} /> a week in rent
            </>
          ) : (
            <>
              <Money cents={def.weeklyRent} /> a week from tenants
            </>
          )}
        </p>
      </div>
      <div className="shop-actions">
        {owned ? (
          <button className="btn btn-small" onClick={() => act({ type: 'sellProperty', propertyId: def.id })}>
            Sell <Money cents={Math.round(value * 0.95)} />
          </button>
        ) : (
          <button className="btn btn-small btn-primary" onClick={() => act({ type: 'buyProperty', propertyId: def.id })}>
            Buy <Money cents={value} />
          </button>
        )}
      </div>
    </li>
  );
}

function InvestmentsTab() {
  const { state, act, confirm } = useGameUi();
  const s = state.shares;
  const blocker = ipoBlocker(state);
  const invest = deptLevel(state, 'investment');
  const price = sharePrice(state);
  const history = s.history.map((h) => h.price);
  const low = history.length ? Math.min(...history) : price;
  const high = history.length ? Math.max(...history) : price;
  const storeBuildings = state.stores.map((st) => propertyDef(storeBuildingId(st.lotId))).filter((d): d is PropertyDef => !!d);
  const unlocked = PROPERTIES.filter((p) => state.cities.includes(p.cityId as (typeof state.cities)[number]));

  return (
    <div className="stack">
      <Card title={s.listed ? `${state.companyName} shares` : 'Company value'} aside={s.listed ? <span className="tag good">Public</span> : <span className="tag">Private</span>}>
        <table className="fin">
          <tbody>
            <tr>
              <th scope="row">{s.listed ? 'Share price' : 'Value per share'}</th>
              <td>{formatMoney(price, true)}</td>
            </tr>
            <tr>
              <th scope="row">Shares outstanding</th>
              <td>{formatShares(shareCount(s))}</td>
            </tr>
            <tr>
              <th scope="row">{s.listed ? 'Market value' : 'Estimated value'}</th>
              <td>{formatBigMoney(marketCap(state))}</td>
            </tr>
            {history.length > 1 && (
              <tr>
                <th scope="row">Range this year</th>
                <td>
                  {formatMoney(low, true)} to {formatMoney(high, true)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {!s.listed && (
          <>
            <p className="muted small">
              Going public sells new shares to investors. The company keeps the money, minus a {Math.round(IPO_FEE * 100)}% bank fee, and your stake shrinks.
            </p>
            {blocker ? (
              <p className="small">To go public: {blocker}</p>
            ) : (
              <div className="row-actions">
                {IPO_PERCENTS.map((pct) => {
                  const issued = (shareCount(s) * BigInt(pct)) / BigInt(100 - pct);
                  const raise = (BigInt(price) * issued * 95n) / 100n;
                  return (
                    <button
                      key={pct}
                      className="btn btn-small btn-primary"
                      onClick={async () => {
                        const ok = await confirm({
                          title: `Sell ${pct}% of ${state.companyName}?`,
                          body: `Investors buy ${formatShares(issued)} new shares and the company raises about ${formatBigMoney(raise)}. This cannot be undone.`,
                          confirmLabel: 'Go public',
                        });
                        if (ok) await act({ type: 'ipo', percent: pct });
                      }}
                    >
                      IPO {pct}% · {formatBigMoney(raise)}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
        {s.listed && (
          <div className="row-actions">
            <button className="btn btn-small" disabled={s.price < SPLIT_MIN_PRICE} onClick={() => act({ type: 'splitShares' })}>
              Split 2 for 1
            </button>
            {[5, 10, 25].map((pct) => (
              <button key={pct} className="btn btn-small" onClick={() => act({ type: 'sellOwnerShares', percent: pct })}>
                Sell {pct}% of your stake
              </button>
            ))}
          </div>
        )}
      </Card>

      <Card title="Stock market" aside={invest < 1 ? <span className="tag warn">Needs Investment 1</span> : undefined}>
        <ul className="shop">
          {STOCKS.map((def) => {
            const q = state.market.stocks[def.symbol];
            const h = state.holdings[def.symbol];
            const change = q ? (q.price - q.prev) / q.prev : 0;
            return (
              <li key={def.symbol} className="shop-item">
                <div>
                  <div className="shop-name">
                    <span className="stock-symbol">{def.symbol}</span> {def.name}
                  </div>
                  <p className="small">
                    {q ? formatMoney(q.price, true) : '-'}{' '}
                    <span className={change > 0 ? 'pos' : change < 0 ? 'neg' : 'muted'}>
                      {change > 0 ? '+' : ''}
                      {(change * 100).toFixed(1)}% this week
                    </span>
                  </p>
                  <p className="muted small">{h ? `You own ${h.shares.toLocaleString('en-US')}, worth ${formatMoney(h.shares * (q?.price ?? 0))}.` : def.blurb}</p>
                </div>
                <div className="shop-actions">
                  <button className="btn btn-small" disabled={invest < 1} onClick={() => act({ type: 'buyStock', symbol: def.symbol, shares: 10 })}>
                    Buy 10
                  </button>
                  <button className="btn btn-small" disabled={invest < 1} onClick={() => act({ type: 'buyStock', symbol: def.symbol, shares: 100 })}>
                    Buy 100
                  </button>
                  {h && (
                    <button className="btn btn-small" onClick={() => act({ type: 'sellStock', symbol: def.symbol, shares: h.shares })}>
                      Sell all
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title="Real estate" aside={invest < 2 ? <span className="tag warn">Needs Investment 2</span> : undefined}>
        <p className="muted small">Buildings earn rent from tenants and change in value with their city's market. Buying the building a store sits in ends that store's rent.</p>
        <ul className="shop">
          {storeBuildings.map((d) => (
            <PropertyRow key={d.id} def={d} />
          ))}
          {unlocked.map((d) => (
            <PropertyRow key={d.id} def={d} />
          ))}
        </ul>
        {state.properties
          .filter((p) => !propertyDef(p.propertyId))
          .map((p) => (
            <p key={p.propertyId} className="muted small">
              A property from an older version ({p.propertyId}) is kept at its purchase price of {formatMoney(p.cost)}.
            </p>
          ))}
        {CITIES.filter((c) => !state.cities.includes(c.id)).length > 0 && <p className="muted small">Unlock more cities to see their buildings.</p>}
      </Card>
    </div>
  );
}

export function HqScreen({ onClose, speed, onSpeed }: { onClose: () => void; speed: Speed; onSpeed: (s: Speed) => void }) {
  const { state } = useGameUi();
  const [tab, setTab] = useState<HqTab>('departments');
  const cash = cashBalance(state);
  const hq = state.hq;
  return (
    <div className="store-screen hq-screen">
      <header className="store-header">
        <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 21V5l8-3 8 3v16" />
          <path d="M9 21v-4h6v4M8 8h2M14 8h2M8 12h2M14 12h2" />
        </svg>
        <div className="store-title">
          <h1>Headquarters</h1>
          <p>
            {state.companyName} · {plural(state.stores.length, 'store')} in {state.cities.length} {state.cities.length === 1 ? 'city' : 'cities'}
          </p>
          <p className={`store-cash num ${cash < 0 ? 'neg' : ''}`}>{formatMoney(cash)} cash</p>
        </div>
        <button className="close-btn" aria-label="Back to the city map" onClick={onClose}>
          <CloseIcon />
        </button>
      </header>
      <div className="hq-speed">
        <SpeedControls speed={speed} onChange={onSpeed} />
        <span className="small">
          Your net worth <strong className="num">{formatBigMoney(personalWealth(state))}</strong>
        </span>
      </div>
      <div className="store-body">
        <div className="store-panel hq-panel" key={hq.open ? tab : 'closed'}>
          {!hq.open ? <OpenHq /> : tab === 'departments' ? <DepartmentsTab /> : tab === 'board' ? <BoardTab /> : tab === 'farms' ? <FarmsTab /> : <InvestmentsTab />}
        </div>
      </div>
      {hq.open && (
        <nav className="tabbar" aria-label="Headquarters sections">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'on' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
