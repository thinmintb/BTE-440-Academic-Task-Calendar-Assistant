import express from 'express';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import path from 'path';

async function startServer() {
  const app = express();
  const PORT = 3000;
  const DATA_FILE = path.join(process.cwd(), 'events_data.json');

  app.use(express.json({ limit: '10mb' }));

  // API Routes
  app.get('/api/events', (req, res) => {
    try {
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      res.json(JSON.parse(data));
    } catch (error) {
      res.status(500).json({ error: 'Failed to load events' });
    }
  });

  app.post('/api/events', (req, res) => {
    try {
      const event = req.body;
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      const events = JSON.parse(data);
      events.push(event);
      fs.writeFileSync(DATA_FILE, JSON.stringify(events, null, 2));
      res.json({ success: true, event });
    } catch (error) {
      res.status(500).json({ error: 'Failed to save event' });
    }
  });

  app.post('/api/events/batch', (req, res) => {
    try {
      const newEvents = req.body;
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      const events = JSON.parse(data);
      const updatedEvents = [...events, ...newEvents];
      fs.writeFileSync(DATA_FILE, JSON.stringify(updatedEvents, null, 2));
      res.json({ success: true, count: newEvents.length });
    } catch (error) {
      res.status(500).json({ error: 'Failed to batch save events' });
    }
  });

  app.delete('/api/events/:id', (req, res) => {
    try {
      const { id } = req.params;
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      let events = JSON.parse(data);
      events = events.filter((e: any) => e.id !== id);
      fs.writeFileSync(DATA_FILE, JSON.stringify(events, null, 2));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete event' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
