-- ============================================================
-- 렉시오(Lexio) 웹게임 DB 스키마 (Supabase / Postgres)
-- 아이디+비밀번호 회원가입 + 닉네임 설정 버전
-- ============================================================

-- ---------- 1. 프로필 (닉네임) ----------
-- Supabase Auth의 auth.users 는 이메일/비번만 관리하므로,
-- 닉네임 등 부가정보는 별도 profiles 테이블에 저장하고 1:1로 연결한다.

-- id는 원래 auth.users(id)를 참조했지만, AI 봇은 실제 로그인 계정이 없어서
-- 참조 제약을 빼고 그냥 uuid 기본키로 둠 (실제 유저는 회원가입 트리거가 auth.users.id와 동일한 값으로 넣어주므로 문제 없음)
create table public.profiles (
  id uuid primary key,
  nickname text not null unique,
  created_at timestamptz not null default now(),
  is_bot boolean not null default false,
  bot_difficulty text check (bot_difficulty in ('easy', 'medium')),
  avatar_icon text not null default '🎴'
);

-- 닉네임 형식 제약: 한글/영문/숫자만, 2자 이상, "무게" 12 이하 (한글 1자=2, 영문/숫자 1자=1
-- → 한글 6자 또는 영문/숫자 12자가 상한이 되도록). regexp_replace로 한글 개수를 세어 가중치 계산.
alter table public.profiles
  add constraint nickname_format check (
    nickname ~ '^[가-힣a-zA-Z0-9]{2,}$'
    and (
      char_length(regexp_replace(nickname, '[^가-힣]', '', 'g')) * 2
      + char_length(regexp_replace(nickname, '[가-힣]', '', 'g'))
    ) <= 12
  );

-- 회원가입(auth.users insert) 시 자동으로 profiles row 생성용 트리거
-- 닉네임은 가입 시 signUp options.data.nickname 으로 넘겨받아 채운다.
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, nickname)
  values (new.id, coalesce(new.raw_user_meta_data->>'nickname', '유저' || substr(new.id::text, 1, 6)));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------- 1-1. AI 봇 ----------
-- 봇은 실제 로그인 계정 없이 profiles 행만 만들어서 방에 앉힌다.
-- 방장만 추가할 수 있고, 봇의 턴은 방장의 브라우저가 대신 실행한다(bot_play_cards / bot_pass_turn).

create function public.add_bot(p_room_id uuid, p_seat_no int, p_difficulty text)
returns uuid as $$
declare
  v_host_id uuid;
  v_bot_id uuid := gen_random_uuid();
  v_label text;
  v_nickname text;
begin
  select host_id into v_host_id from public.rooms where id = p_room_id;
  if v_host_id is null then raise exception '존재하지 않는 방입니다.'; end if;
  if auth.uid() != v_host_id then raise exception '방장만 AI를 추가할 수 있습니다.'; end if;
  if p_difficulty not in ('easy', 'medium') then raise exception '알 수 없는 난이도입니다.'; end if;

  v_label := case when p_difficulty = 'easy' then 'AI쉬움' else 'AI중간' end;
  v_nickname := v_label || (1000 + floor(random() * 9000))::int;

  insert into public.profiles (id, nickname, is_bot, bot_difficulty)
  values (v_bot_id, v_nickname, true, p_difficulty);

  insert into public.room_players (room_id, player_id, seat_no)
  values (p_room_id, v_bot_id, p_seat_no);

  return v_bot_id;
end;
$$ language plpgsql security definer;

-- 방장이 봇의 손패를 확인 (봇 대신 수를 두기 위해 필요 — 사람 손패는 절대 이 경로로 못 봄)
create function public.get_bot_hand(p_room_id uuid, p_bot_id uuid)
returns jsonb as $$
declare
  v_host_id uuid;
  v_cards jsonb;
begin
  select host_id into v_host_id from public.rooms where id = p_room_id;
  if auth.uid() != v_host_id then raise exception '방장만 조회할 수 있습니다.'; end if;
  if not exists (select 1 from public.profiles where id = p_bot_id and is_bot) then
    raise exception '봇이 아닙니다.';
  end if;

  select cards into v_cards from public.player_hands where room_id = p_room_id and player_id = p_bot_id;
  return coalesce(v_cards, '[]'::jsonb);
end;
$$ language plpgsql security definer;

-- 바닥패만으로 "이걸 이길 수 있는 패가 이론상 남아있는지"를 클라이언트(방장)가 판정한 뒤,
-- 없다고 판단되면 이걸 호출해서 곧바로 그 조합을 낸 사람에게 턴을 돌려준다 (모두 패스한 것과 동일 효과)
create function public.force_return_to_leader(p_room_id uuid)
returns void as $$
declare
  v_host_id uuid;
  v_combo_player uuid;
  v_combo_seat int;
  v_turn_limit int;
