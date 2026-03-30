import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { 
  Play, CheckCircle, XCircle, LogOut, ArrowRight, 
  Home as HomeIcon, BarChart2, TrendingUp, Share2 
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

export default function Home() {
  const [user, setUser] = useState(null)
  const [activeTab, setActiveTab] = useState('quiz') 
  
  // 퀴즈 State
  const [mode, setMode] = useState('menu')
  const [quizList, setQuizList] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [score, setScore] = useState(0)
  const [wrongWords, setWrongWords] = useState([])
  const [feedback, setFeedback] = useState(null)
  
  // 설정
  const [questionCount, setQuestionCount] = useState(10)
  const [quizType, setQuizType] = useState('synonym') 

  // 리포트 State
  const [stats, setStats] = useState({ totalTests: 0, avgScore: 0, history: [] })
  const [frequentWrongs, setFrequentWrongs] = useState([])

  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem('user'))
    if (storedUser) {
      setUser(storedUser)
      fetchGroupSettings(storedUser.group_id)
    }
  }, [])

  const fetchGroupSettings = async (groupId) => {
    const { data } = await supabase.from('groups').select('question_count').eq('id', groupId).single()
    if (data) setQuestionCount(data.question_count)
  }

  useEffect(() => {
    if (activeTab === 'report' && user) fetchStats()
  }, [activeTab])

  const fetchStats = async () => {
    const { data } = await supabase.from('test_results').select('*').eq('user_id', user.id).order('created_at', { ascending: true })
    if (!data || data.length === 0) {
      setStats({ totalTests: 0, avgScore: 0, history: [] })
      setFrequentWrongs([])
      return
    }

    const history = data.slice(-10).map(item => {
      const d = new Date(item.created_at)
      d.setHours(d.getHours() + 9) 
      return { date: `${d.getMonth() + 1}/${d.getDate()}`, score: item.score }
    })

    const recentTestsForAnalysis = data.slice(-20)
    const wrongMap = {}
    recentTestsForAnalysis.forEach(test => {
      if (test.wrong_words) {
        test.wrong_words.forEach(w => {
          const key = `${w.word} (${w.meaning_ko})`
          wrongMap[key] = (wrongMap[key] || 0) + 1
        })
      }
    })
    const sortedWrongs = Object.entries(wrongMap).sort(([, a], [, b]) => b - a).slice(0, 5).map(([word, count]) => ({ word, count }))
    const average = data.length > 0 ? Math.round(data.reduce((acc, curr) => acc + curr.score, 0) / data.length) : 0;

    setStats({ totalTests: data.length, avgScore: average, history })
    setFrequentWrongs(sortedWrongs)
  }

  const startQuiz = async () => {
    if (!user?.group_id) return alert('오류: 그룹 정보가 없습니다.')
    
    const groupInfo = await supabase.from('groups').select('question_count').eq('id', user.group_id).single()
    const limit = groupInfo.data?.question_count || 10

    const { data, error } = await supabase.from('words').select('*').eq('group_id', user.group_id)
    if (error || !data || data.length < 4) return alert('단어가 부족합니다 (최소 4개).')

    const getList = (item) => {
      if (!item) return [];
      if (Array.isArray(item)) return item.map(s => String(s).trim()).filter(Boolean);
      return String(item).split(',').map(s => s.trim()).filter(Boolean);
    };

    const validData = data.filter(w => {
      const synList = getList(w.synonyms);
      const antList = getList(w.antonyms);

      if (quizType === 'synonym') return synList.length >= 3; 
      else if (quizType === 'antonym') return antList.length >= 3; 
      return false;
    })

    if (validData.length < limit) {
      alert(`주의: 출제 조건을 만족하는 단어가 부족하여 ${validData.length}문제만 출제됩니다.\n(해당 유형의 동의어/반의어가 3개 이상인 단어만 출제됨)`)
      if(validData.length === 0) return;
    }

    const shuffled = validData.sort(() => 0.5 - Math.random()).slice(0, limit)
    
    // 🔥 [New] 단어의 한국어 뜻을 찾아주는 헬퍼 함수
    const getMeaning = (wordText) => {
      const found = data.find(w => w.word.toLowerCase() === wordText.toLowerCase());
      return found ? found.meaning_ko : '';
    }

    // 🔥 [Home.jsx 수정 부분]
    const newQuiz = shuffled.map(target => {
      const synList = getList(target.synonyms);
      const antList = getList(target.antonyms);

      let options = [];
      let answer = ''; 
      let relation = ''; 

      if (quizType === 'synonym') {
        const correctOptions = synList.sort(() => 0.5 - Math.random()).slice(0, 3);
        if (antList.length > 0) {
          answer = antList[Math.floor(Math.random() * antList.length)];
          relation = 'antonym';
        } else {
          // 1. 겹치지 않는 랜덤 풀 생성
          let randomPool = data.filter(w => w.id !== target.id && !synList.includes(w.word));
          
          // ✨ [NEW] 2. 대상 단어에 품사(pos)가 있다면, 같은 품사끼리 필터링 시도!
          if (target.pos) {
            const samePosPool = randomPool.filter(w => w.pos === target.pos);
            // 같은 품사를 가진 단어가 존재할 때만 랜덤 풀을 교체 (안전 장치)
            if (samePosPool.length > 0) randomPool = samePosPool; 
          }
          
          answer = randomPool[Math.floor(Math.random() * randomPool.length)].word;
          relation = 'random';
        }
        options = [...correctOptions, answer];
      } 
      else if (quizType === 'antonym') {
        const correctOptions = antList.sort(() => 0.5 - Math.random()).slice(0, 3);
        if (synList.length > 0) {
          answer = synList[Math.floor(Math.random() * synList.length)];
          relation = 'synonym';
        } else {
           let randomPool = data.filter(w => w.id !== target.id && !antList.includes(w.word));
           
           // ✨ [NEW] 품사 필터링
           if (target.pos) {
              const samePosPool = randomPool.filter(w => w.pos === target.pos);
              if (samePosPool.length > 0) randomPool = samePosPool;
           }

           answer = randomPool[Math.floor(Math.random() * randomPool.length)].word;
           relation = 'random';
        }
        options = [...correctOptions, answer];
      }

      let meaning = getMeaning(answer);
      if (!meaning) {
        if (relation === 'antonym') meaning = `제시어 '${target.word}'의 반의어`;
        else if (relation === 'synonym') meaning = `제시어 '${target.word}'의 유의어`;
        else meaning = `제시어와 무관한 단어`;
      }

      return {
        ...target,
        correctAnswerText: answer, 
        correctAnswerMeaning: meaning, 
        options: options.sort(() => 0.5 - Math.random()), 
        question: target.word 
      }
    })

    setQuizList(newQuiz)
    setCurrentIndex(0)
    setScore(0)
    setWrongWords([])
    setFeedback(null)
    setMode('playing')
  }

  const handleAnswer = (selectedOption) => {
    if (feedback) return
    const currentWord = quizList[currentIndex]
    const isCorrect = selectedOption === currentWord.correctAnswerText
    if (isCorrect) setScore(prev => prev + 1)
    else setWrongWords(prev => [...prev, { ...currentWord, yourAnswer: selectedOption, correctAnswer: currentWord.correctAnswerText }])
    
    // 🔥 피드백에 정답과 그 뜻을 함께 저장
    setFeedback({ 
      isCorrect, 
      selected: selectedOption, 
      correct: currentWord.correctAnswerText,
      correctMeaning: currentWord.correctAnswerMeaning 
    })
  }

  const handleNext = async () => {
    setFeedback(null)
    if (currentIndex + 1 < quizList.length) {
      setCurrentIndex(prev => prev + 1)
    } else {
      setMode('result')
      const finalScore = score 
      await supabase.from('test_results').insert({
        user_id: user.id,
        test_type: quizType,
        total_questions: quizList.length,
        correct_answers: finalScore,
        score: (finalScore / quizList.length) * 100,
        wrong_words: wrongWords
      })
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('user')
    window.location.href = '/login'
  }

  const handleShare = () => {
    const link = `${window.location.origin}/report/${user.id}`
    navigator.clipboard.writeText(link)
    alert('성적표 링크가 복사되었습니다!\n부모님께 카톡으로 붙여넣기해서 보내드리세요.')
  }

  if (!user) return <div className="text-white text-center mt-20">로딩 중...</div>

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 pb-24">
      <div className="p-4 flex justify-between items-center bg-slate-800/50 backdrop-blur-md sticky top-0 z-10">
        <div>
          <h2 className="text-lg font-bold text-indigo-400">{user.name}</h2>
          <span className="text-xs text-slate-400">{activeTab === 'quiz' ? '오늘도 화이팅! 🔥' : '나의 학습 기록 📈'}</span>
        </div>
        <button onClick={handleLogout} className="text-slate-400 hover:text-white"><LogOut size={20} /></button>
      </div>

      <div className="max-w-md mx-auto p-4">
        {activeTab === 'quiz' && (
          <>
            {mode === 'menu' && (
              <div className="space-y-6 animate-fade-in mt-4">
                <div className="text-center mb-8">
                  <h1 className="text-6xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-pink-400">
                    Daily Voca
                  </h1>
                  <p className="text-right text-xs text-slate-500 font-serif mt-1 mr-4">
                    by Lasid Cho
                  </p>
                </div>

                <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl space-y-6">
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setQuizType('synonym')} className={`p-4 rounded-xl border flex flex-col items-center gap-2 ${quizType === 'synonym' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-700 border-slate-600 text-slate-400'}`}>
                      <span className="text-2xl">🤝</span><span className="font-bold">유의어</span>
                    </button>
                    <button onClick={() => setQuizType('antonym')} className={`p-4 rounded-xl border flex flex-col items-center gap-2 ${quizType === 'antonym' ? 'bg-pink-600 border-pink-500 text-white' : 'bg-slate-700 border-slate-600 text-slate-400'}`}>
                      <span className="text-2xl">↔️</span><span className="font-bold">반의어</span>
                    </button>
                  </div>
                  <div className="text-center text-slate-500 text-sm">
                    현재 설정된 문제 수: <span className="text-indigo-400 font-bold">{questionCount}문제</span>
                  </div>
                </div>
                <button onClick={startQuiz} className="w-full py-4 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl font-bold text-xl shadow-lg flex items-center justify-center gap-2">
                  <Play fill="currentColor" /> 테스트 시작
                </button>
              </div>
            )}
            
            {mode === 'playing' && quizList[currentIndex] && (
              <div className="space-y-4 mt-4">
                <div className="flex justify-between text-sm text-slate-400 font-mono">
                  <span>Q. {currentIndex + 1} / {quizList.length}</span>
                  <span>SCORE: {score + (feedback?.isCorrect ? 1 : 0)}</span>
                </div>
                <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden mb-4">
                  <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${((currentIndex + 1) / quizList.length) * 100}%` }}></div>
                </div>
                <div className="bg-white/5 backdrop-blur-md p-8 rounded-3xl border border-white/10 text-center shadow-2xl relative">
                  <span className={`inline-block px-4 py-2 rounded-full text-sm font-bold mb-4 shadow-sm ${quizType === 'synonym' ? 'bg-indigo-500/20 text-indigo-300' : 'bg-pink-500/20 text-pink-300'}`}>
                    {quizType === 'synonym' ? '💡 다음 중 유의어에 해당하지 않는 것을 고르시오' : '💡 다음 중 반의어에 해당하지 않는 것을 고르시오'}
                  </span>
                  <h2 className="text-4xl font-black text-white mb-2">{quizList[currentIndex].word}</h2>
                  <div className={`transition-all duration-500 overflow-hidden ${feedback ? 'max-h-20 opacity-100 mt-2' : 'max-h-0 opacity-0'}`}>
                    <p className="text-xl text-yellow-300 font-bold">"{quizList[currentIndex].meaning_ko}"</p>
                  </div>
                  {!feedback && <p className="text-slate-500 text-sm mt-4">?</p>}
                </div>
                
                {feedback && (
                  <div className={`p-4 rounded-xl text-center border animate-fade-in ${feedback.isCorrect ? 'bg-green-500/20 border-green-500/50' : 'bg-red-500/20 border-red-500/50'}`}>
                    {feedback.isCorrect ? <h3 className="text-green-400 font-bold flex justify-center gap-2"><CheckCircle /> 정답!</h3> : 
                    <div>
                      <h3 className="text-red-400 font-bold flex justify-center gap-2"><XCircle /> 땡!</h3>
                      <p className="text-slate-300 mt-1">
                        정답: <span className="text-green-400 font-bold underline">{feedback.correct}</span>
                        {/* 🔥 뜻이 존재하면 단어 옆에 (뜻) 형태로 출력 */}
                        {feedback.correctMeaning && <span className="text-green-300 text-sm ml-1">({feedback.correctMeaning})</span>}
                      </p>
                    </div>}
                  </div>
                )}

                <div className="grid gap-3">
                  {quizList[currentIndex].options.map((option, idx) => {
                    let btnClass = "bg-slate-800 border-slate-700 hover:bg-slate-700"
                    if (feedback) {
                      if (option === feedback.correct) btnClass = "bg-green-600 border-green-500 text-white"
                      else if (option === feedback.selected && !feedback.isCorrect) btnClass = "bg-red-600 border-red-500 text-white"
                      else btnClass = "bg-slate-800 border-slate-700 opacity-50"
                    }
                    return (
                      <button key={idx} onClick={() => handleAnswer(option)} disabled={!!feedback} className={`w-full p-4 rounded-xl text-left transition-all border ${btnClass} flex items-center gap-4`}>
                        <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${feedback ? 'bg-black/20' : 'bg-slate-700'}`}>{String.fromCharCode(65 + idx)}</span>
                        <span className="text-lg font-medium">{option}</span>
                      </button>
                    )
                  })}
                </div>
                
                {feedback && <button onClick={handleNext} className="w-full py-4 mt-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 animate-bounce-short">{currentIndex + 1 === quizList.length ? '결과 보기' : '다음 문제'} <ArrowRight size={20} /></button>}
              </div>
            )}
            
            {mode === 'result' && (
              <div className="text-center space-y-6 mt-10 animate-fade-in">
                <div className="bg-slate-800 p-8 rounded-3xl shadow-2xl border border-slate-700">
                  <h2 className="text-2xl font-bold mb-4 text-slate-300">Test Complete!</h2>
                  <div className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-blue-500 mb-2">{Math.round(((score + (feedback?.isCorrect ? 1 : 0)) / quizList.length) * 100)}점</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => { setMode('menu'); window.location.reload(); }} className="py-4 bg-slate-700 rounded-xl font-bold text-white">홈으로</button>
                  <button onClick={() => { setActiveTab('report'); setMode('menu'); }} className="py-4 bg-indigo-600 rounded-xl font-bold text-white">성적표 보기</button>
                </div>
              </div>
            )}
          </>
        )}

        {/* --- 아래 리포트 영역 --- */}
        {activeTab === 'report' && (
          <div className="space-y-6 animate-fade-in mt-4">
            <div className="flex justify-between items-center">
              <h1 className="text-2xl font-bold flex items-center gap-2"><TrendingUp className="text-pink-400" /> 학습 리포트</h1>
              <button onClick={handleShare} className="px-3 py-2 bg-indigo-600/20 border border-indigo-500/50 rounded-lg text-xs font-bold text-indigo-300 hover:bg-indigo-600 hover:text-white transition flex items-center gap-2">
                <Share2 size={14} /> 공유하기
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-800 p-5 rounded-2xl border border-slate-700"><p className="text-slate-400 text-sm">총 테스트</p><p className="text-3xl font-black text-white">{stats.totalTests}<span className="text-sm font-normal text-slate-500 ml-1">회</span></p></div>
              <div className="bg-slate-800 p-5 rounded-2xl border border-slate-700"><p className="text-slate-400 text-sm">평균 점수</p><p className="text-3xl font-black text-indigo-400">{stats.avgScore}<span className="text-sm font-normal text-slate-500 ml-1">점</span></p></div>
            </div>
            <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-lg">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><BarChart2 size={18} /> 최근 성적 변화 (10회)</h3>
              <div className="h-48 w-full">
                {stats.history.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.history}>
                      <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis hide domain={[0, 100]} />
                      <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }} />
                      <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                        {stats.history.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.score >= 80 ? '#4ade80' : entry.score >= 50 ? '#fbbf24' : '#f87171'} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : <div className="h-full flex items-center justify-center text-slate-500">데이터 없음</div>}
              </div>
            </div>
            <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700">
              <h3 className="text-lg font-bold mb-4 text-red-400">🔥 자주 틀리는 단어 Top 5 (최근 20회)</h3>
              {frequentWrongs.length > 0 ? (
                <div className="space-y-3">{frequentWrongs.map((item, idx) => <div key={idx} className="flex justify-between items-center bg-slate-900/50 p-3 rounded-lg border border-slate-700/50"><span className="text-white font-medium">{idx+1}. {item.word}</span><span className="text-xs bg-red-500/20 text-red-300 px-2 py-1 rounded-full">{item.count}회 오답</span></div>)}</div>
              ) : <p className="text-slate-500 text-sm">깨끗합니다! 👍</p>}
            </div>
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 w-full bg-slate-800/90 backdrop-blur-lg border-t border-slate-700 p-2 safe-area-pb z-20">
        <div className="max-w-md mx-auto grid grid-cols-2 gap-2">
          <button onClick={() => { setActiveTab('quiz'); setMode('menu'); }} className={`p-3 rounded-xl flex flex-col items-center gap-1 transition-all ${activeTab === 'quiz' ? 'text-indigo-400 bg-white/5' : 'text-slate-500 hover:text-slate-300'}`}><HomeIcon size={24} /><span className="text-xs font-bold">홈</span></button>
          <button onClick={() => setActiveTab('report')} className={`p-3 rounded-xl flex flex-col items-center gap-1 transition-all ${activeTab === 'report' ? 'text-pink-400 bg-white/5' : 'text-slate-500 hover:text-slate-300'}`}><BarChart2 size={24} /><span className="text-xs font-bold">리포트</span></button>
        </div>
      </div>
    </div>
  )
}