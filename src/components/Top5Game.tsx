import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import { 
  Lightbulb, 
  Eye, 
  RotateCcw, 
  Users, 
  Play, 
  X, 
  Trophy, 
  Star,
  CheckCircle,
  Lock,
  Target,
  Zap,
  Award,
  Settings,
  Clock,
  Timer,
  Home,
  Download,
  Smartphone
} from 'lucide-react';

interface Answer {
  label: string;
  rank: number;
  score: number;
  value?: string | number;
  synonyms?: string[];
}

interface Question {
  id: string;
  text: string;
  answers: Answer[];
  unit?: string;
  source?: string;
}

interface Player {
  id: string;
  name: string;
  score: number;
  claimed: Record<string, string[]>;
}

interface GameState {
  players: Player[];
  currentQuestion: Question | null;
  answerIndex: Map<string, Answer> | null;
  usedQuestionIds: Set<string>;
  pendingMatch: { label: string; score: number; rank: number } | null;
  revealedAnswers: Set<string>;
  gameStarted: boolean;
  currentPlayerIndex: number;
  timeLimit: number; // in seconds (0 = disabled)
  timeRemaining: number;
  timerActive: boolean;
}

// Questions will be loaded from questions.json
let QUESTIONS: Question[] = [];

export default function Top5Game() {
  const { toast } = useToast();
  const [gameState, setGameState] = useState<GameState>({
    players: [],
    currentQuestion: null,
    answerIndex: null,
    usedQuestionIds: new Set(),
    pendingMatch: null,
    revealedAnswers: new Set(),
    gameStarted: false,
    currentPlayerIndex: 0,
    timeLimit: 0,
    timeRemaining: 0,
    timerActive: false
  });
  
  const [newPlayerName, setNewPlayerName] = useState('');
  const [guess, setGuess] = useState('');
  const [feedback, setFeedback] = useState('');
  const [showModal, setShowModal] = useState(false);
  
  const [actionLog, setActionLog] = useState<string[]>([]);
  const [questionsLoaded, setQuestionsLoaded] = useState(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [lastRevealedAnswer, setLastRevealedAnswer] = useState<string | null>(null);
  const [shakeWrong, setShakeWrong] = useState(false);
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showTimeUpModal, setShowTimeUpModal] = useState(false);
  const [showPWAInstructions, setShowPWAInstructions] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginCode, setLoginCode] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isPWA, setIsPWA] = useState(false);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  const flashRef = useRef<HTMLDivElement>(null);

  // Load questions from JSON file
  useEffect(() => {
    const loadQuestions = async () => {
      try {
        // Try to fetch from network first
        const response = await fetch('/questions.json');
        if (response.ok) {
          const data = await response.json();
          const questions = Array.isArray(data) ? data : (data.questions || []);
          
          if (!Array.isArray(questions) || questions.length === 0) {
            throw new Error('لم يتم العثور على أسئلة في ملف questions.json');
          }
          
          QUESTIONS = questions;
          
          // Store questions in localStorage for offline use
          localStorage.setItem('gameQuestions', JSON.stringify(questions));
          
          setQuestionsLoaded(true);
          setLoadingError(null);
        } else {
          throw new Error('Network response not ok');
        }
      } catch (error) {
        console.log('Failed to load questions from network, trying offline cache:', error);
        
        // Fallback to cached questions for offline use
        const cachedQuestions = localStorage.getItem('gameQuestions');
        if (cachedQuestions) {
          try {
            const questions = JSON.parse(cachedQuestions);
            if (Array.isArray(questions) && questions.length > 0) {
              QUESTIONS = questions;
              setQuestionsLoaded(true);
              setLoadingError(null);
              console.log('تم تحميل الأسئلة من الكاش المحلي');
            } else {
              throw new Error('الأسئلة المحفوظة غير صالحة');
            }
          } catch (parseError) {
            console.error('Failed to parse cached questions:', parseError);
            setLoadingError('خطأ في الأسئلة المحفوظة. يرجى الاتصال بالإنترنت');
            setQuestionsLoaded(false);
          }
        } else {
          // No cached questions available
          setLoadingError('لا توجد أسئلة محفوظة. يرجى الاتصال بالإنترنت مرة واحدة على الأقل');
          setQuestionsLoaded(false);
        }
      }
    };

    loadQuestions();
  }, []);

  // Timer effect
  useEffect(() => {
    console.log('Timer effect triggered:', {
      timerActive: gameState.timerActive,
      timeRemaining: gameState.timeRemaining,
      timeLimit: gameState.timeLimit
    });
    
    if (gameState.timerActive && gameState.timeRemaining > 0) {
      timerRef.current = setTimeout(() => {
        setGameState(prev => ({
          ...prev,
          timeRemaining: prev.timeRemaining - 1
        }));
      }, 1000);
    } else if (gameState.timerActive && gameState.timeRemaining <= 0) {
      // Time's up!
      console.log('Time is up! Moving to next player');
      setGameState(prev => ({
        ...prev,
        timerActive: false,
        currentPlayerIndex: (prev.currentPlayerIndex + 1) % prev.players.length
      }));
      setShowTimeUpModal(true);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [gameState.timerActive, gameState.timeRemaining]);

  // Debug modal state changes
  useEffect(() => {
    console.log('showModal state changed:', showModal);
    console.log('pendingMatch:', gameState.pendingMatch);
    console.log('players count:', gameState.players.length);
  }, [showModal, gameState.pendingMatch, gameState.players.length]);

  // PWA Instructions state monitoring
  useEffect(() => {
    console.log('🟡 PWA Instructions state:', showPWAInstructions);
  }, [showPWAInstructions]);

  // Check if running as PWA and auto-fill login code
  useEffect(() => {
    // Check if running as PWA
    const isPWAMode = window.matchMedia('(display-mode: standalone)').matches || 
                      (window.navigator as any).standalone === true ||
                      document.referrer.includes('android-app://');
    
    setIsPWA(isPWAMode);
    
    // Auto-fill login code from cache if available
    const savedCode = localStorage.getItem('gameLoginCode');
    if (savedCode && !isLoggedIn) {
      setLoginCode(savedCode);
    }
  }, [isLoggedIn]);

  // PWA Installation handling
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const installPWA = async () => {
    // Always show the manual instructions modal
    setShowPWAInstructions(true);
  };

  const verifyCode = async () => {
    if (!loginCode.trim()) {
      setLoginError("يرجى إدخال الرمز");
      return;
    }

    setIsVerifying(true);
    setLoginError("");
    
    const inputCode = loginCode.trim().toLowerCase();
    
    try {
      // Try to fetch from network first
      const response = await fetch('/codes.json');
      if (response.ok) {
        const data = await response.json();
        const validCodes = data.validCodes || [];
        
        // Store valid codes in localStorage for offline use
        localStorage.setItem('validGameCodes', JSON.stringify(validCodes));
        
        console.log('Code verification (online):', { 
          inputCode, 
          validCodes,
          validCodesLower: validCodes.map((c: string) => c.toLowerCase()),
          isValid: validCodes.some((code: string) => code.toLowerCase() === inputCode)
        });
        
        // Case insensitive comparison
        const isValidCode = validCodes.some((code: string) => 
          code.toLowerCase() === inputCode
        );
        
        if (isValidCode) {
          localStorage.setItem('gameLoginCode', loginCode.trim());
          setIsLoggedIn(true);
          setLoginCode("");
          toast({ title: "تم بنجاح! 🎉", description: "مرحباً بك في اللعبة" });
        } else {
          setLoginError("الرمز غير صحيح. يرجى المحاولة مرة أخرى");
        }
      } else {
        throw new Error('Network response not ok');
      }
    } catch (error) {
      console.log('Network failed, trying offline codes:', error);
      
      // Fallback to cached codes for offline use
      const cachedCodes = localStorage.getItem('validGameCodes');
      if (cachedCodes) {
        try {
          const validCodes = JSON.parse(cachedCodes);
          
          console.log('Code verification (offline):', { 
            inputCode, 
            validCodes,
            validCodesLower: validCodes.map((c: string) => c.toLowerCase()),
            isValid: validCodes.some((code: string) => code.toLowerCase() === inputCode)
          });
          
          // Case insensitive comparison
          const isValidCode = validCodes.some((code: string) => 
            code.toLowerCase() === inputCode
          );
          
          if (isValidCode) {
            localStorage.setItem('gameLoginCode', loginCode.trim());
            setIsLoggedIn(true);
            setLoginCode("");
            toast({ title: "تم بنجاح! 🎉", description: "مرحباً بك في اللعبة (وضع عدم الاتصال)" });
          } else {
            setLoginError("الرمز غير صحيح. يرجى المحاولة مرة أخرى");
          }
        } catch (parseError) {
          console.error('Failed to parse cached codes:', parseError);
          setLoginError("خطأ في البيانات المحفوظة. يرجى الاتصال بالإنترنت");
        }
      } else {
        // No cached codes available
        setLoginError("لا توجد بيانات محفوظة. يرجى الاتصال بالإنترنت مرة واحدة على الأقل");
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const installPWADirect = async () => {
    if (deferredPrompt) {
      try {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          toast({ title: "🎉 تم!", description: "تم تثبيت التطبيق بنجاح" });
          setShowPWAInstructions(false);
        }
        setDeferredPrompt(null);
      } catch (error) {
        console.error('PWA installation failed:', error);
        toast({ title: "خطأ", description: "فشل في تثبيت التطبيق", variant: "destructive" });
      }
    } else {
      toast({ 
        title: "غير متاح", 
        description: "التثبيت المباشر غير متاح حالياً. اتبع الإرشادات اليدوية.", 
        variant: "destructive" 
      });
    }
  };

  // Arabic text normalization functions
  const normalizeArabicDigits = (s: string) => {
    const map: Record<string, string> = {'٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9'};
    return s.replace(/[٠-٩]/g, d => map[d]);
  };

  const normalizeText = (raw: string) => {
    if (!raw) return "";
    let s = String(raw);
    s = s.replace(/\uFEFB|\uFEFC/g, "لا");
    s = normalizeArabicDigits(s);
    s = s.toLowerCase();
    s = s.replace(/[\u064B-\u065F\u0670\u0640]/g, "");
    s = s.replace(/[أإآ]/g, "ا").replace(/ؤ/g, "و").replace(/ئ/g, "ي").replace(/ء/g, "");
    s = s.replace(/ى/g, "ي").replace(/ة/g, "ه");
    s = s.replace(/[^\p{L}\p{N}\s]/gu, " ");
    s = s.replace(/\s+/g, " ").trim();
    return s;
  };

  const generateVariants = (text: string) => {
    const base = normalizeText(text);
    const variants = new Set([base]);
    const tokens = base.split(" ").filter(Boolean);
    
    // Remove "ال" prefix
    const noAl = tokens.map(token => token.startsWith("ال") ? token.slice(2) : token).join(" ").trim();
    if (noAl) variants.add(noAl);
    
    // Remove clitics
    const noClitics = tokens.map(token => {
      const match = token.match(/^([وفبكل])?(ال)?(.+)$/);
      return match ? (match[3] || token) : token;
    }).join(" ").trim();
    if (noClitics) variants.add(noClitics);
    
    // Joined versions
    variants.add(base.replace(/\s+/g, ""));
    if (noAl) variants.add(noAl.replace(/\s+/g, ""));
    if (noClitics) variants.add(noClitics.replace(/\s+/g, ""));
    
    return Array.from(variants);
  };

  const buildAnswerIndex = (question: Question) => {
    const map = new Map<string, Answer>();
    
    const addKey = (key: string, answer: Answer) => {
      generateVariants(key).forEach(variant => {
        if (variant) map.set(variant, answer);
      });
    };

    // Function to clean and parse synonyms from malformed JSON
    const cleanSynonyms = (synonyms: string[] | undefined): string[] => {
      if (!synonyms || !Array.isArray(synonyms)) return [];
      
      return synonyms.flatMap(synonym => {
        if (typeof synonym === 'string') {
          // Try to parse malformed JSON strings like "[\"\"USA\"\"]"
          try {
            const cleaned = synonym.replace(/^"?\[""?/, '').replace(/""?\]"?$/, '');
            if (cleaned.includes('""')) {
              return cleaned.split('""').filter(s => s.trim().length > 0);
            }
            return [cleaned];
          } catch {
            return [synonym];
          }
        }
        return [synonym];
      }).filter(s => s && typeof s === 'string' && s.trim().length > 0 && !s.match(/^\d+$/));
    };

    // Add common synonyms dynamically
    const addCommonSynonyms = (label: string): string[] => {
      const commonSynonyms: string[] = [];
      
      if (label === 'الولايات المتحدة') {
        commonSynonyms.push('أمريكا', 'USA', 'US', 'United States', 'America');
      }
      
      if (label === 'المملكة المتحدة') {
        commonSynonyms.push('بريطانيا', 'UK', 'Britain', 'United Kingdom');
      }
      
      return commonSynonyms;
    };

    question.answers.forEach(answer => {
      addKey(answer.label, answer);
      
      // Process existing synonyms (even if malformed)
      const cleanedSynonyms = cleanSynonyms(answer.synonyms);
      cleanedSynonyms.forEach(synonym => addKey(synonym, answer));
      
      // Add common synonyms dynamically
      const dynamicSynonyms = addCommonSynonyms(answer.label);
      dynamicSynonyms.forEach(synonym => addKey(synonym, answer));
    });
    
    return map;
  };

  const levenshtein = (a: string, b: string) => {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    
    const dp = new Array(n + 1).fill(0).map((_, j) => j);
    
    for (let i = 1; i <= m; i++) {
      let prev = dp[0];
      dp[0] = i;
      
      for (let j = 1; j <= n; j++) {
        const tmp = dp[j];
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
        prev = tmp;
      }
    }
    
    return dp[n];
  };

  const checkAnswer = (question: Question, rawInput: string) => {
    const index = gameState.answerIndex || buildAnswerIndex(question);
    const userVariants = generateVariants(rawInput);
    
    // Exact match first
    for (const variant of userVariants) {
      const hit = index.get(variant);
      if (hit) {
        return { correct: true, matched: hit.label, score: hit.score, rank: hit.rank };
      }
    }
    
    // Fuzzy match
    const bestKey = userVariants.sort((a, b) => b.length - a.length)[0] || "";
    if (bestKey) {
      const maxDistance = Math.max(1, Math.min(3, Math.floor(bestKey.length / 4)));
      let bestAnswer: Answer | null = null;
      let bestDistance = Infinity;
      
      for (const [key, answer] of index.entries()) {
        if (Math.abs(key.length - bestKey.length) > maxDistance) continue;
        const distance = levenshtein(bestKey, key);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestAnswer = answer;
        }
        if (bestDistance === 0) break;
      }
      
      if (bestAnswer && bestDistance <= maxDistance) {
        return { correct: true, matched: bestAnswer.label, score: bestAnswer.score, rank: bestAnswer.rank };
      }
    }
    
    return { correct: false, matched: null, score: 0, rank: null };
  };

  const addPlayer = () => {
    if (!newPlayerName.trim()) return;
    
    const newPlayer: Player = {
      id: crypto.randomUUID(),
      name: newPlayerName.trim(),
      score: 0,
      claimed: {}
    };
    
    setGameState(prev => ({
      ...prev,
      players: [...prev.players, newPlayer]
    }));
    
    setNewPlayerName('');
  };

  const removePlayer = (playerId: string) => {
    setGameState(prev => ({
      ...prev,
      players: prev.players.filter(p => p.id !== playerId)
    }));
  };

  const startGame = () => {
    if (!questionsLoaded) {
      toast({ title: "خطأ", description: "انتظر تحميل الأسئلة", variant: "destructive" });
      return;
    }
    
    if (gameState.players.length === 0) {
      toast({ title: "خطأ", description: "أضف لاعباً واحداً على الأقل", variant: "destructive" });
      return;
    }
    
    setGameState(prev => ({ ...prev, gameStarted: true }));
    loadRandomQuestion();
  };

  const loadRandomQuestion = () => {
    const availableQuestions = QUESTIONS.filter(q => !gameState.usedQuestionIds.has(q.id));
    
    if (availableQuestions.length === 0) {
      // Reset used questions if all have been used
      setGameState(prev => ({ ...prev, usedQuestionIds: new Set() }));
      return loadRandomQuestion();
    }
    
    const randomQuestion = availableQuestions[Math.floor(Math.random() * availableQuestions.length)];
    const answerIndex = buildAnswerIndex(randomQuestion);
    
    console.log('Loading new question with time settings:', {
      timeLimit: gameState.timeLimit,
      willActivateTimer: gameState.timeLimit > 0
    });
    
    setGameState(prev => ({
      ...prev,
      currentQuestion: randomQuestion,
      answerIndex,
      usedQuestionIds: new Set([...prev.usedQuestionIds, randomQuestion.id]),
      revealedAnswers: new Set(),
      players: prev.players.map(p => ({
        ...p,
        claimed: { ...p.claimed, [randomQuestion.id]: [] }
      })),
      currentPlayerIndex: 0,
      timeRemaining: prev.timeLimit,
      timerActive: prev.timeLimit > 0 && prev.players.length > 0
    }));
    
    setGuess('');
    setFeedback('');
    setLastRevealedAnswer(null);
  };

  const submitGuess = () => {
    if (!gameState.currentQuestion || !guess.trim()) return;
    
    const result = checkAnswer(gameState.currentQuestion, guess.trim());
    console.log('Guess result:', result);
    
    if (!result.correct) {
      setFeedback('❌ إجابة خاطئة - حاول مرة أخرى!');
      setShakeWrong(true);
      setTimeout(() => setShakeWrong(false), 500);
      return;
    }
    
    console.log('Correct answer! Setting up modal...');
    console.log('Current players:', gameState.players);
    console.log('Players count:', gameState.players.length);
    
    // Auto-reveal the correct answer and set pending match
    setGameState(prev => ({
      ...prev,
      revealedAnswers: new Set([...prev.revealedAnswers, result.matched!]),
      pendingMatch: { label: result.matched!, score: result.score, rank: result.rank! }
    }));
    
    setLastRevealedAnswer(result.matched!);
    
    // Show modal after a small delay to ensure state is updated
    setTimeout(() => {
      console.log('Showing modal now...');
      setShowModal(true);
    }, 100);
  };

  const awardToPlayer = (playerId: string) => {
    const { pendingMatch, currentQuestion } = gameState;
    if (!pendingMatch || !currentQuestion) return;
    
    const player = gameState.players.find(p => p.id === playerId);
    if (!player) return;
    
    // Check if player already has this answer
    const playerClaimed = player.claimed[currentQuestion.id] || [];
    if (playerClaimed.includes(pendingMatch.label)) {
      toast({ 
        title: "تحذير", 
        description: `${player.name} سبق وحصل على "${pendingMatch.label}" لهذا السؤال`,
        variant: "destructive"
      });
      return;
    }
    
    // Update player score and claimed answers
    setGameState(prev => ({
      ...prev,
      players: prev.players.map(p => 
        p.id === playerId 
          ? {
              ...p,
              score: p.score + pendingMatch.score,
              claimed: {
                ...p.claimed,
                [currentQuestion.id]: [...(p.claimed[currentQuestion.id] || []), pendingMatch.label]
              }
            }
          : p
      ),
      pendingMatch: null
    }));
    
    // Add to log
    const logEntry = `🎯 +${pendingMatch.score} إلى ${player.name} — ${pendingMatch.label}`;
    setActionLog(prev => [logEntry, ...prev.slice(0, 9)]);
    
    // Visual effects
    screenFlash(pendingMatch.rank);
    
    setFeedback(`🎉 إجابة صحيحة: ${pendingMatch.label} — ${player.name} حصل على +${pendingMatch.score} نقاط!`);
    setGuess('');
    setShowModal(false);
    
    // Reset timer and move to next player if time is enabled
    if (gameState.timeLimit > 0) {
      setGameState(prev => ({
        ...prev,
        currentPlayerIndex: (prev.currentPlayerIndex + 1) % prev.players.length,
        timeRemaining: prev.timeLimit,
        timerActive: true
      }));
    }
    
    // Check if all answers are claimed
    setTimeout(() => {
      if (allAnswersClaimed()) {
        toast({ 
          title: "🏆 تم الانتهاء من السؤال!", 
          description: "تم كشف جميع الإجابات" 
        });
      }
    }, 1000);
  };

  const allAnswersClaimed = () => {
    if (!gameState.currentQuestion) return false;
    
    const claimedAnswers = new Set<string>();
    gameState.players.forEach(player => {
      const claimed = player.claimed[gameState.currentQuestion!.id] || [];
      claimed.forEach(answer => claimedAnswers.add(answer));
    });
    
    return claimedAnswers.size >= gameState.currentQuestion.answers.length;
  };

  const screenFlash = (rank: number) => {
    if (!flashRef.current) return;
    
    const flashClass = `flash-${Math.min(rank, 5)}`;
    flashRef.current.className = `flash-effect ${flashClass}`;
    
    setTimeout(() => {
      if (flashRef.current) {
        flashRef.current.className = 'flash-effect';
      }
    }, 350);
  };

  const showHint = () => {
    if (!gameState.currentQuestion) return;
    
    const unrevealedAnswers = gameState.currentQuestion.answers
      .filter(a => !gameState.revealedAnswers.has(a.label));
    
    if (unrevealedAnswers.length === 0) {
      toast({ title: "💡 تلميح", description: "كل الإجابات مكشوفة!" });
      return;
    }
    
    const randomAnswer = unrevealedAnswers[Math.floor(Math.random() * unrevealedAnswers.length)];
    
    setGameState(prev => ({
      ...prev,
      revealedAnswers: new Set([...prev.revealedAnswers, randomAnswer.label])
    }));
    
    setLastRevealedAnswer(randomAnswer.label);
    setFeedback(`💡 تلميح: ${randomAnswer.label} في المرتبة رقم ${randomAnswer.rank}`);
  };

  const revealAll = () => {
    if (!gameState.currentQuestion) return;
    
    setGameState(prev => ({
      ...prev,
      revealedAnswers: new Set(prev.currentQuestion!.answers.map(a => a.label))
    }));
    
    setFeedback('✨ تم كشف جميع الإجابات!');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      submitGuess();
    }
  };

  const sortedPlayers = [...gameState.players].sort((a, b) => b.score - a.score);

  const getPlayerClaimedCount = (playerId: string) => {
    if (!gameState.currentQuestion) return 0;
    const player = gameState.players.find(p => p.id === playerId);
    return player?.claimed[gameState.currentQuestion.id]?.length || 0;
  };

  // Login Screen
  if (!isLoggedIn) {
    return (
      <>
        <div className="min-h-screen landscape:h-screen landscape:max-h-screen landscape:overflow-hidden p-3 sm:p-6 game-surface flex items-center justify-center">
          <div className="max-w-md mx-auto w-full">
            <Card className="game-card animate-fade-in">
              <CardHeader className="text-center pb-6">
                <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent mb-2">
                  🏆 لعبة توب 5
                </h1>
                <p className="text-muted-foreground">أدخل الرمز للدخول إلى اللعبة</p>
              </CardHeader>
              
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Input
                      type="text"
                      placeholder="أدخل الرمز هنا..."
                      value={loginCode}
                      onChange={(e) => {
                        setLoginCode(e.target.value);
                        setLoginError("");
                      }}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          verifyCode();
                        }
                      }}
                      className="text-center text-lg h-12"
                      disabled={isVerifying}
                    />
                    {loginError && (
                      <p className="text-destructive text-sm text-center animate-shake">
                        {loginError}
                      </p>
                    )}
                  </div>
                  
                  <Button 
                    onClick={verifyCode}
                    className="w-full h-12 text-lg"
                    disabled={isVerifying}
                  >
                    {isVerifying ? "جاري التحقق..." : "تحقق من الرمز"}
                  </Button>
                </div>

                {/* Welcome message and sticker with link */}
                <div className="text-center space-y-4">
                  <p className="text-lg font-medium text-primary">
                    حياكم في متجرنا
                  </p>
                  <div className="flex justify-center">
                    <a 
                      href="https://hex-store.com" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="block hover:scale-105 transition-transform duration-200 cursor-pointer"
                    >
                      <img 
                        src="/lovable-uploads/ec503969-d0e3-4f58-83d0-c78e13572dec.png" 
                        alt="متجر هكس - اضغط للزيارة" 
                        className="w-32 h-32 object-contain animate-bounce-in hover:opacity-80 transition-opacity"
                      />
                    </a>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* PWA Instructions Modal for Login Screen */}
        <Dialog open={showPWAInstructions} onOpenChange={setShowPWAInstructions}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-center text-xl">
                📱 احفظ اللعبة كتطبيق
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4 text-center">
              <p className="text-base">لحفظ اللعبة على هاتفك كتطبيق:</p>
              
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <p className="font-medium">📱 للهواتف:</p>
                <p className="text-sm">1. اضغط على زر المشاركة</p>
                <p className="text-sm">2. اختر "إضافة إلى الشاشة الرئيسية"</p>
                <p className="text-sm">3. اضغط "إضافة"</p>
              </div>
              
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <p className="font-medium">💻 للحاسوب:</p>
                <p className="text-sm">1. اضغط على أيقونة التثبيت في شريط العنوان</p>
                <p className="text-sm">2. أو استخدم قائمة المتصفح ← إضافة إلى الشاشة الرئيسية</p>
              </div>
            </div>
            
            <div className="flex justify-center pt-4">
              <Button onClick={() => setShowPWAInstructions(false)}>
                فهمت!
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  if (!gameState.gameStarted) {
    return (
      <>
        <div className="min-h-screen landscape:h-screen landscape:max-h-screen landscape:overflow-hidden p-3 sm:p-6 game-surface">
          <div className="max-w-4xl mx-auto h-full landscape:h-full flex flex-col">
            <div className="text-center mb-4 sm:mb-8 animate-fade-in">
              <h1 className="text-4xl sm:text-6xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent mb-2 sm:mb-4">
                🏆 لعبة توب 5
              </h1>
              <p className="text-muted-foreground text-lg sm:text-xl">اكتشف الإجابات الخمسة الأولى في هذه اللعبة المثيرة!</p>
          </div>
          
          <Card className="game-card animate-scale-in flex-1 landscape:overflow-hidden">
            <CardHeader className="pb-3 sm:pb-6">
              <CardTitle className="flex items-center gap-2 sm:gap-3 text-lg sm:text-2xl">
                <Users className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                إدارة اللاعبين
                <Badge variant="outline" className="mr-auto text-xs sm:text-sm">
                  {gameState.players.length} لاعب
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 sm:space-y-6 landscape:overflow-y-auto landscape:max-h-[calc(100vh-12rem)]">
              <div className="grid gap-2 sm:gap-3">
                {gameState.players.length === 0 ? (
                  <div className="text-center py-4 sm:py-8 text-muted-foreground">
                    <Users className="w-8 h-8 sm:w-12 sm:h-12 mx-auto mb-2 sm:mb-3 opacity-50" />
                    <p className="text-sm sm:text-base">أضف أسماء اللاعبين أو الفرق للبدء</p>
                  </div>
                ) : (
                  gameState.players.map((player, index) => (
                    <div 
                      key={player.id} 
                      className="flex items-center justify-between p-2 sm:p-4 rounded-xl bg-gradient-to-r from-muted/10 to-muted/5 border border-border animate-slide-reveal"
                      style={{ animationDelay: `${index * 0.1}s` }}
                    >
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className="w-6 h-6 sm:w-10 sm:h-10 rounded-full bg-primary/20 flex items-center justify-center">
                          <Trophy className="w-3 h-3 sm:w-5 sm:h-5 text-primary" />
                        </div>
                        <span className="font-semibold text-sm sm:text-lg">{player.name}</span>
                      </div>
                      <div className="flex items-center gap-2 sm:gap-3">
                        <Badge variant="secondary" className="px-2 py-1 text-xs sm:text-sm">
                          {player.score} نقطة
                        </Badge>
                        <Button 
                          size="sm"
                          variant="ghost"
                          onClick={() => removePlayer(player.id)}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 h-6 w-6 sm:h-8 sm:w-8 p-0"
                        >
                          <X className="w-3 h-3 sm:w-4 sm:h-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              
              <div className="flex gap-2 sm:gap-3">
                <Input
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  placeholder="أدخل اسم اللاعب أو الفريق..."
                  onKeyPress={(e) => e.key === 'Enter' && addPlayer()}
                  className="flex-1 text-base sm:text-lg h-10 sm:h-12"
                  style={{ fontSize: '16px' }}
                />
                <Button 
                  onClick={addPlayer} 
                  variant="secondary"
                  size="sm"
                  className="px-3 sm:px-6 h-10 sm:h-12"
                  disabled={!newPlayerName.trim()}
                >
                  إضافة
                </Button>
              </div>
              
              <Button 
                onClick={startGame}
                className="w-full h-12 sm:h-14 text-sm sm:text-lg animate-glow-pulse"
                size="lg"
                disabled={gameState.players.length === 0 || !questionsLoaded}
              >
                <Play className="w-4 h-4 sm:w-5 sm:h-5 ml-2" />
                {!questionsLoaded ? '⏳ تحميل الأسئلة...' : '🚀 ابدأ اللعبة'}
              </Button>
              
              {/* Only show PWA install button if not already in PWA mode */}
              {!isPWA && (
                <Button 
                  onClick={() => {
                    console.log('🔵 PWA Instructions button clicked!');
                    setShowPWAInstructions(true);
                    console.log('🔵 Set showPWAInstructions to true');
                  }}
                  variant="outline"
                  className="w-full h-12 sm:h-14 text-sm sm:text-lg bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-blue-200 hover:bg-gradient-to-r hover:from-blue-500/20 hover:to-purple-500/20"
                  size="lg"
                  type="button"
                >
                  <Smartphone className="w-4 h-4 sm:w-5 sm:h-5 ml-2" />
                  📱 احفظ اللعبة كتطبيق
                </Button>
              )}
              
              {loadingError && (
                <div className="text-destructive text-xs sm:text-sm p-2 sm:p-3 rounded-lg bg-destructive/10 border border-destructive/20 animate-shake">
                  ⚠️ {loadingError}
                </div>
              )}
              
              {!questionsLoaded && !loadingError && (
                <div className="text-muted-foreground text-center py-2 animate-fade-in">
                  <div className="animate-pulse text-xs sm:text-sm">🔄 تحميل الأسئلة من questions.json...</div>
                </div>
              )}
              
              <div className="text-muted-foreground text-xs sm:text-sm text-center p-2 sm:p-4 rounded-lg bg-muted/5 border-2 border-dashed border-muted/20">
                💡 <strong>كيف تلعب:</strong> عند الإجابة الصحيحة ستظهر نافذة لاختيار اللاعب الذي يستحق النقاط
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

        {/* PWA Instructions Modal - Simple Version */}
        <Dialog open={showPWAInstructions} onOpenChange={setShowPWAInstructions}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-center text-xl">
                📱 احفظ اللعبة كتطبيق
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4 text-center">
              <p className="text-base">لحفظ اللعبة على هاتفك كتطبيق:</p>
              
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <p className="font-medium">📱 للهواتف:</p>
                <p className="text-sm">1. اضغط على زر المشاركة</p>
                <p className="text-sm">2. اختر "إضافة إلى الشاشة الرئيسية"</p>
                <p className="text-sm">3. اضغط "إضافة"</p>
              </div>
              
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <p className="font-medium">💻 للحاسوب:</p>
                <p className="text-sm">1. اضغط على أيقونة التثبيت في شريط العنوان</p>
                <p className="text-sm">2. أو استخدم قائمة المتصفح ← إضافة إلى الشاشة الرئيسية</p>
              </div>
            </div>
            
            <div className="flex justify-center pt-4">
              <Button onClick={() => setShowPWAInstructions(false)}>
                فهمت!
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <div className="min-h-screen landscape:h-screen landscape:max-h-screen landscape:overflow-hidden p-2 sm:p-6 game-surface relative">
      <div ref={flashRef} className="flash-effect" />
      
      <div className="max-w-5xl mx-auto h-full landscape:h-full">
        {/* Responsive Layout: Column on portrait, Row on landscape */}
        <div className="flex flex-col landscape:flex-row h-full landscape:h-full gap-2 sm:gap-4">
          
          {/* Right Panel: Question and Answers (Desktop) / Top Panel (Mobile Portrait) */}
          <div className="flex-1 landscape:order-2">
            <Card className="game-card animate-fade-in h-full landscape:h-full">
              <CardHeader className="pb-2 sm:pb-6 landscape:pb-1">
                <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3 landscape:mb-1">
                  <Target className="w-4 h-4 sm:w-6 sm:h-6 landscape:w-4 landscape:h-4 text-primary" />
                  <Badge variant="outline" className="text-xs sm:text-sm landscape:text-xs">
                    سؤال #{(gameState.usedQuestionIds.size).toString()}
                  </Badge>
                  <Badge variant="outline" className="text-xs mr-auto landscape:text-xs">
                    {gameState.revealedAnswers.size} / {gameState.currentQuestion?.answers.length || 0} مكشوف
                  </Badge>
                </div>
                
                {/* Timer and Current Player Display */}
                {gameState.timeLimit > 0 && gameState.players.length > 0 && (
                  <div className="flex items-center justify-between p-2 sm:p-4 landscape:p-2 landscape:py-1 rounded-xl bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 mb-2 sm:mb-4 landscape:mb-1">
                    <div className="flex items-center gap-2 sm:gap-3 landscape:gap-2">
                      <div className="w-6 h-6 sm:w-10 sm:h-10 landscape:w-6 landscape:h-6 rounded-full bg-primary/20 flex items-center justify-center">
                        <Users className="w-3 h-3 sm:w-5 sm:h-5 landscape:w-3 landscape:h-3 text-primary" />
                      </div>
                      <div>
                        <div className="font-semibold text-sm sm:text-lg landscape:text-xs">
                          دور {gameState.players[gameState.currentPlayerIndex]?.name}
                        </div>
                        <div className="text-xs sm:text-sm landscape:text-xs text-muted-foreground">اللاعب الحالي</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3 landscape:gap-1">
                      <div className="text-right">
                        <div className={`text-lg sm:text-2xl landscape:text-sm font-bold ${
                          gameState.timeRemaining <= 10 ? 'text-destructive animate-pulse' : 'text-primary'
                        }`}>
                          {Math.floor(gameState.timeRemaining / 60)}:{(gameState.timeRemaining % 60).toString().padStart(2, '0')}
                        </div>
                        <div className="text-xs sm:text-sm landscape:text-xs text-muted-foreground">الوقت المتبقي</div>
                      </div>
                      <div className={`w-6 h-6 sm:w-10 sm:h-10 landscape:w-6 landscape:h-6 rounded-full flex items-center justify-center ${
                        gameState.timerActive ? 'bg-primary text-primary-foreground animate-pulse' : 'bg-muted text-muted-foreground'
                      }`}>
                        <Timer className="w-3 h-3 sm:w-5 sm:h-5 landscape:w-3 landscape:h-3" />
                      </div>
                    </div>
                  </div>
                )}
                
                <CardTitle className="text-lg sm:text-2xl lg:text-3xl landscape:text-base leading-relaxed">
                  {gameState.currentQuestion?.text}
                </CardTitle>
                {gameState.currentQuestion?.source && (
                  <p className="text-xs sm:text-sm landscape:text-xs text-muted-foreground mt-2 flex items-center gap-1">
                    <span>📊</span>
                    المصدر: {gameState.currentQuestion.source}
                  </p>
                )}
              </CardHeader>
              
              <CardContent className="space-y-3 sm:space-y-6 landscape:space-y-1 landscape:overflow-y-visible landscape:max-h-[calc(100vh-10rem)]">
                {/* Answers Grid */}
                <div className="space-y-2 sm:space-y-3 landscape:space-y-1">
                  <div className="flex items-center gap-2 text-muted-foreground mb-2 sm:mb-4 landscape:mb-1">
                    <Star className="w-3 h-3 sm:w-4 sm:h-4 landscape:w-3 landscape:h-3" />
                    <span className="text-xs sm:text-sm font-medium landscape:text-xs">الإجابات المطلوبة</span>
                  </div>
                  
                  <div className="grid gap-2 sm:gap-3 landscape:gap-1">
                    {gameState.currentQuestion?.answers
                      .slice()
                      .sort((a, b) => a.rank - b.rank)
                      .map((answer, index) => {
                        const isRevealed = gameState.revealedAnswers.has(answer.label);
                        const isLastRevealed = answer.label === lastRevealedAnswer;
                        const claimedCount = gameState.players.reduce((count, player) => {
                          const claimed = player.claimed[gameState.currentQuestion!.id] || [];
                          return count + (claimed.includes(answer.label) ? 1 : 0);
                        }, 0);
                        
                        return (
                          <div 
                            key={answer.label} 
                            className={`p-2 sm:p-4 landscape:p-1 landscape:py-0.5 rounded-xl border transition-all duration-500 ${
                              isRevealed 
                                ? `bg-gradient-to-r from-success/10 to-success/5 border-success/30 animate-slide-reveal ${
                                    isLastRevealed ? 'animate-bounce-in' : ''
                                  }` 
                                : 'bg-muted/10 border-dashed border-muted/30'
                            }`}
                            style={{ animationDelay: `${index * 0.1}s` }}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 sm:gap-4 landscape:gap-1">
                                <div className={`w-6 h-6 sm:w-10 sm:h-10 landscape:w-5 landscape:h-5 rounded-full flex items-center justify-center font-bold text-sm sm:text-lg landscape:text-xs ${
                                  isRevealed 
                                    ? 'bg-success text-white' 
                                    : 'bg-muted text-muted-foreground'
                                }`}>
                                  {answer.rank}
                                </div>
                                <div className="min-w-0 flex-1">
                                  {isRevealed ? (
                                    <div className="font-semibold text-sm sm:text-lg landscape:text-xs text-success flex items-center gap-2 landscape:gap-1">
                                      <CheckCircle className="w-3 h-3 sm:w-5 sm:h-5 landscape:w-2 landscape:h-2 flex-shrink-0" />
                                      <span className="truncate">{answer.label}</span>
                                    </div>
                                  ) : (
                                    <div className="font-medium text-muted-foreground flex items-center gap-2 landscape:gap-1">
                                      <Lock className="w-3 h-3 sm:w-5 sm:h-5 landscape:w-2 landscape:h-2 flex-shrink-0" />
                                      <span className="text-sm sm:text-base landscape:text-xs">إجابة مخفية</span>
                                    </div>
                                  )}
                                  {isRevealed && answer.value !== undefined && (
                                    <div className="text-xs sm:text-sm landscape:text-xs text-muted-foreground mt-1 landscape:mt-0">
                                      {answer.value} {gameState.currentQuestion?.unit}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 sm:gap-2 landscape:gap-1 flex-shrink-0">
                                {isRevealed && (
                                  <Badge variant="secondary" className="gap-1 text-xs landscape:text-xs landscape:px-1 landscape:py-0">
                                    <Award className="w-2 h-2 sm:w-3 sm:h-3 landscape:w-2 landscape:h-2" />
                                    +{answer.score}
                                  </Badge>
                                )}
                                <Badge variant={claimedCount > 0 ? "default" : "outline"} className="text-xs landscape:text-xs landscape:px-1 landscape:py-0">
                                  مُنحت: {claimedCount}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Left Panel: Controls and Input (Desktop) / Bottom Panel (Mobile Portrait) */}
          <div className="landscape:w-80 landscape:order-1">
            <Card className="game-card animate-fade-in h-full landscape:h-full">
              <CardHeader className="pb-2 sm:pb-6 landscape:pb-1">
                <CardTitle className="flex items-center gap-2 sm:gap-3 text-lg sm:text-2xl landscape:text-sm">
                  <Zap className="w-4 h-4 sm:w-6 sm:h-6 landscape:w-4 landscape:h-4 text-primary" />
                  التحكم والتخمين
                </CardTitle>
              </CardHeader>
              
              <CardContent className="space-y-3 sm:space-y-4 landscape:space-y-2 landscape:overflow-y-auto landscape:max-h-[calc(100vh-8rem)]">
                {/* Input Section */}
                <div className="space-y-3 sm:space-y-4 landscape:space-y-2">
                  <div className={`flex gap-2 sm:gap-3 landscape:gap-2 ${shakeWrong ? 'animate-shake' : ''}`}>
                    <Input
                      value={guess}
                      onChange={(e) => setGuess(e.target.value)}
                      placeholder="أدخل إجابتك هنا..."
                      onKeyDown={handleKeyPress}
                      className="flex-1 text-base sm:text-lg landscape:text-sm h-10 sm:h-12 landscape:h-8"
                      style={{ fontSize: '16px' }}
                    />
                    <Button onClick={submitGuess} size="sm" className="px-4 sm:px-8 landscape:px-2 h-10 sm:h-12 landscape:h-8 landscape:text-xs">
                      <Zap className="w-3 h-3 sm:w-4 sm:h-4 landscape:w-3 landscape:h-3 ml-2" />
                      تحقق
                    </Button>
                  </div>
                  
                  {feedback && (
                    <div className={`p-2 sm:p-4 landscape:p-2 rounded-xl border animate-bounce-in text-sm sm:text-base landscape:text-xs ${
                      feedback.includes('❌') ? 'bg-destructive/10 text-destructive border-destructive/20' :
                      feedback.includes('🎉') || feedback.includes('💡') || feedback.includes('✨') 
                        ? 'bg-success/10 text-green-400 border-success/20' :
                      'bg-muted/10 border-muted/20'
                    }`}>
                      <div className="text-center font-medium">{feedback}</div>
                    </div>
                  )}
                </div>

                {/* Control Buttons */}
                <div className="grid grid-cols-2 gap-2 pt-2 sm:pt-4 landscape:pt-2 border-t border-border/50">
                  <Button variant="outline" size="sm" onClick={showHint} className="gap-1 sm:gap-2 landscape:gap-1 text-xs sm:text-sm landscape:text-xs h-8 sm:h-10 landscape:h-6">
                    <Lightbulb className="w-3 h-3 sm:w-4 sm:h-4 landscape:w-2 landscape:h-2" />
                    تلميح
                  </Button>
                  <Button variant="outline" size="sm" onClick={revealAll} className="gap-1 sm:gap-2 landscape:gap-1 text-xs sm:text-sm landscape:text-xs h-8 sm:h-10 landscape:h-6">
                    <Eye className="w-3 h-3 sm:w-4 sm:h-4 landscape:w-2 landscape:h-2" />
                    كشف الكل
                  </Button>
                  <Button variant="outline" size="sm" onClick={loadRandomQuestion} className="gap-1 sm:gap-2 landscape:gap-1 text-xs sm:text-sm landscape:text-xs h-8 sm:h-10 landscape:h-6">
                    <RotateCcw className="w-3 h-3 sm:w-4 sm:h-4 landscape:w-2 landscape:h-2" />
                    سؤال جديد
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowScoreboard(true)} className="gap-1 sm:gap-2 landscape:gap-1 text-xs sm:text-sm landscape:text-xs h-8 sm:h-10 landscape:h-6">
                    <Trophy className="w-3 h-3 sm:w-4 sm:h-4 landscape:w-2 landscape:h-2" />
                    لوحة الترتيب
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowSettings(true)} className="gap-1 sm:gap-2 landscape:gap-1 text-xs sm:text-sm landscape:text-xs h-8 sm:h-10 landscape:h-6">
                    <Settings className="w-3 h-3 sm:w-4 sm:h-4 landscape:w-2 landscape:h-2" />
                    الإعدادات
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => {
                      // Reset game state to go back to main screen
                      setGameState(prev => ({
                        ...prev,
                        gameStarted: false,
                        currentQuestion: null,
                        revealedAnswers: new Set(),
                        pendingMatch: null,
                        currentPlayerIndex: 0,
                        timeRemaining: 0,
                        timerActive: false
                      }));
                      setGuess('');
                      setFeedback('');
                      setLastRevealedAnswer(null);
                    }} 
                    className="gap-1 sm:gap-2 landscape:gap-1 text-xs sm:text-sm landscape:text-xs h-8 sm:h-10 landscape:h-6 text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Home className="w-3 h-3 sm:w-4 sm:h-4 landscape:w-2 landscape:h-2" />
                    الشاشة الرئيسية
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Enhanced Player Selection Modal */}
      <Dialog open={showModal} onOpenChange={(open) => {
        console.log('Modal open state changed:', open);
        setShowModal(open);
      }}>
        <DialogContent className="sm:max-w-2xl landscape:max-w-md landscape:max-h-[90vh] landscape:my-2">
          <DialogHeader className="text-center space-y-2 landscape:space-y-1 landscape:pb-2">
            <div className="mx-auto w-12 h-12 landscape:w-8 landscape:h-8 bg-success/20 rounded-full flex items-center justify-center animate-bounce-in">
              <CheckCircle className="w-6 h-6 landscape:w-5 landscape:h-5 text-success" />
            </div>
            <DialogTitle className="text-xl landscape:text-lg">
              🎉 إجابة صحيحة!
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-1 landscape:space-y-0">
                <div className="text-base landscape:text-sm font-semibold text-success">
                  {gameState.pendingMatch?.label}
                </div>
                <Badge variant="secondary" className="text-base landscape:text-sm px-3 py-1 landscape:px-2 landscape:py-0.5">
                  +{gameState.pendingMatch?.score} نقاط
                </Badge>
              </div>
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3 landscape:space-y-2">
            <p className="text-center text-muted-foreground text-sm landscape:text-xs">
              اختر اللاعب الذي يستحق هذه النقاط:
            </p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 landscape:grid-cols-2 gap-3 landscape:gap-2 landscape:max-h-60 landscape:overflow-y-auto">
              {gameState.players.map((player) => {
                const claimedCount = getPlayerClaimedCount(player.id);
                return (
                  <Button
                    key={player.id}
                    variant="outline"
                    onClick={() => awardToPlayer(player.id)}
                    className="min-h-16 landscape:min-h-14 p-3 landscape:p-2 hover:bg-primary/10 hover:border-primary/30 transition-all landscape:flex landscape:flex-col landscape:items-center landscape:justify-center"
                  >
                    <div className="w-full space-y-1 landscape:space-y-0.5">
                      <div className="font-semibold text-sm landscape:text-sm text-center landscape:leading-tight">{player.name}</div>
                      <div className="text-xs text-muted-foreground text-center landscape:leading-tight">
                        {player.score} نقطة • {claimedCount} إجابة
                      </div>
                    </div>
                  </Button>
                );
              })}
            </div>
          </div>
          
          <div className="flex justify-center pt-2 landscape:pt-1">
            <Button variant="ghost" onClick={() => setShowModal(false)} className="text-sm landscape:text-xs landscape:h-7">
              إلغاء
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Scoreboard Modal */}
      <Dialog open={showScoreboard} onOpenChange={setShowScoreboard}>
        <DialogContent className="sm:max-w-4xl max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-2xl">
              <Trophy className="w-6 h-6 text-primary" />
              لوحة الترتيب والإحصائيات
            </DialogTitle>
            <DialogDescription>
              عرض ترتيب اللاعبين وسجل النقاط في اللعبة
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid lg:grid-cols-2 gap-6 overflow-y-auto max-h-[60vh] px-1">
            {/* Scoreboard */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                🏆 ترتيب اللاعبين
                <Badge variant="outline">{gameState.players.length} لاعب</Badge>
              </h3>
              <div className="space-y-3">
                {sortedPlayers.map((player, index) => {
                  const claimedCount = getPlayerClaimedCount(player.id);
                  return (
                    <div 
                      key={player.id} 
                      className={`p-4 rounded-xl border transition-all duration-300 animate-fade-in ${
                        index === 0 
                          ? 'bg-gradient-to-r from-primary/10 to-accent/10 border-primary/30' 
                          : 'bg-muted/5 border-border'
                      }`}
                      style={{ animationDelay: `${index * 0.1}s` }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                            index === 0 ? 'bg-primary text-primary-foreground' :
                            index === 1 ? 'bg-accent text-accent-foreground' :
                            index === 2 ? 'bg-muted text-muted-foreground' :
                            'bg-muted/50 text-muted-foreground'
                          }`}>
                            {index + 1}
                          </div>
                          <div>
                            <div className="font-semibold text-lg">{player.name}</div>
                            {claimedCount > 0 && (
                              <div className="text-sm text-muted-foreground">
                                {claimedCount} إجابة في هذا السؤال
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-primary">{player.score}</div>
                          <div className="text-sm text-muted-foreground">نقطة</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Action Log */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                📝 سجل النقاط
                <Badge variant="outline">{actionLog.length} إجراء</Badge>
              </h3>
              <div className="max-h-96 overflow-y-auto space-y-2 border border-border/50 rounded-lg p-3 bg-muted/5">
                {actionLog.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <div className="text-4xl mb-2">🎯</div>
                    <p>سيظهر هنا سجل منح النقاط...</p>
                  </div>
                ) : (
                  actionLog.map((log, index) => (
                    <div 
                      key={index} 
                      className="p-3 rounded-lg bg-background border border-border/30 text-sm animate-slide-reveal"
                      style={{ animationDelay: `${index * 0.05}s` }}
                    >
                      {log}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          
          <div className="flex justify-center pt-4 border-t border-border/50">
            <Button onClick={() => setShowScoreboard(false)}>
              إغلاق
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Settings Modal */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-2xl">
              <Settings className="w-6 h-6 text-primary" />
              إعدادات اللعبة
            </DialogTitle>
            <DialogDescription>
              تخصيص خيارات الوقت وقواعد اللعبة
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Time Limit Setting */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-primary" />
                <div>
                  <div className="font-semibold">حد الوقت لكل لاعب</div>
                  <div className="text-sm text-muted-foreground">
                    {gameState.timeLimit === 0 ? 'بدون حد زمني' : 
                     `${Math.floor(gameState.timeLimit / 60)} دقيقة ${gameState.timeLimit % 60} ثانية`}
                  </div>
                </div>
              </div>
              
              <div className="space-y-3">
                <Slider
                  value={[gameState.timeLimit]}
                  onValueChange={(value) => {
                    console.log('Time limit changed to:', value[0]);
                    setGameState(prev => ({
                      ...prev,
                      timeLimit: value[0],
                      timeRemaining: value[0],
                      timerActive: value[0] > 0 && prev.currentQuestion !== null && prev.players.length > 0
                    }));
                  }}
                  max={120}
                  min={0}
                  step={10}
                  className="w-full"
                />
                
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>بدون وقت</span>
                  <span>دقيقتان</span>
                </div>
                
                {gameState.timeLimit > 0 && (
                  <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                    <div className="text-sm text-primary">
                      ⏰ سيتم تبديل الأدوار كل {Math.floor(gameState.timeLimit / 60)} دقيقة {gameState.timeLimit % 60} ثانية
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex justify-center pt-4 border-t border-border/50">
            <Button onClick={() => setShowSettings(false)}>
              حفظ الإعدادات
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Time Up Modal */}
      <Dialog open={showTimeUpModal} onOpenChange={setShowTimeUpModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 bg-destructive/20 rounded-full flex items-center justify-center animate-bounce-in">
              <Clock className="w-8 h-8 text-destructive" />
            </div>
            <DialogTitle className="text-2xl">
              ⏰ انتهى الوقت!
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2">
                <div className="text-lg font-semibold">
                  انتهت مدة {gameState.players[gameState.currentPlayerIndex - 1 < 0 ? gameState.players.length - 1 : gameState.currentPlayerIndex - 1]?.name}
                </div>
                <div className="text-muted-foreground">
                  الآن دور {gameState.players[gameState.currentPlayerIndex]?.name}
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex justify-center pt-4">
            <Button onClick={() => {
              setShowTimeUpModal(false);
              // Restart timer for next player
              if (gameState.timeLimit > 0) {
                setGameState(prev => ({
                  ...prev,
                  timeRemaining: prev.timeLimit,
                  timerActive: true
                }));
              }
            }}>
              متابعة
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}