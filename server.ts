import express from 'express';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(__dirname, 'server_data.json');

interface User {
  nickname: string;
  staticId: string;
  discord: string;
  password?: string;
  role?: 'superadmin' | 'admin' | 'senior_instructor' | 'instructor';
  rank?: string;
  callsign?: string;
  avatarUrl?: string;
  createdAt?: string;
}

interface Report {
  id: string;
  userId: string;
  nickname: string;
  discord: string;
  date: string;
  checkedReports: number;
  gatherings: number;
  arrests: number;
  events: number;
  checked?: number;
  gathered?: number;
  trainings?: number;
  proofUrl?: string;
  notes?: string;
  status: 'approved' | 'rejected' | 'pending';
  reviewedBy?: string;
  reviewedAt?: string;
  reviewComment?: string;
}

interface WeeklyArchive {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  closedBy: string;
  closedAt: string;
  reportsCount: number;
  totalPoints: number;
  totalCheckedReports: number;
  totalGatherings: number;
  totalArrests: number;
  totalEvents: number;
  archivedReports: Report[];
  instructorSummary: {
    nickname: string;
    staticId: string;
    discord: string;
    points: number;
    reportsCount: number;
    checkedReports: number;
    gatherings: number;
    arrests: number;
    events: number;
  }[];
}

interface AppData {
  users: User[];
  reports: Report[];
  admins: string[];
  archives: WeeklyArchive[];
}

const DEFAULT_DATA: AppData = {
  users: [
    {
      nickname: 'Станислав Яров',
      staticId: '21358',
      discord: 'nensikq',
      password: 'admin',
      role: 'superadmin',
      createdAt: new Date().toISOString(),
    },
  ],
  reports: [],
  admins: ['21358'],
  archives: [],
};

function readData(): AppData {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      const rawUsers: User[] = Array.isArray(parsed.users) ? parsed.users : DEFAULT_DATA.users;

      // Ensure Станислав Яров has superadmin (Куратор Отдела) role
      const users = rawUsers.map((u) => {
        if (u.staticId === '21358' || u.nickname.toLowerCase().includes('станислав яров')) {
          return { ...u, nickname: 'Станислав Яров', role: 'superadmin' as const };
        }
        return u;
      });

      const hasStanislav = users.some((u) => u.staticId === '21358');
      if (!hasStanislav) {
        users.unshift({
          nickname: 'Станислав Яров',
          staticId: '21358',
          discord: 'nensikq',
          password: 'admin',
          role: 'superadmin',
          createdAt: new Date().toISOString(),
        });
      }

      const rawAdmins: string[] = Array.isArray(parsed.admins) ? parsed.admins : DEFAULT_DATA.admins;
      const admins = rawAdmins.includes('21358') ? rawAdmins : ['21358', ...rawAdmins];

      return {
        users,
        reports: Array.isArray(parsed.reports) ? parsed.reports : DEFAULT_DATA.reports,
        admins,
        archives: Array.isArray(parsed.archives) ? parsed.archives : DEFAULT_DATA.archives,
      };
    }
  } catch (err) {
    console.error('Error reading DATA_FILE:', err);
  }
  return DEFAULT_DATA;
}

