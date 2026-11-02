import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppProvider, useApp } from './lib/app'
import Layout from './components/Layout'
import Login from './pages/Login'
import Onboarding from './pages/Onboarding'
import Sales from './pages/Sales'
import Purchases from './pages/Purchases'
import Stock from './pages/Stock'
import Cash from './pages/Cash'
const Dashboard = lazy(() => import('./pages/Dashboard'))
import More from './pages/More'
import Members from './pages/Members'
import AuditLog from './pages/AuditLog'
import Catalog from './pages/Catalog'
import Settings from './pages/Settings'
const Excel = lazy(() => import('./pages/Excel'))

function Gate() {
  const { session, ready, shop, isManager } = useApp()
  if (!ready) return <div className="center"><span className="sub">Đang tải…</span></div>
  if (!session) return <Login />
  return (
    <Routes>
      <Route path="/quan-moi" element={<Onboarding />} />
      {!shop ? <Route path="*" element={<Onboarding />} /> : (
        <Route element={<Layout />}>
          <Route index element={<Sales />} />
          <Route path="nhap" element={<Purchases />} />
          <Route path="kho" element={<Stock />} />
          <Route path="so-tien" element={<Cash />} />
          <Route path="bao-cao" element={<Suspense fallback={<span className="sub">Đang tải…</span>}><Dashboard /></Suspense>} />
          <Route path="them" element={<More />} />
          <Route path="nhan-vien" element={<Members />} />
          <Route path="danh-muc" element={<Catalog />} />
          <Route path="cai-dat" element={<Settings />} />
          {isManager && <Route path="nhat-ky" element={<AuditLog />} />}
          {isManager && <Route path="excel" element={<Suspense fallback={<span className="sub">Đang tải…</span>}><Excel /></Suspense>} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      )}
    </Routes>
  )
}

export default function App() {
  return <BrowserRouter><AppProvider><Gate /></AppProvider></BrowserRouter>
}
