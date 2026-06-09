import express from 'express';
import cors from 'cors';
import syncRouter from './routes/sync';
import stateRouter from './routes/state';

const app = express();
app.use(cors());
app.use(express.json());

app.use('/sync', syncRouter);
app.use('/state', stateRouter);

app.get('/health', (_, res) => res.json({ ok: true }));

const PORT = 3001;
app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));