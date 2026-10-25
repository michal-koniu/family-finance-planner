import { addMonths, ageAt, monthsBetween, parseYM } from './dates';
import { annuityPayment, changeRate, initLoanState, overpay, payInstallment, type LoanState } from './loans';
import type {
  Account,
  AmountSpec,
  GoodFinancing,
  Household,
  MonthFlows,
  MonthSnapshot,
  PlanEvent,
  Property,
  PropertySpec,
  Scenario,
  Settings,
  SimulationResult,
  Trigger,
  YearMonth,
} from './types';

// ---------------------------------------------------------------------------
// Mutable simulation state

interface AccState {
  id: string;
  name: string;
  kind: Account['kind'];
  taxMode: Account['taxMode'];
  value: number;
  basis: number;
  rate: number;
  schedule: Account['schedule'];
}

interface PropState extends PropertySpec {
  id: string;
  value: number;
  basis: number;
  acquired: YearMonth;
}

interface GoodState {
  id: string;
  name: string;
  value: number;
  depreciation: number;
  runningCosts: number; // today's money
  /** Purchase event that created it (for repeated purchases). */
  sourceEvent?: string;
}

interface LoanRuntime {
  id: string;
  name: string;
  state: LoanState;
  monthlyFees: number;
  securedOn?: string;
}

interface LeaseRuntime {
  id: string;
  name: string;
  monthly: number; // nominal, fixed
  monthsLeft: number;
  buyout: boolean;
  buyoutAmount: number; // nominal
  goodValueAtEnd: number; // nominal
  depreciation: number;
  runningCosts: number; // today's money
  sourceEvent: string;
}

interface PersonRuntime {
  id: string;
  name: string;
  birth: YearMonth;
  salaryBase: number; // today's money
  salaryBaseIndex: number; // month the base applies from (real growth compounds from here)
  realGrowth: number;
  retirementAge: number | null;
  retired: boolean;
  pension: number;
  pensionAge: number;
}

interface FlowRuntime {
  name: string;
  kind: 'income' | 'expense';
  amount: number;
  indexed: boolean;
  start?: YearMonth;
  end?: YearMonth;
}

interface OverpayPlan {
  loanId: string;
  name: string;
  amount: number;
  real: boolean;
  monthsLeft: number; // Infinity = until repaid
  strategy: 'shorten' | 'lower';
}

interface Kid {
  name: string;
  birthIndex: number;
}

type PurchaseEvent = Extract<PlanEvent, { kind: 'purchase' }>;

export interface SimulationInput {
  household: Household;
  settings: Settings;
  scenario: Scenario;
}

const EPS = 0.005;

