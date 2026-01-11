import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useNavigate } from 'react-router-dom'

export default function Login() {
  const [loading, setLoading] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)
  const [groups, setGroups] = useState([])
  const navigate = useNavigate()

  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [selectedGroup, setSelectedGroup] = useState('')

  useEffect(() => {
    async function fetchGroups() {
      const { data } = await supabase.from('groups').select('*').order('name')
      if (data) setGroups(data)
    }
    fetchGroups()
  }, [])

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const { data, error } = await supabase.from('users').select('*').eq('phone', phone).eq('password', password)
      
      if (error || !data || data.length === 0) {
        alert("정보가 일치하지 않습니다. 다시 확인해주세요.")
        setLoading(false)
        return
      }

      const user = data[0]
      localStorage.setItem('user', JSON.stringify(user))
      
      if (user.is_admin) navigate('/admin')
      else navigate('/')
      window.location.reload()
    } catch (err) {
      alert("로그인 중 오류가 발생했습니다.")
    } finally {
      setLoading(false)
    }
  }

  const handleSignUp = async (e) => {
    e.preventDefault()
    if (!selectedGroup) return alert('그룹을 선택해주세요!')
    setLoading(true)
    try {
      const { error } = await supabase.from('users').insert({
        phone, password, name, group_id: selectedGroup
      })
      if (error) throw error
      alert('가입되었습니다! 로그인해주세요.')
      setIsSignUp(false)
    } catch (error) {
      alert('이미 등록된 번호이거나 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white/10 backdrop-blur-md p-8 rounded-2xl shadow-xl w-full max-w-md border border-white/20">
        
        {/* 🔥 [Updated] 제목 및 서명 영역 */}
        <div className="text-center mb-8">
          <h1 className="text-6xl font-bold text-center text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">
            Daily Voca
          </h1>
          <p className="text-right text-xs text-slate-500 font-serif mt-1 mr-4">
            by Lasid Cho
          </p>
        </div>

        <form onSubmit={isSignUp ? handleSignUp : handleLogin} className="space-y-4">
          <div>
            <label className="block text-slate-300 mb-1">전화번호</label>
            <input type="text" required placeholder="01012345678" className="w-full p-3 rounded-lg bg-slate-800/50 text-white border border-slate-700 outline-none focus:border-indigo-500" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <label className="block text-slate-300 mb-1">비밀번호</label>
            <input type="password" required placeholder="비밀번호" className="w-full p-3 rounded-lg bg-slate-800/50 text-white border border-slate-700 outline-none focus:border-indigo-500" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {isSignUp && (
            <>
              <div>
                <label className="block text-slate-300 mb-1">이름</label>
                <input type="text" required placeholder="홍길동" className="w-full p-3 rounded-lg bg-slate-800/50 text-white border border-slate-700 outline-none focus:border-indigo-500" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">그룹 선택</label>
                <select required className="w-full p-3 rounded-lg bg-slate-800/50 text-white border border-slate-700 outline-none focus:border-indigo-500" value={selectedGroup} onChange={(e) => setSelectedGroup(e.target.value)}>
                  <option value="">선택해주세요</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
            </>
          )}
          <button type="submit" disabled={loading} className="w-full py-4 mt-6 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-lg shadow-lg hover:opacity-90 transition">
            {loading ? '처리 중...' : (isSignUp ? '가입하기' : '로그인')}
          </button>
        </form>
        <div className="mt-6 text-center">
          <button onClick={() => setIsSignUp(!isSignUp)} className="text-slate-400 hover:text-white text-sm underline underline-offset-4">
            {isSignUp ? '이미 계정이 있나요? 로그인' : '계정이 없으신가요? 회원가입'}
          </button>
        </div>
      </div>
    </div>
  )
}