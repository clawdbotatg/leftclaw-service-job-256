# Claw Derby Settler

Node.js Express backend for the Claw Derby race engine.

## Setup

```bash
cd packages/settler
cp .env.example .env
# fill in ALCHEMY_API_KEY and SETTLER_PRIVATE_KEY
npm install
npm start
```

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Health check |
| GET | /race/current | Current race state |
| POST | /race/start | Start new race (opens betting) |
| POST | /race/bet | Place bet `{ player, lobsterId, tokens }` |
| POST | /race/run | Run race & settle bets on-chain |
| GET | /race/history | Last 50 finished races |
| GET | /race/:raceId/proof | Proof data for a race |
| GET | /player/:address/session | Player on-chain token balance |
