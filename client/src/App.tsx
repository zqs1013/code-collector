import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import ContestListPage from './pages/student/ContestListPage';
import ContestPage from './pages/student/ContestPage';
import TeacherContestsPage from './pages/teacher/ContestsPage';
import TeacherProblemsPage from './pages/teacher/ProblemsPage';
import ReviewPage from './pages/teacher/ReviewPage';
import TeacherStudentsPage from './pages/teacher/StudentsPage';
import AdminTeachersPage from './pages/admin/TeachersPage';
import AdminContestsPage from './pages/admin/ContestsPage';
import AdminStudentsPage from './pages/admin/StudentsPage';

// 登录页守卫：已登录则跳到首页，未登录则显示登录页
function LoginGuard() {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen text-gray-400">加载中...</div>;
  if (user) return <Navigate to="/" replace />;
  return <LoginPage />;
}

function RequireAuth({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen text-gray-400">加载中...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginGuard />} />

      <Route path="/" element={<RequireAuth><Layout><HomePage /></Layout></RequireAuth>} />

      {/* 学生路由 */}
      <Route path="/contests" element={<RequireAuth roles={['student']}><Layout><ContestListPage /></Layout></RequireAuth>} />
      <Route path="/contests/:id" element={<RequireAuth roles={['student']}><Layout><ContestPage /></Layout></RequireAuth>} />

      {/* 教师路由（管理员也可进入） */}
      <Route path="/teacher/contests" element={<RequireAuth roles={['teacher', 'superadmin']}><Layout><TeacherContestsPage /></Layout></RequireAuth>} />
      <Route path="/teacher/contests/:contestId/problems" element={<RequireAuth roles={['teacher', 'superadmin']}><Layout><TeacherProblemsPage /></Layout></RequireAuth>} />
      <Route path="/teacher/contests/:contestId/review" element={<RequireAuth roles={['teacher', 'superadmin']}><Layout><ReviewPage /></Layout></RequireAuth>} />
      <Route path="/teacher/students" element={<RequireAuth roles={['teacher']}><Layout><TeacherStudentsPage /></Layout></RequireAuth>} />

      {/* 管理员路由 */}
      <Route path="/admin/teachers" element={<RequireAuth roles={['superadmin']}><Layout><AdminTeachersPage /></Layout></RequireAuth>} />
      <Route path="/admin/contests" element={<RequireAuth roles={['superadmin']}><Layout><AdminContestsPage /></Layout></RequireAuth>} />
      <Route path="/admin/students" element={<RequireAuth roles={['superadmin']}><Layout><AdminStudentsPage /></Layout></RequireAuth>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
