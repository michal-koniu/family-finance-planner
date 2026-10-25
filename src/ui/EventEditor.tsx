import type { AmountSpec, GoodFinancing, Household, MortgageSpec, PlanEvent, PropertySpec, Scenario, Settings, Trigger } from '../engine/types';
import { kindInfo } from '../model/defaults';
import { accountRefs, loanRefs, personRefs, propertyRefs, type Ref } from '../model/refs';
import { Check, Month, Num, removeAt, Select, Text, updateAt } from './fields';
import { annuityPayment } from '../engine/loans';
import { money } from './format';

interface Props {
  event: PlanEvent;
  onChange: (e: PlanEvent) => void;
  household: Household;
  settings: Settings;
  scenario: Scenario | null;
}

const opts = (refs: Ref[]) => refs.map((r) => ({ value: r.id, label: r.label }));

export function TriggerEditor({ trigger, onChange, household }: { trigger: Trigger; onChange: (t: Trigger) => void; household: Household }) {
  const people = personRefs(household);
  const accounts = accountRefs(household);
  return (
    <div className="grid">
      <Select
        label="When"
        value={trigger.type}
        onChange={(type) => {
          if (type === 'date') onChange({ type, date: trigger.type === 'date' ? trigger.date : '2030-01' });
          if (type === 'age') onChange({ type, personId: people[0]?.id ?? '', age: 50 });
          if (type === 'wealth') onChange({ type, measure: 'liquid', threshold: 2_000_000 });
          if (type === 'accountValue') onChange({ type, accountId: accounts[0]?.id ?? '', threshold: 500_000, real: false });
        }}
        options={[
          { value: 'date', label: 'On a date' },
          { value: 'age', label: 'At an age' },
          { value: 'wealth', label: 'When savings reach…' },
          { value: 'accountValue', label: 'When an account reaches…' },
        ]}
      />
      {trigger.type === 'date' && <Month label="Month" value={trigger.date} onChange={(d) => d && onChange({ ...trigger, date: d })} />}
      {trigger.type === 'age' && (
        <>
          <Select label="Person" value={trigger.personId} onChange={(personId) => onChange({ ...trigger, personId })} options={opts(people)} />
          <Num label="Age" value={trigger.age} onChange={(age) => onChange({ ...trigger, age: Math.round(age) })} min={0} max={120} />
        </>
      )}
      {trigger.type === 'wealth' && (
        <>
          <Select
            label="Measure"
            value={trigger.measure}
            onChange={(measure) => onChange({ ...trigger, measure })}
            options={[
              { value: 'liquid', label: 'Savings & investments (no property)' },
              { value: 'netWorth', label: 'Net worth (incl. property, minus debts)' },
            ]}
          />
          <Num label="Reaches (today's money)" kind="money" value={trigger.threshold} onChange={(threshold) => onChange({ ...trigger, threshold })} />
        </>
      )}
      {trigger.type === 'accountValue' && (
        <>
          <Select label="Account" value={trigger.accountId} onChange={(accountId) => onChange({ ...trigger, accountId })} options={opts(accounts)} />
          <Num label="Is worth at least" kind="money" value={trigger.threshold} onChange={(threshold) => onChange({ ...trigger, threshold })} />
          <Check label="Amount in today's money" checked={trigger.real} onChange={(real) => onChange({ ...trigger, real })} />
        </>
      )}
    </div>
  );
}

function AmountEditor({ value, onChange }: { value: AmountSpec; onChange: (a: AmountSpec) => void }) {
  return (
    <>
      <Select
        label="How much"
        value={value.mode}
        onChange={(mode) => {
          if (mode === 'all') onChange({ mode });
          if (mode === 'share') onChange({ mode, value: 0.5 });
          if (mode === 'fixed') onChange({ mode, value: 50_000, real: true });
        }}
        options={[
          { value: 'all', label: 'Everything' },
          { value: 'share', label: 'A share' },
          { value: 'fixed', label: 'A fixed amount' },
        ]}
      />
      {value.mode === 'share' && <Num label="Share" kind="pct" value={value.value} onChange={(v) => onChange({ ...value, value: v })} min={0} max={1} />}
      {value.mode === 'fixed' && (
        <>
          <Num label="Amount (before tax)" kind="money" value={value.value} onChange={(v) => onChange({ ...value, value: v })} />
          <Check label="In today's money" checked={value.real} onChange={(real) => onChange({ ...value, real })} />
        </>
      )}
    </>
  );
}

