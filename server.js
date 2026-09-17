const express = require('express');
const path = require('path');
const session = require('express-session');
const SqliteStore = require('connect-sqlite3')(session);
const fs = require('fs');
const { resolveBaseDir } = require('./src/runtimePaths');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_DIR = resolveBaseDir();
const DATA_DIR = path.join(BASE_DIR, 'data');
const UPLOADS_DIR = path.join(BASE_DIR, 'uploads');

// 确保数据目录存在
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(path.join(UPLOADS_DIR, 'contest_materials'), { recursive: true });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session 配置
app.use(session({
  store: new SqliteStore({ db: 'sessions.db', dir: DATA_DIR }),
  secret: process.env.SESSION_SECRET || 'change-me-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7天
    httpOnly: true,
  }
}));

// API 路由（批量导入学生须挂在 app 上，否则部分环境下子 Router 无法匹配 /students/bulk）
require('./src/studentsBulk').mountStudentsBulkRoutes(app);
app.use('/api/auth', require('./src/auth'));
app.use('/api/users', require('./src/users'));
app.use('/api/contests', require('./src/contests'));
app.use('/api', require('./src/submissions'));

// 前端静态文件（生产模式）
const distPath = path.join(__dirname, 'client', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  // SPA 回退：刷新 /teacher/... 等深层路径时仍返回 index.html
  app.get('/{*path}', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  // 开发模式提示
  app.get('/', (req, res) => res.send('请先构建前端：cd client && npm run build'));
}

app.listen(PORT, () => {
  console.log(`✅ 服务器已启动：http://localhost:${PORT}`);
  console.log(`   默认管理员账号：admin（默认密码见启动日志 [DB] Created default admin）`);
});
