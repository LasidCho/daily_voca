import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { 
  Upload, Trash2, LogOut, FileSpreadsheet, Users, Settings, 
  BarChart2, XCircle, Plus, FolderPlus, Link as LinkIcon, RefreshCw, CheckSquare
} from 'lucide-react'
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts'

export default function Admin() {
  const [activeTab, setActiveTab] = useState('word')
  const [groups, setGroups] = useState([])
  const [selectedGroup, setSelectedGroup] = useState('')
  const [uploading, setUploading] = useState(false)
  
  // 상태 관리
  const [students, setStudents] = useState([])
  const [groupSettings, setGroupSettings] = useState(10)
  const [viewingStudent, setViewingStudent] = useState(null)
  const [studentStats, setStudentStats] = useState(null)
  const [newGroupName, setNewGroupName] = useState('')
  
  // 🔥 [New] 단어 통계 State
  const [wordStats, setWordStats] = useState({ total: 0, hasSynonyms: 0, hasAntonyms: 0 })

  const navigate = useNavigate()

  useEffect(() => { fetchGroups() }, [])
  useEffect(() => {
    if (selectedGroup) { 
      fetchGroupDetails()
      fetchStudents()
      fetchWordStats() // 🔥 그룹 선택 시 단어 수 조회
    } else { 
      setStudents([])
      setWordStats({ total: 0, hasSynonyms: 0, hasAntonyms: 0 })
    }
  }, [selectedGroup])

  const fetchGroups = async () => {
    const { data } = await supabase.from('groups').select('*').order('name')
    if (data) setGroups(data)
  }
  const fetchGroupDetails = async () => {
    const { data } = await supabase.from('groups').select('question_count').eq('id', selectedGroup).single()
    if (data) setGroupSettings(data.question_count)
  }
  const fetchStudents = async () => {
    const { data } = await supabase.from('users').select('*').eq('group_id', selectedGroup).eq('is_admin', false).order('name')
    if (data) setStudents(data)
  }
  
  // 🔥 [New] 단어 통계 조회 함수
  const fetchWordStats = async () => {
    const { data } = await supabase.from('words').select('synonyms, antonyms').eq('group_id', selectedGroup)
    if (data) {
      // 전체 개수 및 유의어/반의어가 있는 단어 개수 계산
      const total = data.length
      const hasSynonyms = data.filter(w => w.synonyms && w.synonyms.length > 0).length
      const hasAntonyms = data.filter(w => w.antonyms && w.antonyms.length > 0).length
      setWordStats({ total, hasSynonyms, hasAntonyms })
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('user')
    window.location.href = '/login'
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file || !selectedGroup) return alert('확인 필요')
    setUploading(true)
    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, {type:'binary'})
        const ws = wb.Sheets[wb.SheetNames[0]]
        // 🔥 [Admin.jsx 수정 부분]
        const data = XLSX.utils.sheet_to_json(ws).map(r => ({
          word: r.word, 
          meaning_ko: r.meaning_ko, 
          synonyms: r.synonyms ? String(r.synonyms).split(',').map(s=>s.trim()) : [], 
          antonyms: r.antonyms ? String(r.antonyms).split(',').map(s=>s.trim()) : [], 
          group_id: parseInt(selectedGroup), 
          difficulty: r.difficulty||1,
          pos: r.pos ? String(r.pos).trim() : null // ✨ [NEW] 엑셀에서 품사(pos) 읽어오기
        }))
        
        const { error } = await supabase.from('words').insert(data)
        if(error) throw error
        alert(`${data.length}개 등록 완료`)
        fetchWordStats() // 업로드 직후 통계 갱신
      } catch(err){
        alert('실패:'+err.message)
      } finally{
        setUploading(false)
        e.target.value=''
      }
    }
    reader.readAsBinaryString(file)
  }

  const handleDeleteGroupWords = async () => {
    if(!selectedGroup || !confirm('단어 전체 삭제?')) return
    await supabase.from('words').delete().eq('group_id', selectedGroup)
    alert('삭제 완료')
    fetchWordStats() // 삭제 후 통계 갱신
  }

  const updateGroupSettings = async () => {
    const {error} = await supabase.from('groups').update({question_count: groupSettings}).eq('id', selectedGroup)
    if(!error) alert('저장됨')
  }
  
  const handleDeleteStudent = async (id) => {
    if(!confirm('학생 삭제?')) return; 
    await supabase.from('users').delete().eq('id', id); 
    alert('삭제됨'); 
    fetchStudents(); 
    setViewingStudent(null);
  }

  // 🐛 [버그 수정] 통계 날짜 및 평균 점수 오류 수정
  const loadStudentReport = async (student) => {
    setViewingStudent(student); 
    const {data} = await supabase.from('test_results').select('*').eq('user_id', student.id).order('created_at', {ascending:true});
    
    if(!data || data.length === 0) { 
      setStudentStats(null); 
      return 
    }
    
    const chartData = data.slice(-10).map(i => {
      // 한국 시간(KST) 보정 추가
      const d = new Date(i.created_at);
      return {
        date: `${d.getMonth() + 1}/${d.getDate()}`,
        score: i.score
      };
    });

    const wm = {}; 
    data.slice(-20).forEach(t => {
      t.wrong_words?.forEach(w => {
        const key = `${w.word} (${w.meaning_ko})`;
        wm[key] = (wm[key] || 0) + 1;
      });
    });
    
    // 평균 점수 NaN 방지 및 반올림 처리
    const avgScore = data.length > 0 ? Math.round(data.reduce((a,c)=>a+c.score,0)/data.length) : 0;

    setStudentStats({
      avgScore, 
      totalTests: data.length, 
      chartData, 
      frequentWrongs: Object.entries(wm).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([word,count])=>({word,count}))
    });
  }

  const handleAddGroup = async () => {
    if(!newGroupName.trim()) return; 
    await supabase.from('groups').insert({name:newGroupName}); 
    alert('생성됨'); 
    setNewGroupName(''); 
    fetchGroups();
  }

  const handleDeleteGroup = async () => {
    if(!selectedGroup) return; 
    const u = await supabase.from('users').select('id').eq('group_id', selectedGroup); 
    if(u.data?.length > 0) return alert('학생 존재시 삭제 불가');
    
    if(confirm('그룹 삭제?')) { 
      await supabase.from('groups').delete().eq('id', selectedGroup); 
      alert('삭제됨'); 
      setSelectedGroup(''); 
      fetchGroups(); 
    }
  }

  const handleResetGroupRecords = async () => {
    if (!selectedGroup) return alert('그룹을 선택해주세요.')
    const confirmMsg = prompt(`⚠️ 경고: 이 그룹(${groups.find(g=>g.id==selectedGroup)?.name}) 학생들의 모든 시험 기록이 영구 삭제됩니다.\n진행하려면 "초기화" 라고 입력하세요.`)
    if (confirmMsg !== "초기화") return alert('취소되었습니다.')
    try {
      const { data: groupStudents } = await supabase.from('users').select('id').eq('group_id', selectedGroup)
      if (!groupStudents || groupStudents.length === 0) return alert('학생이 없습니다.')
      const studentIds = groupStudents.map(s => s.id)
      const { error } = await supabase.from('test_results').delete().in('user_id', studentIds)
      if (error) throw error
      alert('초기화되었습니다.')
      if (viewingStudent && studentIds.includes(viewingStudent.id)) setViewingStudent(null)
    } catch (err) { alert('실패: ' + err.message) }
  }

  const handleCopyLink = (student) => {
    const link = `${window.location.origin}/report/${student.id}`
    navigator.clipboard.writeText(link); 
    alert('링크 복사 완료');
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6 flex flex-col items-center">
      <div className="w-full max-w-5xl flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-pink-400">관리자 대시보드 👑</h1>
        <button onClick={handleLogout} className="flex items-center gap-2 text-slate-400 hover:text-white"><LogOut size={20} /> 로그아웃</button>
      </div>

      <div className="flex gap-4 mb-8 w-full max-w-5xl">
        <button onClick={() => setActiveTab('word')} className={`px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition ${activeTab === 'word' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}><FileSpreadsheet size={20} /> 단어 데이터</button>
        <button onClick={() => setActiveTab('student')} className={`px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition ${activeTab === 'student' ? 'bg-pink-600 text-white' : 'bg-slate-800 text-slate-400'}`}><Users size={20} /> 학생 및 그룹</button>
      </div>

      <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-4">
          <div className="bg-slate-800 p-5 rounded-2xl border border-slate-700">
            <h3 className="text-lg font-bold mb-4 text-slate-300">그룹 선택</h3>
            <select className="w-full p-3 bg-slate-900 border border-slate-700 rounded-lg outline-none" value={selectedGroup} onChange={(e) => setSelectedGroup(e.target.value)}>
              <option value="">그룹 선택</option>{groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          
          {activeTab === 'word' && selectedGroup && (
            <div className="bg-slate-800 p-5 rounded-2xl border border-slate-700 animate-fade-in">
              <h3 className="text-lg font-bold mb-4 text-indigo-300 flex items-center gap-2"><CheckSquare size={18}/> 등록 현황</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between border-b border-slate-700 pb-2">
                  <span className="text-slate-400">전체 단어</span>
                  <span className="font-bold text-white">{wordStats.total}개</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">유의어 보유</span>
                  <span className={`font-bold ${wordStats.hasSynonyms < 4 ? 'text-red-400' : 'text-green-400'}`}>{wordStats.hasSynonyms}개</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">반의어 보유</span>
                  <span className={`font-bold ${wordStats.hasAntonyms < 4 ? 'text-red-400' : 'text-green-400'}`}>{wordStats.hasAntonyms}개</span>
                </div>
              </div>
              {wordStats.hasSynonyms < 4 && <p className="text-xs text-red-400 mt-3">* 유의어 퀴즈 최소 4개 필요!</p>}
              {wordStats.hasAntonyms < 4 && <p className="text-xs text-red-400 mt-1">* 반의어 퀴즈 최소 4개 필요!</p>}
            </div>
          )}

          {activeTab === 'student' && (
            <div className="space-y-4 animate-fade-in">
              <div className="bg-slate-800 p-5 rounded-2xl border border-slate-700">
                <h3 className="text-lg font-bold mb-4 text-slate-300 flex items-center gap-2"><FolderPlus size={18}/> 그룹 관리</h3>
                <div className="flex gap-2 mb-4"><input type="text" placeholder="새 그룹명" className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg text-sm" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} /><button onClick={handleAddGroup} className="bg-green-600 p-2 rounded-lg text-white"><Plus size={18}/></button></div>
                {selectedGroup && <button onClick={handleDeleteGroup} className="w-full py-2 bg-red-600/20 text-red-400 border border-red-600/50 rounded-lg hover:bg-red-600 text-sm flex justify-center gap-2"><Trash2 size={16}/> 그룹 삭제</button>}
              </div>
              
              {selectedGroup && (
                <div className="bg-slate-800 p-5 rounded-2xl border border-slate-700 border-l-4 border-l-orange-500">
                  <h3 className="text-lg font-bold mb-4 text-orange-400 flex items-center gap-2"><RefreshCw size={18}/> 기록 관리</h3>
                  <button onClick={handleResetGroupRecords} className="w-full py-2 bg-orange-600/20 text-orange-400 border border-orange-600/50 rounded-lg hover:bg-orange-600 hover:text-white transition text-sm font-bold">
                    이 그룹 성적 전체 초기화
                  </button>
                </div>
              )}

              {selectedGroup && (
                <div className="bg-slate-800 p-5 rounded-2xl border border-slate-700">
                  <h3 className="text-lg font-bold mb-4 text-slate-300 flex items-center gap-2"><Settings size={18}/> 시험 설정</h3>
                  <label className="text-sm text-slate-400">회당 문제 수</label>
                  <div className="flex gap-2 mt-2"><input type="number" className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg" value={groupSettings} onChange={(e) => setGroupSettings(e.target.value)} /><button onClick={updateGroupSettings} className="bg-indigo-600 px-4 rounded-lg font-bold text-white">저장</button></div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="md:col-span-2">
          {activeTab === 'word' && (
            <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 animate-fade-in space-y-6">
              <div className="space-y-4"><h2 className="text-xl font-bold flex items-center gap-2"><Upload size={24} className="text-indigo-400"/> 엑셀 업로드</h2><input type="file" accept=".xlsx, .xls" disabled={!selectedGroup || uploading} onChange={handleFileUpload} className="w-full p-3 bg-slate-900 border border-slate-700 rounded-lg file:bg-indigo-600 file:text-white file:border-0 file:rounded-lg file:px-4 file:py-2" /></div>
              <div className="pt-6 border-t border-slate-700"><button onClick={handleDeleteGroupWords} disabled={!selectedGroup} className="px-4 py-2 bg-red-600/20 text-red-400 border border-red-600/50 rounded-lg hover:bg-red-600 hover:text-white transition">선택한 그룹 단어 전체 삭제</button></div>
            </div>
          )}
          
          {activeTab === 'student' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Users size={24} className="text-pink-400"/> 학생 목록 ({students.length}명)</h2>
                {students.length===0 ? <p className="text-slate-500">학생이 없습니다.</p> : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                    {students.map(s => (
                      <div key={s.id} className={`flex justify-between items-center p-3 rounded-lg border ${viewingStudent?.id===s.id ? 'bg-indigo-600/20 border-indigo-500' : 'bg-slate-900 border-slate-700'}`}>
                        <div><p className="font-bold text-white">{s.name}</p><p className="text-xs text-slate-400">{s.phone}</p></div>
                        <div className="flex gap-2">
                          <button onClick={() => handleCopyLink(s)} className="p-2 bg-slate-700 hover:bg-green-600 rounded text-slate-300 hover:text-white transition" title="공유 링크"><LinkIcon size={16}/></button>
                          <button onClick={() => loadStudentReport(s)} className="p-2 bg-slate-700 hover:bg-indigo-600 rounded text-slate-300 hover:text-white transition"><BarChart2 size={16}/></button>
                          <button onClick={() => handleDeleteStudent(s.id)} className="p-2 bg-slate-700 hover:bg-red-600 rounded text-slate-300 hover:text-white transition"><Trash2 size={16}/></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {viewingStudent && (
                <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 animate-fade-in border-l-4 border-l-indigo-500">
                  <div className="flex justify-between items-start mb-6"><div><h2 className="text-xl font-bold text-white">{viewingStudent.name} 학생 리포트</h2><p className="text-slate-400 text-sm">평균: {studentStats?.avgScore}점 / 총: {studentStats?.totalTests}회</p></div><button onClick={() => setViewingStudent(null)} className="text-slate-500 hover:text-white"><XCircle /></button></div>
                  {studentStats ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="h-40"><p className="text-sm text-slate-400 mb-2">성적 추이</p><ResponsiveContainer><BarChart data={studentStats.chartData}><XAxis dataKey="date" stroke="#94a3b8" fontSize={10}/><Bar dataKey="score" fill="#818cf8"/><Tooltip contentStyle={{backgroundColor:'#1e293b'}}/></BarChart></ResponsiveContainer></div>
                      <div><p className="text-sm text-slate-400 mb-2">오답 노트</p><div className="space-y-2">{studentStats.frequentWrongs.map((w,i)=><div key={i} className="flex justify-between text-sm bg-slate-900 p-2 rounded border border-slate-700"><span className="text-white">{w.word}</span><span className="text-red-400">{w.count}회</span></div>)}</div></div>
                    </div>
                  ) : <p className="text-center text-slate-500 py-10">기록 없음</p>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}