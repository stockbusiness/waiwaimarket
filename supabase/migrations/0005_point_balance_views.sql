-- 0005 ポイント残高ビューの是正と本部集計ビュー
-- 目的：docs/02 6.2「予約中は利用可能残高から除外」、付与予定→確定の状態遷移、
--       docs/02 4.4「未使用残高・基本還元額・キャンペーン発行額・利用額・失効額を分けて確認」、
--       docs/02 6.5「台帳合計と口座残高の一致を日次で照合」を満たす。
-- 残高列は持たず、すべて台帳とロットの集計から算出する（CLAUDE.md 絶対ルール）。

-- ============================================================
-- 1. point_balances の是正
-- ============================================================
-- 0001 の定義には次の問題があった。
--   a) earn_confirmed を記録しても pending_points が減らず、確定後も
--      「付与予定」に残り続ける。
--   b) 予約中（point_reservations.status='active'）のポイントが
--      利用可能残高から控除されていない。
--   c) 台帳に行のない購入者が結果に現れない（新規口座の残高が NULL になる）。
--   d) view が security_invoker でないため、RLS を迂回して他人の残高を
--      読めてしまう（0002 の point_ledger_self が効かない）。
--
-- 取消（earn_reversal）が付与予定と確定済みのどちらを打ち消したかは、
-- reversal_of の指す元エントリの entry_type で判別する
-- （0003 で earn_reversal の reversal_of を必須にしている）。
drop view if exists point_balances;

create view point_balances as
with entries as (
  select e.buyer_id,
         e.entry_type,
         e.delta,
         src.entry_type as reversed_entry_type
  from point_ledger_entries e
  left join point_ledger_entries src on src.id = e.reversal_of
),
ledger as (
  select buyer_id,
         -- 利用可能：確定・利用・返還・失効・調整と、確定済み分の取消
         coalesce(sum(delta) filter (
           where entry_type in ('earn_confirmed','spend','spend_refund','expire','adjustment')
         ), 0)
         + coalesce(sum(delta) filter (
           where entry_type = 'earn_reversal' and reversed_entry_type = 'earn_confirmed'
         ), 0) as available_points,
         -- 付与予定：予定計上から確定振替と予定分の取消を差し引く
         coalesce(sum(delta) filter (where entry_type = 'earn_pending'), 0)
         - coalesce(sum(delta) filter (where entry_type = 'earn_confirmed'), 0)
         + coalesce(sum(delta) filter (
           where entry_type = 'earn_reversal' and reversed_entry_type = 'earn_pending'
         ), 0) as pending_points
  from entries
  group by buyer_id
),
reserved as (
  select buyer_id, coalesce(sum(points), 0) as reserved_points
  from point_reservations
  where status = 'active' and expires_at > now()
  group by buyer_id
)
select a.buyer_id,
       coalesce(l.available_points, 0) as available_points,
       coalesce(l.pending_points, 0)   as pending_points,
       coalesce(r.reserved_points, 0)  as reserved_points,
       -- 実際に利用できる残高（予約中を除外）。マイナスはそのまま返す。
       coalesce(l.available_points, 0) - coalesce(r.reserved_points, 0) as usable_points
from point_accounts a
left join ledger   l on l.buyer_id = a.buyer_id
left join reserved r on r.buyer_id = a.buyer_id;

alter view point_balances set (security_invoker = on);

comment on view point_balances is
  '台帳とロットからの算出残高。usable_points が 0 未満の間はポイント利用を停止する（docs/02 6.4）。';

-- ============================================================
-- 2. 本部向け：未使用残高と最大値引き原資（docs/02 4.4、docs/00 成功条件7）
-- ============================================================
create view point_outstanding_liability as
select coalesce(fs.source_type::text, 'unassigned') as funding_source_type,
       fs.tenant_id,
       coalesce(pr.scope, 'unknown')                as rule_scope,
       coalesce(sum(l.remaining_points) filter (where l.status = 'pending'), 0)   as pending_points,
       coalesce(sum(l.remaining_points) filter (where l.status = 'available'), 0) as available_points,
       -- 額面ベースの最大値引き原資
       coalesce(sum(l.remaining_points) filter (where l.status in ('pending','available')), 0)
         as max_discount_reserve
