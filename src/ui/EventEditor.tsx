import type { AmountSpec, GoodFinancing, Household, MortgageSpec, PlanEvent, PropertySpec, Scenario, Settings, Trigger } from '../engine/types';
import { useI18n } from '../i18n';
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
  const { t } = useI18n();
  const people = personRefs(household);
  const accounts = accountRefs(household);
  return (
    <div className="grid">
      <Select
        label={t('When')}
        value={trigger.type}
        onChange={(type) => {
          if (type === 'date') onChange({ type, date: trigger.type === 'date' ? trigger.date : '2030-01' });
          if (type === 'age') onChange({ type, personId: people[0]?.id ?? '', age: 50 });
          if (type === 'wealth') onChange({ type, measure: 'liquid', threshold: 2_000_000 });
          if (type === 'accountValue') onChange({ type, accountId: accounts[0]?.id ?? '', threshold: 500_000, real: false });
        }}
        options={[
          { value: 'date', label: t('On a date') },
          { value: 'age', label: t('At an age') },
          { value: 'wealth', label: t('When savings reach…') },
          { value: 'accountValue', label: t('When an account reaches…') },
        ]}
      />
      {trigger.type === 'date' && <Month label={t('Month')} value={trigger.date} onChange={(d) => d && onChange({ ...trigger, date: d })} />}
      {trigger.type === 'age' && (
        <>
          <Select label={t('Person')} value={trigger.personId} onChange={(personId) => onChange({ ...trigger, personId })} options={opts(people)} />
          <Num label={t('Age')} value={trigger.age} onChange={(age) => onChange({ ...trigger, age: Math.round(age) })} min={0} max={120} />
        </>
      )}
      {trigger.type === 'wealth' && (
        <>
          <Select
            label={t('Measure')}
            value={trigger.measure}
            onChange={(measure) => onChange({ ...trigger, measure })}
            options={[
              { value: 'liquid', label: t('Savings & investments (no property)') },
              { value: 'netWorth', label: t('Net worth (incl. property, minus debts)') },
            ]}
          />
          <Num label={t("Reaches (today's money)")} kind="money" value={trigger.threshold} onChange={(threshold) => onChange({ ...trigger, threshold })} />
        </>
      )}
      {trigger.type === 'accountValue' && (
        <>
          <Select label={t('Account')} value={trigger.accountId} onChange={(accountId) => onChange({ ...trigger, accountId })} options={opts(accounts)} />
          <Num label={t('Is worth at least')} kind="money" value={trigger.threshold} onChange={(threshold) => onChange({ ...trigger, threshold })} />
          <Check label={t("Amount in today's money")} checked={trigger.real} onChange={(real) => onChange({ ...trigger, real })} />
        </>
      )}
    </div>
  );
}

function AmountEditor({ value, onChange }: { value: AmountSpec; onChange: (a: AmountSpec) => void }) {
  const { t } = useI18n();
  return (
    <>
      <Select
        label={t('How much')}
        value={value.mode}
        onChange={(mode) => {
          if (mode === 'all') onChange({ mode });
          if (mode === 'share') onChange({ mode, value: 0.5 });
          if (mode === 'fixed') onChange({ mode, value: 50_000, real: true });
        }}
        options={[
          { value: 'all', label: t('Everything') },
          { value: 'share', label: t('A share') },
          { value: 'fixed', label: t('A fixed amount') },
        ]}
      />
      {value.mode === 'share' && <Num label={t('Share')} kind="pct" value={value.value} onChange={(v) => onChange({ ...value, value: v })} min={0} max={1} />}
      {value.mode === 'fixed' && (
        <>
          <Num label={t('Amount (before tax)')} kind="money" value={value.value} onChange={(v) => onChange({ ...value, value: v })} />
          <Check label={t("In today's money")} checked={value.real} onChange={(real) => onChange({ ...value, real })} />
        </>
      )}
    </>
  );
}

function FundFrom({ value, onChange, household }: { value: string[]; onChange: (v: string[]) => void; household: Household }) {
  const { t } = useI18n();
  const accounts = accountRefs(household);
  return (
    <div className="subcard">
      <b>{t('Pay own money from')}</b>
      <small className="hint" style={{ display: 'block', marginBottom: 8 }}>
        {t(
          'Investments are sold from these accounts in this order (tax on gains is paid). Whatever is still missing comes from the current account; if that runs short, the month’s income and then the withdrawal order cover it.',
        )}
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
        {t('+ Add account')}
      </button>
    </div>
  );
}

