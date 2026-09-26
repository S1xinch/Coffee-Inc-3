import { MAX_STAFF, RAISE_STEP, RECRUITING_COST, TRAINING_COST, equipmentType, marketWage } from '../../sim/catalog';
import { baristaRate, serviceCapacity, workingEquipment } from '../../sim/store';
import { Card, Meter, Money, when } from '../bits';
import { useGameUi } from '../context';

export function StaffTab() {
  const { state, act, confirm } = useGameUi();
  const register = workingEquipment(state, 'register');
  const registerCap = register ? equipmentType(register.typeId).capacity : 0;

  return (
    <div className="stack">
      <Card title={`Your team (${state.staff.length} of ${MAX_STAFF})`}>
        <p className="muted small">
          The team can serve about {Math.floor(serviceCapacity(state))} customers an hour
          {register ? `, and the register handles up to ${registerCap}` : ''}. Staff are paid for every hour the store is open.
        </p>
        {state.staff.length === 0 && <p>No one works here yet. Hire someone from the applicants below.</p>}
        <ul className="people">
          {state.staff.map((s) => {
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
                  <button className="btn btn-small" disabled={training || s.skill >= 10} onClick={() => act({ type: 'trainStaff', staffId: s.id })}>
                    Train <Money cents={TRAINING_COST} />
                  </button>
                  <button className="btn btn-small" onClick={() => act({ type: 'giveRaise', staffId: s.id })}>
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
                      if (ok) await act({ type: 'fireStaff', staffId: s.id });
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
                <button className="btn btn-small btn-primary" disabled={state.staff.length >= MAX_STAFF} onClick={() => act({ type: 'hireStaff', candidateId: c.id })}>
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
