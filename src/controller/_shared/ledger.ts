import { sql, type SQL } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { num, round2 } from "@/lib/num";

// ─────────────────────────────────────────────────────────────
// Party ledger. Debit = the party owes us; credit = we owe the party.
//   opening balance        DR / CR as entered
//   sale                   Dr   (grand total)
//   sale return            Cr   (refund returns are offset by the refund payment)
//   received from customer Cr
//   refund to customer     Dr
//   purchase               Cr
//   purchase return        Dr   (pending or completed)
//   replacement received   Cr   (completed REPLACEMENT returns)
//   paid to supplier       Dr
//   refund from supplier   Cr
// Void documents and void payments are excluded.
// ─────────────────────────────────────────────────────────────

export interface LedgerEntry {
  date: string;
  createdAt: string;
  type: string;
  documentId: string | null;
  number: string | null;
  description: string;
  debit: number;
  credit: number;
}

/** UNION of every ledger line — for one party, or for all parties when partyId is omitted. */
export function ledgerLinesSql(organizationId: string, partyId?: string): SQL {
  const only = (col: SQL) => (partyId ? sql` and ${col} = ${partyId}` : sql` and ${col} is not null`);
  return sql`
    select p.id as party_id, p.created_at::date::text as date, p.created_at as created_at, 'OPENING' as type, null::uuid as document_id,
           null as number, 'Opening balance' as description,
           case when p.opening_balance_type = 'DR' then p.opening_balance else 0 end as debit,
           case when p.opening_balance_type = 'CR' then p.opening_balance else 0 end as credit
      from parties p where p.organization_id = ${organizationId} and p.opening_balance > 0${only(sql`p.id`)}
    union all
    select s.party_id, (s.sale_date at time zone os.timezone)::date::text, s.created_at, 'SALE', s.id, s.invoice_number,
           'Sale', s.grand_total, 0
      from sales s join organization_settings os on os.organization_id = s.organization_id
     where s.organization_id = ${organizationId} ${only(sql`s.party_id`)} and s.status = 'POSTED'
    union all
    select r.party_id, r.return_date::text, r.created_at, 'SALE_RETURN', r.id, r.number,
           case when r.resolution = 'STORE_CREDIT' then 'Sales return (store credit)' else 'Sales return' end, 0, r.grand_total
      from sale_returns r
     where r.organization_id = ${organizationId} ${only(sql`r.party_id`)} and r.status = 'POSTED'
    union all
    select pu.party_id, pu.purchase_date::text, pu.created_at, 'PURCHASE', pu.id, pu.number,
           coalesce('Purchase — bill ' || pu.supplier_invoice_number, 'Purchase'), 0, pu.grand_total
      from purchases pu
     where pu.organization_id = ${organizationId} ${only(sql`pu.party_id`)} and pu.status = 'POSTED'
    union all
    select pr.party_id, pr.return_date::text, pr.created_at, 'PURCHASE_RETURN', pr.id, pr.number,
           'Purchase return', pr.grand_total, 0
      from purchase_returns pr
     where pr.organization_id = ${organizationId} ${only(sql`pr.party_id`)} and pr.status <> 'VOID'
    union all
    select pr.party_id, (pr.completed_at at time zone os.timezone)::date::text, pr.completed_at, 'REPLACEMENT', pr.id, pr.number,
           'Replacement goods received', 0, pr.grand_total
      from purchase_returns pr join organization_settings os on os.organization_id = pr.organization_id
     where pr.organization_id = ${organizationId} ${only(sql`pr.party_id`)}
       and pr.status = 'COMPLETED' and pr.resolution = 'REPLACEMENT'
    union all
    select pay.party_id, pay.payment_date::text, pay.created_at, pay.direction::text, pay.id, pay.number,
           case pay.direction
             when 'RECEIVED_FROM_CUSTOMER' then 'Payment received'
             when 'REFUND_TO_CUSTOMER' then 'Refund paid'
             when 'PAID_TO_SUPPLIER' then 'Payment made'
             else 'Refund received' end
           || ' (' || lower(replace(pay.method::text, '_', ' ')) || ')',
           case when pay.direction in ('REFUND_TO_CUSTOMER', 'PAID_TO_SUPPLIER') then pay.amount else 0 end,
           case when pay.direction in ('RECEIVED_FROM_CUSTOMER', 'REFUND_FROM_SUPPLIER') then pay.amount else 0 end
      from payments pay
     where pay.organization_id = ${organizationId} ${only(sql`pay.party_id`)} and pay.status = 'POSTED'
  `;
}

/** Current balance: positive = receivable (they owe us), negative = payable. */
export async function partyBalance(tx: DbOrTx, organizationId: string, partyId: string): Promise<number> {
  const result = await tx.execute<{ balance: string | null }>(
    sql`select coalesce(sum(debit) - sum(credit), 0) as balance from (${ledgerLinesSql(organizationId, partyId)}) l`,
  );
  return round2(num(result.rows[0]?.balance));
}

/** Balance per party for the whole tenant (parties with no activity are absent). */
export function allBalancesSql(organizationId: string): SQL {
  return sql`select party_id, coalesce(sum(debit) - sum(credit), 0) as balance
    from (${ledgerLinesSql(organizationId)}) l group by party_id`;
}
