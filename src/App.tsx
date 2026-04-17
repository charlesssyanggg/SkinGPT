/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Camera, 
  MessageSquare, 
  FlaskConical, 
  History as HistoryIcon, 
  Image as ImageIcon,
  ChevronLeft, 
  Loader2, 
  User, 
  CheckCircle2, 
  AlertCircle,
  ArrowRight,
  Sun,
  Moon,
  Send,
  TrendingUp,
  TrendingDown,
  Minus,
  Calendar,
  Sparkles,
  Mail,
  Lock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Card, Button, cn } from './components/UI';
import SkinRadarChart from './components/SkinRadarChart';
import SkinTrendChart from './components/SkinTrendChart';
import { analyzeSkin, analyzeIngredients, consultAI, type SkinAnalysisResult } from './services/geminiService';
import Markdown from 'react-markdown';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  onAuthStateChanged, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  collection, 
  addDoc, 
  query, 
  orderBy, 
  limit, 
  onSnapshot, 
  doc, 
  getDocs, 
  type User as FirebaseUser 
} from './firebase';

type Page = 'home' | 'detection' | 'result' | 'consultation' | 'ingredients' | 'loading' | 'products' | 'login' | 'history' | 'trend_detail';

// Error Boundary for better UX
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen flex flex-col items-center justify-center p-6 text-center bg-bg-gray">
          <AlertCircle size={48} className="text-red-500 mb-4" />
          <h2 className="text-xl font-bold mb-2">出错了</h2>
          <p className="text-slate-500 mb-6">应用程序遇到意外错误，请尝试重新加载。</p>
          <Button onClick={() => window.location.reload()}>重新加载</Button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [currentPage, setCurrentPage] = useState<Page>('login');
  const [prevPage, setPrevPage] = useState<Page | null>(null);
  const [analysisResult, setAnalysisResult] = useState<SkinAnalysisResult | null>(null);
  const [history, setHistory] = useState<(SkinAnalysisResult & { id: string; date: string })[]>([]);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  const [ingredientsResult, setIngredientsResult] = useState<any>(null);
  const [ingredientsInput, setIngredientsInput] = useState("");
  
  // Auth state for email/password
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const resizeImage = (dataUrl: string, maxDimension: number = 800): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDimension) {
            height *= maxDimension / width;
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width *= maxDimension / height;
            height = maxDimension;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.8)); // 0.8 quality for smaller size
      };
      img.src = dataUrl;
    });
  };

  const handleFirestoreError = (error: unknown, operation: string, path: string | null) => {
    const errInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: auth.currentUser?.uid || 'anonymous',
        email: auth.currentUser?.email || 'N/A',
        emailVerified: auth.currentUser?.emailVerified || false,
        isAnonymous: auth.currentUser?.isAnonymous || false,
        tenantId: auth.currentUser?.tenantId || null,
        providerInfo: auth.currentUser?.providerData.map(provider => ({
          providerId: provider.providerId,
          displayName: provider.displayName || '',
          email: provider.email || '',
          photoUrl: provider.photoURL || ''
        })) || []
      },
      operationType: operation.toLowerCase(),
      path
    };
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    throw new Error(JSON.stringify(errInfo));
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
      if (u) {
        if (currentPage === 'login') setCurrentPage('home');
      } else {
        setCurrentPage('login');
      }
    });
    return () => unsubscribe();
  }, [currentPage]);

  useEffect(() => {
    if (!user) {
      setHistory([]);
      return;
    }

    const path = `users/${user.uid}/skin_history`;
    const q = query(
      collection(db, path),
      orderBy('timestamp', 'desc'),
      limit(10)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data().result,
        date: doc.data().timestamp
      }));
      setHistory(data);
    }, (error) => {
      handleFirestoreError(error, 'LIST', path);
    });

    return () => unsubscribe();
  }, [user]);

  const handleLogin = async () => {
    try {
      setAuthError(null);
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error("Login failed", err);
      setAuthError("Google 登录失败，请稍后重试。");
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    
    setAuthError(null);
    try {
      if (isRegistering) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      console.error("Email auth failed", err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setAuthError("邮箱或密码错误");
      } else if (err.code === 'auth/email-already-in-use') {
        setAuthError("该邮箱已被注册");
      } else if (err.code === 'auth/weak-password') {
        setAuthError("密码强度不足（至少6位）");
      } else {
        setAuthError("身份验证失败，请检查网络或输入格式");
      }
    }
  };

  const handleLogout = () => {
    auth.signOut();
  };

  const saveToHistory = async (result: SkinAnalysisResult) => {
    if (!user) return;
    const path = `users/${user.uid}/skin_history`;
    try {
      await addDoc(collection(db, path), {
        userId: user.uid,
        timestamp: new Date().toISOString(),
        result: result
      });
    } catch (err) {
      handleFirestoreError(err, 'CREATE', path);
    }
  };

  const getTrends = () => {
    if (history.length < 2) return null;
    
    const chartData = history.slice(0, 7).map(h => ({
      date: h.date,
      moisture: h.radarData.find(d => d.name === '水分')?.value || 0,
      oil: h.radarData.find(d => d.name === '油分')?.value || 0,
      sensitivity: h.radarData.find(d => d.name === '敏感度')?.value || 0,
      overall: h.overallScore
    }));

    const latest = history[0];
    const previous = history[1];
    const findVal = (data: any[], name: string) => data.find(d => d.name === name)?.value || 0;

    return {
      chartData,
      moisture: findVal(latest.radarData, '水分') - findVal(previous.radarData, '水分'),
      sensitivity: findVal(latest.radarData, '敏感度') - findVal(previous.radarData, '敏感度'),
      acne: latest.riskLevels.acne === previous.riskLevels.acne ? 0 : (latest.riskLevels.acne === '高风险' ? 1 : -1)
    };
  };

  const navigateTo = (page: Page) => {
    setPrevPage(currentPage);
    setCurrentPage(page);
  };

  const goBack = () => {
    if (prevPage) {
      setCurrentPage(prevPage);
      setPrevPage(null);
    } else {
      setCurrentPage('home');
    }
  };

  // --- Page Components ---

  const Home = () => {
    const trends = getTrends();
    const latestResult = history[0];

    return (
      <div className="flex flex-col gap-6 p-6 min-h-screen bg-bg-gray">
        <header className="pt-10 pb-6 flex justify-between items-start">
          <div>
            <motion.h1 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-[28px] font-display font-extrabold text-brand tracking-tight"
            >
              SkinGPT
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-text-secondary mt-1 text-sm"
            >
              你的AI皮肤健康管家
            </motion.p>
          </div>
          <div className="w-10 h-10 bg-white rounded-full border border-slate-100 flex items-center justify-center text-slate-400 overflow-hidden" onClick={handleLogout}>
            {user?.photoURL ? <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" /> : <User size={20} />}
          </div>
        </header>

        {/* --- Trends Section --- */}
        {latestResult && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
            <Card 
              onClick={() => navigateTo('trend_detail')}
              className="border-none bg-gradient-to-br from-brand to-brand/80 text-white p-5 shadow-lg overflow-hidden relative cursor-pointer active:scale-[0.99] transition-transform"
            >
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <HistoryIcon size={80} />
              </div>
              <h3 className="text-sm font-bold flex items-center justify-between opacity-90 mb-2">
                <div className="flex items-center gap-2">
                  <TrendingUp size={16} /> 过去7天趋势监控
                </div>
                <ArrowRight size={14} />
              </h3>
              
              {trends?.chartData && trends.chartData.length >= 2 ? (
                <div className="pointer-events-none">
                  <SkinTrendChart data={trends.chartData} />
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-4 mt-4">
                  <TrendItem 
                    label="水分" 
                    value={latestResult.radarData.find(d => d.name === '水分')?.value || 0} 
                    trend={trends?.moisture} 
                  />
                  <TrendItem 
                    label="敏感" 
                    value={latestResult.radarData.find(d => d.name === '敏感度')?.value || 0} 
                    trend={trends?.sensitivity} 
                    inverse 
                  />
                  <TrendItem 
                    label="瑕疵" 
                    value={latestResult.problems.length} 
                    trend={trends ? (latestResult.problems.length - (history[1]?.problems.length || 0)) : undefined} 
                    inverse
                  />
                </div>
              )}
              
              <p className="text-[10px] opacity-60 mt-4 text-center">点击查看详情数据分析</p>
            </Card>
          </motion.div>
        )}

        <div className="grid gap-4">
          <Card onClick={() => navigateTo('detection')} className="flex items-center gap-4 border-none shadow-sm active:scale-[0.98] transition-transform">
            <div className="w-12 h-12 bg-brand-light rounded-xl flex items-center justify-center text-brand">
              <Camera size={24} />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-[16px]">拍照检测</h3>
              <p className="text-xs text-text-secondary">一键分析趋势与周期方案</p>
            </div>
            <ArrowRight size={16} className="text-slate-200" />
          </Card>

          <div className="grid grid-cols-2 gap-4">
            <Card onClick={() => navigateTo('consultation')} className="flex flex-col gap-3 border-none shadow-sm active:scale-[0.98] transition-transform">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-500">
                <MessageSquare size={20} />
              </div>
              <div>
                <h3 className="font-bold text-[14px]">AI问诊</h3>
                <p className="text-[10px] text-text-secondary">专家建议</p>
              </div>
            </Card>
            <Card onClick={() => navigateTo('ingredients')} className="flex flex-col gap-3 border-none shadow-sm active:scale-[0.98] transition-transform">
              <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center text-green-500">
                <FlaskConical size={20} />
              </div>
              <div>
                <h3 className="font-bold text-[14px]">成分分析</h3>
                <p className="text-[10px] text-text-secondary">揭秘配方</p>
              </div>
            </Card>
          </div>
        </div>

        {/* --- Active Plan Summary --- */}
        {latestResult && latestResult.weeklyPlan && (
          <Card className="border-none bg-white p-5 shadow-sm">
            <h3 className="text-[14px] font-bold text-slate-800 mb-3 flex items-center gap-2">
              <Calendar size={18} className="text-brand" /> 当前护肤周期: {latestResult.weeklyPlan.title || '定制方案'}
            </h3>
            <div className="flex items-center gap-4">
              <div className="flex-1 space-y-1">
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-brand w-1/3" />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 font-medium">
                  <span>第 1 天</span>
                  <span>第 7 天</span>
                </div>
              </div>
              <Button onClick={() => { setAnalysisResult(latestResult); navigateTo('result'); }} className="h-8 px-3 py-0 text-[11px] min-h-0">
                查看方案
              </Button>
            </div>
          </Card>
        )}

        <div className="mt-4 flex flex-col items-center">
          <div className="flex items-center gap-4 text-slate-300 text-sm font-medium">
            <span onClick={() => navigateTo('history')} className="cursor-pointer hover:text-brand transition-colors text-slate-500">历史分析报告</span>
            <span className="w-px h-3 bg-slate-300" />
            <span onClick={() => navigateTo('products')} className="cursor-pointer hover:text-brand transition-colors text-slate-500">产品专区</span>
          </div>
        </div>
        
        <footer className="mt-auto py-8 text-center text-[10px] text-slate-400">
          SkinGPT 构建的长期皮肤健康管理系统
        </footer>
      </div>
    );
  };

  const TrendItem = ({ label, value, trend, inverse = false }: { label: string; value: number | string; trend?: number; inverse?: boolean }) => {
    let Icon = Minus;
    let color = 'text-white/60';
    
    if (trend && trend > 0) {
      Icon = TrendingUp;
      color = inverse ? 'text-red-300' : 'text-green-300';
    } else if (trend && trend < 0) {
      Icon = TrendingDown;
      color = inverse ? 'text-green-300' : 'text-red-300';
    }

    return (
      <div className="text-center">
        <p className="text-[11px] opacity-70 mb-1">{label}</p>
        <div className="flex items-center justify-center gap-1">
          <span className="text-lg font-bold">{value}</span>
          <Icon size={14} className={color} />
        </div>
      </div>
    );
  };

  const Detection = () => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isStreamOn, setIsStreamOn] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [tempPreview, setTempPreview] = useState<string | null>(null);

    useEffect(() => {
      let currentStream: MediaStream | null = null;
      async function startCamera() {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            currentStream = stream;
            setIsStreamOn(true);
          }
        } catch (err) {
          console.error("Camera access denied", err);
          setError("无法访问摄像头，请尝试上传照片");
        }
      }
      startCamera();
      return () => {
        if (currentStream) {
          currentStream.getTracks().forEach(track => track.stop());
        }
      };
    }, []);

    const handleImageCaptured = async (dataUrl: string) => {
      const resizedDataUrl = await resizeImage(dataUrl);
      setTempPreview(resizedDataUrl);
    };

    const confirmAnalysis = async () => {
      if (!tempPreview) return;
      
      setCapturedImage(tempPreview);
      setIsLoading(true);
      setLoadingText("AI正在分析你的皮肤状态...");
      setCurrentPage('loading');
      
      try {
        const result = await analyzeSkin(tempPreview, history[0]);
        setAnalysisResult(result);
        saveToHistory(result);
        navigateTo('result');
      } catch (err: any) {
        console.error(err);
        setLoadingText("分析失败: " + (err.message || "未知错误"));
        setTimeout(() => navigateTo('home'), 2000);
      } finally {
        setIsLoading(false);
      }
    };

    const takePhoto = () => {
      if (canvasRef.current && videoRef.current) {
        const context = canvasRef.current.getContext('2d');
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context?.drawImage(videoRef.current, 0, 0);
        const dataUrl = canvasRef.current.toDataURL('image/jpeg');
        handleImageCaptured(dataUrl);
      }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result) {
            handleImageCaptured(event.target.result as string);
          }
        };
        reader.readAsDataURL(file);
      }
    };

    return (
      <div className="flex flex-col h-screen bg-black">
        <div className="p-4 flex items-center justify-between bg-black/50 backdrop-blur-sm z-10 absolute top-0 w-full text-white">
          <button onClick={goBack}><ChevronLeft /></button>
          <span className="font-medium">拍照检测</span>
          <div className="w-6" />
        </div>

        <div className="flex-1 relative overflow-hidden flex items-center justify-center">
          {!tempPreview ? (
            <>
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted 
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                {/* Guide Circle */}
                <div className="w-72 h-72 border-2 border-brand/50 rounded-full border-dashed animate-pulse flex items-center justify-center">
                  <div className="w-64 h-64 border-2 border-white/80 rounded-full border-dashed" />
                </div>
                <p className="text-white/80 text-sm mt-8 font-medium">请在自然光下拍摄面部</p>
              </div>
            </>
          ) : (
            <div className="w-full h-full relative">
              <img 
                src={tempPreview} 
                alt="Preview" 
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/20 pointer-events-none" />
              <div className="absolute bottom-10 left-0 right-0 p-6 flex flex-col gap-4 text-center">
                 <p className="text-white text-lg font-bold drop-shadow-md">照片清晰吗？</p>
              </div>
            </div>
          )}
        </div>

        <canvas ref={canvasRef} className="hidden" />
        <input 
          type="file" 
          ref={fileInputRef} 
          accept="image/*" 
          onChange={handleFileUpload} 
          className="hidden" 
        />

        <div className="p-10 bg-black flex flex-col items-center gap-6">
          {!tempPreview ? (
            <>
              {error && <p className="text-red-400 text-[10px] mb-2">{error}</p>}
              <div className="flex items-center gap-8">
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center text-white active:scale-95 transition-transform"
                >
                  <ImageIcon size={20} />
                </button>
                <button 
                  onClick={takePhoto}
                  className="w-20 h-20 bg-white rounded-full flex items-center justify-center p-1 border-4 border-white/20 active:scale-95 transition-transform"
                >
                  <div className="w-full h-full bg-brand rounded-full flex items-center justify-center text-white">
                    <Camera size={32} />
                  </div>
                </button>
                <div className="w-12 h-12" /> {/* Spacer */}
              </div>
              <p className="text-slate-400 text-xs">点击按钮拍摄 或 选择照片</p>
            </>
          ) : (
            <div className="flex gap-4 w-full max-w-[280px]">
              <Button 
                variant="ghost"
                onClick={() => setTempPreview(null)}
                className="flex-1 border border-white/20 text-white bg-white/5 hover:bg-white/10 h-14 rounded-2xl"
              >
                重新拍摄
              </Button>
              <Button 
                onClick={confirmAnalysis}
                className="flex-1 h-14 rounded-2xl"
              >
                开始分析
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const Result = () => {
    if (!analysisResult) return null;

    const getRiskColor = (level: string) => {
      const l = level.toLowerCase();
      if (l.includes('高') || l.includes('high')) return 'text-risk-high';
      if (l.includes('中') || l.includes('medium') || l.includes('mid')) return 'text-risk-mid';
      return 'text-risk-low';
    };

    const getRiskLabel = (level: string) => {
      const l = level.toLowerCase();
      if (l.includes('高') || l.includes('high')) return '高风险';
      if (l.includes('中') || l.includes('medium') || l.includes('mid')) return '中等风险';
      return '安全';
    };

    return (
      <div className="flex flex-col min-h-screen bg-bg-gray pb-20">
        <header className="sticky top-0 glass-panel p-4 flex items-center justify-between z-20">
          <div className="flex items-center gap-4">
            <button onClick={() => navigateTo('home')}><ChevronLeft /></button>
            <h2 className="font-bold text-[18px]">皮肤分析报告</h2>
          </div>
          <div className="flex items-center gap-1.5 bg-brand/10 px-3 py-1 rounded-full">
            <span className="text-[10px] font-bold text-brand">AI 已深度扫描</span>
            <CheckCircle2 size={12} className="text-brand" />
          </div>
        </header>

        <div className="p-6 space-y-6">
          {/* --- Score & Age Section --- */}
          <section className="flex items-center justify-between bg-white rounded-3xl p-6 shadow-sm border border-slate-50">
            <div className="flex flex-col">
              <span className="text-[12px] text-slate-400 font-medium">综合评分</span>
              <div className="flex items-baseline gap-1">
                <h3 className="text-[42px] font-display font-black text-brand leading-none">
                  {analysisResult.overallScore || 0}
                </h3>
                <span className="text-brand/60 text-sm font-bold">PT</span>
              </div>
            </div>
            
            <div className="h-12 w-px bg-slate-100" />

            <div className="flex flex-col items-end">
              <span className="text-[12px] text-slate-400 font-medium">视觉肌龄</span>
              <div className="flex items-baseline gap-1">
                <h3 className="text-[28px] font-display font-bold text-slate-800 leading-none">
                  {analysisResult.skinAge || 0}
                </h3>
                <span className="text-slate-400 text-xs font-bold">岁</span>
              </div>
            </div>
          </section>

          {/* --- Change Analysis (Causal Logic) --- */}
          {analysisResult.changeAnalysis && analysisResult.changeAnalysis.length > 0 && (
            <section className="bg-brand/5 rounded-2xl p-4 border border-brand/10">
              <h4 className="text-[13px] font-bold text-brand mb-3 flex items-center gap-2">
                <TrendingUp size={16} /> 肤质动态分析 (因果逻辑)
              </h4>
              <div className="space-y-4">
                {analysisResult.changeAnalysis.map((change, i) => (
                  <div key={i} className="bg-white/50 p-3 rounded-xl">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[12px] font-bold text-slate-700">{change.metric}</span>
                      <div className="flex items-center gap-2 text-[12px]">
                        <span className="text-slate-400 line-through">{change.previousValue}</span>
                        <ArrowRight size={10} className="text-slate-300" />
                        <span className={cn(
                          "font-bold",
                          change.currentValue > change.previousValue ? "text-green-500" : "text-red-500"
                        )}>{change.currentValue}</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] text-slate-600 bg-brand/5 p-2 rounded-lg border border-brand/5">
                        <span className="font-bold text-brand">原因：</span>{change.reason}
                      </p>
                      <p className="text-[11px] text-brand font-medium pl-2 italic">
                        {change.conclusion}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="text-center pt-2">
             <p className="text-text-secondary text-sm mb-1 font-medium">检测肤质</p>
             <h3 className="text-[24px] font-display font-extrabold text-brand leading-tight">
               {analysisResult.skinType}
             </h3>
             <SkinRadarChart data={analysisResult.radarData || []} />
          </div>

          <section>
            <h4 className="text-[14px] font-bold mb-3 flex items-center gap-2 text-slate-700">
               <TrendingUp size={16} className="text-brand" /> 重点关注问题
            </h4>
            <div className="tag-group flex flex-wrap gap-2">
              {(analysisResult.problems || []).map((p, i) => (
                <span key={p} className={cn(i % 2 === 0 ? "tag-red" : "tag-yellow")}>
                  {p}
                </span>
              ))}
            </div>
          </section>

          {/* --- Detailed Dimensions Section --- */}
          {analysisResult.detailedDimensions && analysisResult.detailedDimensions.length > 0 && (
            <section className="grid grid-cols-2 gap-4">
              {(analysisResult.detailedDimensions || []).map((dim, i) => (
                <div key={i} className="bg-white p-4 rounded-2xl border border-slate-50 shadow-sm flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[12px] font-bold text-slate-600">{dim.name}</span>
                    <span className={cn(
                      "text-[14px] font-black",
                      (dim.value || 0) > 80 ? "text-green-500" : (dim.value || 0) > 50 ? "text-yellow-500" : "text-red-500"
                    )}>{dim.value || 0}</span>
                  </div>
                  <div className="w-full h-1 bg-slate-50 rounded-full mt-2 overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${dim.value || 0}%` }}
                      className={cn(
                        "h-full rounded-full",
                        (dim.value || 0) > 80 ? "bg-green-500" : (dim.value || 0) > 50 ? "bg-yellow-500" : "bg-red-500"
                      )}
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2 leading-tight">{dim.description}</p>
                </div>
              ))}
            </section>
          )}

          <section className="space-y-1 bg-white rounded-2xl p-2 border border-slate-50 shadow-sm">
            <div className="flex justify-between items-center p-3 border-b border-slate-50">
              <span className="text-[13px] text-slate-600 font-medium">敏感风险</span>
              <span className={cn("text-[12px] font-bold", getRiskColor(analysisResult.riskLevels?.sensitivity || ""))}>
                {getRiskLabel(analysisResult.riskLevels?.sensitivity || "")}
              </span>
            </div>
            <div className="flex justify-between items-center p-3 border-b border-slate-50">
              <span className="text-[13px] text-slate-600 font-medium">痤疮风险</span>
              <span className={cn("text-[12px] font-bold", getRiskColor(analysisResult.riskLevels?.acne || ""))}>
                {getRiskLabel(analysisResult.riskLevels?.acne || "")}
              </span>
            </div>
            {analysisResult.riskLevels?.uvDamage && (
              <div className="flex justify-between items-center p-3 border-b border-slate-50">
                <span className="text-[13px] text-slate-600 font-medium">光老化风险</span>
                <span className={cn("text-[12px] font-bold", getRiskColor(analysisResult.riskLevels.uvDamage))}>
                  {getRiskLabel(analysisResult.riskLevels.uvDamage)}
                </span>
              </div>
            )}
             {analysisResult.riskLevels?.aging && (
              <div className="flex justify-between items-center p-3">
                <span className="text-[13px] text-slate-600 font-medium">细纹/老化</span>
                <span className={cn("text-[12px] font-bold", getRiskColor(analysisResult.riskLevels.aging))}>
                  {getRiskLabel(analysisResult.riskLevels.aging)}
                </span>
              </div>
            )}
          </section>

          <section>
            <div className="bg-[#F8FAFC] rounded-xl p-5 border border-slate-100 shadow-sm">
              <h4 className="text-[14px] font-bold mb-4 flex items-center gap-2 text-brand">
                <Calendar size={18} /> 专属 7 天管理方案
              </h4>
              <p className="text-[11px] text-slate-500 mb-4 font-medium italic">“不仅是建议，更是你的 AI 医生私人管家”</p>
              
              <div className="space-y-6">
                {(analysisResult.weeklyPlan?.phases || []).map((phase, idx) => (
                  <div key={idx} className="relative pl-6 border-l-2 border-brand/10">
                    <div className="absolute left-[-9px] top-0 w-4 h-4 rounded-full bg-brand flex items-center justify-center shadow-lg">
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                    </div>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[13px] font-bold text-slate-800">{phase.days}</span>
                      <span className="tag-green !text-[10px]">{phase.focus}</span>
                    </div>
                    <div className="grid gap-2">
                      {(phase.steps || []).map((step, sidx) => (
                        <div key={sidx} className="bg-white/60 p-3 rounded-lg text-[12px] text-slate-600 border border-slate-100/50 flex items-start gap-2">
                          <CheckCircle2 size={14} className="text-brand shrink-0 mt-0.5" />
                          {step}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 pt-5 border-t border-slate-100">
                <h5 className="text-[12px] font-bold text-slate-700 mb-3">📍 基础日流程 (AM & PM)</h5>
                <div className="flex gap-4">
                  <div className="flex-1 bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                    <p className="text-[11px] font-bold text-brand mb-2 flex items-center gap-1"><Sun size={12} /> 早</p>
                    <div className="text-[10px] text-slate-500 leading-relaxed">{(analysisResult.routine?.morning || []).join(' → ')}</div>
                  </div>
                  <div className="flex-1 bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                    <p className="text-[11px] font-bold text-slate-700 mb-2 flex items-center gap-1"><Moon size={12} /> 晚</p>
                    <div className="text-[10px] text-slate-500 leading-relaxed">{(analysisResult.routine?.evening || []).join(' → ')}</div>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100">
                <h5 className="text-[12px] font-bold text-brand mb-2 italic">厚海锐膜 · 深度推荐</h5>
                <Card 
                  onClick={() => navigateTo('products')}
                  className="p-3 bg-white border border-brand/5 shadow-sm flex items-center gap-3 active:scale-[0.98] transition-transform"
                >
                  <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                    <FlaskConical className="text-brand" size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold truncate text-slate-800">重组胶原蛋白旗舰系列面膜</p>
                    <p className="text-[10px] text-brand/70 font-medium">60秒速溶 · 真皮层直达修护</p>
                  </div>
                  <ArrowRight size={14} className="text-brand shrink-0" />
                </Card>
              </div>
            </div>
          </section>

          <div className="p-4 pt-10 text-center relative">
            <div className="text-[10px] text-slate-400">本结果由AI辅助生成，仅供参考</div>
          </div>
        </div>
      </div>
    );
  };

  const Consultation = () => {
    const [messages, setMessages] = useState<{ role: 'ai' | 'user'; content: string }[]>([
      { role: 'ai', content: '### 你好！我是你的皮肤助手。\n请描述你的皮肤问题或关心的话题。' }
    ]);
    const [input, setInput] = useState("");
    const [isSending, setIsSending] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async () => {
      if (!input.trim() || isSending) return;
      
      const userMsg = input;
      setInput("");
      setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
      setIsSending(true);

      try {
        const aiMsg = await consultAI(userMsg, messages.map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content })));
        setMessages(prev => [...prev, { role: 'ai', content: aiMsg }]);
      } catch (err) {
        setMessages(prev => [...prev, { role: 'ai', content: '抱歉，我现在无法回答，请稍后再试。' }]);
      } finally {
        setIsSending(false);
      }
    };

    return (
      <div className="flex flex-col h-screen bg-bg-gray">
        <header className="glass-panel p-4 flex items-center gap-4 z-20">
          <button onClick={goBack}><ChevronLeft /></button>
          <h2 className="font-bold text-lg">AI问诊</h2>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === 'user' ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[85%] p-4 rounded-2xl shadow-sm",
                m.role === 'user' ? "bg-brand text-white rounded-tr-none" : "bg-white text-slate-800 rounded-tl-none border border-slate-100"
              )}>
                <div className="markdown-body text-sm leading-relaxed prose prose-slate max-w-none">
                  <Markdown>{m.content}</Markdown>
                </div>
              </div>
            </div>
          ))}
          {isSending && (
            <div className="flex justify-start">
              <div className="bg-white p-4 rounded-2xl rounded-tl-none shadow-sm border border-slate-100 flex items-center gap-2">
                <Loader2 size={16} className="animate-spin text-brand" />
                <span className="text-xs text-slate-400 font-medium">SkinGPT正在思考...</span>
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>

        <div className="p-4 bg-white border-t border-slate-100 safe-area-bottom">
          <div className="flex gap-2">
            <input 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="描述您的皮肤问题..."
              className="flex-1 bg-slate-100 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-brand outline-none"
            />
            <Button onClick={handleSend} disabled={!input} className="px-4 py-3 rounded-xl h-auto">
              <Send size={18} />
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const Ingredients = () => {
    const [isThinking, setIsThinking] = useState(false);
    const [isScanning, setIsScanning] = useState(false);
    const [scanPreview, setScanPreview] = useState<string | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleAnalyze = async (imageData?: string) => {
      setIsThinking(true);
      if (imageData) {
        setLoadingText("AI正在识别配料表并进行分析...");
        setCurrentPage('loading');
      }
      
      try {
        const res = await analyzeIngredients(ingredientsInput, imageData);
        setIngredientsResult(res);
        if (imageData) {
          // Save ingredients analysis to history
          if (user) {
            const path = `users/${user.uid}/ingredient_history`;
            await addDoc(collection(db, path), {
              userId: user.uid,
              timestamp: new Date().toISOString(),
              ingredients: ingredientsInput || "图像分析",
              result: res
            });
          }
          navigateTo('ingredients');
        }
      } catch (err) {
        console.error(err);
        if (imageData) {
          setLoadingText("识别失败，请重试或手动输入");
          setTimeout(() => navigateTo('ingredients'), 2000);
        }
      } finally {
        setIsThinking(false);
        setIsLoading(false);
        setScanPreview(null);
        setIsScanning(false);
      }
    };

    const startCamera = async () => {
      setIsScanning(true);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error(err);
        setIsScanning(false);
        alert("无法启动摄像头");
      }
    };

    const stopCamera = () => {
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
      }
      setIsScanning(false);
    };

    const captureScan = () => {
      if (canvasRef.current && videoRef.current) {
        const context = canvasRef.current.getContext('2d');
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context?.drawImage(videoRef.current, 0, 0);
        const dataUrl = canvasRef.current.toDataURL('image/jpeg');
        setScanPreview(dataUrl);
        stopCamera();
      }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result) {
            setScanPreview(event.target.result as string);
          }
        };
        reader.readAsDataURL(file);
      }
    };

    const handleConfimScan = () => {
      if (scanPreview) {
        handleAnalyze(scanPreview);
      }
    };

    return (
      <div className="flex flex-col min-h-screen bg-bg-gray">
        <header className="glass-panel p-4 flex items-center gap-4 z-20">
          <button onClick={() => { stopCamera(); goBack(); }}><ChevronLeft /></button>
          <h2 className="font-bold text-lg">成分分析</h2>
        </header>

        <div className="p-6 space-y-6">
          <section>
            <div className="flex justify-between items-center mb-3">
              <h4 className="font-bold text-slate-800">请输入或拍摄成分表</h4>
              <div className="flex gap-2">
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 bg-white rounded-lg border border-slate-200 text-slate-600 active:scale-95 transition-transform"
                >
                  <ImageIcon size={18} />
                </button>
                <button 
                  onClick={startCamera}
                  className="p-2 bg-brand text-white rounded-lg active:scale-95 transition-transform"
                >
                  <Camera size={18} />
                </button>
              </div>
            </div>
            
            <input 
              type="file" 
              ref={fileInputRef} 
              accept="image/*" 
              onChange={handleFileUpload} 
              className="hidden" 
            />

            {isScanning && (
              <div className="fixed inset-0 z-50 bg-black flex flex-col">
                <div className="p-4 flex justify-between text-white">
                  <button onClick={stopCamera}><ChevronLeft /></button>
                  <span>拍摄配料表</span>
                  <div className="w-6" />
                </div>
                <div className="flex-1 flex items-center justify-center p-6">
                  <video ref={videoRef} autoPlay playsInline className="w-full max-h-full object-contain rounded-xl" />
                </div>
                <div className="p-10 flex flex-col items-center gap-4">
                  <button 
                    onClick={captureScan}
                    className="w-16 h-16 bg-white rounded-full p-1 border-4 border-white/20"
                  >
                    <div className="w-full h-full bg-brand rounded-full items-center justify-center flex text-white">
                      <Camera size={24} />
                    </div>
                  </button>
                  <p className="text-white/60 text-xs">请确保文字清晰且对焦准确</p>
                </div>
              </div>
            )}

            {scanPreview && (
              <div className="fixed inset-0 z-50 bg-black flex flex-col">
                <div className="p-4 flex items-center justify-between text-white">
                  <button onClick={() => setScanPreview(null)}><ChevronLeft /></button>
                  <span>确认照片</span>
                  <div className="w-6" />
                </div>
                <div className="flex-1 flex items-center justify-center p-6">
                  <img src={scanPreview} alt="Scan Preview" className="max-w-full max-h-full object-contain rounded-xl" />
                </div>
                <div className="p-10 flex gap-4 w-full">
                  <Button variant="ghost" onClick={() => setScanPreview(null)} className="flex-1 border border-white/20 text-white">
                    重拍
                  </Button>
                  <Button onClick={handleConfimScan} className="flex-1">
                    开始识别
                  </Button>
                </div>
              </div>
            )}

            <div className="relative">
              <textarea 
                value={ingredientsInput}
                onChange={(e) => setIngredientsInput(e.target.value)}
                placeholder="例如：水、甘油、丁二醇、烟酰胺..."
                className="w-full h-32 bg-white rounded-2xl p-4 text-sm border border-slate-200 outline-none focus:ring-2 focus:ring-brand shadow-sm resize-none"
              />
            </div>
            <Button 
              onClick={() => handleAnalyze()} 
              isLoading={isThinking} 
              disabled={!ingredientsInput && !scanPreview}
              className="w-full mt-4 shadow-md"
            >
              开始分析
            </Button>
          </section>

          <canvas ref={canvasRef} className="hidden" />

          <AnimatePresence>
            {ingredientsResult && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <div className="bg-brand/5 rounded-2xl p-4 border border-brand/20">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-bold text-slate-800">🔍 分析结果</h4>
                    {ingredientsResult.safetyRating && (
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-bold text-slate-500">安全得分:</span>
                        <span className="text-lg font-bold text-brand">{ingredientsResult.safetyRating}/10</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div>
                      <h5 className="text-xs font-bold text-risk-high uppercase tracking-wider mb-2 flex items-center gap-1">
                        <AlertCircle size={14} /> 风险成分
                      </h5>
                      <div className="space-y-2">
                        {(ingredientsResult.riskIngredients || []).map((ing: any, i: number) => (
                          <div key={i} className="bg-white/50 p-2 rounded-lg text-sm">
                            <span className="font-bold text-risk-high">❌ {ing.name}</span>
                            <p className="text-xs text-slate-500 mt-1">{ing.reason}</p>
                          </div>
                        ))}
                        {(ingredientsResult.riskIngredients || []).length === 0 && <p className="text-xs text-slate-400">未检测到高风险成分</p>}
                      </div>
                    </div>

                    <div>
                      <h5 className="text-xs font-bold text-risk-low uppercase tracking-wider mb-2 flex items-center gap-1">
                        <CheckCircle2 size={14} /> 安全/有效成分
                      </h5>
                      <div className="space-y-2">
                        {(ingredientsResult.safeIngredients || []).map((ing: any, i: number) => (
                          <div key={i} className="bg-white/50 p-2 rounded-lg text-sm">
                            <span className="font-bold text-brand">✅ {ing.name}</span>
                            <p className="text-xs text-slate-500 mt-1">{ing.benefit}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="pt-4 border-t border-brand/10">
                      <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">🎯 适合人群</h5>
                      <p className="text-sm font-medium text-slate-700">{ingredientsResult.suitableSkinTypes}</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  };

  const Products = () => {
    const products = [
      {
        id: 'flagship-mask',
        name: '重组胶原蛋白旗舰系列面膜',
        tagline: '医美级修护 · 精准抗衰',
        price: '199',
        image: '/mask.png',
        link: 'https://www.hhrmnano.com/',
        highlights: [
          { icon: '🔥', text: '痛点：精华吸收率不足5%，无法渗入真皮层' },
          { icon: '✅', text: '方案：60秒速溶形成百万微通道，吸收率提升6倍' }
        ],
        description: '专为抗老不妥协的高净值女性及医美术后群体打造。采用医疗级重组胶原蛋白，以固态形式共纺于纳米纤维骨架。',
        details: [
          { label: '透皮吸收', value: '提升至约30%' },
          { label: '刺激指数', value: '0 (医美术后可用)' },
          { label: '速溶时间', value: '30-60秒' }
        ]
      },
      {
        id: 'local-patch',
        name: '纳米纤维局部修护贴系列',
        tagline: '精准靶向 · 碎片化护肤',
        price: '99 - 399',
        image: '/patch.png',
        link: 'https://www.hhrmnano.com/',
        highlights: [
          { icon: '⏰', text: '痛点：传统面膜耗时久，局部问题缺乏方案' },
          { icon: '🎯', text: '方案：10-60秒速溶，针对眼/额/痘区精准修护' }
        ],
        subSeries: [
          { name: '「启明贴」眼部', use: '眼袋浮肿、黑眼圈', main: '胶原多肽+咖啡因' },
          { name: '「华盖贴」额部', use: '抬头纹、干燥泛红', main: '玻尿酸分子矩阵' },
          { name: '「净墟贴」痘区', use: '红肿炎症、脓液吸附', main: '水杨酸前体+氧化锌' }
        ]
      },
      {
        id: 'nano-essence',
        name: '重组胶原多肽纳米精华',
        tagline: '固态锁鲜 · 极致活性',
        price: '599 - 899',
        image: '/essence.png',
        link: 'https://www.hhrmnano.com/',
        highlights: [
          { icon: '🧪', text: '痛点：液态精华水分稀释，有效成分浓度低、活性损耗大' },
          { icon: '💎', text: '方案：重组胶原+六胜肽，浓度提升5-8倍，0防腐' }
        ],
        description: '将“液态精华固态化”，消除水分稀释。手掌温度即可溶解成浓稠精华液，成分极度纯粹。',
        structure: [
          { label: '形态', value: '超薄圆形固态膜片 (<0.1mm)' },
          { label: '优势', value: '5-8倍浓度提升' },
          { label: '体验', value: '医美级深层抗皱' }
        ]
      }
    ];

    return (
      <div className="flex flex-col min-h-screen bg-bg-gray">
        <header className="sticky top-0 glass-panel p-4 flex items-center gap-4 z-20">
          <button onClick={goBack}><ChevronLeft /></button>
          <h2 className="font-bold text-lg">厚海锐膜 · 产品系列</h2>
        </header>

        <div className="p-4 space-y-6 pb-20">
          {products.map((product) => (
            <motion.div 
              key={product.id}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <Card className="p-0 overflow-hidden border-none shadow-md">
                <div className="relative aspect-[4/3] bg-brand/5 flex items-center justify-center overflow-hidden">
                  <img 
                    src={product.image} 
                    alt={product.name} 
                    className="w-full h-full object-cover transition-opacity duration-500"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.opacity = '0';
                      (e.target as HTMLImageElement).parentElement!.classList.add('bg-slate-100');
                    }}
                  />
                  {/* Placeholder overlay (visible if image fails or is missing) */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center -z-10 bg-brand-light">
                    <FlaskConical size={40} className="text-brand/20 mb-2" />
                    <p className="text-[10px] text-brand/40 font-bold uppercase tracking-widest leading-tight">
                      {product.name}<br/>图片准备中
                    </p>
                    <p className="text-[9px] text-slate-400 mt-2 italic">请在 public 文件夹中<br/>寻找 {product.image}</p>
                  </div>
                  
                  <div className="absolute top-3 left-3 flex flex-col gap-1 z-10">
                    <span className="bg-brand text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tighter">
                      SUNIANE
                    </span>
                  </div>
                  <div className="absolute bottom-3 right-3 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-lg z-10">
                    <span className="text-brand font-display font-extrabold text-lg">¥{product.price}</span>
                  </div>
                </div>

                <div className="p-5 space-y-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800 leading-tight">{product.name}</h3>
                    <p className="text-sm font-medium text-brand mt-1">{product.tagline}</p>
                  </div>

                  <div className="space-y-2">
                    {(product.highlights || []).map((h, i) => (
                      <div key={i} className="flex gap-2 text-xs leading-relaxed">
                        <span className="shrink-0">{h.icon}</span>
                        <span className={i === 0 ? "text-slate-500" : "text-slate-700 font-medium"}>{h.text}</span>
                      </div>
                    ))}
                  </div>

                  {product.description && (
                    <p className="text-xs text-slate-500 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
                      {product.description}
                    </p>
                  )}

                  {product.details && (
                    <div className="grid grid-cols-3 gap-2">
                      {(product.details || []).map((d, i) => (
                        <div key={i} className="text-center p-2 rounded-lg bg-blue-50/50 border border-blue-100/50">
                          <p className="text-[10px] text-slate-400 font-medium">{d.label}</p>
                          <p className="text-[11px] font-bold text-brand">{d.value}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {product.subSeries && (
                    <div className="space-y-2">
                      {(product.subSeries || []).map((s, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                          <div>
                            <p className="text-[13px] font-bold text-slate-800">{s.name}</p>
                            <p className="text-[10px] text-slate-400">{s.use}</p>
                          </div>
                          <div className="text-right">
                            <span className="tag-green !text-[10px]">{s.main}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {product.structure && (
                    <div className="space-y-2">
                       {(product.structure || []).map((s, i) => (
                        <div key={i} className="flex justify-between items-center py-2 border-b border-slate-50 text-[12px]">
                          <span className="text-slate-400">{s.label}</span>
                          <span className="font-bold text-slate-700">{s.value}</span>
                        </div>
                       ))}
                    </div>
                  )}

                  <Button 
                    onClick={() => window.open(product.link, '_blank')}
                    className="w-full mt-4"
                  >
                    前往购买 <ArrowRight size={16} />
                  </Button>
                </div>
              </Card>
            </motion.div>
          ))}
          
          <div className="py-10 text-center">
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">厚海锐膜 · 专注纳米纤维护肤</p>
          </div>
        </div>
      </div>
    );
  };

  const LoadingPage = () => {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-bg-gray p-8 text-center gap-6">
        <div className="relative">
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
            className="w-20 h-20 border-4 border-slate-200 border-t-brand rounded-full"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <Sparkles className="text-brand animate-pulse" size={24} />
          </div>
        </div>
        <div>
          <h3 className="text-xl font-bold text-slate-800">
            {loadingText}
          </h3>
          <p className="text-slate-400 text-sm mt-2">
            {loadingText.includes('失败') ? "请重试或检查网络" : "AI正在调动千万级专业皮肤数据库..."}
          </p>
        </div>
      </div>
    );
  };

  const LoginPage = () => (
    <div className="min-h-screen flex flex-col p-6 bg-white overflow-y-auto">
      <div className="flex-1 flex flex-col items-center justify-center py-10">
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-20 h-20 bg-brand rounded-[24px] flex items-center justify-center text-white mb-6 shadow-xl shadow-brand/20"
        >
          <Camera size={40} />
        </motion.div>
        
        <motion.h1 
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="text-3xl font-display font-black text-slate-800 mb-2"
        >
          SkinGPT
        </motion.h1>
        
        <motion.p 
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-slate-400 mb-10 text-center text-sm font-medium"
        >
          AI 驱动的私人皮肤科专家
        </motion.p>

        {authError && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full bg-red-50 text-red-500 p-4 rounded-xl text-xs mb-6 flex items-center gap-2 border border-red-100"
          >
            <AlertCircle size={14} />
            {authError}
          </motion.div>
        )}

        <form onSubmit={handleEmailAuth} className="w-full space-y-4">
          <div className="space-y-1.5">
            <label className="text-[12px] font-bold text-slate-500 ml-1 uppercase tracking-wider">邮箱地址</label>
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-brand transition-colors">
                <Mail size={18} />
              </div>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 pl-12 pr-4 text-sm outline-none focus:ring-2 focus:ring-brand focus:bg-white transition-all"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] font-bold text-slate-500 ml-1 uppercase tracking-wider">登录密码</label>
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-brand transition-colors">
                <Lock size={18} />
              </div>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 pl-12 pr-4 text-sm outline-none focus:ring-2 focus:ring-brand focus:bg-white transition-all"
                required
              />
            </div>
          </div>

          <Button type="submit" className="w-full h-14 rounded-2xl text-[15px] font-bold shadow-lg shadow-brand/10">
            {isRegistering ? "立即注册" : "进入分析室"}
          </Button>
          
          <div className="text-center">
            <button 
              type="button"
              onClick={() => setIsRegistering(!isRegistering)}
              className="text-sm text-slate-400 font-medium hover:text-brand transition-colors"
            >
              {isRegistering ? "已有账号？去登录" : "没有账号？点击注册"}
            </button>
          </div>
        </form>

        <div className="w-full flex items-center gap-4 my-8">
          <div className="h-px bg-slate-100 flex-1" />
          <span className="text-[10px] text-slate-300 font-bold uppercase tracking-widest">其他登录方式</span>
          <div className="h-px bg-slate-100 flex-1" />
        </div>

        <div className="w-full flex flex-col gap-4">
          <button 
            onClick={handleLogin}
            className="flex items-center justify-center gap-3 bg-white border border-slate-100 py-4 rounded-2xl text-sm font-bold text-slate-700 active:scale-95 transition-all shadow-sm"
          >
            <img src="https://img.icons8.com/color/48/000000/google-logo.png" className="w-5 h-5 dark:invert-0" alt="Google" />
            Google 登录
          </button>
        </div>
      </div>

      <div className="pb-4 text-[11px] text-slate-400 text-center leading-relaxed">
        登录即代表您同意我们的<br/>
        <span className="font-bold text-slate-500">《服务协议》</span> 与 <span className="font-bold text-slate-500">《隐私政策》</span>
      </div>
    </div>
  );

  const HistoryPage = () => (
    <div className="flex flex-col min-h-screen bg-bg-gray pb-20">
      <header className="glass-panel p-4 flex items-center gap-4 z-20 sticky top-0">
        <button onClick={goBack}><ChevronLeft /></button>
        <h2 className="font-bold text-lg">历史分析报告</h2>
      </header>
      
      <div className="p-6 space-y-4">
        {history.length === 0 ? (
          <div className="py-20 text-center text-slate-400">
            <HistoryIcon size={48} className="mx-auto mb-4 opacity-20" />
            <p className="text-sm">暂无分析记录，快去检测一下吧！</p>
          </div>
        ) : (
          history.map((record) => (
            <Card 
              key={record.id} 
              onClick={() => { setAnalysisResult(record); navigateTo('result'); }}
              className="p-4 bg-white border border-slate-50 shadow-sm flex items-center gap-4 active:scale-[0.98] transition-all"
            >
              <div className="w-12 h-12 bg-brand/10 rounded-xl flex items-center justify-center text-brand shrink-0">
                <Calendar size={20} />
              </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-slate-800 text-[15px]">{record.skinType}</h4>
                      <p className="text-[12px] text-slate-400">{new Date(record.date).toLocaleString('zh-CN')}</p>
                      <div className="flex gap-1 mt-1 text-[10px]">
                        {(record.problems || []).slice(0, 2).map(p => <span key={p} className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">{p}</span>)}
                      </div>
                    </div>
              <div className="text-brand font-black text-xl">{record.overallScore || '--'}</div>
            </Card>
          ))
        )}
      </div>
    </div>
  );

  const TrendDetailPage = () => {
    const trends = getTrends();
    
    return (
      <div className="flex flex-col min-h-screen bg-bg-gray pb-20">
        <header className="glass-panel p-4 flex items-center gap-4 z-20 sticky top-0">
          <button onClick={goBack}><ChevronLeft /></button>
          <h2 className="font-bold text-lg">趋势详表 (量化分析)</h2>
        </header>

        <div className="p-6 space-y-6">
          {!trends || !trends.chartData || trends.chartData.length < 2 ? (
            <div className="py-20 text-center">
              <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-300">
                <TrendingUp size={40} />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">数据不足</h3>
              <p className="text-sm text-slate-500 max-w-[240px] mx-auto leading-relaxed">
                趋势图需要至少 <strong>2 次</strong> 检测记录才能生成。请坚持每天在相同光照下拍摄。
              </p>
              <Button onClick={() => navigateTo('detection')} className="mt-8 px-8 rounded-xl">
                立即去拍照
              </Button>
            </div>
          ) : (
            <>
              <Card className="bg-white border-none shadow-sm p-4">
                <h3 className="text-[14px] font-bold text-slate-700 mb-4 flex items-center gap-2">
                  <TrendingUp size={16} className="text-brand" /> 近7次记录趋势图
                </h3>
                <div className="h-[250px]">
                  <SkinTrendChart data={trends.chartData} />
                </div>
              </Card>

              <Card className="bg-white border-none shadow-sm p-0 overflow-hidden">
                <div className="bg-slate-50 p-4 border-b border-slate-100 flex justify-between items-center">
                  <h3 className="text-[14px] font-bold text-slate-700">量化明细表</h3>
                  <div className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">
                    QUANTITATIVE DATA
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[12px]">
                    <thead className="bg-slate-50 text-slate-400 border-b border-slate-100">
                      <tr>
                        <th className="px-4 py-3 font-medium">日期</th>
                        <th className="px-4 py-3 font-medium text-center">综合</th>
                        <th className="px-4 py-3 font-medium text-center">水分</th>
                        <th className="px-4 py-3 font-medium text-center">油分</th>
                        <th className="px-4 py-3 font-medium text-center">敏感</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {trends.chartData.map((d, i) => (
                        <tr key={i} className="active:bg-slate-50 transition-colors cursor-pointer" onClick={() => { setAnalysisResult(history[i]); navigateTo('result'); }}>
                          <td className="px-4 py-4 font-medium text-slate-600">
                            {new Date(d.date).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}
                          </td>
                          <td className="px-4 py-4 text-center font-bold text-brand">{d.overall}</td>
                          <td className="px-4 py-4 text-center text-blue-500 font-medium">{d.moisture}</td>
                          <td className="px-4 py-4 text-center text-amber-500 font-medium">{d.oil}</td>
                          <td className="px-4 py-4 text-center text-red-500 font-medium">{d.sensitivity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              <div className="bg-brand/5 rounded-2xl p-4 border border-brand/10">
                <h4 className="text-[12px] font-bold text-brand mb-2 italic">📌 趋势分析说明</h4>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  数据波动是皮肤自我调节的正常现象。我们重点监测的是<strong>屏障稳定性</strong>（敏感度波动小于15%）以及<strong>水分保持力</strong>的阶梯式提升。如果您发现敏感度异常持续上升，请减少果酸等刺激性成分的使用。
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <ErrorBoundary>
      <div className="max-w-md mx-auto min-h-screen bg-bg-gray relative shadow-2xl overflow-x-hidden border-x border-slate-100">
        <AnimatePresence mode="wait">
          {!authReady ? (
            <motion.div 
               key="splash"
               initial={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               className="h-screen flex items-center justify-center bg-white"
            >
              <Loader2 className="animate-spin text-brand" size={32} />
            </motion.div>
          ) : (
            <motion.div
              key={currentPage}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
              className="h-full"
            >
              {currentPage === 'login' && <LoginPage />}
              {currentPage === 'home' && <Home />}
              {currentPage === 'detection' && <Detection />}
              {currentPage === 'result' && <Result />}
              {currentPage === 'history' && <HistoryPage />}
              {currentPage === 'trend_detail' && <TrendDetailPage />}
              {currentPage === 'consultation' && <Consultation />}
              {currentPage === 'ingredients' && <Ingredients />}
              {currentPage === 'products' && <Products />}
              {currentPage === 'loading' && <LoadingPage />}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ErrorBoundary>
  );
}
