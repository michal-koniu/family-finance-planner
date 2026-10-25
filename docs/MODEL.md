# How the numbers are calculated

Everything is computed in `src/engine/simulate.ts`. It's a deterministic, month-by-month simulation: the same inputs
always give the same result, with no randomness. Tests in `src/engine/*.test.ts` check it against values worked out by
hand (annuity formula, compounding, tax on a BTC sale, and so on).

## Time

- **Now** is the end of the month before *Plan starts* (Settings). Everything you enter in Household describes that
  moment.
- The plan then runs month by month for *Plan length* years. Each month, in this order:
  1. Return changes scheduled for that month take effect.
  2. **Events** for that month happen, in list order (household life events first, then the scenario's; loan
     overpayments and rate changes last, so they find a mortgage taken that same month). They use start-of-month
     prices. Conditions like "when savings reach X" are checked against the end of the previous month.
  3. **Markets move**: each account grows by its yearly return turned into a monthly one, `(1 + r)^(1/12) − 1`.
     Property grows with inflation × (1 + extra growth). Things like cars lose value at `(1 − d)^(1/12)` a month.
  4. **Income** arrives: salaries, pensions, rent received (after the empty-months share), child benefit, other income.
  5. **Bills** are paid: living costs, rent, kids, property costs, running costs, lease payments, loan installments.
     Overpayments and lease buy-outs also leave the current account here.
  6. The month is **settled** on the current account (see Money flow below).
- Snapshots show the state at the **end** of each month. The cash flow you see for a month is that month's.

## Inflation

- When on, the price level after *n* months is `(1 + X)^(n/12)`, i.e. compounded yearly: after 1 year exactly 1 + X,
  after 10 years `(1 + X)^10`.
- Amounts you enter in today's money (salaries, costs, rent, kids' costs, pensions, prices marked "today's money") are
  multiplied by the price level when they happen.
- Cash and deposits keep their nominal amount, so their real value falls by `1/(1 + X)^n`, minus whatever interest
  they earn.
- Investment returns you enter are **nominal**. Their real growth is roughly return − inflation (exactly
  `(1 + r)/(1 + X) − 1`).
- Loan installments are fixed nominal amounts, so in today's money they shrink every year.
- **Today's money** view: every amount at month *n* is divided by the price level at *n*.
- When inflation is off, nothing is indexed and both views show the same numbers.

## Money flow