export function PropertySpecEditor({ value, onChange }: { value: PropertySpec; onChange: (p: PropertySpec) => void }) {
  const { t } = useI18n();
  const set = (patch: Partial<PropertySpec>) => onChange({ ...value, ...patch });
  return (
    <div className="grid">
      <Text label={t('Name')} value={value.name} onChange={(name) => set({ name })} />
      <Select
        label={t('Use')}
        value={value.use}
        onChange={(use) => set({ use })}
        options={[
          { value: 'home', label: t('We live in it') },
          { value: 'rental', label: t('Rented out') },
          { value: 'vacant', label: t('Empty / holiday flat') },
        ]}
      />
      <Num label={t('Price growth above inflation')} kind="pct" value={value.realGrowth} onChange={(realGrowth) => set({ realGrowth })} hint={t('0 = prices just follow inflation')} />
      <Num
        label={t('Monthly owner costs')}
        kind="money"
        value={value.monthlyCosts}
        onChange={(monthlyCosts) => set({ monthlyCosts })}
        hint={t("Building fees, insurance, property tax (today's money)")}
      />
      <Num label={t('Repairs per year')} kind="pct" value={value.maintenancePct} onChange={(maintenancePct) => set({ maintenancePct })} hint={t('Share of the property value')} />
      {value.use === 'rental' && (
        <>
          <Num label={t('Rent received / month')} kind="money" value={value.rentIncome} onChange={(rentIncome) => set({ rentIncome })} hint={t("Today's money; rises with inflation")} />
          <Num label={t('Empty part of the year')} kind="pct" value={value.vacancyPct} onChange={(vacancyPct) => set({ vacancyPct })} hint={t('8% ≈ one month a year')} />
          <Num label={t('Tax on rent')} kind="pct" value={value.rentalTaxRate} onChange={(rentalTaxRate) => set({ rentalTaxRate })} hint={t('Lump-sum tax on rent received')} />
          <Num label={t('Management fee')} kind="pct" value={value.managementPct} onChange={(managementPct) => set({ managementPct })} hint={t('Share of rent received')} />
        </>
      )}
    </div>
  );
}

function MortgageEditor({ value, onChange, price }: { value: MortgageSpec; onChange: (m: MortgageSpec) => void; price: number }) {
  const { t } = useI18n();
  const set = (patch: Partial<MortgageSpec>) => onChange({ ...value, ...patch });
  const principal = value.mode === 'ltv' ? price * value.value : value.value;
  const first = value.type === 'equal' ? annuityPayment(principal, value.rate, value.termYears * 12) : principal / (value.termYears * 12) + (principal * value.rate) / 12;
  return (
    <div className="subcard">
      <div className="grid">
        <Select
          label={t('Loan size')}
          value={value.mode}
          onChange={(mode) => set({ mode, value: mode === 'ltv' ? 0.8 : Math.round(price * 0.8) })}
          options={[
            { value: 'ltv', label: t('Share of price') },
            { value: 'amount', label: t('Fixed amount') },
          ]}
        />
        {value.mode === 'ltv' ? (
          <Num label={t('Share of price')} kind="pct" value={value.value} onChange={(v) => set({ value: v })} min={0} max={1} />
        ) : (
          <Num label={t('Loan amount')} kind="money" value={value.value} onChange={(v) => set({ value: v })} />
        )}
        <Num label={t('Interest rate')} kind="pct" value={value.rate} onChange={(rate) => set({ rate })} hint={t('Add later changes with a “Loan rate changes” event')} />
        <Num label={t('Term')} suffix={t('yrs')} value={value.termYears} onChange={(termYears) => set({ termYears: Math.max(1, Math.round(termYears)) })} />
        <Select
          label={t('Installments')}
          value={value.type}
          onChange={(type) => set({ type })}
          options={[
            { value: 'equal', label: t('Equal (raty równe)') },
            { value: 'decreasing', label: t('Decreasing (raty malejące)') },
          ]}
        />
        <Num label={t('Bank commission')} kind="pct" value={value.commissionPct} onChange={(commissionPct) => set({ commissionPct })} />
        <Num label={t('Other monthly loan costs')} kind="money" value={value.monthlyFees} onChange={(monthlyFees) => set({ monthlyFees })} hint={t('Insurance, account fee')} />
      </div>
      <small className="hint">{t("≈ {loan} loan, first installment ≈ {first} / month (at today's prices).", { loan: money(principal), first: money(first) })}</small>
    </div>
  );
}

