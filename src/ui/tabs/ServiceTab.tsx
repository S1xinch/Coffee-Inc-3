import { BANKRUPTCY_GRACE_WEEKS, CLOSE_HOUR, OPEN_HOUR, REPAIR_RATE, equipmentType } from '../../sim/catalog';
import { formatTime } from '../../sim/clock';
import { incidentDef, incidentStaff } from '../../sim/incidents';
import { isWorking, readiness, serviceCapacity } from '../../sim/store';
import { AlertIcon, CheckIcon, CircleIcon } from '../Icons';
import { Card, Money, Stat, plural, when } from '../bits';
import { useGameUi } from '../context';

export function ServiceTab({ saveError }: { saveError: string | null }) {
  const { state, act, goTo, openSheet } = useGameUi();
  const ready = readiness(state);
  const broken = state.store.equipment.filter((e) => e.broken);
  const today = state.today;
  const working = state.staff.filter((s) => isWorking(s, state.hour)).length;
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
            <button className="btn btn-small btn-primary" onClick={() => act({ type: 'repairEquipment', equipmentId: e.id })}>
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

      {state.incidents.map((incident) => {
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
          <button className={`btn btn-small ${state.store.open ? '' : 'btn-primary'}`} onClick={() => act({ type: 'setStoreOpen', open: !state.store.open })}>
            {state.store.open ? 'Close store' : 'Open store'}
          </button>
        }
      >
        <div className="stats">
          <Stat label="Served">{today.served.toLocaleString('en-US')}</Stat>
          <Stat label="Walked out">{today.lost.toLocaleString('en-US')}</Stat>
          <Stat label="Sales">
            <Money cents={today.revenue} />
          </Stat>
          <Stat label="Team capacity">{Math.floor(serviceCapacity(state))}/h</Stat>
        </div>
        <p className="muted small">
          Open {formatTime(OPEN_HOUR)} to {formatTime(CLOSE_HOUR)} every day. {working} of {state.staff.length} staff working now.
        </p>
        <div className="row-actions">
          <button className="btn btn-small" onClick={() => openSheet('staff')}>
            Manage staff
          </button>
        </div>
      </Card>

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