- Income and bills go through the **current account** (Household → Money rules).
- At the end of each month, **everything in the current account above the buffer** (N months of that month's bills) is
  invested across the accounts in *Monthly savings go to*. That covers savings, sale proceeds and anything else.
  Shares are proportions. With no accounts listed, money stays in the current account.
- If the current account is below zero, investments are sold until it's back to zero: first the **withdrawal order**,
  then any other account (untaxed ones first, then those with the smallest taxable gain). For investments taxed on
  sale, the app sells enough to cover both the bill and the tax: `gross = needed / (1 − tax × gain share)`.
- If every account is empty, the current account stays negative. That's shown as a **shortfall**, with one warning
  saying when the money runs out and for how many months.
- Purchases (property own contribution, car, lease upfront payment, birth costs) first sell from the accounts you chose
  in the event. The rest comes from the current account, and the month's income arrives before anything else has to
  be sold.
- Moment details show **Income − costs** (spending only) separately from **own money paid at events** and **extra loan
  repayments**. Those two aren't consumption: they turn cash into property or less debt.

## Taxes

- **Investments taxed on sale** (stocks, crypto): when you sell part of a holding, the cost basis sold is the same
  share of the total cost basis (average cost). Tax = rate × (sale amount − fees − cost basis sold), charged
  immediately.
  Example: 3 BTC bought for 225 000, worth 660 000, all sold: tax = 19% × 435 000 = 82 650.
- **Deposits/bonds**: interest is taxed every month as it's earned (like Polish banks deduct Belka at capitalisation).
- **Tax-free** accounts (IKE) and cash: no tax.
- **Property sale**: gain = price − selling costs − (purchase price + purchase costs + renovation). It's taxed at the
  property rate unless the sale happens after the exemption period: from 1 January of year *purchase year + 5 + 1*
  with the default 5 years.
- **Rental income**: lump-sum rate × rent actually received.
- **Income tax** is never calculated: salaries and pensions are entered after tax.

## Loans

- Monthly interest = remaining balance × yearly rate / 12.
- **Equal installments**: `P = L·r / (1 − (1 + r)^−n)` with `r` = rate/12.
- **Decreasing installments**: principal L/n each month plus interest on what's left.
- **Rate change**: the installment is recalculated for the remaining balance and remaining months (how Polish
  variable-rate mortgages work).
- **Overpayment**: *shorten* keeps the installment and cuts the remaining months; *lower* keeps the term and
  recalculates a lower installment.
- A loan taken in a month pays its first installment at the end of that month.
- Selling a property or car repays the loan secured on it from the sale money.

## Purchases, leases, kids, retirement

- **Buy property**: price (in today's money it follows property prices until the purchase), purchase costs %,
  renovation, optional mortgage (share of price or fixed amount), bank commission. It can end your rent. Owner costs:
  monthly fixed costs plus yearly repairs as a share of value.
- **Car / big item**: cash, loan (equal installments) or lease (upfront %, fixed monthly payment, optional buy-out at
  the end at a % of the original price). It can repeat every N years: the old item is sold at its depreciated value
  and its loan repaid, and a running lease ends. It can also replace something you own now (sold at the first
  purchase).
- **Child**: monthly costs from the age bands in Settings (today's money), child benefit until 18, one-off costs at
  birth. A child born before the plan start (a Child event dated in the past) keeps its real age and has no birth
  costs.
- **Retirement**: at the default age per person (Household), or through a Retire event (date, age, or "when savings
  reach X in today's money"). Salary stops; the state pension starts at the pension age. Bills are then covered from
  savings in the withdrawal order.

## Net worth

- **Market value**: all accounts + property market value + things − debts.
- **After tax & selling costs**: market value minus the capital gains tax you'd owe if you sold every investment now,
  minus property selling costs (Settings) and any property gain tax still due.
- **Liquid**: accounts only (what you could turn into cash within days).

## Known simplifications

These are deliberate and keep the model transparent. Keep them in mind when reading results:

- Returns and inflation are fixed rates per period (no randomness, volatility or sequence-of-returns risk), so
  retirement dates and drawdowns are on the optimistic side. Use return changes over time to model bull and bear
  markets, or compare a cautious scenario.
- Capital gains tax is paid at the moment of sale, not in April of the next year (PIT-38). Losses don't offset gains
  and aren't carried forward.
- Deposit interest is taxed on its nominal amount, as the law does, even when inflation is higher than the interest.
- Renovation/furnishing is counted fully in the property's tax basis and doesn't raise its market value.
- Selling your home doesn't restart rent automatically. Add a “Change rent” event.
- The state pension follows inflation only (real Polish indexation adds part of real wage growth).
- Purchase loans are always equal-installment; bank commission is paid upfront, not added to the loan; there are no
  early-repayment fees.
- The "when savings reach X" trigger uses market values before latent tax.
- IKE/IKZE rules (early-withdrawal penalties, IKZE deduction and exit tax) aren't modelled; use the "None" tax mode
  for IKE.
- All amounts are in one currency. For USD assets or targets, convert at the exchange rate you expect.
- Rental income uses a single lump-sum rate (8.5% default). The 12.5% rate above 100 000 zł a year isn't applied
  automatically, so set a blended rate if you'll exceed it.
- The property gain tax exemption for reinvesting in your own housing (ulga mieszkaniowa) isn't modelled.
- Bank fees, prepayment fees and insurance can be entered as monthly loan costs or commission, but aren't computed
  from bank rules.
- Indexation is smooth month by month rather than once a year (identical at each yearly anniversary).
- A shortfall is not charged interest; treat any warning as "this plan doesn't work as is".
