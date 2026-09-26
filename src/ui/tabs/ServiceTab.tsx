import { BANKRUPTCY_GRACE_WEEKS, CLOSE_HOUR, OPEN_HOUR, REPAIR_RATE, equipmentType } from '../../sim/catalog';
import { formatTime } from '../../sim/clock';
import { incidentDef, incidentStaff } from '../../sim/incidents';
import { lot } from '../../sim/city';
import { managerStatus } from '../../sim/manager';
import { isWorking, readiness, serviceCapacity, weeklyRent } from '../../sim/store';
import { Portrait } from '../Brand';
import { AlertIcon, CheckIcon, CircleIcon } from '../Icons';
import { Card, Money, Stat, plural, when } from '../bits';
import { useGameUi } from '../context';

const STATUS_LABEL = { operating: 'Running smoothly', hiring: 'Hiring', repairing: 'Repairing', needsAttention: 'Needs you' } as const;

function ManagerCard() {
  const { state, store, openSheet } = useGameUi();
  const status = managerStatus(state, store);
  if (!store.manager || !status) return null;
  const m = store.manager;
  return (
    <Card title="Store manager" aside={<span className={`tag ${status.state === 'needsAttention' ? 'bad' : status.state === 'operating' ? 'good' : 'warn'}`}>{STATUS_LABEL[status.state]}</span>}>
      <div className="dialogue in-modal">
        <Portrait look={m.look} size={44} apron={state.brand.color} />
        <p>
          <strong>{m.name.split(' ')[0]}</strong>
          <span>{status.note}</span>
        </p>
      </div>
      <p className="muted small">
        {m.name} handles incidents on the spot, repairs broken equipment when cash allows, and hires baristas to match demand. Buying equipment and setting prices stay with you.
      </p>
      <div className="row-actions">
        <button className="btn btn-small" onClick={() => openSheet('staff')}>
          Manager settings
        </button>
      </div>
    </Card>
  );
}

function LocationCard() {
  const { state, store, storeAct, confirm, selectStore } = useGameUi();
  const where = lot(store.lotId);
  return (
    <Card title="This location">
      <p className="muted small">
        {where.address}. Rent is <Money cents={weeklyRent(store)} /> a week.
      </p>
      {state.stores.length > 1 && (
        <div className="row-actions">
          <button
            className="btn btn-small btn-danger"
            onClick={async () => {
              const ok = await confirm({
                title: `Close the store at ${where.address}?`,
                body: 'The equipment is sold to a used-equipment dealer, the staff are let go, and the lease ends. This cannot be undone.',
                confirmLabel: 'Close for good',
                danger: true,
              });
              if (!ok) return;
              const next = state.stores.find((s) => s.id !== store.id)!;
              if (await storeAct({ type: 'closeStore' })) selectStore(next.id);
            }}
          >
            Close this location
          </button>
        </div>
      )}
      {state.stores.length === 1 && <p className="muted small">Lease more lots from the city map to grow into a chain.</p>}
    </Card>
  );
}