function FinancingEditor({ value, onChange }: { value: GoodFinancing; onChange: (f: GoodFinancing) => void }) {
  const { t } = useI18n();
  return (
    <div className="subcard">
      <div className="grid">
        <Select
          label={t('Paid with')}
          value={value.type}
          onChange={(type) => {
            if (type === 'cash') onChange({ type });
            if (type === 'loan') onChange({ type, downPaymentPct: 0.2, rate: 0.09, termMonths: 60, commissionPct: 0 });
            if (type === 'lease') onChange({ type, initialPct: 0.1, monthly: 2500, termMonths: 48, buyoutPct: 0.4, buyout: false });
          }}
          options={[
            { value: 'cash', label: t('Cash') },
            { value: 'loan', label: t('Loan') },
            { value: 'lease', label: t('Lease') },
          ]}
        />
        {value.type === 'loan' && (
          <>
            <Num label={t('Down payment')} kind="pct" value={value.downPaymentPct} onChange={(downPaymentPct) => onChange({ ...value, downPaymentPct })} />
            <Num label={t('Interest rate')} kind="pct" value={value.rate} onChange={(rate) => onChange({ ...value, rate })} />
            <Num label={t('Term')} suffix={t('mo')} value={value.termMonths} onChange={(x) => onChange({ ...value, termMonths: Math.max(1, Math.round(x)) })} />
            <Num label={t('Commission')} kind="pct" value={value.commissionPct} onChange={(commissionPct) => onChange({ ...value, commissionPct })} />
          </>
        )}
        {value.type === 'lease' && (
          <>
            <Num label={t('Upfront payment')} kind="pct" value={value.initialPct} onChange={(initialPct) => onChange({ ...value, initialPct })} hint={t('Share of price')} />
            <Num label={t('Monthly payment')} kind="money" value={value.monthly} onChange={(monthly) => onChange({ ...value, monthly })} hint={t('Fixed for the whole lease')} />
            <Num label={t('Term')} suffix={t('mo')} value={value.termMonths} onChange={(x) => onChange({ ...value, termMonths: Math.max(1, Math.round(x)) })} />
            <Num label={t('Buy-out price')} kind="pct" value={value.buyoutPct} onChange={(buyoutPct) => onChange({ ...value, buyoutPct })} hint={t('Share of original price')} />
            <Check label={t('Buy it out at the end')} checked={value.buyout} onChange={(buyout) => onChange({ ...value, buyout })} />
          </>
        )}
      </div>
    </div>
  );
}