begin
  select host_id into v_host_id from public.rooms where id = p_room_id;
  if auth.uid() != v_host_id then raise exception '방장만 처리할 수 있습니다.'; end if;

  select current_combo_player_id into v_combo_player
  from public.game_table_state where room_id = p_room_id;
  if v_combo_player is null then
    return; -- 이미 테이블이 비어있으면(다른 경로로 이미 처리됨) 아무것도 안 함
  end if;

  select seat_no into v_combo_seat from public.room_players
  where room_id = p_room_id and player_id = v_combo_player;
  select turn_time_limit into v_turn_limit from public.rooms where id = p_room_id;

  update public.game_table_state set
    current_combo = null,
    current_combo_player_id = null,
    current_turn_seat = v_combo_seat,
    passed_seats = '{}',
    turn_deadline = now() + (v_turn_limit || ' seconds')::interval,
    updated_at = now()
  where room_id = p_room_id;
end;
$$ language plpgsql security definer;

-- 방장이 사람(강퇴, 다시 들어오는 건 자유) 또는 AI(제거/난이도 변경 전 단계)를 자리에서 내보냄
create function public.remove_player(p_room_id uuid, p_player_id uuid)
returns void as $$
declare
  v_host_id uuid;
  v_is_bot boolean;
begin
  select host_id into v_host_id from public.rooms where id = p_room_id;
  if auth.uid() != v_host_id then raise exception '방장만 내보낼 수 있습니다.'; end if;
  if p_player_id = v_host_id then raise exception '방장 자기 자신은 내보낼 수 없습니다.'; end if;

  select is_bot into v_is_bot from public.profiles where id = p_player_id;

  delete from public.room_players where room_id = p_room_id and player_id = p_player_id;

  if v_is_bot then
    delete from public.profiles where id = p_player_id;
  end if;
end;
$$ language plpgsql security definer;

-- ---------- 2. 방(room) ----------
-- 3/4/5인 렉시오 방. 초대 코드로 친구들이 입장.

create type room_status as enum ('waiting', 'playing', 'finished');

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null unique, -- 짧은 초대코드 (예: 6자리)
  host_id uuid not null references public.profiles(id),
  player_count int not null check (player_count in (3, 4, 5)),
  target_score int, -- 이번 판(매치)의 목표 점수 (예: 150) — 시작 시 방장이 선택
  apply_two_weight boolean not null default false, -- "2" 보유 페널티 가중치 적용 여부
  turn_time_limit int not null default 20, -- 한 턴 제한시간(초) — 15/20/25/30 중 선택, 초과 시 자동 패스
  status room_status not null default 'waiting',
  created_at timestamptz not null default now()
);

create table public.room_players (
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  seat_no int not null, -- 0-indexed 좌석 순서
  joined_at timestamptz not null default now(),
  primary key (room_id, player_id),
  unique (room_id, seat_no)
);

-- ---------- 3. 게임 기록 ----------
-- 한 판(게임)이 끝날 때마다 결과를 기록. 카드 한장 단위는 저장하지 않고
-- "최종 순위/점수"만 남긴다 (리더보드 계산에 필요한 최소 데이터).

create table public.games (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.rooms(id) on delete set null, -- 방이 나중에 삭제돼도 리더보드 기록(게임 결과)은 남아있어야 함
  player_count int not null check (player_count in (3, 4, 5)),
  played_at timestamptz not null default now()
);

