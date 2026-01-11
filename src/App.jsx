import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Admin from './pages/Admin'
import Home from './pages/Home'
import PublicReport from './pages/PublicReport' // 👈 새로 추가

function App() {
  const user = JSON.parse(localStorage.getItem('user'))

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-900 text-slate-100">
        <Routes>
          <Route path="/login" element={!user ? <Login /> : (user.is_admin ? <Navigate to="/admin" /> : <Navigate to="/" />)} />
          <Route path="/" element={user && !user.is_admin ? <Home /> : <Navigate to="/login" />} />
          <Route path="/admin" element={user?.is_admin ? <Admin /> : <Navigate to="/" />} />
          
          {/* 👇 학부모 공유용 공개 리포트 페이지 (로그인 불필요) */}
          <Route path="/report/:userId" element={<PublicReport />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App