function writeData(data: AppData) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing DATA_FILE:', err);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // In-memory presence tracker: staticId -> timestamp
  const activePresence = new Map<string, number>();

  const getOnlineStaticIds = (): string[] => {
    const now = Date.now();
    const online: string[] = [];
    activePresence.forEach((timestamp, staticId) => {
      if (now - timestamp < 15000) {
        online.push(staticId);
      }
    });
    return online;
  };

  // API Routes
  app.get('/api/db', (req, res) => {
    const data = readData();
    res.json({
      ...data,
      onlineUsers: getOnlineStaticIds(),
    });
  });

  app.post('/api/heartbeat', (req, res) => {
    const { staticId } = req.body;
    if (staticId) {
      activePresence.set(String(staticId), Date.now());
    }
    res.json({ success: true, onlineUsers: getOnlineStaticIds() });
  });

  app.post('/api/users/role', (req, res) => {
    const { staticId, role } = req.body;
    if (!staticId || !role) {
      return res.status(400).json({ error: 'staticId and role are required' });
    }

    const data = readData();
    const user = data.users.find((u) => u.staticId === String(staticId));

    if (user) {
      user.role = role;
      if (role === 'admin' || role === 'superadmin') {
        if (!data.admins.includes(user.staticId)) {
          data.admins.push(user.staticId);
        }
      }
      writeData(data);
      return res.json({ success: true, user, users: data.users, admins: data.admins });
    }

    return res.status(404).json({ error: 'User not found' });
  });

  app.post('/api/users', (req, res) => {
    const { user } = req.body;
    if (!user || !user.staticId) {
      return res.status(400).json({ error: 'User and staticId are required' });
    }

    const data = readData();
    const existingIndex = data.users.findIndex((u) => u.staticId === user.staticId);

    if (existingIndex >= 0) {
      data.users[existingIndex] = { ...data.users[existingIndex], ...user };
    } else {
      data.users.push(user);
    }

    writeData(data);
    res.json({ success: true, user, users: data.users });
  });

  app.post('/api/avatar', (req, res) => {
    const { staticId, avatarUrl } = req.body;
    if (!staticId) {
      return res.status(400).json({ error: 'staticId is required' });
    }

    const data = readData();
    const user = data.users.find((u) => u.staticId === staticId);
    if (user) {
      user.avatarUrl = avatarUrl || undefined;
      writeData(data);
      return res.json({ success: true, user, users: data.users });
    }

    return res.status(404).json({ error: 'User not found' });
  });

  app.post('/api/reports', (req, res) => {
    const { report } = req.body;
    if (!report || !report.id) {
      return res.status(400).json({ error: 'Report object is required' });
    }

    const data = readData();
    data.reports.unshift(report);
    writeData(data);
    res.json({ success: true, report, reports: data.reports });
  });

  app.delete('/api/reports/:id', (req, res) => {
    const { id } = req.params;
    const data = readData();
    data.reports = data.reports.filter((r) => r.id !== id);
    writeData(data);
    res.json({ success: true, reports: data.reports });
  });

  app.post('/api/admins', (req, res) => {
    const { admins } = req.body;
    if (!Array.isArray(admins)) {
      return res.status(400).json({ error: 'Admins array is required' });
    }

    const data = readData();
    data.admins = admins;
    writeData(data);
    res.json({ success: true, admins: data.admins });
  });

  app.post('/api/archive-week', (req, res) => {
    const { title, closedBy } = req.body;
    const data = readData();

    if (data.reports.length === 0) {
      return res.status(400).json({ error: 'Нет активных рапортов для архивации' });
    }

    // Calculate points helper
    const calcPoints = (r: Report) => {
      const checked = r.checkedReports ?? r.checked ?? 0;
      const gathered = r.gatherings ?? r.gathered ?? 0;
      const arr = r.arrests ?? 0;
      const ev = r.events ?? r.trainings ?? 0;
      return checked * 3 + gathered * 15 + arr * 2 + ev * 10;
    };

    const activeReports = [...data.reports];
    const totalReportsCount = activeReports.length;
    const totalCheckedReports = activeReports.reduce((sum, r) => sum + (r.checkedReports ?? r.checked ?? 0), 0);
    const totalGatherings = activeReports.reduce((sum, r) => sum + (r.gatherings ?? r.gathered ?? 0), 0);
    const totalArrests = activeReports.reduce((sum, r) => sum + (r.arrests ?? 0), 0);
    const totalEvents = activeReports.reduce((sum, r) => sum + (r.events ?? r.trainings ?? 0), 0);
    const totalPoints = activeReports.reduce((sum, r) => sum + calcPoints(r), 0);

    // Group by instructor
    const instMap = new Map<string, {
      nickname: string;
      staticId: string;
      discord: string;
      points: number;
      reportsCount: number;
      checkedReports: number;
      gatherings: number;
      arrests: number;
      events: number;
    }>();

    activeReports.forEach((r) => {
      const prev = instMap.get(r.userId) || {
        nickname: r.nickname,
        staticId: r.userId,
        discord: r.discord,
        points: 0,
        reportsCount: 0,
        checkedReports: 0,
        gatherings: 0,
        arrests: 0,
        events: 0,
      };

      prev.points += calcPoints(r);
      prev.reportsCount += 1;
      prev.checkedReports += (r.checkedReports ?? r.checked ?? 0);
      prev.gatherings += (r.gatherings ?? r.gathered ?? 0);
      prev.arrests += (r.arrests ?? 0);
      prev.events += (r.events ?? r.trainings ?? 0);

      instMap.set(r.userId, prev);
    });

    const instructorSummary = Array.from(instMap.values()).sort((a, b) => b.points - a.points);

    // Determine dates
    const dates = activeReports.map((r) => new Date(r.date).getTime()).sort((a, b) => a - b);
    const minDate = dates.length > 0 ? new Date(dates[0]).toISOString() : new Date().toISOString();
    const maxDate = new Date().toISOString();

    const archiveTitle = title || `Еженедельный отчёт (с ${new Date(minDate).toLocaleDateString('ru-RU')} по ${new Date(maxDate).toLocaleDateString('ru-RU')})`;

    const newArchive: WeeklyArchive = {
      id: `arch-${Date.now()}`,
      title: archiveTitle,
      startDate: minDate,
      endDate: maxDate,
      closedBy: closedBy || 'Руководство отдела',
      closedAt: maxDate,
      reportsCount: totalReportsCount,
      totalPoints,
      totalCheckedReports,
      totalGatherings,
      totalArrests,
      totalEvents,
      archivedReports: activeReports,
      instructorSummary,
    };

    data.archives.unshift(newArchive);
    data.reports = []; // Clear active reports for the new week!

    writeData(data);
    res.json({
      success: true,
      archive: newArchive,
      archives: data.archives,
      reports: data.reports,
    });
  });

  app.delete('/api/archives/:id', (req, res) => {
    const { id } = req.params;
    const data = readData();
    data.archives = data.archives.filter((a) => a.id !== id);
    writeData(data);
    res.json({ success: true, archives: data.archives });
  });

  app.post('/api/reset', (req, res) => {
    writeData(DEFAULT_DATA);
    res.json({ success: true, ...DEFAULT_DATA });
  });

  // Vite development or production static serve
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true, host: '0.0.0.0', port: PORT },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