create table public.game_results (
  game_id uuid not null references public.games(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  rank int not null,        -- 그 판에서의 등수 (1등, 2등 ...)
  score int not null,       -- 그 판에서 획득한 점수
  primary key (game_id, player_id)
);

-- ---------- 3-1. 진행 중인 매치의 실시간 누적 점수 ----------
-- 목표점수(target_score)에 도달할 때까지 여러 라운드를 거치는 동안
-- 각 플레이어의 현재 누적 점수를 여기 저장해서 화면에 실시간으로 보여준다.
-- 매치가 끝나면(누군가 목표점수 도달) 이 값을 games/game_results 로 확정 기록하고
-- 이 테이블의 해당 room 행은 정리한다 (다음 매치를 위해).

create table public.match_scores (
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  score int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (room_id, player_id)
);

-- 매치 시작 시 참가자 전원의 점수를 0으로 초기화 (RLS 때문에 클라이언트가 match_scores 를
-- 직접 upsert 할 수 없어서, increment_match_score 와 마찬가지로 함수를 통해서만 기록한다)
create function public.init_match_scores(p_room_id uuid, p_player_ids uuid[])
returns void as $$
declare
  v_player_id uuid;
begin
  foreach v_player_id in array p_player_ids
  loop
    insert into public.match_scores (room_id, player_id, score)
    values (p_room_id, v_player_id, 0)
    on conflict (room_id, player_id) do update set score = 0, updated_at = now();
  end loop;
end;
$$ language plpgsql security definer;

-- 라운드 종료마다 호출: 점수를 원자적으로 더한다 (동시 업데이트 충돌 방지)
-- 동시에 "한 라운드 최고점" 칭호 계산용으로 이번 라운드에서 얻은 델타를 round_score_log 에도 남긴다.
create function public.increment_match_score(p_room_id uuid, p_player_id uuid, p_delta int)
returns void as $$
begin
  insert into public.match_scores (room_id, player_id, score)
  values (p_room_id, p_player_id, p_delta)
  on conflict (room_id, player_id)
  do update set score = public.match_scores.score + excluded.score, updated_at = now();

  insert into public.round_score_log (room_id, player_id, delta)
  values (p_room_id, p_player_id, p_delta);
end;
$$ language plpgsql security definer;

-- 라운드 하나에서 실제로 얻은 점수 기록 (매치 누적치와는 별개로, "한 라운드 최고점" 칭호 계산용)
create table public.round_score_log (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  delta int not null,
  created_at timestamptz not null default now()
);

alter table public.round_score_log enable row level security;
create policy "round_score_log viewable by everyone"
  on public.round_score_log for select using (true);
-- insert 는 increment_match_score() 함수를 통해서만 이루어짐

create view public.player_best_round_scores as
select player_id, max(delta) as best_single_round_score
from public.round_score_log
group by player_id;

-- ---------- 4. 리더보드 뷰 ----------
-- 누적 점수 순위 + "게임당 평균 점수" 순위를 함께 제공.
-- 매 게임 끝날 때마다 game_results 에 insert 만 하면 이 뷰가 알아서 갱신됨
-- (별도 upsert/누적 컬럼 관리 필요 없음 — 항상 원본 기록에서 재계산).

create view public.leaderboard as
select
  p.id as player_id,
  p.nickname,
  count(gr.game_id) as total_games,
  coalesce(sum(gr.score), 0) as total_score,
  case
    when count(gr.game_id) = 0 then 0
    else round(coalesce(sum(gr.score), 0)::numeric / count(gr.game_id), 2)
  end as avg_score_per_game,
  count(*) filter (where gr.rank = 1) as total_wins
from public.profiles p
left join public.game_results gr on gr.player_id = p.id
group by p.id, p.nickname;

-- 정렬 예시 (앱에서 쿼리 시):
--   누적점수 순위: order by total_score desc
--   평균점수 순위: order by avg_score_per_game desc

-- ---------- 4-1. 플레이어별 "한 판(매치) 최고 점수" ----------
-- "최고점 달인" 칭호 판정용 — game_results 에는 매치 하나가 끝날 때마다
-- 그 매치의 최종 점수가 남기 때문에, 그 중 개인 최고 기록만 뽑으면 됨.

create view public.player_best_scores as
select player_id, max(score) as best_single_match_score
from public.game_results
group by player_id;

-- ---------- 5. 채팅 메시지 ----------
-- room_id 가 null 이면 "로비(전체) 채팅", 값이 있으면 해당 방 안에서만 보이는 채팅

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.rooms(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  content text not null check (char_length(content) between 1 and 300),
  created_at timestamptz not null default now()
);

create index messages_room_id_idx on public.messages (room_id, created_at);
create index messages_lobby_idx on public.messages (created_at) where room_id is null;

-- ---------- 7. 실시간 게임 진행 상태 ----------
-- 손패는 본인만 볼 수 있어야 하므로 RLS로 본인 행만 select 허용.
-- 실제 쓰기(딜/카드제출/패스)는 전부 아래 RPC 함수(SECURITY DEFINER)를 통해서만 이루어져
-- 클라이언트가 직접 테이블을 조작해 부정행위 하는 걸 막는다.

create table public.player_hands (
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  cards jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (room_id, player_id)
);

create table public.game_table_state (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  round_number int not null default 1,
  current_combo jsonb,                -- 현재 테이블 위 카드 (null = 새 라운드 첫 턴, 자유롭게 낼 수 있음)
  current_combo_player_id uuid references public.profiles(id) on delete set null,
  current_turn_seat int not null default 0,
  passed_seats int[] not null default '{}',
  turn_deadline timestamptz,
  round_winner_id uuid references public.profiles(id) on delete set null, -- 패 0장 만든 사람 (null = 라운드 진행중)
  paused_by uuid references public.profiles(id) on delete set null, -- 일시정지 건 사람 (null = 진행중), 이 사람만 재개 가능
  advance_requested boolean not null default false, -- 라운드 승자가 "다음으로"를 눌러 대기를 건너뛰고 싶을 때
  updated_at timestamptz not null default now()
);

alter table public.player_hands enable row level security;
create policy "players can view only their own hand"
  on public.player_hands for select using (auth.uid() = player_id);

alter table public.game_table_state enable row level security;
create policy "table state viewable by authenticated users"
  on public.game_table_state for select using (auth.role() = 'authenticated');

-- 라운드 시작: 호스트가 (클라이언트에서 셔플/분배 계산 후) 각자 손패를 제출하면
-- 서버가 한 번에 저장하고 테이블 상태를 초기화한다.
-- p_hands 형식: [{ "player_id": "...", "cards": [{ "number": 5, "suit": 0 }, ...] }, ...]
create function public.start_round(
  p_room_id uuid,
  p_hands jsonb,
  p_starter_seat int,
  p_round_number int,
  p_turn_seconds int
) returns void as $$
declare
  v_host_id uuid;
  v_hand jsonb;
begin
  select host_id into v_host_id
  from public.rooms where id = p_room_id;

  if v_host_id is null then
    raise exception '존재하지 않는 방입니다.';
  end if;
  if auth.uid() != v_host_id then
    raise exception '방장만 라운드를 시작할 수 있습니다.';
  end if;

  for v_hand in select * from jsonb_array_elements(p_hands)
  loop
    insert into public.player_hands (room_id, player_id, cards, updated_at)
    values (p_room_id, (v_hand->>'player_id')::uuid, v_hand->'cards', now())
    on conflict (room_id, player_id)
    do update set cards = excluded.cards, updated_at = now();
  end loop;

  insert into public.game_table_state
    (room_id, round_number, current_combo, current_combo_player_id, current_turn_seat, passed_seats, turn_deadline, round_winner_id, paused_by, advance_requested, updated_at)
  values
    (p_room_id, p_round_number, null, null, p_starter_seat, '{}', now() + (p_turn_seconds || ' seconds')::interval, null, null, false, now())
  on conflict (room_id)
  do update set
    round_number = excluded.round_number,
    current_combo = null,
    current_combo_player_id = null,
    current_turn_seat = excluded.current_turn_seat,
    passed_seats = '{}',
    turn_deadline = excluded.turn_deadline,
    round_winner_id = null,
    paused_by = null,
    advance_requested = false,
    updated_at = now();
end;
$$ language plpgsql security definer;

-- 라운드 승자가 "다음으로" 버튼을 눌러 대기시간을 건너뛰고 싶을 때 호출.
-- 실제 다음 라운드/매치종료 처리는 여전히 방장 클라이언트가 수행하며, 이 함수는 그걸 앞당기라는 신호만 보냄.
create function public.request_advance(p_room_id uuid)
returns void as $$
declare
  v_winner uuid;
  v_host_id uuid;
begin
  select round_winner_id into v_winner from public.game_table_state where room_id = p_room_id;
  select host_id into v_host_id from public.rooms where id = p_room_id;
  -- 승자 본인이거나(사람이 이겼을 때) 방장이면(AI가 이겨서 승자 본인이 누를 수 없을 때) 진행 가능
  if v_winner is null or (auth.uid() != v_winner and auth.uid() != v_host_id) then
    raise exception '이번 라운드 승자 또는 방장만 다음으로 넘길 수 있습니다.';
  end if;
  update public.game_table_state set advance_requested = true, updated_at = now()
  where room_id = p_room_id;
end;
$$ language plpgsql security definer;

-- 카드 내기: 지금 내 차례일 때만 가능. 손패에서 제출한 카드를 제거하고
-- 테이블 상태를 갱신, 다음 사람에게 턴을 넘긴다. 손패가 0장이 되면 라운드 종료로 표시.
create function public.play_cards(p_room_id uuid, p_cards jsonb)
returns void as $$
declare
  v_seat int;
  v_player_count int;
  v_current_seat int;
  v_current_combo jsonb;
  v_round_number int;
  v_hand jsonb;
  v_new_hand jsonb;
  v_turn_limit int;
  v_next_seat int;
begin
  select seat_no into v_seat from public.room_players
  where room_id = p_room_id and player_id = auth.uid();
  if v_seat is null then
    raise exception '이 방의 참가자가 아닙니다.';
  end if;

  select current_turn_seat, current_combo, round_number into v_current_seat, v_current_combo, v_round_number
  from public.game_table_state where room_id = p_room_id;

  if v_current_seat is null or v_current_seat != v_seat then
    raise exception '지금은 당신의 차례가 아닙니다.';
  end if;

  if v_current_combo is not null and jsonb_array_length(v_current_combo) != jsonb_array_length(p_cards) then
    raise exception '이전에 나온 조합과 같은 장수를 내야 합니다.';
  end if;

  select cards into v_hand from public.player_hands
  where room_id = p_room_id and player_id = auth.uid();

  -- 제출한 카드들이 실제로 손패에 있는지 확인하며 하나씩 제거
  v_new_hand := v_hand;
  for i in 0 .. jsonb_array_length(p_cards) - 1 loop
    declare
      v_target jsonb := p_cards -> i;
      v_idx int := null;
    begin
      for j in 0 .. jsonb_array_length(v_new_hand) - 1 loop
        if (v_new_hand -> j ->> 'number')::int = (v_target->>'number')::int
           and (v_new_hand -> j ->> 'suit')::int = (v_target->>'suit')::int then
          v_idx := j;
          exit;
        end if;
      end loop;
      if v_idx is null then
        raise exception '가지고 있지 않은 카드는 낼 수 없습니다.';
      end if;
      v_new_hand := v_new_hand - v_idx;
    end;
  end loop;

  update public.player_hands set cards = v_new_hand, updated_at = now()
  where room_id = p_room_id and player_id = auth.uid();

  select player_count into v_player_count from public.rooms where id = p_room_id;
  select turn_time_limit into v_turn_limit from public.rooms where id = p_room_id;
  v_next_seat := (v_seat + 1) % v_player_count;

  update public.game_table_state set
    current_combo = p_cards,
    current_combo_player_id = auth.uid(),
    current_turn_seat = v_next_seat,
    passed_seats = '{}',
    turn_deadline = now() + (v_turn_limit || ' seconds')::interval,
    round_winner_id = case when jsonb_array_length(v_new_hand) = 0 then auth.uid() else null end,
    updated_at = now()
  where room_id = p_room_id;

  insert into public.play_log (room_id, round_number, player_id, cards)
  values (p_room_id, v_round_number, auth.uid(), p_cards);
end;
$$ language plpgsql security definer;

-- 방장이 봇을 대신해서 패를 낸다 (play_cards와 로직은 동일하되, 대상이 auth.uid()가 아니라 p_bot_id)
create function public.bot_play_cards(p_room_id uuid, p_bot_id uuid, p_cards jsonb)
returns void as $$
declare
  v_host_id uuid;
  v_seat int;
  v_player_count int;
  v_current_seat int;
  v_current_combo jsonb;
  v_round_number int;
  v_hand jsonb;
  v_new_hand jsonb;
  v_turn_limit int;
  v_next_seat int;
begin
  select host_id into v_host_id from public.rooms where id = p_room_id;
  if auth.uid() != v_host_id then raise exception '방장만 봇을 대신 조작할 수 있습니다.'; end if;
  if not exists (select 1 from public.profiles where id = p_bot_id and is_bot) then
    raise exception '봇이 아닙니다.';
  end if;

  select seat_no into v_seat from public.room_players where room_id = p_room_id and player_id = p_bot_id;
  if v_seat is null then raise exception '이 방에 없는 봇입니다.'; end if;

  select current_turn_seat, current_combo, round_number into v_current_seat, v_current_combo, v_round_number
  from public.game_table_state where room_id = p_room_id;
  if v_current_seat is null or v_current_seat != v_seat then raise exception '지금은 봇의 차례가 아닙니다.'; end if;
  if v_current_combo is not null and jsonb_array_length(v_current_combo) != jsonb_array_length(p_cards) then
    raise exception '이전에 나온 조합과 같은 장수를 내야 합니다.';
  end if;

  select cards into v_hand from public.player_hands where room_id = p_room_id and player_id = p_bot_id;
  v_new_hand := v_hand;
  for i in 0 .. jsonb_array_length(p_cards) - 1 loop
    declare
      v_target jsonb := p_cards -> i;
      v_idx int := null;
    begin
      for j in 0 .. jsonb_array_length(v_new_hand) - 1 loop
        if (v_new_hand -> j ->> 'number')::int = (v_target->>'number')::int
           and (v_new_hand -> j ->> 'suit')::int = (v_target->>'suit')::int then
          v_idx := j;
          exit;
        end if;
      end loop;
      if v_idx is null then raise exception '봇이 가지고 있지 않은 카드입니다.'; end if;
      v_new_hand := v_new_hand - v_idx;
    end;
  end loop;

  update public.player_hands set cards = v_new_hand, updated_at = now()
  where room_id = p_room_id and player_id = p_bot_id;

  select player_count into v_player_count from public.rooms where id = p_room_id;
  select turn_time_limit into v_turn_limit from public.rooms where id = p_room_id;
  v_next_seat := (v_seat + 1) % v_player_count;

  update public.game_table_state set
    current_combo = p_cards,
    current_combo_player_id = p_bot_id,
    current_turn_seat = v_next_seat,
    passed_seats = '{}',
    turn_deadline = now() + (v_turn_limit || ' seconds')::interval,
    round_winner_id = case when jsonb_array_length(v_new_hand) = 0 then p_bot_id else null end,
    updated_at = now()
  where room_id = p_room_id;

  insert into public.play_log (room_id, round_number, player_id, cards)
  values (p_room_id, v_round_number, p_bot_id, p_cards);
end;
$$ language plpgsql security definer;

-- 방장이 봇을 대신해서 패스한다
create function public.bot_pass_turn(p_room_id uuid, p_bot_id uuid)
returns void as $$
declare
  v_host_id uuid;
  v_current_seat int;
  v_combo_player uuid;
  v_combo_seat int;
  v_player_count int;
  v_passed int[];
  v_turn_limit int;
  v_next_seat int;
  v_bot_seat int;
begin
  select host_id into v_host_id from public.rooms where id = p_room_id;
  if auth.uid() != v_host_id then raise exception '방장만 봇을 대신 조작할 수 있습니다.'; end if;

  select seat_no into v_bot_seat from public.room_players where room_id = p_room_id and player_id = p_bot_id;

  select current_turn_seat, current_combo_player_id, passed_seats
  into v_current_seat, v_combo_player, v_passed
  from public.game_table_state where room_id = p_room_id;

  if v_current_seat != v_bot_seat then raise exception '지금은 봇의 차례가 아닙니다.'; end if;

  select player_count into v_player_count from public.rooms where id = p_room_id;
  select turn_time_limit into v_turn_limit from public.rooms where id = p_room_id;

  v_passed := array_append(v_passed, v_current_seat);

  if v_combo_player is not null then
    select seat_no into v_combo_seat from public.room_players
    where room_id = p_room_id and player_id = v_combo_player;
  end if;

  if v_combo_seat is not null and array_length(v_passed, 1) >= v_player_count - 1 then
    update public.game_table_state set
      current_combo = null, current_combo_player_id = null, current_turn_seat = v_combo_seat,
      passed_seats = '{}', turn_deadline = now() + (v_turn_limit || ' seconds')::interval, updated_at = now()
    where room_id = p_room_id;
  else
    v_next_seat := (v_current_seat + 1) % v_player_count;
    update public.game_table_state set
      current_turn_seat = v_next_seat, passed_seats = v_passed,
      turn_deadline = now() + (v_turn_limit || ' seconds')::interval, updated_at = now()
    where room_id = p_room_id;
  end if;
end;
$$ language plpgsql security definer;

-- 패스: 본인이 자기 차례에 직접 패스하거나, 제한시간이 지났으면 누구든(자동패스 트리거) 대신 호출 가능.
-- 남은 전원이 패스하면 마지막으로 낸 사람에게 턴이 돌아가며 테이블이 비워진다(새로 자유롭게 낼 수 있음).
create function public.pass_turn(p_room_id uuid)
returns void as $$
declare
  v_current_seat int;
  v_deadline timestamptz;
  v_occupant uuid;
  v_combo_player uuid;
  v_combo_seat int;
  v_player_count int;
  v_passed int[];
  v_turn_limit int;
  v_next_seat int;
begin
  select current_turn_seat, turn_deadline, current_combo_player_id, passed_seats
  into v_current_seat, v_deadline, v_combo_player, v_passed
  from public.game_table_state where room_id = p_room_id;

  select player_id into v_occupant from public.room_players
  where room_id = p_room_id and seat_no = v_current_seat;

  if auth.uid() != v_occupant and now() < v_deadline then
    raise exception '아직 제한시간이 남아있어 대신 패스할 수 없습니다.';
  end if;

  select player_count into v_player_count from public.rooms where id = p_room_id;
  select turn_time_limit into v_turn_limit from public.rooms where id = p_room_id;

  v_passed := array_append(v_passed, v_current_seat);

  if v_combo_player is not null then
    select seat_no into v_combo_seat from public.room_players
    where room_id = p_room_id and player_id = v_combo_player;
  end if;

  -- 콤보를 낸 사람을 제외한 전원이 패스했으면 테이블을 비우고 그 사람 차례로 되돌린다
  if v_combo_seat is not null and array_length(v_passed, 1) >= v_player_count - 1 then
    update public.game_table_state set
      current_combo = null,
      current_combo_player_id = null,
      current_turn_seat = v_combo_seat,
      passed_seats = '{}',
      turn_deadline = now() + (v_turn_limit || ' seconds')::interval,
      updated_at = now()
    where room_id = p_room_id;
  else
    v_next_seat := (v_current_seat + 1) % v_player_count;
    update public.game_table_state set
      current_turn_seat = v_next_seat,
      passed_seats = v_passed,
      turn_deadline = now() + (v_turn_limit || ' seconds')::interval,
      updated_at = now()
    where room_id = p_room_id;
  end if;
end;
$$ language plpgsql security definer;

-- 일시정지: 참가자 누구든 걸 수 있음. 이미 누가 걸어놨으면 무시(멱등).
create function public.pause_game(p_room_id uuid)
returns void as $$
begin
  if not exists (select 1 from public.room_players where room_id = p_room_id and player_id = auth.uid()) then
    raise exception '이 방의 참가자가 아닙니다.';
  end if;

  update public.game_table_state
  set paused_by = coalesce(paused_by, auth.uid()), updated_at = now()
  where room_id = p_room_id;
end;
$$ language plpgsql security definer;

-- 재개: 일시정지를 건 사람만 가능. 재개 시 현재 턴 플레이어에게 새 제한시간을 다시 준다(불이익 방지).
create function public.unpause_game(p_room_id uuid, p_turn_seconds int)
returns void as $$
declare
  v_paused_by uuid;
begin
  select paused_by into v_paused_by from public.game_table_state where room_id = p_room_id;

  if v_paused_by is null then
    return; -- 이미 재개된 상태면 조용히 무시
  end if;
  if auth.uid() != v_paused_by then
    raise exception '일시정지를 건 사람만 재개할 수 있습니다.';
  end if;

  update public.game_table_state
  set paused_by = null, turn_deadline = now() + (p_turn_seconds || ' seconds')::interval, updated_at = now()
  where room_id = p_room_id;
end;
$$ language plpgsql security definer;

-- 중도 포기: 나간 사람은 이번 매치 점수가 페널티 점수(기본 -50)로 확정되고,
-- 나머지는 지금까지 쌓인 match_scores 그대로 최종 기록되며 매치가 즉시 종료된다.
create function public.quit_match_with_penalty(p_room_id uuid, p_penalty int default -50)
returns uuid as $$
declare
  v_game_id uuid;
  v_rank int := 1;
  v_row record;
  v_has_bot boolean;
  v_effective_penalty int;
begin
  if not exists (select 1 from public.room_players where room_id = p_room_id and player_id = auth.uid()) then
    raise exception '이 방의 참가자가 아닙니다.';
  end if;

  -- AI 봇이 낀 매치는 리더보드에 안 남기고, 페널티도 없음
  select exists (
    select 1 from public.room_players rp
    join public.profiles pr on pr.id = rp.player_id
    where rp.room_id = p_room_id and pr.is_bot
  ) into v_has_bot;

  v_effective_penalty := case when v_has_bot then 0 else p_penalty end;

  if not v_has_bot then
    insert into public.games (room_id, player_count)
    select p_room_id, player_count from public.rooms where id = p_room_id
    returning id into v_game_id;

    for v_row in
      select player_id,
             case when player_id = auth.uid() then v_effective_penalty else score end as final_score
      from public.match_scores
      where room_id = p_room_id
      order by (case when player_id = auth.uid() then v_effective_penalty else score end) desc
    loop
      insert into public.game_results (game_id, player_id, rank, score)
      values (v_game_id, v_row.player_id, v_rank, v_row.final_score);
      v_rank := v_rank + 1;
    end loop;
  end if;

  delete from public.match_scores where room_id = p_room_id;
  update public.rooms set status = 'waiting' where id = p_room_id;
  delete from public.game_table_state where room_id = p_room_id;
  delete from public.player_hands where room_id = p_room_id;
  delete from public.play_log where room_id = p_room_id;

  return v_game_id;
end;
$$ language plpgsql security definer;

-- 각 참가자의 "남은 패 개수"만 알려줌 (실제 카드 내용은 절대 노출 안 됨 — 전략적으로 꼭 필요한 정보)
create function public.get_hand_counts(p_room_id uuid)
returns table(player_id uuid, card_count int) as $$
begin
  -- 주의: RETURNS TABLE의 컬럼명(player_id)이 함수 안에서 변수처럼도 잡히기 때문에,
  -- room_players.player_id 를 그냥 쓰면 모호해짐 → 반드시 별명(rp)으로 명시해야 함
  if not exists (
    select 1 from public.room_players rp
    where rp.room_id = p_room_id and rp.player_id = auth.uid()
  ) then
    raise exception '이 방의 참가자가 아닙니다.';
  end if;

  return query
  select ph.player_id, jsonb_array_length(ph.cards)
  from public.player_hands ph
  where ph.room_id = p_room_id;
end;
$$ language plpgsql security definer;

create function public.reveal_round_hands(p_room_id uuid)
returns table(player_id uuid, cards jsonb) as $$
begin
  if not exists (
    select 1 from public.game_table_state
    where room_id = p_room_id and round_winner_id is not null
  ) then
    raise exception '아직 라운드가 끝나지 않았습니다.';
  end if;

  return query
  select ph.player_id, ph.cards
  from public.player_hands ph
  where ph.room_id = p_room_id;
end;
$$ language plpgsql security definer;

-- 이번 라운드에 나온 패를 순서대로 계속 볼 수 있도록 하는 기록 (전략적으로 이전에 나온 패를 참고할 수 있게)
create table public.play_log (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  round_number int not null,
  player_id uuid not null references public.profiles(id) on delete cascade,
  cards jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.play_log enable row level security;
create policy "play_log viewable by authenticated users"
  on public.play_log for select using (auth.role() = 'authenticated');
-- 매치 종료 시 정리(delete)할 수 있어야 함 (다음 매치의 1라운드와 안 겹치게)
create policy "authenticated users can clear play log"
  on public.play_log for delete using (auth.role() = 'authenticated');
-- insert 는 play_cards() 함수를 통해서만 이루어짐

alter publication supabase_realtime add table public.play_log;
alter publication supabase_realtime add table public.game_table_state;

alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.games enable row level security;
alter table public.game_results enable row level security;

-- 프로필: 누구나 닉네임 조회 가능(리더보드 표시용), 본인 것만 수정 가능
create policy "profiles are viewable by everyone"
  on public.profiles for select using (true);
create policy "users can update own profile"
  on public.profiles for update using (auth.uid() = id);

-- 방/참가자: 로그인한 사용자면 조회/입장 가능 (소규모 친구용이라 단순하게)
create policy "rooms viewable by authenticated users"
  on public.rooms for select using (auth.role() = 'authenticated');
create policy "authenticated users can create rooms"
  on public.rooms for insert with check (auth.uid() = host_id);
-- 방장이 방 설정(목표점수/제한시간/인원수/상태 등)을 바꿀 수 있어야 함 — 이게 빠져있어서
-- 지금까지 시작 옵션 저장, 게임 시작(status='playing'), 매치 종료 후 복귀(status='waiting')가
-- 에러 없이 조용히 씹히고 있었을 수 있음
create policy "host can update their room"
  on public.rooms for update
  using (auth.uid() = host_id)
  with check (true);
-- ↑ using: "지금 방장인 사람만 수정 가능" / with check: 없으면 postgres가 using을 재사용해서
-- "수정 후에도 auth.uid()=host_id 여야 함"이 되어버려 방장 위임(host_id를 남에게 넘기기)이
-- 전부 조용히 거부됨 — 그래서 명시적으로 with check(true)로 풀어줌
-- 참가자가 아무도 없는(방금 마지막 사람이 나간) 방은 누구든 정리 삭제할 수 있음
create policy "anyone can delete an empty room"
  on public.rooms for delete
  using (not exists (select 1 from public.room_players rp where rp.room_id = rooms.id));

create policy "room_players viewable by authenticated users"
  on public.room_players for select using (auth.role() = 'authenticated');
create policy "users can join rooms as themselves"
  on public.room_players for insert with check (auth.uid() = player_id);
create policy "users can leave rooms as themselves"
  on public.room_players for delete using (auth.uid() = player_id);

-- 게임 기록: 조회는 누구나(리더보드용), 기록 insert는 서버(서비스 롤)에서만
create policy "games viewable by everyone"
  on public.games for select using (true);
create policy "game_results viewable by everyone"
  on public.game_results for select using (true);
-- 매치 종료 기록은 방장(또는 중도 포기자) 클라이언트가 직접 insert 함 — 소규모 친구용이라 단순하게 허용
create policy "authenticated users can record match results"
  on public.games for insert with check (auth.role() = 'authenticated');
create policy "authenticated users can record match result rows"
  on public.game_results for insert with check (auth.role() = 'authenticated');

-- 채팅: 로그인한 사용자면 전체 조회 가능, 자기 자신 이름으로만 작성 가능
alter table public.messages enable row level security;
create policy "messages viewable by authenticated users"
  on public.messages for select using (auth.role() = 'authenticated');
create policy "users can send messages as themselves"
  on public.messages for insert with check (auth.uid() = sender_id);

-- Realtime 구독을 위해 publication 에 추가 (방/채팅/점수 실시간 갱신용)
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.room_players;
alter publication supabase_realtime add table public.match_scores;

alter table public.match_scores enable row level security;
create policy "match_scores viewable by authenticated users"
  on public.match_scores for select using (auth.role() = 'authenticated');
-- 매치 끝나고 다음 매치를 위해 클라이언트가 직접 정리(delete)함
create policy "authenticated users can clear match scores"
  on public.match_scores for delete using (auth.role() = 'authenticated');
-- insert/update 는 increment_match_score() 함수(security definer)를 통해서만 이루어짐