export function simulate({ household, settings, scenario }: SimulationInput): SimulationResult {
  const start = settings.startMonth;
  const totalMonths = Math.max(1, Math.round(settings.horizonYears * 12));
  const infl = settings.inflationEnabled ? settings.inflationRate : 0;
  const cpiAt = (m: number) => Math.pow(1 + infl, m / 12);
  const cgt = settings.capitalGainsTaxRate;

  const labels: Record<string, string> = {};
  const warnings: string[] = [];
  const warn = (w: string) => {
    if (!warnings.includes(w)) warnings.push(w);
  };

  // ----- initial state
  const accounts = new Map<string, AccState>();
  for (const a of household.accounts) {
    accounts.set(a.id, {
      id: a.id,
      name: a.name,
      kind: a.kind,
      taxMode: a.taxMode,
      value: a.value,
      basis: a.taxMode === 'onSale' && Number.isFinite(a.costBasis) ? a.costBasis : a.value,
      rate: rateAtStart(a, start),
      schedule: a.schedule,
    });
    labels[a.id] = a.name;
  }
  const cashId = household.allocation.cashAccountId;
  if (!accounts.has(cashId)) {
    accounts.set(cashId || '__cash', {
      id: cashId || '__cash',
      name: 'Cash',
      kind: 'cash',
      taxMode: 'none',
      value: 0,
      basis: 0,
      rate: 0,
      schedule: [],
    });
    labels[cashId || '__cash'] = 'Cash';
    warn('No cash account selected in Household → Money rules; using an empty one.');
  }
  const cash = accounts.get(cashId) ?? accounts.get('__cash')!;

  const properties = new Map<string, PropState>();
  for (const p of household.properties) addProperty(p);

  const goods = new Map<string, GoodState>();
  for (const g of household.goods) {
    goods.set(g.id, { ...g, depreciation: clamp01(g.depreciation) });
    labels[g.id] = g.name;
  }

  const loans = new Map<string, LoanRuntime>();
  for (const l of household.loans) {
    loans.set(l.id, {
      id: l.id,
      name: l.name,
      state: initLoanState(l.balance, l.rate, Math.max(1, Math.round(l.remainingMonths)), l.type),
      monthlyFees: l.monthlyFees,
      securedOn: l.securedOn,
    });
    labels[l.id] = l.name;
  }

  const leases: LeaseRuntime[] = [];
  const people: PersonRuntime[] = household.people.map((p) => {
    labels[p.id] = p.name;
    return {
      id: p.id,
      name: p.name,
      birth: p.birth,
      salaryBase: p.netSalary,
      salaryBaseIndex: 0,
      realGrowth: p.realSalaryGrowth,
      retirementAge: p.retirementAge,
      retired: false,
      pension: p.pension,
      pensionAge: p.pensionAge,
    };
  });
  const flows: FlowRuntime[] = household.flows.map((f) => ({ ...f }));
  let rent = household.rent;
  let surplusRule = household.allocation.surplus.slice();
  const kids: Kid[] = [];
  const overpays: OverpayPlan[] = [];
  const retirements: Record<string, number> = {};

  const events: PlanEvent[] = [
    ...household.commonEvents.filter((e) => !scenario.excludedCommon.includes(e.id)),
    ...scenario.events,
  ].filter((e) => e.enabled);
  const fired = new Set<string>();
  let firstShortfall: YearMonth | null = null;
  let shortfallMonths = 0;
  const repeats = new Map<number, PurchaseEvent[]>(); // month index -> purchases due
  const occurrences = new Map<string, number>();

  for (const e of events) {
    if (e.trigger.type === 'date' && e.trigger.date < start) {
      warn(`"${e.name}" is dated before the plan start; it happens in the first month.`);
    }
  }

  // Snapshot 0 is "now": the end of the month before the plan starts. Snapshot m is the
  // end of the m-th simulated month, labelled with that month.
  const months: MonthSnapshot[] = [];
  months.push(snapshot(0, addMonths(start, -1), 1, emptyFlows(), 0, 0, 0, {}, []));

  // ----- main loop
  for (let m = 1; m <= totalMonths; m++) {
    const date = addMonths(start, m - 1);
    const cpi = cpiAt(m);
    const prev = months[m - 1];
    const fl = emptyFlows();
    const eventCosts: Record<string, number> = {};
    const eventLog: string[] = [];
    let taxPaid = 0;
    let interestPaid = 0;
    let debtRepaid = 0;
    let eventOutflows = 0;
    // Events happen at the start of the month, i.e. at the end of the previous one.
    const cpiStart = cpiAt(m - 1);
    const pendingMoves: { to: string; amount: number }[] = [];

    const addIncome = (k: string, v: number) => {
      if (v) fl.income[k] = (fl.income[k] ?? 0) + v;
    };
    const addExpense = (k: string, v: number) => {
      if (v) fl.expense[k] = (fl.expense[k] ?? 0) + v;
    };
    const addEventCost = (k: string, v: number) => {
      if (v > EPS) eventCosts[k] = (eventCosts[k] ?? 0) + v;
    };

    // 1. Scheduled return changes take effect this month.
    for (const a of accounts.values()) {
      for (const p of a.schedule) if (p.from === date) a.rate = p.rate;
    }

    // 2. Events, at the start of the month. Conditions are checked against last month's end state.
    const due = events.filter((e) => !fired.has(e.id) && triggerMet(e.trigger, m, date, prev));
    // Loan changes go last, so they find a mortgage taken by another event the same month.
    due.sort((a, b) => Number(isLoanEvent(a)) - Number(isLoanEvent(b)));
    for (const e of due) {
      fired.add(e.id);
      runEvent(e, m, date, cpiStart);
    }
    for (const e of repeats.get(m) ?? []) runPurchase(e, m, date, cpiStart);

    // 3. Markets move over the month.
    for (const a of accounts.values()) {
      if (a.value <= 0) continue;
      const growth = a.value * (Math.pow(1 + Math.max(-0.99, a.rate), 1 / 12) - 1);
      if (a.taxMode === 'interest' && growth > 0) {
        const tax = growth * cgt;
        taxPaid += tax;
        a.value += growth - tax;
        a.basis = a.value;
      } else {
        a.value += growth;
        if (a.taxMode !== 'onSale') a.basis = a.value;
      }
    }
    for (const p of properties.values()) {
      p.value *= Math.pow((1 + infl) * (1 + Math.max(-0.99, p.realGrowth)), 1 / 12);
    }
    for (const g of goods.values()) {
      g.value *= Math.pow(1 - g.depreciation, 1 / 12);
    }

    // 4. Income.
    for (const p of people) {
      const age = ageAt(p.birth, date);
      if (!p.retired && p.retirementAge != null && age >= p.retirementAge) {
        retire(p, m);
        eventLog.push(`${p.name} retires at ${age}`);
      }
      if (!p.retired) {
        const salary = p.salaryBase * cpi * Math.pow(1 + p.realGrowth, (m - p.salaryBaseIndex) / 12);
        addIncome(`Salary: ${p.name}`, salary);
      }
      if (p.pension > 0 && age >= p.pensionAge) addIncome(`Pension: ${p.name}`, p.pension * cpi);
    }
    for (const p of properties.values()) {
      if (p.use !== 'rental' || p.rentIncome <= 0) continue;
      const received = p.rentIncome * cpi * (1 - p.vacancyPct);
      addIncome(`Rent received: ${p.name}`, received);
      const tax = received * p.rentalTaxRate;
      addExpense('Rental income tax', tax);
      taxPaid += tax;
      addExpense('Rental management', received * p.managementPct);
    }
    for (const k of kids) {
      const age = Math.floor((m - k.birthIndex) / 12);
      if (age < 18 && settings.childBenefit > 0) {
        addIncome('Child benefit', settings.childBenefit * (settings.childBenefitIndexed ? cpi : 1));
      }
    }

    // 5. Regular expenses.
    for (const f of flows) {
      if (f.start && date < f.start) continue;
      if (f.end && date > f.end) continue;
      const v = f.amount * (f.indexed ? cpi : 1);
      if (f.kind === 'income') addIncome(f.name, v);
      else addExpense(f.name, v);
    }
    if (rent > 0) addExpense('Rent', rent * cpi);
    for (const k of kids) {
      const age = Math.floor((m - k.birthIndex) / 12);
      const band = settings.kidCostBands.find((b) => age >= b.fromAge && age < b.toAge);
      if (band) addExpense(`Kid: ${k.name}`, band.monthly * cpi);
    }
    for (const p of properties.values()) {
      addExpense(`Property costs: ${p.name}`, p.monthlyCosts * cpi + (p.value * p.maintenancePct) / 12);
    }
    for (const g of goods.values()) {
      if (g.runningCosts > 0) addExpense(`Running costs: ${g.name}`, g.runningCosts * cpi);
    }
    for (const l of leases) {
      if (l.monthsLeft <= 0) continue;
      addExpense(`Lease: ${l.name}`, l.monthly);
      if (l.runningCosts > 0) addExpense(`Running costs: ${l.name}`, l.runningCosts * cpi);
    }
    for (const l of loans.values()) {
      const { interest, installment } = payInstallment(l.state);
      if (installment > 0) {
        addExpense(`Installment: ${l.name}`, installment);
        interestPaid += interest;
        if (l.monthlyFees > 0) addExpense(`Loan fees: ${l.name}`, l.monthlyFees);
      }
    }
    const regularExpenses = sum(fl.expense);

    // Overpayments (not consumption, but they leave the cash account).
    for (const o of overpays) {
      if (o.monthsLeft <= 0) continue;
      const loan = loans.get(o.loanId);
      if (!loan || loan.state.balance <= EPS) {
        o.monthsLeft = 0;
        continue;
      }
      const applied = overpay(loan.state, o.amount * (o.real ? cpi : 1), o.strategy);
      debtRepaid += applied;
      cash.value -= applied;
      o.monthsLeft -= 1;
    }

    // Leases that end this month (the buy-out is paid before savings are invested).
    for (const l of leases) {
      if (l.monthsLeft <= 0) continue;
      l.monthsLeft -= 1;
      if (l.monthsLeft === 0) {
        eventLog.push(`${l.name} lease ended`);
        if (l.buyout) {
          taxPaid += payFrom(l.buyoutAmount, []).tax;
          const id = `${l.id}:owned`;
          goods.set(id, {
            id,
            name: l.name,
            value: l.goodValueAtEnd,
            depreciation: l.depreciation,
            runningCosts: l.runningCosts,
            sourceEvent: l.sourceEvent,
          });
          labels[id] = l.name;
          eventLog.push(`${l.name} bought out for ${fmt(l.buyoutAmount)}`);
        }
      }
    }

    // 6. Settle the month on the cash account.
    const net = sum(fl.income) - sum(fl.expense);
    cash.value += net;
    for (const mv of pendingMoves) {
      const amt = Math.min(mv.amount, Math.max(0, cash.value));
      const to = accounts.get(mv.to);
      if (!to || to === cash || amt <= 0) continue;
      cash.value -= amt;
      deposit(to, amt);
    }
    // Everything above the buffer is invested by the savings split (shares are proportions).
    const buffer = household.allocation.bufferMonths * regularExpenses;
    const targets = surplusRule.filter((x) => x.share > 0 && accounts.has(x.accountId) && x.accountId !== cash.id);
    const shareSum = targets.reduce((a, x) => a + x.share, 0);
    if (cash.value > buffer + EPS && shareSum > 0) {
      const investable = cash.value - buffer;
      for (const x of targets) {
        const amt = (investable * x.share) / shareSum;
        cash.value -= amt;
        deposit(accounts.get(x.accountId)!, amt);
      }
    }
    if (cash.value < 0) taxPaid += refillCash();
    if (cash.value < -EPS) {
      firstShortfall ??= date;
      shortfallMonths++;
    }

    months.push(snapshot(m, date, cpi, fl, interestPaid, taxPaid, net, eventCosts, eventLog, debtRepaid, eventOutflows));

    // ----- helpers that need this month's scope

    function runEvent(e: PlanEvent, mi: number, d: YearMonth, c: number): void {
      switch (e.kind) {
        case 'transfer': {
          const from = accounts.get(e.from);
          const to = accounts.get(e.to);
          if (!from || !to) {
            warn(`"${e.name}": account not found.`);
            return;
          }
          const gross = Math.min(from.value, amountOf(e.amount, from.value, c));
          if (gross <= EPS) {
            eventLog.push(`${e.name}: nothing to move`);
            return;
          }
          const { net, tax, fee } = sell(from, gross, clamp01(e.feePct));
          taxPaid += tax;
          addEventCost('Transaction fees', fee);
          deposit(to, net);
          eventLog.push(
            `${e.name}: ${fmt(gross)} from ${from.name} → ${fmt(net)} into ${to.name}` +
              (tax > EPS ? ` (tax ${fmt(tax)})` : ''),
          );
          return;
        }
        case 'setReturn': {
          const a = accounts.get(e.accountId);
          if (a) {
            a.rate = e.rate;
            eventLog.push(`${e.name}: ${a.name} return now ${(e.rate * 100).toFixed(1)}%/yr`);
          }
          return;
        }
        case 'buyProperty': {
          const index = c * Math.pow(1 + e.property.realGrowth, (mi - 1) / 12);
          const price = e.priceReal ? e.price * index : e.price;
          const buyCosts = price * e.buyCostPct;
          const extra = e.extraCosts * (e.priceReal ? c : 1);
          let principal = 0;
          if (e.mortgage) {
            principal = e.mortgage.mode === 'ltv' ? price * e.mortgage.value : e.mortgage.value * (e.priceReal ? c : 1);
            principal = Math.max(0, Math.min(principal, price + buyCosts + extra));
          }
          const commission = e.mortgage ? principal * e.mortgage.commissionPct : 0;
          const own = price + buyCosts + extra + commission - principal;
          const { tax } = payFrom(own, e.fundFrom);
          taxPaid += tax;
          addEventCost('Property purchase costs', buyCosts);
          addEventCost('Renovation / furnishing', extra);
          addEventCost('Bank commission', commission);
          const id = e.id;
          addProperty({ ...e.property, id, value: price, costBasis: price + buyCosts + extra, acquired: d });
          if (e.mortgage && principal > EPS) {
            const lid = `${e.id}:loan`;
            loans.set(lid, {
              id: lid,
              name: `Mortgage: ${e.property.name}`,
              state: initLoanState(principal, e.mortgage.rate, Math.max(1, Math.round(e.mortgage.termYears * 12)), e.mortgage.type),
              monthlyFees: e.mortgage.monthlyFees,
              securedOn: id,
            });
            labels[lid] = `Mortgage: ${e.property.name}`;
          }
          if (e.endsRent) rent = 0;
          eventLog.push(
            `Bought ${e.property.name} for ${fmt(price)}` +
              (principal > EPS ? `, mortgage ${fmt(principal)}` : '') +
              `, own money ${fmt(own)}` +
              (tax > EPS ? ` (tax on sold investments ${fmt(tax)})` : ''),
          );
          return;
        }
        case 'sellProperty': {
          const p = properties.get(e.propertyId);
          if (!p) {
            warn(`"${e.name}": property not found (maybe not bought yet in this scenario).`);
            return;
          }
          const sellCost = p.value * e.sellCostPct;
          let repaid = 0;
          for (const [lid, l] of loans) {
            if (l.securedOn === p.id) {
              repaid += l.state.balance;
              loans.delete(lid);
            }
          }
          const gain = p.value - sellCost - p.basis;
          const exempt = parseYM(d).y >= parseYM(p.acquired).y + settings.propertyExemptionYears + 1;
          const tax = !exempt && gain > 0 ? gain * settings.propertyGainTaxRate : 0;
          taxPaid += tax;
          addEventCost('Property selling costs', sellCost);
          const proceeds = p.value - sellCost - repaid - tax;
          properties.delete(p.id);
          const to = accounts.get(e.to) ?? cash;
          if (proceeds >= 0) deposit(to, proceeds);
          else taxPaid += payFrom(-proceeds, []).tax;
          eventLog.push(
            `Sold ${p.name} for ${fmt(p.value)}` +
              (repaid > EPS ? `, repaid mortgage ${fmt(repaid)}` : '') +
              (tax > EPS ? `, gain tax ${fmt(tax)}` : exempt ? ', gain tax-free' : '') +
              ` → ${fmt(proceeds)} into ${to.name}`,
          );
          return;
        }
        case 'purchase':
          runPurchase(e, mi, d, c);
          return;
        case 'child': {
          // A child born before the plan start keeps its real age (index ≤ 0) and no birth costs.
          const born = e.trigger.type === 'date' ? monthsBetween(start, e.trigger.date) + 1 : mi;
          kids.push({ name: e.childName, birthIndex: Math.min(born, mi) });
          if (born >= mi) {
            addEventCost(`Birth: ${e.childName}`, e.birthCost * c);
            if (e.birthCost > 0) taxPaid += payFrom(e.birthCost * c, []).tax;
            eventLog.push(`${e.childName} is born`);
          } else {
            eventLog.push(`${e.childName} (age ${Math.floor((mi - born) / 12)}) is included`);
          }
          return;
        }
        case 'retire': {
          for (const p of people) if (e.personId === 'all' || p.id === e.personId) retire(p, mi);
          eventLog.push(`${e.name}: retirement`);
          return;
        }
        case 'setSalary': {
          const p = people.find((x) => x.id === e.personId);
          if (p) {
            p.salaryBase = e.netSalary;
            p.salaryBaseIndex = mi;
            eventLog.push(`${p.name}'s take-home pay set to ${fmt(e.netSalary)} (today's money)`);
          }
          return;
        }
        case 'setRent':
          rent = e.rent;
          eventLog.push(e.rent > 0 ? `Rent now ${fmt(e.rent)} (today's money)` : 'Stopped renting');
          return;
        case 'oneOff': {
          const v = e.amount * (e.real ? c : 1);
          if (e.flowKind === 'income') {
            addIncome(e.name, v);
            if (e.to && e.to !== cash.id) pendingMoves.push({ to: e.to, amount: v });
          } else {
            addExpense(e.name, v);
          }
          eventLog.push(`${e.name}: ${e.flowKind === 'income' ? '+' : '−'}${fmt(v)}`);
          return;
        }
        case 'recurring': {
          const end = e.months > 0 ? addMonths(d, e.months - 1) : undefined;
          flows.push({ name: e.name, kind: e.flowKind, amount: e.amount, indexed: e.indexed, start: d, end });
          eventLog.push(`${e.name} starts`);
          return;
        }
        case 'overpay': {
          const loan = loans.get(e.loanId);
          if (!loan) {
            warn(`"${e.name}": loan not found (maybe not taken yet in this scenario).`);
            return;
          }
          overpays.push({
            loanId: e.loanId,
            name: e.name,
            amount: e.amount,
            real: e.real,
            monthsLeft: e.monthly ? (e.months > 0 ? e.months : Infinity) : 1,
            strategy: e.strategy,
          });
          eventLog.push(`${e.name} starts`);
          return;
        }
        case 'loanRate': {
          const loan = loans.get(e.loanId);
          if (loan) {
            changeRate(loan.state, e.rate);
            eventLog.push(`${loan.name}: rate now ${(e.rate * 100).toFixed(2)}%`);
          }
          return;
        }
        case 'setAllocation':
          surplusRule = e.surplus.slice();
          eventLog.push(`${e.name}: savings allocation changed`);
          return;
      }
    }

    function runPurchase(e: PurchaseEvent, mi: number, _d: YearMonth, c: number): void {
      const k = occurrences.get(e.id) ?? 0;
      occurrences.set(e.id, k + 1);
      // Replace the previous one (or the item it replaces): sell it at its depreciated value, repay its loan.
      for (const l of leases) if (l.sourceEvent === e.id) l.monthsLeft = 0;
      for (const [gid, g] of goods) {
        const replaced = k > 0 ? g.sourceEvent === e.id : !!e.replaces && gid === e.replaces;
        if (!replaced) continue;
        let proceeds = g.value;
        for (const [lid, l] of loans) {
          if (l.securedOn === gid) {
            proceeds -= l.state.balance;
            loans.delete(lid);
          }
        }
        goods.delete(gid);
        if (proceeds >= 0) deposit(cash, proceeds);
        else taxPaid += payFrom(-proceeds, []).tax;
        eventLog.push(`Sold old ${g.name} for ${fmt(g.value)}`);
      }
      const price = e.priceReal ? e.price * c : e.price;
      const depreciation = clamp01(e.depreciation);
      const id = `${e.id}#${k}`;
      const f: GoodFinancing = e.financing;
      if (f.type === 'lease') {
        const initial = price * f.initialPct;
        const { tax } = payFrom(initial, e.fundFrom);
        taxPaid += tax;
        addEventCost(`Lease initial payment: ${e.name}`, initial);
        const monthly = f.monthly * (e.priceReal ? c : 1);
        leases.push({
          id,
          name: e.name,
          monthly,
          monthsLeft: f.termMonths,
          buyout: f.buyout,
          buyoutAmount: price * f.buyoutPct,
          goodValueAtEnd: price * Math.pow(1 - depreciation, f.termMonths / 12),
          depreciation,
          runningCosts: e.runningCosts,
          sourceEvent: e.id,
        });
        eventLog.push(`Leased ${e.name}: ${fmt(initial)} upfront + ${fmt(monthly)}/month for ${f.termMonths} months`);
      } else {
        let principal = 0;
        let commission = 0;
        if (f.type === 'loan') {
          principal = price * (1 - f.downPaymentPct);
          commission = principal * f.commissionPct;
        }
        const own = price - principal + commission;
        const { tax } = payFrom(own, e.fundFrom);
        taxPaid += tax;
        addEventCost('Bank commission', commission);
        goods.set(id, {
          id,
          name: e.name,
          value: price,
          depreciation,
          runningCosts: e.runningCosts,
          sourceEvent: e.id,
        });
        labels[id] = e.name;
        if (f.type === 'loan' && principal > EPS) {
          const lid = `${id}:loan`;
          loans.set(lid, {
            id: lid,
            name: `Loan: ${e.name}`,
            state: initLoanState(principal, f.rate, Math.max(1, Math.round(f.termMonths)), 'equal'),
            monthlyFees: 0,
            securedOn: id,
          });
          labels[lid] = `Loan: ${e.name}`;
          eventLog.push(
            `Bought ${e.name} for ${fmt(price)} with a loan of ${fmt(principal)} (${fmt(annuityPayment(principal, f.rate, f.termMonths))}/month)`,
          );
        } else {
          eventLog.push(`Bought ${e.name} for ${fmt(price)} in cash` + (tax > EPS ? ` (tax on sold investments ${fmt(tax)})` : ''));
        }
      }
      if (e.repeatYears > 0) {
        const next = mi + Math.round(e.repeatYears * 12);
        if (next <= totalMonths) {
          const list = repeats.get(next) ?? [];
          list.push(e);
          repeats.set(next, list);
        }
      }
    }

    /**
     * Pays `amount` by selling from the chosen accounts first; the rest comes out of the current
     * account (it may dip below zero until the month is settled, after this month's income).
     */
    function payFrom(amount: number, fundFrom: string[]): { tax: number } {
      eventOutflows += amount;
      let remaining = amount;
      let tax = 0;
      for (const id of fundFrom) {
        if (remaining <= EPS) break;
        const a = accounts.get(id);
        if (!a || a === cash || a.value <= EPS) continue;
        const r = sell(a, Math.min(a.value, grossFor(a, remaining)));
        tax += r.tax;
        remaining -= r.net;
      }
      if (remaining > EPS) cash.value -= remaining;
      return { tax };
    }
  }

  if (firstShortfall) {
    warnings.push(
      `Money runs out in ${firstShortfall}: every account is empty and bills are unpaid in ${shortfallMonths} month(s) (shown as shortfall, no interest charged).`,
    );
  }
  return { scenarioId: scenario.id, months, labels, retirements, warnings };

  // ---------------------------------------------------------------------------
  // helpers with access to the state

  function addProperty(p: Property): void {
    properties.set(p.id, {
      ...p,
      basis: p.costBasis,
    });
    labels[p.id] = p.name;
  }

  function retire(p: PersonRuntime, m: number): void {
    if (p.retired) return;
    p.retired = true;
    retirements[p.id] = m;
  }

  function deposit(to: AccState, amount: number): void {
    to.value += amount;
    to.basis += amount;
  }

  /**
   * Sells `gross` from an account. Fees reduce the taxable gain (as in Polish tax law).
   * Returns the cash received after fees and capital gains tax.
   */
  function sell(a: AccState, gross: number, feePct = 0): { net: number; tax: number; fee: number } {
    if (gross <= 0 || a.value <= 0) return { net: 0, tax: 0, fee: 0 };
    gross = Math.min(gross, a.value);
    const fee = gross * feePct;
    let tax = 0;
    if (a.taxMode === 'onSale') {
      const basisPart = a.basis * (gross / a.value);
      const gain = gross - fee - basisPart;
      tax = gain > 0 ? gain * cgt : 0;
      a.basis -= basisPart;
    } else {
      a.basis = Math.max(0, a.basis - gross);
    }
    a.value -= gross;
    if (a.value < EPS) {
      a.value = 0;
      a.basis = 0;
    }
    return { net: gross - fee - tax, tax, fee };
  }

  /** Gross amount to sell from `a` so that `net` is left after tax. */
  function grossFor(a: AccState, net: number): number {
    if (a.taxMode !== 'onSale' || a.value <= 0) return net;
    const gainShare = Math.max(0, (a.value - a.basis) / a.value);
    return net / (1 - cgt * gainShare);
  }

  /**
   * Brings a negative current account back to zero by selling: first the withdrawal order,
   * then every other account (untaxed ones first, then those with the smallest taxable gain).
   * Returns the tax paid. If everything is empty the account stays negative (a shortfall).
   */
  function refillCash(): number {
    const explicit = household.allocation.withdrawalOrder.filter((id) => id !== cash.id && accounts.has(id));
    const gainShare = (a: AccState) => (a.taxMode === 'onSale' && a.value > 0 ? Math.max(0, (a.value - a.basis) / a.value) : -1);
    const rest = [...accounts.values()]
      .filter((a) => a !== cash && !explicit.includes(a.id))
      .sort((x, y) => gainShare(x) - gainShare(y))
      .map((a) => a.id);
    let tax = 0;
    for (const id of [...explicit, ...rest]) {
      if (cash.value >= -EPS) break;
      const a = accounts.get(id)!;
      if (a.value <= EPS) continue;
      const r = sell(a, Math.min(a.value, grossFor(a, -cash.value)));
      tax += r.tax;
      cash.value += r.net;
    }
    if (Math.abs(cash.value) < EPS) cash.value = 0;
    return tax;
  }

  function amountOf(spec: AmountSpec, available: number, cpi: number): number {
    switch (spec.mode) {
      case 'all':
        return available;
      case 'share':
        return available * spec.value;
      case 'fixed':
        return spec.value * (spec.real ? cpi : 1);
    }
  }

  function triggerMet(t: Trigger, m: number, date: YearMonth, prev: MonthSnapshot): boolean {
    switch (t.type) {
      case 'date':
        return date === t.date || (m === 1 && t.date < date);
      case 'age': {
        const p = people.find((x) => x.id === t.personId);
        return !!p && ageAt(p.birth, date) >= t.age;
      }
      case 'wealth': {
        const v = t.measure === 'liquid' ? prev.liquid : prev.netWorth;
        return v / prev.cpi >= t.threshold;
      }
      case 'accountValue': {
        const v = prev.accounts[t.accountId] ?? 0;
        return (t.real ? v / prev.cpi : v) >= t.threshold;
      }
    }
  }

  function snapshot(
    index: number,
    date: YearMonth,
    cpi: number,
    fl: MonthFlows,
    interestPaid: number,
    taxPaid: number,
    netCashFlow: number,
    eventCosts: Record<string, number>,
    eventLog: string[],
    debtRepaid = 0,
    eventOutflows = 0,
  ): MonthSnapshot {
    const acc: Record<string, number> = {};
    let liquid = 0;
    let latentTax = 0;
    for (const a of accounts.values()) {
      acc[a.id] = a.value;
      liquid += a.value;
      if (a.taxMode === 'onSale' && a.value > a.basis) latentTax += (a.value - a.basis) * cgt;
    }
    const props: Record<string, number> = {};
    let propTotal = 0;
    let propExit = 0;
    for (const p of properties.values()) {
      props[p.id] = p.value;
      propTotal += p.value;
      const sellCost = p.value * settings.propertySellCostPct;
      const exempt = parseYM(date).y >= parseYM(p.acquired).y + settings.propertyExemptionYears + 1;
      const gain = p.value - sellCost - p.basis;
      propExit += sellCost + (!exempt && gain > 0 ? gain * settings.propertyGainTaxRate : 0);
    }
    const gd: Record<string, number> = {};
    let goodsTotal = 0;
    for (const g of goods.values()) {
      gd[g.id] = g.value;
      goodsTotal += g.value;
    }
    const ln: Record<string, number> = {};
    let debt = 0;
    for (const l of loans.values()) {
      if (l.state.balance <= EPS) continue;
      ln[l.id] = l.state.balance;
      debt += l.state.balance;
    }
    const netWorth = liquid + propTotal + goodsTotal - debt;
    return {
      index,
      date,
      cpi,
      accounts: acc,
      properties: props,
      goods: gd,
      loans: ln,
      flows: fl,
      interestPaid,
      taxPaid,
      netCashFlow,
      eventCosts,
      debtRepaid,
      eventOutflows,
      netWorth,
      netWorthAfterTax: netWorth - latentTax - propExit,
      liquid,
      shortfall: cash.value < 0 ? -cash.value : 0,
      events: eventLog,
    };
  }
}

function rateAtStart(a: Account, start: YearMonth): number {
  let rate = a.rate;
  let best = '';
  for (const p of a.schedule) {
    if (p.from <= start && p.from >= best) {
      best = p.from;
      rate = p.rate;
    }
  }
  return rate;
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

function isLoanEvent(e: PlanEvent): boolean {
  return e.kind === 'overpay' || e.kind === 'loanRate';
}

function emptyFlows(): MonthFlows {
  return { income: {}, expense: {} };
}

function sum(r: Record<string, number>): number {
  let s = 0;
  for (const k in r) s += r[k];
  return s;
}

function fmt(v: number): string {
  return Math.round(v).toLocaleString('en-US').replace(/,/g, ' ');
}