export function ServiceTab({ saveError }: { saveError: string | null }) {
  const { state, store, act, goTo, openSheet, storeAct } = useGameUi();
  const ready = readiness(state, store);
  const broken = store.equipment.filter((e) => e.broken);
  const today = store.today;
  const working = store.staff.filter((s) => isWorking(s, state.hour)).length;
  const checklist: { done: boolean; label: string; go: () => void }[] = [
    { done: ready.register, label: 'Install a cash register', go: () => openSheet('customize') },
    { done: ready.drinkMachine, label: 'Install a coffee machine', go: () => openSheet('customize') },
    { done: ready.barista, label: 'Hire a barista', go: () => openSheet('staff') },
    { done: ready.menu, label: 'Put a drink on the menu', go: () => goTo('product') },
  ];

  return (
    <div className="stack">
      {saveError && (
        <div className="alert bad" role="alert">
          <AlertIcon />
          <span>{saveError}</span>
        </div>
      )}
      {state.distressWeeks > 0 && (
        <div className="alert bad" role="alert">
          <AlertIcon />
          <span>
            Cash is below zero. You have {plural(BANKRUPTCY_GRACE_WEEKS - state.distressWeeks + 1, 'week')} to recover before the company goes bankrupt.
          </span>
          <button className="btn btn-small" onClick={() => goTo('finance')}>
            Bank
          </button>
        </div>
      )}
      {broken.map((e) => {
        const t = equipmentType(e.typeId);
        return (
          <div className="alert warn" role="alert" key={e.id}>
            <AlertIcon />
            <span>The {t.name} is broken. Drinks that need it are off the menu.</span>
            <button className="btn btn-small btn-primary" onClick={() => storeAct({ type: 'repairEquipment', equipmentId: e.id })}>
              Repair <Money cents={Math.round(t.cost * REPAIR_RATE)} />
            </button>
          </div>
        );
      })}

      {!ready.ready && (
        <Card title="Before you open">
          <ul className="checklist">
            {checklist.map((c) => (
              <li key={c.label} className={c.done ? 'done' : ''}>
                {c.done ? <CheckIcon /> : <CircleIcon />}
                <span>{c.label}</span>
                {!c.done && (
                  <button className="btn btn-small" onClick={c.go}>
                    Go
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ManagerCard />

      {state.incidents.filter((i) => i.storeId === store.id).map((incident) => {
        const def = incidentDef(incident.defId);
        const staff = incidentStaff(state, incident);
        const hoursLeft = Math.max(0, incident.deadlineHour - state.hour);
        return (
          <Card key={incident.id} title={def.title} className="incident">
            <p>{def.text(staff?.name ?? 'A barista')}</p>
            <div className="choices">
              {def.options.map((o, i) => (
                <button key={o.label} className="choice" onClick={() => act({ type: 'resolveIncident', incidentId: incident.id, option: i })}>
                  <span className="choice-label">
                    {o.label}
                    {o.cost > 0 && (
                      <>
                        {' '}
                        (<Money cents={o.cost} />)
                      </>
                    )}
                  </span>
                  <span className="choice-detail">{o.detail}</span>
                </button>
              ))}
            </div>
            <p className="muted small">
              If you do nothing, "{def.options[def.defaultOption]!.label}" happens in {plural(hoursLeft, 'hour')}.
            </p>
          </Card>
        );
      })}

      <Card
        title="Today"
        aside={
          <button className={`btn btn-small ${store.open ? '' : 'btn-primary'}`} onClick={() => storeAct({ type: 'setStoreOpen', open: !store.open })}>
            {store.open ? 'Close store' : 'Open store'}
          </button>
        }
      >
        <div className="stats">
          <Stat label="Served">{today.served.toLocaleString('en-US')}</Stat>
          <Stat label="Walked out">{today.lost.toLocaleString('en-US')}</Stat>
          <Stat label="Sales">
            <Money cents={today.revenue} />
          </Stat>
          <Stat label="Team capacity">{Math.floor(serviceCapacity(state, store))}/h</Stat>
        </div>
        <p className="muted small">
          Open {formatTime(OPEN_HOUR)} to {formatTime(CLOSE_HOUR)} every day. {working} of {store.staff.length} staff working now.
        </p>
        <div className="row-actions">
          <button className="btn btn-small" onClick={() => openSheet('staff')}>
            Manage staff
          </button>
        </div>
      </Card>

      <LocationCard />

      <Card title="Activity">
        <ul className="log">
          {state.log
            .slice(-25)
            .reverse()
            .map((l, i) => (
              <li key={`${l.hour}-${i}`} className={l.tone}>
                <span className="log-time">{when(l.hour)}</span>
                <span>{l.text}</span>
              </li>
            ))}
        </ul>
      </Card>
    </div>
  );
}
