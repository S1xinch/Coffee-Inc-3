import type { GameState } from '../sim/state';
import { ratingStars, starRating } from '../sim/store';
import { Portrait, Stars } from './Brand';

type Aspect = keyof GameState['store']['ratings'];

const ROWS: { key: Aspect; label: string }[] = [
  { key: 'price', label: 'Price' },
  { key: 'product', label: 'Product' },
  { key: 'service', label: 'Service' },
  { key: 'atmosphere', label: 'Atmosphere' },
];

const QUOTES: Record<Aspect, { high: string; low: string }> = {
  price: { high: 'Fair prices for what you get.', low: 'Way too pricey for a cup of coffee.' },
  product: { high: 'The latte was excellent. Best in the neighborhood.', low: 'The coffee tasted flat. They need better equipment.' },
  service: { high: 'In and out in a couple of minutes.', low: 'Waited forever. People were giving up and leaving.' },
  atmosphere: { high: 'Cozy spot to sit and stay a while.', low: 'Not much of a place to hang out.' },
};

// Sample reviews written from the store's actual ratings: its best and worst aspects.
function sampleReviews(state: GameState) {
  const sorted = [...ROWS].sort((a, b) => state.store.ratings[b.key] - state.store.ratings[a.key]);
  const picks = [sorted[0]!, sorted[sorted.length - 1]!, sorted[1]!];
  return picks.map((row, i) => {
    const rating = state.store.ratings[row.key];
    return {
      key: row.key,
      stars: Math.max(1, Math.min(5, Math.round(ratingStars(rating)))),
      text: rating >= 0.5 ? QUOTES[row.key].high : QUOTES[row.key].low,
      look: (state.store.reviews * 37 + i * 211) % 997,
    };
  });
}

export function Reviews({ state }: { state: GameState }) {
  const reviews = state.store.reviews;
  const overall = starRating(state);
  return (
    <section className="reviews" aria-label="Customer reviews">
      <h2 className="section-title">Customer reviews</h2>
      <div className="review-summary">
        <div className="review-overall">
          <span className="review-score num">{reviews > 0 ? overall.toFixed(1) : '-'}</span>
          <Stars value={reviews > 0 ? overall : 0} size={26} />
          <span>{reviews > 0 ? `${reviews.toLocaleString('en-US')} review${reviews === 1 ? '' : 's'}` : 'No reviews yet'}</span>
        </div>
        <div className="review-rows">
          {ROWS.map((r) => {
            const stars = ratingStars(state.store.ratings[r.key]);
            return (
              <div className="review-row" key={r.key}>
                <span>{r.label}</span>
                <Stars value={reviews > 0 ? stars : 0} size={16} />
                <span className="num">{reviews > 0 ? stars.toFixed(1) : '-'}</span>
              </div>
            );
          })}
        </div>
      </div>
      {reviews > 0 && (
        <div className="review-cards">
          {sampleReviews(state).map((q) => (
            <article className="review-quote" key={q.key}>
              <div className="review-quote-head">
                <Stars value={q.stars} size={18} />
                <Portrait look={q.look} size={40} apron="#3a3f4a" />
              </div>
              <p>{q.text}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
