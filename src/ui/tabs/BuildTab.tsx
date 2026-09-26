import { EQUIPMENT, REPAIR_RATE, RESALE_RATE, SINGLE_UNIT_CATEGORIES, equipmentType, type EquipmentType } from '../../sim/catalog';
import { formatMoney } from '../../sim/money';
import { ambiancePoints, bookValue, equipmentIn } from '../../sim/store';
import { Card, Money } from '../bits';
import { useGameUi } from '../context';

const GROUPS: { title: string; categories: EquipmentType['category'][]; note?: string }[] = [
  { title: 'Counter', categories: ['register', 'espresso', 'grinder', 'drip', 'coldbrew', 'pastry'], note: 'Upgrading trades in the old model automatically.' },
  { title: 'Seating', categories: ['seating'] },
  { title: 'Decor', categories: ['decor'] },
];

export function BuildTab() {
  const { state, act, confirm } = useGameUi();

  const sell = async (equipmentId: string) => {
    const e = state.store.equipment.find((x) => x.id === equipmentId);
    if (!e) return;
    const t = equipmentType(e.typeId);
    const value = Math.round(bookValue(e) * RESALE_RATE);
    const ok = await confirm({
      title: `Sell the ${t.name}?`,
      body: `A used-equipment dealer will pay ${formatMoney(value)}.`,
      confirmLabel: 'Sell',
      danger: true,
    });
    if (ok) await act({ type: 'sellEquipment', equipmentId });
  };

  return (
    <div className="stack">
      <p className="muted">
        Ambiance {Math.min(ambiancePoints(state), 16)} of 16. Seating and decor make the room nicer, which raises satisfaction and brings people back.
      </p>
      {GROUPS.map((group) => (
        <Card key={group.title} title={group.title}>
          {group.note && <p className="muted small">{group.note}</p>}
          <ul className="shop">
            {EQUIPMENT.filter((t) => group.categories.includes(t.category)).map((t) => {
              const owned = state.store.equipment.filter((e) => e.typeId === t.id);
              const single = SINGLE_UNIT_CATEGORIES.includes(t.category);
              const current = single ? equipmentIn(state, t.category) : undefined;
              const currentType = current ? equipmentType(current.typeId) : undefined;
              const isCurrent = current?.typeId === t.id;
              const isDowngrade = !!currentType && currentType.cost > t.cost;
              const tradeIn = current && !isCurrent && !isDowngrade ? Math.round(bookValue(current) * RESALE_RATE) : 0;
              return (
                <li key={t.id} className="shop-item">
                  <div>
                    <div className="shop-name">
                      {t.name}
                      {!single && owned.length > 0 && <span className="tag">{owned.length} of {t.max}</span>}
                      {isCurrent && <span className={`tag ${current?.broken ? 'bad' : 'good'}`}>{current?.broken ? 'Broken' : 'Installed'}</span>}
                    </div>
                    <p className="muted small">{t.description}</p>
                  </div>
                  <div className="shop-actions">
                    {isCurrent && current?.broken && (
                      <button className="btn btn-small btn-primary" onClick={() => act({ type: 'repairEquipment', equipmentId: current.id })}>
                        Repair <Money cents={Math.round(t.cost * REPAIR_RATE)} />
                      </button>
                    )}
                    {(isCurrent || (!single && owned.length > 0)) && (
                      <button className="btn btn-small" onClick={() => sell((isCurrent ? current : owned[owned.length - 1])!.id)}>
                        Sell
                      </button>
                    )}
                    {!isCurrent && !isDowngrade && (single || owned.length < t.max) && (
                      <button className="btn btn-small btn-primary" onClick={() => act({ type: 'buyEquipment', typeId: t.id })}>
                        {current ? 'Upgrade' : 'Buy'} <Money cents={t.cost - tradeIn} />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      ))}
    </div>
  );
}
