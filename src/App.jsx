-- ════════════════════════════════════════════════════════════════
-- 家事トラッカー Supabase スキーマ作成用 SQL
--
-- 実行方法:
--   1. Supabase ダッシュボードを開く（家事アプリのプロジェクト）
--   2. 左メニューの「SQL Editor」をクリック
--   3. 「+ New query」をクリック
--   4. このファイルの中身を全部コピーして貼り付け
--   5. 右下の緑色の「Run」ボタンをクリック
--   6. エラーが出なければ完了
-- ════════════════════════════════════════════════════════════════

-- カテゴリー（料理🍳、掃除🧹、洗濯👕、育児👶、その他📦 など）
create table categories (
  id text primary key,
  name text not null,
  emoji text,
  color text,
  sort_order int default 0,
  is_deleted boolean default false,
  created_at timestamptz default now()
);

-- タスク
create table tasks (
  id text primary key,
  category_id text references categories(id),
  name text not null,
  points int default 1,
  sort_order int default 0,
  is_deleted boolean default false,
  created_at timestamptz default now()
);

-- 記録（タスク完了履歴）
create table records (
  id text primary key,
  task_id text references tasks(id),
  task_name_snapshot text,
  category_id text,
  date date not null,
  seconds int,
  time_label text,
  points int,
  created_at timestamptz default now()
);

-- ごほうび
create table rewards (
  id text primary key,
  name text not null,
  emoji text,
  cost int not null,
  is_deleted boolean default false,
  created_at timestamptz default now()
);

-- ポイント増減履歴
create table point_history (
  id text primary key,
  type text not null check (type in ('earn', 'spend')),
  amount int not null,
  reason text,
  date date,
  reward_id text references rewards(id),
  created_at timestamptz default now()
);

-- アプリ全体の状態（シングルトン）
create table app_state (
  id int primary key default 1,
  total_points int default 0,
  streak int default 0,
  last_log_date date,
  running_timers jsonb default '{}',
  paused_timers jsonb default '{}',
  updated_at timestamptz default now()
);

-- RLS は無効化（個人利用、anon keyのみ）
alter table categories disable row level security;
alter table tasks disable row level security;
alter table records disable row level security;
alter table rewards disable row level security;
alter table point_history disable row level security;
alter table app_state disable row level security;

-- 初期データ: app_stateのシングルトン行
insert into app_state (id) values (1) on conflict (id) do nothing;

-- 索引（クエリ高速化）
create index idx_records_date on records(date);
create index idx_records_category on records(category_id);
create index idx_records_task on records(task_id);
create index idx_point_history_date on point_history(date);
