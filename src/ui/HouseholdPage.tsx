import { useState } from 'react';
import { addMonths, ageAt, monthsBetween } from '../engine/dates';
import type { Account, Good, Household, Loan, Person, Property, RecurringFlow } from '../engine/types';
import { useI18n } from '../i18n';
import { defaultPropertySpec, newAccount, uid } from '../model/defaults';
import { useStore } from '../state/store';
import { PropertySpecEditor } from './EventEditor';
import { EventList } from './EventList';
import { Check, ConfirmButton, Month, Num, removeAt, Select, Text, updateAt, move } from './fields';
import { money, pct } from './format';

export function HouseholdPage() {
  const { doc, updateHousehold } = useStore();
  const { t, month } = useI18n();
  const tr = (k: string) => t(k);
  const h = doc.household;
  const s = doc.settings;
  const set = (patch: Partial<Household>) => updateHousehold((x) => ({ ...x, ...patch }));
  const accOpts = h.accounts.map((a) => ({ value: a.id, label: a.name }));

  return (
    <div>
      <p className="notice info">
        {t(
          "Describe where you are now (end of {date}). Every scenario starts from this. Amounts are monthly and after tax, in today's money; they rise with inflation automatically when it's switched on.",
          { date: month(addMonths(s.startMonth, -1)) },
        )}
      </p>

      {/* ---------------- people */}
      <section className="card">
        <div className="card-head">
          <h3>{t('People')}</h3>
        </div>
        {h.people.map((p, i) => (
          <PersonEditor
            key={p.id}
            p={p}
            startMonth={s.startMonth}
            onChange={(np) => set({ people: updateAt(h.people, i, np) })}
            onRemove={() => set({ people: removeAt(h.people, i) })}
          />
        ))}
        <button
          type="button"
          className="btn"
          onClick={() =>
            set({
              people: [
                ...h.people,
                { id: uid('p-'), name: t(h.people.length ? 'Partner' : 'Me'), birth: '1990-01', netSalary: 10000, realSalaryGrowth: 0.01, retirementAge: 65, pension: 3000, pensionAge: 65 },
              ],
            })
          }
        >
          {t('+ Add person')}
        </button>
      </section>

      {/* ---------------- regular money */}
      <section className="card">
        <div className="card-head">
          <h3>{t('Rent and regular costs')}</h3>
        </div>
        <div className="grid">
          <Num label={t('Rent we pay / month')} kind="money" value={h.rent} onChange={(rent) => set({ rent })} hint={t('0 if not renting')} />
        </div>
        <h4 style={{ margin: '16px 0 8px' }}>{t('Other regular income and costs')}</h4>
        {h.flows.map((f, i) => (
          <FlowEditor key={f.id} f={f} onChange={(nf) => set({ flows: updateAt(h.flows, i, nf) })} onRemove={() => set({ flows: removeAt(h.flows, i) })} />
        ))}
        <button
          type="button"
          className="btn"
          onClick={() => set({ flows: [...h.flows, { id: uid('f-'), name: t('Living costs'), kind: 'expense', amount: 5000, indexed: true }] })}
        >
          {t('+ Add income or cost')}
        </button>
        <p className="hint">{t("Kids' costs are added by “Child” events. Loan installments and property costs come from loans/properties.")}</p>
      </section>

      {/* ---------------- accounts */}
      <section className="card">
        <div className="card-head">
          <h3>{t('Savings and investments')}</h3>
        </div>
        {h.accounts.map((a, i) => (
          <AccountEditor
            key={a.id}
            a={a}
            startMonth={s.startMonth}
            isCash={a.id === h.allocation.cashAccountId}
            onChange={(na) => set({ accounts: updateAt(h.accounts, i, na) })}
            onRemove={() => set({ accounts: removeAt(h.accounts, i) })}
          />
        ))}
        <div className="row">
          <button type="button" className="btn" onClick={() => set({ accounts: [...h.accounts, newAccount('investment', tr)] })}>
            {t('+ Investment (stocks, crypto…)')}
          </button>
          <button type="button" className="btn" onClick={() => set({ accounts: [...h.accounts, newAccount('deposit', tr)] })}>
            {t('+ Deposit / bonds')}
          </button>
          <button type="button" className="btn" onClick={() => set({ accounts: [...h.accounts, newAccount('cash', tr)] })}>
            {t('+ Cash account')}
          </button>
        </div>
      </section>

      {/* ---------------- property */}
      <section className="card">
        <div className="card-head">
          <h3>{t('Property we own now')}</h3>
        </div>
        {h.properties.length === 0 && <p className="muted">{t('None. Use a “Buy property” event in a scenario for future purchases.')}</p>}
        {h.properties.map((p, i) => (
          <PropertyEditor key={p.id} p={p} onChange={(np) => set({ properties: updateAt(h.properties, i, np) })} onRemove={() => set({ properties: removeAt(h.properties, i) })} />
        ))}
        <button
          type="button"
          className="btn"
          onClick={() =>
            set({
              properties: [...h.properties, { ...defaultPropertySpec('home', tr), id: uid('prop-'), value: 600000, costBasis: 600000, acquired: addMonths(s.startMonth, -24) }],
            })
          }
        >
          {t('+ Add property')}
        </button>
      </section>

      {/* ---------------- loans */}
      <section className="card">
        <div className="card-head">
          <h3>{t('Loans we have now')}</h3>
        </div>
        {h.loans.length === 0 && <p className="muted">{t('None.')}</p>}
        {h.loans.map((l, i) => (
          <LoanEditor
            key={l.id}
            l={l}
            properties={h.properties}
            goods={h.goods}
            onChange={(nl) => set({ loans: updateAt(h.loans, i, nl) })}
            onRemove={() => set({ loans: removeAt(h.loans, i) })}
          />
        ))}
        <button
          type="button"
          className="btn"
          onClick={() => set({ loans: [...h.loans, { id: uid('loan-'), name: t('Mortgage'), balance: 400000, rate: 0.065, remainingMonths: 300, type: 'equal', monthlyFees: 0 }] })}
        >
          {t('+ Add loan')}
        </button>
      </section>

      {/* ---------------- goods */}
      <section className="card">
        <div className="card-head">
          <h3>{t('Car and other valuable things')}</h3>
        </div>
        {h.goods.map((g, i) => (
          <GoodEditor key={g.id} g={g} onChange={(ng) => set({ goods: updateAt(h.goods, i, ng) })} onRemove={() => set({ goods: removeAt(h.goods, i) })} />
        ))}
        <button
          type="button"
          className="btn"
          onClick={() => set({ goods: [...h.goods, { id: uid('good-'), name: t('Car'), value: 60000, depreciation: 0.15, runningCosts: 600 }] })}
        >
          {t('+ Add item')}
        </button>
      </section>

      {/* ---------------- money rules */}
      <section className="card stack">
        <div className="card-head">
          <h3>{t('Money rules')}</h3>
        </div>
        <div className="grid">
          <Select
            label={t('Current account (salary in, bills out)')}
            value={h.allocation.cashAccountId}
            onChange={(cashAccountId) => set({ allocation: { ...h.allocation, cashAccountId } })}
            options={accOpts}
          />
          <Num
            label={t('Keep in current account')}
            suffix={t('mo')}
            value={h.allocation.bufferMonths}
            onChange={(bufferMonths) => set({ allocation: { ...h.allocation, bufferMonths: Math.max(0, bufferMonths) } })}
            hint={t('Months of expenses kept as a buffer before investing')}
          />
        </div>
        <div className="subcard">
          <b>{t('Monthly savings go to')}</b>
          <small className="hint" style={{ display: 'block', marginBottom: 8 }}>
            {t(
              'Everything in the current account above the buffer (monthly savings, sale proceeds…) is invested in these accounts. Shares are proportions (70/30 and 7/3 are the same). With no accounts here, money stays in the current account. Change it over time with a “Change where savings go” event.',
            )}
          </small>
          {h.allocation.surplus.map((x, i) => (
            <div className="list-row" key={i}>
              <Select
                label={t('Account')}
                value={x.accountId}
                onChange={(accountId) => set({ allocation: { ...h.allocation, surplus: updateAt(h.allocation.surplus, i, { ...x, accountId }) } })}
                options={accOpts}
              />
              <Num
                label={t('Share')}
                kind="pct"
                value={x.share}
                onChange={(share) => set({ allocation: { ...h.allocation, surplus: updateAt(h.allocation.surplus, i, { ...x, share }) } })}
              />
              <button type="button" className="btn small ghost" onClick={() => set({ allocation: { ...h.allocation, surplus: removeAt(h.allocation.surplus, i) } })}>
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn small"
            onClick={() => set({ allocation: { ...h.allocation, surplus: [...h.allocation.surplus, { accountId: accOpts[0]?.value ?? '', share: 0 }] } })}
          >
            {t('+ Add')}
          </button>
          <small className="hint" style={{ display: 'block', marginTop: 6 }}>
            {t('Total: {total} (scaled to 100%)', { total: pct(h.allocation.surplus.reduce((a, x) => a + x.share, 0), 0) })}
          </small>
        </div>
        <div className="subcard">
          <b>{t('When money runs short, sell from')}</b>
          <small className="hint" style={{ display: 'block', marginBottom: 8 }}>
            {t(
              'In this order, after the current account is empty (e.g. in retirement). Accounts not listed are used after these (untaxed first, then those with the smallest gain). Tax on gains is paid automatically.',
            )}
          </small>
          {h.allocation.withdrawalOrder.map((id, i) => (
            <div className="list-row" key={i}>
              <Select
                label={`${i + 1}.`}
                value={id}
                onChange={(v) => set({ allocation: { ...h.allocation, withdrawalOrder: updateAt(h.allocation.withdrawalOrder, i, v) } })}
                options={accOpts}
              />
              <button type="button" className="btn small" onClick={() => set({ allocation: { ...h.allocation, withdrawalOrder: move(h.allocation.withdrawalOrder, i, -1) } })}>
                ↑
              </button>
              <button type="button" className="btn small ghost" onClick={() => set({ allocation: { ...h.allocation, withdrawalOrder: removeAt(h.allocation.withdrawalOrder, i) } })}>
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn small"
            onClick={() => {
              const next = h.accounts.find((a) => a.id !== h.allocation.cashAccountId && !h.allocation.withdrawalOrder.includes(a.id));
              if (next) set({ allocation: { ...h.allocation, withdrawalOrder: [...h.allocation.withdrawalOrder, next.id] } });
            }}
          >
            {t('+ Add')}
          </button>
        </div>
      </section>

      {/* ---------------- shared events */}
      <section className="card">
        <div className="card-head">
          <h3>{t('Life events in every scenario')}</h3>
        </div>
        <p className="hint" style={{ marginTop: -4 }}>
          {t('Kids, a planned retirement, a wedding… things that happen whatever you decide. A scenario can switch one off.')}
        </p>
        <EventList events={h.commonEvents} onChange={(commonEvents) => set({ commonEvents })} household={h} settings={s} scenario={null} addLabel={t('+ Add life event')} />
      </section>
    </div>
  );
}

function Remove({ onRemove }: { onRemove: () => void }) {
  const { t } = useI18n();
  return (
    <ConfirmButton className="btn small danger" onConfirm={onRemove}>
      {t('Remove')}
    </ConfirmButton>
  );
}

function PersonEditor({ p, startMonth, onChange, onRemove }: { p: Person; startMonth: string; onChange: (p: Person) => void; onRemove: () => void }) {
  const { t } = useI18n();
  const set = (patch: Partial<Person>) => onChange({ ...p, ...patch });
  return (
    <div className="subcard">
      <div className="grid">
        <Text label={t('Name')} value={p.name} onChange={(name) => set({ name })} />
        <Month label={t('Born')} value={p.birth} onChange={(birth) => birth && set({ birth })} hint={t('Age {age} now', { age: ageAt(p.birth, startMonth) })} />
        <Num label={t('Take-home pay / month')} kind="money" value={p.netSalary} onChange={(netSalary) => set({ netSalary })} hint={t('After tax')} />
        <Num label={t('Pay rise above inflation')} kind="pct" value={p.realSalaryGrowth} onChange={(realSalaryGrowth) => set({ realSalaryGrowth })} hint={t('Per year, career growth')} />
        <Num
          label={t('Stops working at age')}
          value={p.retirementAge ?? 0}
          onChange={(v) => set({ retirementAge: v > 0 ? Math.round(v) : null })}
          hint={t('0 = only via a “Retire” event')}
        />
        <Num label={t('State pension / month')} kind="money" value={p.pension} onChange={(pension) => set({ pension })} hint={t("After tax, today's money")} />
        <Num label={t('Pension from age')} value={p.pensionAge} onChange={(pensionAge) => set({ pensionAge: Math.round(pensionAge) })} />
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <span className="spacer" />
        <Remove onRemove={onRemove} />
      </div>
    </div>
  );
}

function FlowEditor({ f, onChange, onRemove }: { f: RecurringFlow; onChange: (f: RecurringFlow) => void; onRemove: () => void }) {
  const { t } = useI18n();
  const set = (patch: Partial<RecurringFlow>) => onChange({ ...f, ...patch });
  return (
    <div className="subcard">
      <div className="grid">
        <Text label={t('Name')} value={f.name} onChange={(name) => set({ name })} />
        <Select
          label={t('Type')}
          value={f.kind}
          onChange={(kind) => set({ kind })}
          options={[
            { value: 'expense', label: t('Cost') },
            { value: 'income', label: t('Income (after tax)') },
          ]}
        />
        <Num label={t('Per month')} kind="money" value={f.amount} onChange={(amount) => set({ amount })} />
        <Month label={t('From (optional)')} value={f.start} onChange={(start) => set({ start })} optional />
        <Month label={t('Until (optional)')} value={f.end} onChange={(end) => set({ end })} optional />
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <Check label={t('Rises with inflation')} checked={f.indexed} onChange={(indexed) => set({ indexed })} />
        <span className="spacer" />
        <Remove onRemove={onRemove} />
      </div>
    </div>
  );
}

function AccountEditor({ a, startMonth, isCash, onChange, onRemove }: {
  a: Account;
  startMonth: string;
  isCash: boolean;
  onChange: (a: Account) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const set = (patch: Partial<Account>) => onChange({ ...a, ...patch });
  const [helper, setHelper] = useState(false);
  return (
    <div className="subcard">
      <div className="grid">
        <Text label={t('Name')} value={a.name} onChange={(name) => set({ name })} />
        <Select
          label={t('Type')}
          value={a.kind}
          onChange={(kind) => set({ kind })}
          options={[
            { value: 'cash', label: t('Cash / current account') },
            { value: 'deposit', label: t('Deposit / bonds') },
            { value: 'investment', label: t('Investment (stocks, crypto, gold…)') },
          ]}
        />
        <Num
          label={t('Value now')}
          kind="money"
          value={a.value}
          // Until a purchase price is entered, assume no gain yet (basis follows the value).
          onChange={(value) => set({ value, costBasis: a.taxMode !== 'onSale' || a.costBasis === a.value || a.costBasis === 0 ? value : a.costBasis })}
        />
        <Select
          label={t('Tax on gains')}
          value={a.taxMode}
          onChange={(taxMode) => set({ taxMode })}
          options={[
            { value: 'onSale', label: t('When sold (stocks, crypto)') },
            { value: 'interest', label: t('Monthly on interest (deposits)') },
            { value: 'none', label: t('None (IKE, cash)') },
          ]}
        />
        {a.taxMode === 'onSale' && (
          <Num label={t('What we paid for it')} kind="money" value={a.costBasis} onChange={(costBasis) => set({ costBasis })} hint={t('Tax is paid on value minus this when sold')} />
        )}
        <Num label={t('Yearly return')} kind="pct" value={a.rate} onChange={(rate) => set({ rate })} hint={t('Nominal, before inflation')} />
      </div>

      <div style={{ marginTop: 10 }}>
        <b style={{ fontSize: 14 }}>{t('Return changes over time')}</b>
        {a.schedule.map((p, i) => (
          <div className="list-row" key={i}>
            <Month label={t('From')} value={p.from} onChange={(from) => from && set({ schedule: updateAt(a.schedule, i, { ...p, from }) })} />
            <Num label={t('Yearly return')} kind="pct" value={p.rate} onChange={(rate) => set({ schedule: updateAt(a.schedule, i, { ...p, rate }) })} />
            <button type="button" className="btn small ghost" onClick={() => set({ schedule: removeAt(a.schedule, i) })}>
              ✕
            </button>
          </div>
        ))}
        <div className="row">
          <button
            type="button"
            className="btn small"
            onClick={() => {
              const last = a.schedule[a.schedule.length - 1]?.from ?? startMonth;
              set({ schedule: [...a.schedule, { from: addMonths(last, 12), rate: a.rate }].sort((x, y) => x.from.localeCompare(y.from)) });
            }}
          >
            {t('+ Change from a date')}
          </button>
          <button type="button" className="btn small" onClick={() => setHelper(!helper)}>
            {t('Return from a target…')}
          </button>
          <span className="spacer" />
          {!isCash && <Remove onRemove={onRemove} />}
        </div>
        {helper && <TargetHelper a={a} startMonth={startMonth} onUse={(rate) => set({ rate })} />}
      </div>
    </div>
  );
}

/** Works out the yearly return that turns today's value into a target value by a date. */
function TargetHelper({ a, startMonth, onUse }: { a: Account; startMonth: string; onUse: (rate: number) => void }) {
  const { t } = useI18n();
  const [from, setFrom] = useState(a.value || 100000);
  const [to, setTo] = useState((a.value || 100000) * 3);
  const [by, setBy] = useState(addMonths(startMonth, 30));
  const months = monthsBetween(addMonths(startMonth, -1), by);
  const rate = months > 0 && from > 0 && to > 0 ? Math.pow(to / from, 12 / months) - 1 : NaN;
  return (
    <div className="subcard" style={{ marginTop: 8 }}>
      <div className="grid">
        <Num label={t('Worth now')} kind="money" value={from} onChange={setFrom} />
        <Num label={t('Expected to be worth')} kind="money" value={to} onChange={setTo} />
        <Month label={t('By')} value={by} onChange={(v) => v && setBy(v)} />
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <span>
          {t('= {rate} per year over {months} months (×{factor})', { rate: Number.isFinite(rate) ? pct(rate, 1) : '—', months, factor: (to / from).toFixed(2) })}
        </span>
        <button type="button" className="btn small primary" disabled={!Number.isFinite(rate)} onClick={() => onUse(Math.round(rate * 10000) / 10000)}>
          {t('Use as starting return')}
        </button>
      </div>
      <small className="hint">{t('For a USD price target, convert at the exchange rate you expect. Add a “change from a date” entry for what happens after.')}</small>
    </div>
  );
}

function PropertyEditor({ p, onChange, onRemove }: { p: Property; onChange: (p: Property) => void; onRemove: () => void }) {
  const { t } = useI18n();
  return (
    <div className="subcard">
      <div className="grid">
        <Num label={t('Market value now')} kind="money" value={p.value} onChange={(value) => onChange({ ...p, value })} />
        <Num label={t('Paid incl. purchase costs')} kind="money" value={p.costBasis} onChange={(costBasis) => onChange({ ...p, costBasis })} hint={t('For gain tax if sold early')} />
        <Month label={t('Bought')} value={p.acquired} onChange={(acquired) => acquired && onChange({ ...p, acquired })} />
      </div>
      <div style={{ marginTop: 10 }}>
        <PropertySpecEditor value={p} onChange={(spec) => onChange({ ...p, ...spec })} />
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <span className="spacer" />
        <Remove onRemove={onRemove} />
      </div>
    </div>
  );
}

function LoanEditor({ l, properties, goods, onChange, onRemove }: {
  l: Loan;
  properties: Property[];
  goods: Good[];
  onChange: (l: Loan) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const set = (patch: Partial<Loan>) => onChange({ ...l, ...patch });
  const next =
    l.type === 'equal'
      ? (l.balance * (l.rate / 12)) / (1 - Math.pow(1 + l.rate / 12, -l.remainingMonths)) || l.balance / l.remainingMonths
      : l.balance / l.remainingMonths + (l.balance * l.rate) / 12;
  return (
    <div className="subcard">
      <div className="grid">
        <Text label={t('Name')} value={l.name} onChange={(name) => set({ name })} />
        <Num label={t('Left to repay')} kind="money" value={l.balance} onChange={(balance) => set({ balance })} />
        <Num label={t('Interest rate')} kind="pct" value={l.rate} onChange={(rate) => set({ rate })} />
        <Num
          label={t('Installments left')}
          suffix={t('mo')}
          value={l.remainingMonths}
          onChange={(v) => set({ remainingMonths: Math.max(1, Math.round(v)) })}
          hint={t('{years} years', { years: (l.remainingMonths / 12).toFixed(1) })}
        />
        <Select
          label={t('Installments')}
          value={l.type}
          onChange={(type) => set({ type })}
          options={[
            { value: 'equal', label: t('Equal') },
            { value: 'decreasing', label: t('Decreasing') },
          ]}
        />
        <Num label={t('Other monthly costs')} kind="money" value={l.monthlyFees} onChange={(monthlyFees) => set({ monthlyFees })} />
        <Select
          label={t('Secured on')}
          value={l.securedOn ?? ''}
          onChange={(v) => set({ securedOn: v || undefined })}
          options={[{ value: '', label: t('— nothing —') }, ...properties.map((p) => ({ value: p.id, label: p.name })), ...goods.map((g) => ({ value: g.id, label: g.name }))]}
          hint={t('Repaid automatically if that is sold')}
        />
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <small className="hint">{t('Next installment ≈ {amount}', { amount: money(next) })}</small>
        <span className="spacer" />
        <Remove onRemove={onRemove} />
      </div>
    </div>
  );
}

function GoodEditor({ g, onChange, onRemove }: { g: Good; onChange: (g: Good) => void; onRemove: () => void }) {
  const { t } = useI18n();
  const set = (patch: Partial<Good>) => onChange({ ...g, ...patch });
  return (
    <div className="subcard">
      <div className="grid">
        <Text label={t('Name')} value={g.name} onChange={(name) => set({ name })} />
        <Num label={t('Worth now')} kind="money" value={g.value} onChange={(value) => set({ value })} />
        <Num label={t('Loses value per year')} kind="pct" value={g.depreciation} onChange={(depreciation) => set({ depreciation })} />
        <Num label={t('Running costs / month')} kind="money" value={g.runningCosts} onChange={(runningCosts) => set({ runningCosts })} />
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <span className="spacer" />
        <Remove onRemove={onRemove} />
      </div>
    </div>
  );
}
