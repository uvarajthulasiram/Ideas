import type { Quote } from "@direct-booking/core";
import { money, shortDate, type Locale } from "../lib/format";

/** A quote exactly as the API returned it: no amounts are computed here. */
export function QuoteLines({ quote, l }: { quote: Quote; l: Locale }) {
  const first = quote.cancellation[0];
  return (
    <>
      <dl className="lines">
        {quote.lines.map((line, i) => (
          <div key={i}>
            <dt>{line.kind === "tax" || line.kind === "discount" ? `${line.label} (${line.percent}%)` : line.label}</dt>
            <dd>{money(line.amount, l)}</dd>
          </div>
        ))}
        <div className="lines__total">
          <dt>Total</dt>
          <dd>{money(quote.total, l)}</dd>
        </div>
      </dl>
      <div className="schedule">
        <div>
          <span>Due today</span>
          <span>{money(quote.dueNow, l)}</span>
        </div>
        {quote.balanceDueDate && (
          <div className="muted">
            <span>Charged {shortDate(quote.balanceDueDate, l.locale, true)}</span>
            <span>{money(quote.dueLater, l)}</span>
          </div>
        )}
      </div>
      {first && (
        <p className="tiny muted">
          {first.refundPercent === 100 ? "Free cancellation" : `${first.refundPercent}% refund if you cancel`} until {shortDate(first.until, l.locale, true)}.
        </p>
      )}
    </>
  );
}
