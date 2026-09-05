# Lexxio (렉씨오) — 설치 안내

## 1. Next.js 프로젝트 생성
```
npx create-next-app@latest lexio
```
질문에는: TypeScript Yes / Tailwind No / src 디렉터리 No / App Router Yes / import alias(@/*) Yes
("추천 기본값 사용"으로 진행해도 무방 — Tailwind가 같이 깔리지만 이 프로젝트는 안 씀)

```
cd lexio
npm install @supabase/supabase-js
```

## 2. 파일 배치
이 zip 안의 `app/`, `components/`, `lib/`, `schema.sql`을 방금 만든 `lexio` 프로젝트 폴더에
그대로 덮어써줘 (경로 구조 동일하게).

## 3. Supabase 프로젝트 생성
1. https://supabase.com → New project (리전: Northeast Asia Seoul 추천)
2. SQL Editor 에서 `schema.sql` 전체 내용 붙여넣고 Run

## 4. 환경변수
프로젝트 루트에 `.env.local` 생성:
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```
(Supabase Project Settings → API 에서 확인)

## 5. 실행
```
npm run dev
```
http://localhost:3000 접속 → /auth 로 자동 이동

## 6. 배포
Vercel에 깃허브 저장소 연결 → 위 두 환경변수 등록 → Deploy