from point_lots l
left join point_funding_sources fs on fs.id = l.funding_source_id
left join point_rules pr on pr.id = l.point_rule_id
group by 1, 2, 3;

alter view point_outstanding_liability set (security_invoker = on);

comment on view point_outstanding_liability is
  '負担元・ルール種別ごとの未使用ポイント残高。本部負担分が最大値引き原資となる。';

-- ============================================================
-- 3. 本部向け：月次の発行・利用・失効（docs/02 4.4）
-- ============================================================
create view point_monthly_movements as
select date_trunc('month', e.occurred_at)::date       as year_month,
       coalesce(fs.source_type::text, 'unassigned')   as funding_source_type,
       coalesce(pr.scope, 'unknown')                  as rule_scope,
       coalesce(sum(e.delta)  filter (where e.entry_type = 'earn_pending'), 0)   as issued_points,
       coalesce(sum(e.delta)  filter (where e.entry_type = 'earn_confirmed'), 0) as confirmed_points,
       coalesce(sum(-e.delta) filter (where e.entry_type = 'spend'), 0)          as used_points,
       coalesce(sum(e.delta)  filter (where e.entry_type = 'spend_refund'), 0)   as refunded_points,
       coalesce(sum(-e.delta) filter (where e.entry_type = 'expire'), 0)         as expired_points,
       coalesce(sum(-e.delta) filter (where e.entry_type = 'earn_reversal'), 0)  as reversed_points,
       coalesce(sum(e.delta)  filter (where e.entry_type = 'adjustment'), 0)     as adjusted_points
from point_ledger_entries e
left join point_lots l on l.id = e.lot_id
left join point_rules pr on pr.id = l.point_rule_id
-- 負担者は台帳に明示があればそれを、なければ対象ロットの負担者を使う。
left join point_funding_sources fs on fs.id = coalesce(e.funding_source_id, l.funding_source_id)
group by 1, 2, 3;

alter view point_monthly_movements set (security_invoker = on);

comment on view point_monthly_movements is
  '月次の基本還元額・キャンペーン発行額・利用額・失効額。rule_scope=base が基本還元、campaign が上乗せ施策。';

-- ============================================================
-- 4. 日次照合用（docs/02 6.5「台帳合計と口座残高の一致を日次で照合」）
-- ============================================================
-- 台帳から算出した利用可能残高と、ロット残量の合計が一致することを確認する。
-- 残高がマイナスの購入者は、台帳側のみマイナスとなりロット側は 0 になるため
-- difference が負になる。バッチはこの条件を区別して扱う。
create view point_balance_reconciliation as
select b.buyer_id,
       b.available_points                                   as ledger_available_points,
       coalesce(lot.available_remaining, 0)                 as lot_available_points,
       b.pending_points                                     as ledger_pending_points,
       coalesce(lot.pending_remaining, 0)                   as lot_pending_points,
       b.available_points - coalesce(lot.available_remaining, 0) as available_difference,
       b.pending_points  - coalesce(lot.pending_remaining, 0)    as pending_difference
from point_balances b
left join (
  select buyer_id,
         coalesce(sum(remaining_points) filter (where status = 'available'), 0) as available_remaining,
         coalesce(sum(remaining_points) filter (where status = 'pending'), 0)   as pending_remaining
  from point_lots
  group by buyer_id
) lot on lot.buyer_id = b.buyer_id;

alter view point_balance_reconciliation set (security_invoker = on);

comment on view point_balance_reconciliation is
  '日次照合用。available_difference が 0 でない購入者を検知する（マイナス残高の購入者を除く）。';
