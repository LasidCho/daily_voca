import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { BarChart2, TrendingUp, User, Calendar } from 'lucide-react'
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

export default function PublicReport() {
  const { userId } = useParams() // URL에서 학생 ID를 가져옴
  const [stats, setStats] = useState(null)
  const [studentName, setStudentName] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (userId) fetchReport()
  }, [userId])

  const fetchReport = async () => {
    try {
      // 1. 학생 이름 가져오기
      const userRes = await supabase.from('users').select('name').eq('id', userId).single()
      if (userRes.data) setStudentName(userRes.data.name)

      // 2. 성적 데이터 가져오기
      const { data } = await supabase
        .from('test_results')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })

      if (!data || data.length === 0) {
        setStats(null)
      } else {
        // --- 🐛 통계 계산 (날짜 및 평균 오류 수정) ---
        const recent20 = data.slice(-20)
        const history = data.slice(-10).map(item => {
          // KST(한국 시간) 보정: 오전 9시 이전 데이터가 전날로 나오는 현상 해결
          const d = new Date(item.created_at)
          d.setHours(d.getHours() + 9) 
          return {
            date: `${d.getMonth() + 1}/${d.getDate()}`,
            score: item.score
          }
        })

        // 오답 분석
        const wrongMap = {}
        recent20.forEach(test => {
          if (test.wrong_words) {
            test.wrong_words.forEach(w => {
              const key = `${w.word} (${w.meaning_ko})`
              wrongMap[key] = (wrongMap[key] || 0) + 1
            })
          }
        })
        const frequentWrongs = Object.entries(wrongMap)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5)
          .map(([word, count]) => ({ word, count }))

        // 평균 점수 계산 시 NaN 에러 방지용 방어 코드 추가
        const average = data.length > 0 ? Math.round(data.reduce((acc, curr) => acc + curr.score, 0) / data.length) : 0;

        setStats({
          totalTests: data.length,
          avgScore: average,
          history,
          frequentWrongs
        })
      }
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">데이터 불러오는 중...</div>

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6 flex flex-col items-center">
      <div className="w-full max-w-md space-y-6 animate-fade-in">
        
        {/* 헤더 */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-pink-400">
            Daily Voca 리포트
          </h1>
          <p className="text-slate-400 mt-2 flex items-center justify-center gap-2">
            <User size={16}/> {studentName} 학생의 학습 기록
          </p>
          <p className="text-xs text-slate-500 mt-1">
            <Calendar size={12} className="inline mr-1"/>
            {new Date().toLocaleDateString()} 기준
          </p>
        </div>

        {stats ? (
          <>
            {/* 요약 카드 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-800 p-5 rounded-2xl border border-slate-700 text-center">
                <p className="text-slate-400 text-sm">총 테스트 수행</p>
                <p className="text-3xl font-black text-white">{stats.totalTests}<span className="text-sm font-normal text-slate-500 ml-1">회</span></p>
              </div>
              <div className="bg-slate-800 p-5 rounded-2xl border border-slate-700 text-center">
                <p className="text-slate-400 text-sm">평균 점수</p>
                <p className="text-3xl font-black text-indigo-400">{stats.avgScore}<span className="text-sm font-normal text-slate-500 ml-1">점</span></p>
              </div>
            </div>

            {/* 그래프 */}
            <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-lg">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><TrendingUp size={18} className="text-green-400"/> 최근 성적 변화</h3>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.history}>
                    <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                    <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                      {stats.history.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.score >= 80 ? '#4ade80' : entry.score >= 50 ? '#fbbf24' : '#f87171'} />
                      ))}
                    </Bar>
                    <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 오답 노트 */}
            <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700">
              <h3 className="text-lg font-bold mb-4 text-red-400">🔥 자주 틀리는 단어 Top 5</h3>
              {stats.frequentWrongs.length > 0 ? (
                <div className="space-y-3">
                  {stats.frequentWrongs.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center bg-slate-900/50 p-3 rounded-lg border border-slate-700/50">
                      <span className="text-white font-medium">{idx+1}. {item.word}</span>
                      <span className="text-xs bg-red-500/20 text-red-300 px-2 py-1 rounded-full">{item.count}회 오답</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 text-sm text-center">틀린 단어가 없습니다. 훌륭해요! 👍</p>
              )}
            </div>
          </>
        ) : (
          <div className="text-center py-20 text-slate-500 bg-slate-800/50 rounded-2xl border border-slate-700">
            <p>아직 학습 기록이 없습니다.</p>
          </div>
        )}
      </div>
    </div>
  )
}