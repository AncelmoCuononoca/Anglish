# Anglish AI

Modern AI-powered English learning platform for Portuguese speakers.

## Stack
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + Framer Motion
- **Backend**: Node.js + Express + TypeScript
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth
- **AI Chat**: Anthropic Claude API
- **Voice**: ElevenLabs TTS + OpenAI Whisper STT
- **Payments**: Stripe
- **WhatsApp**: Twilio

## Getting Started

### Prerequisites
Install [Node.js 20+](https://nodejs.org)

### Frontend
```bash
cd frontend
cp .env.example .env        # fill in your keys
npm install
npm run dev                 # http://localhost:3000
```

### Backend
```bash
cd backend
cp .env.example .env        # fill in your keys
npm install
npm run dev                 # http://localhost:4000
```

## Project Structure
```
├── frontend/
│   └── src/
│       ├── pages/          # All page components
│       ├── components/     # Reusable UI components
│       ├── lib/            # Supabase, store, utils
│       └── types/          # TypeScript types
└── backend/
    └── src/
        ├── routes/         # Express API routes
        └── lib/            # Anthropic, Supabase, helpers
```

## Pages
| Route | Page |
|---|---|
| `/` | Landing Page |
| `/auth` | Login / Register |
| `/dashboard` | Student Dashboard |
| `/lessons/:id` | Lesson content |
| `/exercises/:id` | Interactive exercises |
| `/speaking` | Speaking AI (voice) |
| `/chat` | Chat Tutor |
| `/schedule` | Book live class |
| `/leaderboard` | Rankings |
| `/profile` | Profile & progress |
| `/plans` | Pricing plans |
| `/admin` | Admin panel |

## Supabase Tables Needed
- `profiles` - user data, XP, streak, plan, level
- `lessons` - lesson content per level/week/day
- `exercises` - exercises per lesson
- `scheduled_lessons` - live class bookings
- `achievements` - user badges

## Founder
Anselmo Aldair · Angola 🇦🇴