export function EventEditor({ event: e, onChange, household, settings, scenario }: Props) {
  const { t } = useI18n();
  const set = (patch: Record<string, unknown>) => onChange({ ...e, ...patch } as PlanEvent);
  const accounts = opts(accountRefs(household));
  const people = opts(personRefs(household));
  const loans = opts(loanRefs(household, scenario));
  const info = kindInfo(e.kind);
  const kinds = (incomeLabel: string) => [
    { value: 'expense' as const, label: t('Expense') },
    { value: 'income' as const, label: incomeLabel },
  ];

  return (
    <div className="stack">
      <small className="hint">{t(info.hint)}</small>
      <div className="grid">
        <Text label={t('Name')} value={e.name} onChange={(name) => set({ name })} />
      </div>
      <TriggerEditor trigger={e.trigger} onChange={(trigger) => set({ trigger })} household={household} />

      {e.kind === 'transfer' && (
        <div className="grid">
          <Select label={t('From')} value={e.from} onChange={(from) => set({ from })} options={accounts} />
          <Select label={t('To')} value={e.to} onChange={(to) => set({ to })} options={accounts} />
          <AmountEditor value={e.amount} onChange={(amount) => set({ amount })} />
          <Num label={t('Fees')} kind="pct" value={e.feePct} onChange={(feePct) => set({ feePct })} hint={t('Exchange / broker fee')} />
        </div>
      )}

      {e.kind === 'setReturn' && (
        <div className="grid">
          <Select label={t('Account')} value={e.accountId} onChange={(accountId) => set({ accountId })} options={accounts} />
          <Num label={t('New yearly return')} kind="pct" value={e.rate} onChange={(rate) => set({ rate })} hint={t('Negative for a falling market')} />
        </div>
      )}

      {e.kind === 'setAllocation' && (
        <div className="subcard">
          <b>{t('Monthly savings go to')}</b>
          {e.surplus.map((x, i) => (
            <div className="list-row" key={i}>
              <Select label={t('Account')} value={x.accountId} onChange={(accountId) => set({ surplus: updateAt(e.surplus, i, { ...x, accountId }) })} options={accounts} />
              <Num label={t('Share')} kind="pct" value={x.share} onChange={(share) => set({ surplus: updateAt(e.surplus, i, { ...x, share }) })} />
              <button type="button" className="btn small ghost" onClick={() => set({ surplus: removeAt(e.surplus, i) })}>
                ✕
              </button>
            </div>
          ))}
          <button type="button" className="btn small" onClick={() => set({ surplus: [...e.surplus, { accountId: accounts[0]?.value ?? '', share: 0 }] })}>
            {t('+ Add')}
          </button>
        </div>
      )}

      {e.kind === 'oneOff' && (
        <div className="grid">
          <Select label={t('Type')} value={e.flowKind} onChange={(flowKind) => set({ flowKind })} options={kinds(t('Income'))} />
          <Num label={t('Amount')} kind="money" value={e.amount} onChange={(amount) => set({ amount })} />
          <Check label={t("In today's money")} checked={e.real} onChange={(real) => set({ real })} />
          {e.flowKind === 'income' && <Select label={t('Put into')} value={e.to} onChange={(to) => set({ to })} options={accounts} />}
        </div>
      )}

      {e.kind === 'recurring' && (
        <div className="grid">
          <Select label={t('Type')} value={e.flowKind} onChange={(flowKind) => set({ flowKind })} options={kinds(t('Income (after tax)'))} />
          <Num label={t('Per month')} kind="money" value={e.amount} onChange={(amount) => set({ amount })} />
          <Check label={t('Rises with inflation')} checked={e.indexed} onChange={(indexed) => set({ indexed })} />
          <Num label={t('For how many months')} value={e.months} onChange={(m) => set({ months: Math.max(0, Math.round(m)) })} hint={t('0 = until the end of the plan')} />
        </div>
      )}

      {e.kind === 'buyProperty' && (
        <>
          <div className="grid">
            <Num label={t('Price')} kind="money" value={e.price} onChange={(price) => set({ price })} />
            <Check label={t("Price in today's money (grows with property prices until bought)")} checked={e.priceReal} onChange={(priceReal) => set({ priceReal })} />
            <Num label={t('Purchase costs')} kind="pct" value={e.buyCostPct} onChange={(buyCostPct) => set({ buyCostPct })} hint={t('PCC tax, notary, agency')} />
            <Num label={t('Renovation & furniture')} kind="money" value={e.extraCosts} onChange={(extraCosts) => set({ extraCosts })} />
            <Check label={t('We stop paying rent')} checked={e.endsRent} onChange={(endsRent) => set({ endsRent })} />
          </div>
          <Check
            label={t('Take a mortgage')}
            checked={!!e.mortgage}
            onChange={(on) => set({ mortgage: on ? { mode: 'ltv', value: 0.8, rate: 0.065, termYears: 25, type: 'equal', commissionPct: 0, monthlyFees: 0 } : null })}
          />
          {e.mortgage && <MortgageEditor value={e.mortgage} onChange={(mortgage) => set({ mortgage })} price={e.price} />}
          <FundFrom value={e.fundFrom} onChange={(fundFrom) => set({ fundFrom })} household={household} />
          <b>{t('The property')}</b>
          <PropertySpecEditor value={e.property} onChange={(property) => set({ property })} />
        </>
      )}

      {e.kind === 'sellProperty' && (
        <div className="grid">
          <Select label={t('Property')} value={e.propertyId} onChange={(propertyId) => set({ propertyId })} options={opts(propertyRefs(household, scenario))} />
          <Num label={t('Selling costs')} kind="pct" value={e.sellCostPct} onChange={(sellCostPct) => set({ sellCostPct })} hint={t('Agency, notary')} />
          <Select label={t('Put the money into')} value={e.to} onChange={(to) => set({ to })} options={accounts} />
          <small className="hint">
            {t(
              'Its mortgage is repaid from the sale. Gain tax ({rate}%) applies if sold before {years} full calendar years have passed after the purchase year. If you lived there, add a “Change rent” event if you’ll rent again.',
              { rate: Math.round(settings.propertyGainTaxRate * 100), years: settings.propertyExemptionYears },
            )}
          </small>
        </div>
      )}

      {e.kind === 'setRent' && (
        <div className="grid">
          <Num label={t('New monthly rent')} kind="money" value={e.rent} onChange={(rent) => set({ rent })} hint={t("Today's money; 0 = stop renting")} />
        </div>
      )}

      {e.kind === 'purchase' && (
        <>
          <div className="grid">
            <Num label={t('Price')} kind="money" value={e.price} onChange={(price) => set({ price })} />
            <Check label={t("Price in today's money")} checked={e.priceReal} onChange={(priceReal) => set({ priceReal })} />
            <Num label={t('Loses value per year')} kind="pct" value={e.depreciation} onChange={(depreciation) => set({ depreciation })} hint={t('Cars ≈ 15%, electronics ≈ 30%')} />
            <Num label={t('Running costs / month')} kind="money" value={e.runningCosts} onChange={(runningCosts) => set({ runningCosts })} hint={t("Insurance, fuel, service (today's money)")} />
            <Num label={t('Replace every')} suffix={t('yrs')} value={e.repeatYears} onChange={(r) => set({ repeatYears: Math.max(0, r) })} hint={t('0 = buy once. The old one is sold.')} />
            {household.goods.length > 0 && (
              <Select
                label={t('Replaces something we own now')}
                value={e.replaces ?? ''}
                onChange={(v) => set({ replaces: v || undefined })}
                options={[{ value: '', label: t('— nothing —') }, ...household.goods.map((g) => ({ value: g.id, label: g.name }))]}
                hint={t('It’s sold (and its loan repaid) when this is bought')}
              />
            )}
          </div>
          <FinancingEditor value={e.financing} onChange={(financing) => set({ financing })} />
          {e.financing.type !== 'lease' || e.financing.initialPct > 0 ? <FundFrom value={e.fundFrom} onChange={(fundFrom) => set({ fundFrom })} household={household} /> : null}
        </>
      )}

      {e.kind === 'child' && (
        <div className="grid">
          <Text label={t("Child's name")} value={e.childName} onChange={(childName) => set({ childName })} />
          <Num label={t('One-off costs at birth')} kind="money" value={e.birthCost} onChange={(birthCost) => set({ birthCost })} hint={t("Pram, room… (today's money)")} />
          <small className="hint">{t('Monthly costs by age and child benefit are set in Settings. A date in the past adds a child you already have.')}</small>
        </div>
      )}

      {e.kind === 'retire' && (
        <div className="grid">
          <Select label={t('Who')} value={e.personId} onChange={(personId) => set({ personId })} options={[{ value: 'all', label: t('Everyone') }, ...people]} />
          <small className="hint">
            {t('Salary stops; pensions start at the pension age from Household. Bills are then paid from savings in the withdrawal order.')}
          </small>
        </div>
      )}

      {e.kind === 'setSalary' && (
        <div className="grid">
          <Select label={t('Who')} value={e.personId} onChange={(personId) => set({ personId })} options={people} />
          <Num label={t('New take-home pay / month')} kind="money" value={e.netSalary} onChange={(netSalary) => set({ netSalary })} hint={t("After tax, today's money; 0 = sabbatical")} />
        </div>
      )}

      {e.kind === 'overpay' && (
        <div className="grid">
          <Select label={t('Loan')} value={e.loanId} onChange={(loanId) => set({ loanId })} options={loans} />
          <Num label={t('Amount')} kind="money" value={e.amount} onChange={(amount) => set({ amount })} />
          <Check label={t("In today's money")} checked={e.real} onChange={(real) => set({ real })} />
          <Check label={t('Every month')} checked={e.monthly} onChange={(monthly) => set({ monthly })} />
          {e.monthly && <Num label={t('For how many months')} value={e.months} onChange={(m) => set({ months: Math.max(0, Math.round(m)) })} hint={t('0 = until repaid')} />}
          <Select
            label={t('Effect')}
            value={e.strategy}
            onChange={(strategy) => set({ strategy })}
            options={[
              { value: 'shorten', label: t('Shorten the loan') },
              { value: 'lower', label: t('Lower the installment') },
            ]}
          />
        </div>
      )}

      {e.kind === 'loanRate' && (
        <div className="grid">
          <Select label={t('Loan')} value={e.loanId} onChange={(loanId) => set({ loanId })} options={loans} />
          <Num label={t('New interest rate')} kind="pct" value={e.rate} onChange={(rate) => set({ rate })} />
        </div>
      )}
    </div>
  );
}