function FundFrom({ value, onChange, household }: { value: string[]; onChange: (v: string[]) => void; household: Household }) {
  const accounts = accountRefs(household);
  return (
    <div className="subcard">
      <b>Pay own money from</b>
      <small className="hint" style={{ display: 'block', marginBottom: 8 }}>
        Investments are sold from these accounts in this order (tax on gains is paid). Whatever is still missing comes from
        the current account; if that runs short, the month's income and then the withdrawal order cover it.
      </small>
      {value.map((id, i) => (
        <div className="list-row" key={i}>
          <Select label={`${i + 1}.`} value={id} onChange={(v) => onChange(updateAt(value, i, v))} options={opts(accounts)} />
          <button type="button" className="btn small ghost" onClick={() => onChange(removeAt(value, i))}>
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="btn small" onClick={() => onChange([...value, accounts.find((a) => !value.includes(a.id))?.id ?? accounts[0]?.id])}>
        + Add account
      </button>
    </div>
  );
}

export function PropertySpecEditor({ value, onChange }: { value: PropertySpec; onChange: (p: PropertySpec) => void }) {
  const set = (patch: Partial<PropertySpec>) => onChange({ ...value, ...patch });
  return (
    <div className="grid">
      <Text label="Name" value={value.name} onChange={(name) => set({ name })} />
      <Select
        label="Use"
        value={value.use}
        onChange={(use) => set({ use })}
        options={[
          { value: 'home', label: 'We live in it' },
          { value: 'rental', label: 'Rented out' },
          { value: 'vacant', label: 'Empty / holiday flat' },
        ]}
      />
      <Num label="Price growth above inflation" kind="pct" value={value.realGrowth} onChange={(realGrowth) => set({ realGrowth })} hint="0 = prices just follow inflation" />
      <Num label="Monthly owner costs" kind="money" value={value.monthlyCosts} onChange={(monthlyCosts) => set({ monthlyCosts })} hint="Building fees, insurance, property tax (today's money)" />
      <Num label="Repairs per year" kind="pct" value={value.maintenancePct} onChange={(maintenancePct) => set({ maintenancePct })} hint="Share of the property value" />
      {value.use === 'rental' && (
        <>
          <Num label="Rent received / month" kind="money" value={value.rentIncome} onChange={(rentIncome) => set({ rentIncome })} hint="Today's money; rises with inflation" />
          <Num label="Empty part of the year" kind="pct" value={value.vacancyPct} onChange={(vacancyPct) => set({ vacancyPct })} hint="8% ≈ one month a year" />
          <Num label="Tax on rent" kind="pct" value={value.rentalTaxRate} onChange={(rentalTaxRate) => set({ rentalTaxRate })} hint="Lump-sum tax on rent received" />
          <Num label="Management fee" kind="pct" value={value.managementPct} onChange={(managementPct) => set({ managementPct })} hint="Share of rent received" />
        </>
      )}
    </div>
  );
}

function MortgageEditor({ value, onChange, price }: { value: MortgageSpec; onChange: (m: MortgageSpec) => void; price: number }) {
  const set = (patch: Partial<MortgageSpec>) => onChange({ ...value, ...patch });
  const principal = value.mode === 'ltv' ? price * value.value : value.value;
  const first = value.type === 'equal' ? annuityPayment(principal, value.rate, value.termYears * 12) : principal / (value.termYears * 12) + (principal * value.rate) / 12;
  return (
    <div className="subcard">
      <div className="grid">
        <Select
          label="Loan size"
          value={value.mode}
          onChange={(mode) => set({ mode, value: mode === 'ltv' ? 0.8 : Math.round(price * 0.8) })}
          options={[
            { value: 'ltv', label: 'Share of price' },
            { value: 'amount', label: 'Fixed amount' },
          ]}
        />
        {value.mode === 'ltv' ? (
          <Num label="Share of price" kind="pct" value={value.value} onChange={(v) => set({ value: v })} min={0} max={1} />
        ) : (
          <Num label="Loan amount" kind="money" value={value.value} onChange={(v) => set({ value: v })} />
        )}
        <Num label="Interest rate" kind="pct" value={value.rate} onChange={(rate) => set({ rate })} hint="Add later changes with a “Loan rate changes” event" />
        <Num label="Term" suffix="yrs" value={value.termYears} onChange={(termYears) => set({ termYears: Math.max(1, Math.round(termYears)) })} />
        <Select
          label="Installments"
          value={value.type}
          onChange={(type) => set({ type })}
          options={[
            { value: 'equal', label: 'Equal (raty równe)' },
            { value: 'decreasing', label: 'Decreasing (raty malejące)' },
          ]}
        />
        <Num label="Bank commission" kind="pct" value={value.commissionPct} onChange={(commissionPct) => set({ commissionPct })} />
        <Num label="Other monthly loan costs" kind="money" value={value.monthlyFees} onChange={(monthlyFees) => set({ monthlyFees })} hint="Insurance, account fee" />
      </div>
      <small className="hint">
        ≈ {money(principal)} loan, first installment ≈ {money(first)} / month (at today's prices).
      </small>
    </div>
  );
}

function FinancingEditor({ value, onChange }: { value: GoodFinancing; onChange: (f: GoodFinancing) => void }) {
  return (
    <div className="subcard">
      <div className="grid">
        <Select
          label="Paid with"
          value={value.type}
          onChange={(type) => {
            if (type === 'cash') onChange({ type });
            if (type === 'loan') onChange({ type, downPaymentPct: 0.2, rate: 0.09, termMonths: 60, commissionPct: 0 });
            if (type === 'lease') onChange({ type, initialPct: 0.1, monthly: 2500, termMonths: 48, buyoutPct: 0.4, buyout: false });
          }}
          options={[
            { value: 'cash', label: 'Cash' },
            { value: 'loan', label: 'Loan' },
            { value: 'lease', label: 'Lease' },
          ]}
        />
        {value.type === 'loan' && (
          <>
            <Num label="Down payment" kind="pct" value={value.downPaymentPct} onChange={(downPaymentPct) => onChange({ ...value, downPaymentPct })} />
            <Num label="Interest rate" kind="pct" value={value.rate} onChange={(rate) => onChange({ ...value, rate })} />
            <Num label="Term" suffix="mo" value={value.termMonths} onChange={(t) => onChange({ ...value, termMonths: Math.max(1, Math.round(t)) })} />
            <Num label="Commission" kind="pct" value={value.commissionPct} onChange={(commissionPct) => onChange({ ...value, commissionPct })} />
          </>
        )}
        {value.type === 'lease' && (
          <>
            <Num label="Upfront payment" kind="pct" value={value.initialPct} onChange={(initialPct) => onChange({ ...value, initialPct })} hint="Share of price" />
            <Num label="Monthly payment" kind="money" value={value.monthly} onChange={(monthly) => onChange({ ...value, monthly })} hint="Fixed for the whole lease" />
            <Num label="Term" suffix="mo" value={value.termMonths} onChange={(t) => onChange({ ...value, termMonths: Math.max(1, Math.round(t)) })} />
            <Num label="Buy-out price" kind="pct" value={value.buyoutPct} onChange={(buyoutPct) => onChange({ ...value, buyoutPct })} hint="Share of original price" />
            <Check label="Buy it out at the end" checked={value.buyout} onChange={(buyout) => onChange({ ...value, buyout })} />
          </>
        )}
      </div>
    </div>
  );
}

export function EventEditor({ event: e, onChange, household, settings, scenario }: Props) {
  const set = (patch: Record<string, unknown>) => onChange({ ...e, ...patch } as PlanEvent);
  const accounts = opts(accountRefs(household));
  const people = opts(personRefs(household));
  const loans = opts(loanRefs(household, scenario));
  const info = kindInfo(e.kind);

  return (
    <div className="stack">
      <small className="hint">{info.hint}</small>
      <div className="grid">
        <Text label="Name" value={e.name} onChange={(name) => set({ name })} />
      </div>
      <TriggerEditor trigger={e.trigger} onChange={(trigger) => set({ trigger })} household={household} />

      {e.kind === 'transfer' && (
        <div className="grid">
          <Select label="From" value={e.from} onChange={(from) => set({ from })} options={accounts} />
          <Select label="To" value={e.to} onChange={(to) => set({ to })} options={accounts} />
          <AmountEditor value={e.amount} onChange={(amount) => set({ amount })} />
          <Num label="Fees" kind="pct" value={e.feePct} onChange={(feePct) => set({ feePct })} hint="Exchange / broker fee" />
        </div>
      )}

      {e.kind === 'setReturn' && (
        <div className="grid">
          <Select label="Account" value={e.accountId} onChange={(accountId) => set({ accountId })} options={accounts} />
          <Num label="New yearly return" kind="pct" value={e.rate} onChange={(rate) => set({ rate })} hint="Negative for a falling market" />
        </div>
      )}

      {e.kind === 'setAllocation' && (
        <div className="subcard">
          <b>Monthly savings go to</b>
          {e.surplus.map((s, i) => (
            <div className="list-row" key={i}>
              <Select label="Account" value={s.accountId} onChange={(accountId) => set({ surplus: updateAt(e.surplus, i, { ...s, accountId }) })} options={accounts} />
              <Num label="Share" kind="pct" value={s.share} onChange={(share) => set({ surplus: updateAt(e.surplus, i, { ...s, share }) })} />
              <button type="button" className="btn small ghost" onClick={() => set({ surplus: removeAt(e.surplus, i) })}>
                ✕
              </button>
            </div>
          ))}
          <button type="button" className="btn small" onClick={() => set({ surplus: [...e.surplus, { accountId: accounts[0]?.value ?? '', share: 0 }] })}>
            + Add
          </button>
        </div>
      )}

      {e.kind === 'oneOff' && (
        <div className="grid">
          <Select
            label="Type"
            value={e.flowKind}
            onChange={(flowKind) => set({ flowKind })}
            options={[
              { value: 'expense', label: 'Expense' },
              { value: 'income', label: 'Income' },
            ]}
          />
          <Num label="Amount" kind="money" value={e.amount} onChange={(amount) => set({ amount })} />
          <Check label="In today's money" checked={e.real} onChange={(real) => set({ real })} />
          {e.flowKind === 'income' && <Select label="Put into" value={e.to} onChange={(to) => set({ to })} options={accounts} />}
        </div>
      )}

      {e.kind === 'recurring' && (
        <div className="grid">
          <Select
            label="Type"
            value={e.flowKind}
            onChange={(flowKind) => set({ flowKind })}
            options={[
              { value: 'expense', label: 'Expense' },
              { value: 'income', label: 'Income (after tax)' },
            ]}
          />
          <Num label="Per month" kind="money" value={e.amount} onChange={(amount) => set({ amount })} />
          <Check label="Rises with inflation" checked={e.indexed} onChange={(indexed) => set({ indexed })} />
          <Num label="For how many months" value={e.months} onChange={(m) => set({ months: Math.max(0, Math.round(m)) })} hint="0 = until the end of the plan" />
        </div>
      )}

      {e.kind === 'buyProperty' && (
        <>
          <div className="grid">
            <Num label="Price" kind="money" value={e.price} onChange={(price) => set({ price })} />
            <Check label="Price in today's money (grows with property prices until bought)" checked={e.priceReal} onChange={(priceReal) => set({ priceReal })} />
            <Num label="Purchase costs" kind="pct" value={e.buyCostPct} onChange={(buyCostPct) => set({ buyCostPct })} hint="PCC tax, notary, agency" />
            <Num label="Renovation & furniture" kind="money" value={e.extraCosts} onChange={(extraCosts) => set({ extraCosts })} />
            <Check label="We stop paying rent" checked={e.endsRent} onChange={(endsRent) => set({ endsRent })} />
          </div>
          <Check
            label="Take a mortgage"
            checked={!!e.mortgage}
            onChange={(on) => set({ mortgage: on ? { mode: 'ltv', value: 0.8, rate: 0.065, termYears: 25, type: 'equal', commissionPct: 0, monthlyFees: 0 } : null })}
          />
          {e.mortgage && <MortgageEditor value={e.mortgage} onChange={(mortgage) => set({ mortgage })} price={e.price} />}
          <FundFrom value={e.fundFrom} onChange={(fundFrom) => set({ fundFrom })} household={household} />
          <b>The property</b>
          <PropertySpecEditor value={e.property} onChange={(property) => set({ property })} />
        </>
      )}

      {e.kind === 'sellProperty' && (
        <div className="grid">
          <Select label="Property" value={e.propertyId} onChange={(propertyId) => set({ propertyId })} options={opts(propertyRefs(household, scenario))} />
          <Num label="Selling costs" kind="pct" value={e.sellCostPct} onChange={(sellCostPct) => set({ sellCostPct })} hint="Agency, notary" />
          <Select label="Put the money into" value={e.to} onChange={(to) => set({ to })} options={accounts} />
          <small className="hint">
            Its mortgage is repaid from the sale. Gain tax ({Math.round(settings.propertyGainTaxRate * 100)}%) applies if sold before the end of the{' '}
            {settings.propertyExemptionYears}th calendar year after purchase. If you lived there, add a “Change rent” event if you'll rent again.
          </small>
        </div>
      )}

      {e.kind === 'setRent' && (
        <div className="grid">
          <Num label="New monthly rent" kind="money" value={e.rent} onChange={(rent) => set({ rent })} hint="Today's money; 0 = stop renting" />
        </div>
      )}

      {e.kind === 'purchase' && (
        <>
          <div className="grid">
            <Num label="Price" kind="money" value={e.price} onChange={(price) => set({ price })} />
            <Check label="Price in today's money" checked={e.priceReal} onChange={(priceReal) => set({ priceReal })} />
            <Num label="Loses value per year" kind="pct" value={e.depreciation} onChange={(depreciation) => set({ depreciation })} hint="Cars ≈ 15%, electronics ≈ 30%" />
            <Num label="Running costs / month" kind="money" value={e.runningCosts} onChange={(runningCosts) => set({ runningCosts })} hint="Insurance, fuel, service (today's money)" />
            <Num label="Replace every" suffix="yrs" value={e.repeatYears} onChange={(r) => set({ repeatYears: Math.max(0, r) })} hint="0 = buy once. The old one is sold." />
            {household.goods.length > 0 && (
              <Select
                label="Replaces something we own now"
                value={e.replaces ?? ''}
                onChange={(v) => set({ replaces: v || undefined })}
                options={[{ value: '', label: '— nothing —' }, ...household.goods.map((g) => ({ value: g.id, label: g.name }))]}
                hint="It's sold (and its loan repaid) when this is bought"
              />
            )}
          </div>
          <FinancingEditor value={e.financing} onChange={(financing) => set({ financing })} />
          {e.financing.type !== 'lease' || e.financing.initialPct > 0 ? <FundFrom value={e.fundFrom} onChange={(fundFrom) => set({ fundFrom })} household={household} /> : null}
        </>
      )}

      {e.kind === 'child' && (
        <div className="grid">
          <Text label="Child's name" value={e.childName} onChange={(childName) => set({ childName })} />
          <Num label="One-off costs at birth" kind="money" value={e.birthCost} onChange={(birthCost) => set({ birthCost })} hint="Pram, room… (today's money)" />
          <small className="hint">Monthly costs by age and child benefit are set in Settings.</small>
        </div>
      )}

      {e.kind === 'retire' && (
        <div className="grid">
          <Select label="Who" value={e.personId} onChange={(personId) => set({ personId })} options={[{ value: 'all', label: 'Everyone' }, ...people]} />
          <small className="hint">Salary stops; pensions start at the pension age from Household. Bills are then paid from savings in the withdrawal order.</small>
        </div>
      )}

      {e.kind === 'setSalary' && (
        <div className="grid">
          <Select label="Who" value={e.personId} onChange={(personId) => set({ personId })} options={people} />
          <Num label="New take-home pay / month" kind="money" value={e.netSalary} onChange={(netSalary) => set({ netSalary })} hint="After tax, today's money; 0 = sabbatical" />
        </div>
      )}

      {e.kind === 'overpay' && (
        <div className="grid">
          <Select label="Loan" value={e.loanId} onChange={(loanId) => set({ loanId })} options={loans} />
          <Num label="Amount" kind="money" value={e.amount} onChange={(amount) => set({ amount })} />
          <Check label="In today's money" checked={e.real} onChange={(real) => set({ real })} />
          <Check label="Every month" checked={e.monthly} onChange={(monthly) => set({ monthly })} />
          {e.monthly && <Num label="For how many months" value={e.months} onChange={(m) => set({ months: Math.max(0, Math.round(m)) })} hint="0 = until repaid" />}
          <Select
            label="Effect"
            value={e.strategy}
            onChange={(strategy) => set({ strategy })}
            options={[
              { value: 'shorten', label: 'Shorten the loan' },
              { value: 'lower', label: 'Lower the installment' },
            ]}
          />
        </div>
      )}

      {e.kind === 'loanRate' && (
        <div className="grid">
          <Select label="Loan" value={e.loanId} onChange={(loanId) => set({ loanId })} options={loans} />
          <Num label="New interest rate" kind="pct" value={e.rate} onChange={(rate) => set({ rate })} />
        </div>
      )}
    </div>
  );
}
