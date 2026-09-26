import { MANAGER_SALARY, MAX_STAFF, RAISE_STEP, RECRUITING_COST, TRAINING_COST, equipmentType, marketWage } from '../../sim/catalog';
import { managerStatus } from '../../sim/manager';
import { baristaRate, serviceCapacity, workingEquipment } from '../../sim/store';
import { Portrait } from '../Brand';
import { Card, Meter, Money, when } from '../bits';
import { useGameUi } from '../context';

// Coffee Inc 2's managers could get stuck on a status forever. Here the status is worked out
// from the store every time you look, and the manager's last action is always shown.
const STATUS_LABEL = { operating: 'Running smoothly', hiring: 'Hiring', repairing: 'Repairing', needsAttention: 'Needs you' } as const;

function ManagerSection() {
  const { state, store, storeAct, confirm } = useGameUi();
  const m = store.manager;
  const status = managerStatus(state, store);
  if (!m || !status) {
    return (
      <Card title="Store manager">
        <p className="muted small">
          A manager runs this store while you are elsewhere: they answer incidents right away, repair broken equipment first thing in the morning when cash allows, and hire baristas to match demand.
        </p>
        <div className="row-actions">
          <button className="btn btn-small btn-primary" onClick={() => storeAct({ type: 'hireManager' })}>
            Hire a manager <Money cents={MANAGER_SALARY} />/week
          </button>
        </div>
      </Card>
    );
  }
  return (
    <Card title="Store manager">
      <div className="person-head">
        <Portrait look={m.look} size={40} apron={state.brand.color} />
        <strong>{m.name}</strong>
        <span className={`tag ${status.state === 'needsAttention' ? 'bad' : status.state === 'operating' ? 'good' : 'warn'}`}>{STATUS_LABEL[status.state]}</span>
      </div>
      <p>{status.note}</p>
      <p className="muted small">
        Salary <Money cents={m.salary} /> a week.{m.lastAction && m.lastActionHour !== null ? ` Last action ${when(m.lastActionHour)}: ${m.lastAction}.` : ' No actions yet.'}
      </p>
      <div className="row-actions">
        <button
          className="btn btn-small btn-danger"
          onClick={async () => {
            const ok = await confirm({ title: `Let ${m.name} go?`, body: 'You will handle incidents, repairs, and hiring at this store yourself.', confirmLabel: 'Let go', danger: true });
            if (ok) await storeAct({ type: 'fireManager' });
          }}
        >
          Let go
        </button>
      </div>
    </Card>
  );
}

export function StaffTab() {
  const { state, store, act, confirm, storeAct } = useGameUi();
  const register = workingEquipment(store, 'register');
  const registerCap = register ? equipmentType(register.typeId).capacity : 0;

  return (
    <div className="stack">
      <ManagerSection />
      <Card title={`Your team (${store.staff.length} of ${MAX_STAFF})`}>
        <p className="muted small">
          The team can serve about {Math.floor(serviceCapacity(state, store))} customers an hour
          {register ? `, and the register handles up to ${registerCap}` : ''}. Staff are paid for every hour the store is open.
        </p>
        {store.staff.length === 0 && <p>No one works here yet. Hire someone from the applicants below.</p>}
        <ul className="people">
          {store.staff.map((s) => {
            const training = s.trainingUntilHour !== null && s.trainingUntilHour > state.hour;
            const sick = s.sickUntilHour !== null && s.sickUntilHour > state.hour;
            const market = marketWage(s.skill);
            return (
              <li key={s.id} className="person">
                <div className="person-head">
                  <strong>{s.name}</strong>
                  <span className={`tag ${training || sick ? 'warn' : 'good'}`}>
                    {training ? `Training until ${when(s.trainingUntilHour!)}` : sick ? 'Out sick' : 'Working'}
                  </span>
                </div>
                <div className="meter-row">
                  <span>Skill</span>
                  <Meter value={s.skill} max={10} label="Skill" tone="good" />
                  <span className="num">{s.skill}/10</span>
                </div>
                <div className="meter-row">
                  <span>Morale</span>
                  <Meter value={s.morale} label="Morale" />
                  <span className="num">{Math.round(s.morale)}</span>
                </div>
                <p className="muted small">
                  <Money cents={s.wage} withCents />/h (typical for this skill: <Money cents={market} withCents />) · serves about {Math.round(baristaRate(s))}/h
                </p>
                <div className="row-actions">
                  <button className="btn btn-small" disabled={training || s.skill >= 10} onClick={() => storeAct({ type: 'trainStaff', staffId: s.id })}>
                    Train <Money cents={TRAINING_COST} />
                  </button>
                  <button className="btn btn-small" onClick={() => storeAct({ type: 'giveRaise', staffId: s.id })}>
                    Raise +<Money cents={RAISE_STEP} />/h
                  </button>
                  <button
                    className="btn btn-small btn-danger"
                    onClick={async () => {
                      const ok = await confirm({
                        title: `Let ${s.name} go?`,
                        body: 'The rest of the team will be a little less happy.',
                        confirmLabel: 'Let go',
                        danger: true,
                      });
                      if (ok) await storeAct({ type: 'fireStaff', staffId: s.id });
                    }}
                  >
                    Let go
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card
        title="Applicants"
        aside={
          <button className="btn btn-small" onClick={() => act({ type: 'refreshCandidates' })}>
            New job ad <Money cents={RECRUITING_COST} />
          </button>
        }
      >
        <p className="muted small">New applicants show up every Monday.</p>
        {state.candidates.length === 0 && <p>No applicants right now.</p>}
        <ul className="people">
          {state.candidates.map((c) => (
            <li key={c.id} className="person">
              <div className="person-head">
                <strong>{c.name}</strong>
                <span className="num">
                  <Money cents={c.askingWage} withCents />/h
                </span>
              </div>
              <div className="meter-row">
                <span>Skill</span>
                <Meter value={c.skill} max={10} label="Skill" tone="good" />
                <span className="num">{c.skill}/10</span>
              </div>
              <div className="row-actions">
                <button className="btn btn-small btn-primary" disabled={store.staff.length >= MAX_STAFF} onClick={() => storeAct({ type: 'hireStaff', candidateId: c.id })}>
                  Hire
                </button>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
