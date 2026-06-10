import 'dotenv/config'; // add this line
import express from 'express';
import cors from 'cors';
import syncRouter from './routes/sync';
import stateRouter from './routes/state';
import webhookRouter from './routes/webhook';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/sync', syncRouter);
app.use('/state', stateRouter);
app.use('/webhook', webhookRouter);

app.get('/health', (_, res) => res.json({ ok: true }));

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;
app.listen(PORT, () => {
  console.log(`Alcovia server on http://localhost:${PORT}`);
  console.log(`n8n webhook URL: ${process.env.N8N_WEBHOOK_URL || '(not set — using mock sink)'}`);
});