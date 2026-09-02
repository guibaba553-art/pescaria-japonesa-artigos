create table if not exists public.otp_send_log (
  id bigint generated always as identity primary key,
  phone text not null,
  sent_at timestamptz not null default now()
);

create index if not exists otp_send_log_phone_sent_idx
  on public.otp_send_log (phone, sent_at desc);

-- RLS sem policies: só service role (hooks/testes) acessa.
alter table public.otp_send_log enable row level security;
