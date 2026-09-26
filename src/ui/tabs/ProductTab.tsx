import { MENU, MENU_CATEGORY_EQUIPMENT, neighborhood, type MenuCategory } from '../../sim/catalog';
import { itemAvailable } from '../../sim/store';
import { MinusIcon, PlusIcon } from '../Icons';
import { Card, Money } from '../bits';
import { useGameUi } from '../context';

const CATEGORY_TITLES: Record<MenuCategory, string> = {
  espresso: 'Espresso bar',
  drip: 'Drip coffee',
  coldbrew: 'Cold brew',
  pastry: 'Pastries',
};

const NEEDS: Record<MenuCategory, string> = {
  espresso: 'an espresso machine',
  drip: 'a Batch Brewer',
  coldbrew: 'a Cold Brew Tower',
  pastry: 'a Pastry Case',
};

const STEP = 25;

export function ProductTab() {
  const { state, act, openSheet } = useGameUi();
  const sensitivity = neighborhood(state.neighborhoodId).priceSensitivity;
  const sensitivityLabel = sensitivity >= 1.3 ? 'high' : sensitivity <= 0.8 ? 'low' : 'medium';

  return (
    <div className="stack">
      <p className="muted">
        Customers here are {sensitivityLabel === 'medium' ? 'moderately' : sensitivityLabel === 'high' ? 'very' : 'not very'} price sensitive.
        Charging near the typical price keeps them happy; going higher earns more per cup but fewer people buy.
      </p>
      {(Object.keys(CATEGORY_TITLES) as MenuCategory[]).map((category) => {
        const items = MENU.filter((m) => m.category === category);
        const available = items.length > 0 && itemAvailable(state, items[0]!);
        const broken = state.store.equipment.some((e) => e.broken && e.typeId.startsWith(MENU_CATEGORY_EQUIPMENT[category]));
        return (
          <Card
            key={category}
            title={CATEGORY_TITLES[category]}
            aside={
              !available && (
                <button className="btn btn-small" onClick={() => openSheet('customize')}>
                  {broken ? 'Repair' : 'Customize'}
                </button>
              )
            }
          >
            {!available && <p className="muted small">{broken ? 'The machine for these is broken.' : `Needs ${NEEDS[category]}.`}</p>}
            <ul className={`menu-list ${available ? '' : 'dim'}`}>
              {items.map((item) => {
                const entry = state.store.menu[item.id]!;
                const margin = Math.round(((entry.price - item.unitCost) / entry.price) * 100);
                return (
                  <li key={item.id}>
                    <label className="menu-toggle">
                      <input
                        type="checkbox"
                        checked={entry.enabled}
                        onChange={(e) => act({ type: 'setMenuItem', itemId: item.id, enabled: e.target.checked })}
                      />
                      <span>
                        <span className="menu-name">{item.name}</span>
                        <span className="muted small">
                          Typical <Money cents={item.refPrice} withCents /> · Cost <Money cents={item.unitCost} withCents /> · {margin}% margin
                        </span>
                      </span>
                    </label>
                    <div className="stepper">
                      <button
                        className="btn btn-icon"
                        aria-label={`Lower ${item.name} price`}
                        onClick={() => act({ type: 'setMenuItem', itemId: item.id, price: entry.price - STEP })}
                      >
                        <MinusIcon />
                      </button>
                      <span className="num price">
                        <Money cents={entry.price} withCents />
                      </span>
                      <button
                        className="btn btn-icon"
                        aria-label={`Raise ${item.name} price`}
                        onClick={() => act({ type: 'setMenuItem', itemId: item.id, price: entry.price + STEP })}
                      >
                        <PlusIcon />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}
