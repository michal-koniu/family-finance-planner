# Our Finances: a long-term decision planner

A private planning app for two people to compare big money decisions over decades: pay cash or take credit while
savings stay invested, rent or buy, when to retire, what kids cost, how a crypto trading plan plays out. It shows the
exact result of each choice side by side.

- **Compare**: net worth of several scenarios on one chart, in today's or future money, at market value or after tax
  and selling costs. Pick any month to see every balance, debt, income and cost line next to each other. There's also
  a milestones table and a full month-by-month or year-by-year table with CSV export.
- **Scenarios**: your household plus planned events: buy/sell property (cash or mortgage, to live in or rent out),
  move/sell/buy investments (19% tax on gains handled), change expected returns (bull and bear markets), car or other
  purchases (cash, loan, lease, repeated every N years), kids, retirement (at a date, an age, or a savings target),
  pay changes, rent changes, mortgage overpayments and rate changes, one-off or regular income and costs. Events can
  fire on a date, at an age, or when savings or an account reach a value.
- **Inflation** (optional) works the realistic way: compounded yearly; cash loses value; salaries, rent, costs and
  property prices rise; loan installments stay fixed.
- **Data** syncs between your devices through a private GitHub repository. It works on laptop and iPhone (add it to
  the home screen). The Compare tab shows whether you're looking at the built-in example data or your own plan.
- **Languages**: English, Polish, Russian and Spanish (EN/PL/RU/ES switch in the top bar or Settings → Display).
  Light, dark or automatic theme. Both are remembered per device.

Setup (free hosting, sync, iPhone): **[docs/SETUP.md](docs/SETUP.md)**
How the numbers are calculated: **[docs/MODEL.md](docs/MODEL.md)**

## Development

```bash
npm install
npm run dev     # local dev server
npm test        # calculation engine tests (hand-checked expected values)
npm run build   # type-check + production build
```

Code layout:

- `src/engine/`: pure calculation engine (no UI): `simulate.ts` (monthly simulation), `loans.ts`, `metrics.ts`, with tests
- `src/model/`: defaults, example data, merging copies from two devices
- `src/sync/`: GitHub storage and the sync round
- `src/state/`: app state, local persistence, background sync
- `src/ui/`: React screens
- `src/i18n/`: translations. The English text is the key; `pl.ts`, `ru.ts` and `es.ts` map it to each language.
  `npm test` fails if any text the app shows is missing a translation or has mismatched `{placeholders}`.
