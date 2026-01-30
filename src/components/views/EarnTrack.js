import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Play, Pause, RefreshCw, Settings, Wallet, Sparkles, Target, Sun, Moon } from 'lucide-react';

const STORAGE_KEY = 'ems_earnTrackState';
const THEME_KEY = 'ems_earnTrackTheme';

const MOTIVATION_QUOTES = [
  { message: 'Time is money. Make it count!', tip: 'Stay focused on the goal.' },
  { message: 'Every hour you track is an hour you own.', tip: 'Track time, own results.' },
  { message: 'Small sessions add up to big earnings.', tip: 'Consistency beats intensity.' },
  { message: 'Your rate reflects your value. Own it.', tip: 'Charge what you are worth.' },
  { message: 'The hustle is real. So are the results.', tip: 'Work smart, then work hard.' },
  { message: 'Earn while you learn. Track while you grow.', tip: 'Measure progress daily.' },
  { message: 'Every dollar tracked is a dollar earned.', tip: 'Log it. Own it.' },
  { message: 'Focus time is money time.', tip: 'Block distractions, block hours.' },
  { message: 'Goals need numbers. You have them.', tip: 'Set weekly and monthly targets.' },
  { message: 'Pause when you need to. Then press play again.', tip: 'Rest is part of the plan.' },
];

function TargetProgress({ type, target, current, hourlyRate, dark }) {
  if (target <= 0) return null;

  const percentage = Math.min(100, (current / target) * 100);
  const remainingMoney = Math.max(0, target - current);
  const hoursRemaining = hourlyRate > 0 ? remainingMoney / hourlyRate : 0;

  const daysLeft = useMemo(() => {
    const now = new Date();
    if (type === 'Week') {
      const dayOfWeek = now.getDay();
      return dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
    }
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return lastDayOfMonth.getDate() - now.getDate();
  }, [type]);

  const cardClass = dark
    ? 'bg-slate-800/50 border-slate-700/50'
    : 'bg-white/80 border-gray-200 shadow-sm';
  const labelClass = dark ? 'text-slate-400' : 'text-gray-500';
  const valueClass = dark ? 'text-white' : 'text-gray-900';
  const mutedClass = dark ? 'text-slate-600' : 'text-gray-400';
  const barBgClass = dark ? 'bg-slate-900' : 'bg-gray-200';
  const tipClass = dark ? 'text-slate-500' : 'text-gray-500';
  const successClass = 'text-emerald-500 font-bold';

  return (
    <div className={`border rounded-xl p-4 w-full mb-3 ${cardClass}`}>
      <div className="flex justify-between items-center mb-2">
        <h3 className={`text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1.5 ${labelClass}`}>
          <Target className="w-3 h-3 text-cyan-500" />
          {type}ly Goal
        </h3>
        <span className={`text-xs font-mono font-medium ${valueClass}`}>
          ${current.toFixed(0)} <span className={mutedClass}>/ ${target}</span>
        </span>
      </div>
      <div className={`h-1.5 w-full rounded-full overflow-hidden mb-2 ${barBgClass}`}>
        <div
          className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all duration-500 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className={`flex justify-between items-center text-[10px] ${tipClass}`}>
        {remainingMoney > 0 ? (
          <span>Need <b>{hoursRemaining.toFixed(1)} hrs</b> more</span>
        ) : (
          <span className={successClass}>Goal Hit! 🎉</span>
        )}
        <span>{daysLeft} days left</span>
      </div>
    </div>
  );
}

function MotivationCard({ currentEarnings, hourlyRate, isWorking, quoteIndex, onNextQuote, dark }) {
  const quote = MOTIVATION_QUOTES[quoteIndex % MOTIVATION_QUOTES.length];
  const [showCard, setShowCard] = useState(false);

  useEffect(() => {
    if (isWorking && currentEarnings === 0 && !showCard) {
      setShowCard(true);
    }
  }, [isWorking, currentEarnings, showCard]);

  if (!showCard) {
    return (
      <div className="mt-4 flex justify-center">
        <button
          onClick={() => setShowCard(true)}
          className={`flex items-center gap-2 text-xs transition-colors ${dark ? 'text-slate-500 hover:text-cyan-400' : 'text-gray-500 hover:text-cyan-600'}`}
        >
          <Sparkles className="w-3 h-3" />
          <span>Get Motivation</span>
        </button>
      </div>
    );
  }

  const cardClass = dark
    ? 'from-slate-800 to-slate-900 border-slate-700/50'
    : 'from-gray-100 to-gray-200 border-gray-200 shadow';
  const textClass = dark ? 'text-slate-200' : 'text-gray-800';
  const tipClass = 'text-cyan-600 font-bold';

  return (
    <div className={`mt-6 bg-gradient-to-br border rounded-xl p-4 relative overflow-hidden ${cardClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-sm font-medium italic mb-1 ${textClass}`}>"{quote.message}"</p>
          <div className={`text-[10px] uppercase tracking-wide ${tipClass}`}>
            Tip: {quote.tip}
          </div>
        </div>
        <button
          onClick={onNextQuote}
          className={dark ? 'text-slate-500 hover:text-white transition-colors' : 'text-gray-500 hover:text-gray-900 transition-colors'}
          title="Next quote"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

const DEFAULT_RATE = 200;

export default function EarnTrack() {
  const [hourlyRate, setHourlyRate] = useState(DEFAULT_RATE);
  const [isWorking, setIsWorking] = useState(false);
  const [totalSavedEarnings, setTotalSavedEarnings] = useState(0);
  const [sessions, setSessions] = useState([]);
  const [weeklyTarget, setWeeklyTarget] = useState(0);
  const [monthlyTarget, setMonthlyTarget] = useState(0);
  const [sessionStartTime, setSessionStartTime] = useState(null);
  const [currentSessionEarnings, setCurrentSessionEarnings] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [motivationIndex, setMotivationIndex] = useState(0);
  const requestRef = useRef(0);

  // Load state from localStorage
  useEffect(() => {
    const savedState = localStorage.getItem(STORAGE_KEY);
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme !== null) setDarkMode(savedTheme === 'dark');
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        if (parsed.hourlyRate != null) setHourlyRate(parsed.hourlyRate);
        if (parsed.totalSavedEarnings != null) setTotalSavedEarnings(parsed.totalSavedEarnings);
        if (Array.isArray(parsed.sessions)) setSessions(parsed.sessions);
        if (parsed.weeklyTarget != null) setWeeklyTarget(parsed.weeklyTarget);
        if (parsed.monthlyTarget != null) setMonthlyTarget(parsed.monthlyTarget);
        if (parsed.isWorking && parsed.currentSessionStartTime) {
          setIsWorking(true);
          setSessionStartTime(parsed.currentSessionStartTime);
        }
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  // Persist state to localStorage
  useEffect(() => {
    const stateToSave = {
      isWorking,
      hourlyRate,
      totalSavedEarnings,
      sessions,
      weeklyTarget,
      monthlyTarget,
      currentSessionStartTime: sessionStartTime,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
  }, [isWorking, hourlyRate, totalSavedEarnings, sessions, weeklyTarget, monthlyTarget, sessionStartTime]);

  useEffect(() => {
    localStorage.setItem(THEME_KEY, darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const updateEarnings = useCallback(() => {
    if (isWorking && sessionStartTime) {
      const now = Date.now();
      const elapsedMs = now - sessionStartTime;
      const earnings = (elapsedMs / 3600000) * hourlyRate;
      setCurrentSessionEarnings(earnings);
      requestRef.current = requestAnimationFrame(updateEarnings);
    }
  }, [isWorking, sessionStartTime, hourlyRate]);

  useEffect(() => {
    if (isWorking) {
      requestRef.current = requestAnimationFrame(updateEarnings);
    } else {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      setCurrentSessionEarnings(0);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isWorking, updateEarnings]);

  const historyStats = useMemo(() => {
    const now = new Date();
    const currentDay = now.getDay();
    const diffToMonday = now.getDate() - currentDay + (currentDay === 0 ? -6 : 1);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(diffToMonday);
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfWeekTime = startOfWeek.getTime();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    const weekHistory = sessions
      .filter(s => s.endTime >= startOfWeekTime)
      .reduce((sum, s) => sum + s.earnings, 0);
    const monthHistory = sessions
      .filter(s => s.endTime >= startOfMonth)
      .reduce((sum, s) => sum + s.earnings, 0);

    return { week: weekHistory, month: monthHistory };
  }, [sessions]);

  const handleToggleWork = () => {
    if (isWorking) {
      const now = Date.now();
      const elapsedMs = sessionStartTime ? now - sessionStartTime : 0;
      const earnings = (elapsedMs / 3600000) * hourlyRate;
      const newSession = {
        id: crypto.randomUUID?.() || `s-${Date.now()}`,
        startTime: sessionStartTime,
        endTime: now,
        earnings,
        durationSeconds: elapsedMs / 1000,
      };
      setSessions(prev => [...prev, newSession]);
      setIsWorking(false);
      setSessionStartTime(null);
      setCurrentSessionEarnings(0);
    } else {
      setSessionStartTime(Date.now());
      setIsWorking(true);
    }
  };

  const handleReset = () => {
    if (window.confirm('Reset all earnings history?')) {
      setIsWorking(false);
      setTotalSavedEarnings(0);
      setSessions([]);
      setCurrentSessionEarnings(0);
      setSessionStartTime(null);
    }
  };

  const formatMoney = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'decimal',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const totalHistoryEarnings = sessions.reduce((acc, s) => acc + s.earnings, 0);
  const displayAmount = totalSavedEarnings + totalHistoryEarnings + currentSessionEarnings;
  const currentWeekEarnings = historyStats.week + (isWorking ? currentSessionEarnings : 0);
  const currentMonthEarnings = historyStats.month + (isWorking ? currentSessionEarnings : 0);

  const isDark = darkMode;
  const bgBase = isDark ? 'bg-slate-900 text-slate-100' : 'bg-gray-50 text-gray-900';
  const inputClass = isDark
    ? 'bg-slate-800 border-slate-700 text-white focus:border-cyan-500'
    : 'bg-white border-gray-300 text-gray-900 focus:border-indigo-500';
  const headerIconBg = isWorking ? 'bg-emerald-500/20 text-emerald-500' : isDark ? 'bg-slate-800 text-slate-400' : 'bg-gray-200 text-gray-500';
  const settingsPanelClass = isDark ? 'bg-slate-800/90 border-slate-700' : 'bg-white border-gray-200 shadow';

  return (
    <div className={`flex flex-col min-h-full rounded-lg overflow-hidden ${bgBase}`}>
      <div className="flex flex-col flex-1 p-6 relative">
        {/* Ambient blurs */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
          <div
            className={`absolute top-[-10%] left-[-10%] w-[200px] h-[200px] rounded-full blur-[60px] transition-opacity duration-700 ${
              isWorking ? 'opacity-100' : 'opacity-40'
            } ${isDark ? 'bg-blue-500/10' : 'bg-blue-400/20'}`}
          />
          <div
            className={`absolute bottom-[-10%] right-[-10%] w-[200px] h-[200px] rounded-full blur-[60px] transition-opacity duration-700 ${
              isWorking ? 'opacity-100' : 'opacity-20'
            } ${isDark ? 'bg-emerald-500/10' : 'bg-emerald-400/20'}`}
          />
        </div>

        {/* Header */}
        <div className="flex justify-between items-center mb-8 relative z-10">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-md ${headerIconBg}`}>
              <Wallet className="w-4 h-4" />
            </div>
            <h1 className={`text-sm font-bold tracking-wide ${isDark ? 'text-slate-200' : 'text-gray-800'}`}>
              EarnTrack Pro
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`p-2 rounded-lg transition-colors ${isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200'}`}
              title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={isDark ? 'text-slate-500 hover:text-white transition-colors' : 'text-gray-500 hover:text-gray-900 transition-colors'}
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Settings panel */}
        {showSettings && (
          <div className={`mb-6 border rounded-lg p-4 relative z-20 ${settingsPanelClass}`}>
            <div className="space-y-3">
              <div>
                <label className={`text-[10px] uppercase font-bold tracking-wider ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                  Hourly Rate
                </label>
                <div className="relative mt-1">
                  <span className={`absolute left-2.5 top-1/2 -translate-y-1/2 text-xs ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>$</span>
                  <input
                    type="number"
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(Number(e.target.value) || 0)}
                    className={`w-full border rounded py-1.5 pl-5 pr-2 text-xs focus:outline-none focus:ring-1 ${inputClass}`}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={`text-[10px] uppercase font-bold tracking-wider ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                    Weekly Goal
                  </label>
                  <input
                    type="number"
                    value={weeklyTarget || ''}
                    onChange={(e) => setWeeklyTarget(Number(e.target.value) || 0)}
                    placeholder="0"
                    className={`w-full mt-1 border rounded py-1.5 px-2 text-xs focus:outline-none focus:ring-1 ${inputClass}`}
                  />
                </div>
                <div>
                  <label className={`text-[10px] uppercase font-bold tracking-wider ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                    Monthly Goal
                  </label>
                  <input
                    type="number"
                    value={monthlyTarget || ''}
                    onChange={(e) => setMonthlyTarget(Number(e.target.value) || 0)}
                    placeholder="0"
                    className={`w-full mt-1 border rounded py-1.5 px-2 text-xs focus:outline-none focus:ring-1 ${inputClass}`}
                  />
                </div>
              </div>
              <button
                onClick={handleReset}
                className="w-full flex items-center justify-center gap-1.5 text-[10px] text-red-500 hover:bg-red-500/10 py-2 rounded mt-2 transition-colors"
              >
                <RefreshCw className="w-3 h-3" /> Reset History
              </button>
            </div>
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 flex flex-col items-center justify-center relative z-10">
          <div className="text-center mb-8">
            <span className={`text-[10px] uppercase tracking-[0.2em] font-medium ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>
              Total Earnings
            </span>
            <div className="relative mt-2 mb-6">
              <span className={`text-4xl sm:text-5xl font-bold font-mono tracking-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>
                <span className={isDark ? 'text-slate-600 mr-1' : 'text-gray-400 mr-1'}>$</span>
                {formatMoney(displayAmount)}
              </span>
              {isWorking && (
                <span className="absolute -top-3 -right-6 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
              )}
            </div>

            <button
              onClick={handleToggleWork}
              className={`
                group relative overflow-hidden rounded-full px-8 py-3 transition-all duration-300 transform active:scale-95 shadow-xl
                ${
                  isWorking
                    ? 'bg-slate-800 border border-rose-500/30 text-rose-400 hover:bg-rose-500/10'
                    : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/20'
                }
              `}
            >
              <div className="flex items-center gap-2 font-semibold text-sm">
                {isWorking ? (
                  <>
                    <Pause className="w-4 h-4" /> Stop Tracking
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" /> Start Tracking
                  </>
                )}
              </div>
            </button>
            <div className={`mt-4 text-[10px] font-mono ${isDark ? 'text-slate-600' : 'text-gray-400'}`}>
              ${hourlyRate} / hour
            </div>
          </div>

          <div className="w-full max-w-[280px]">
            <TargetProgress
              type="Week"
              target={weeklyTarget}
              current={currentWeekEarnings}
              hourlyRate={hourlyRate}
              dark={isDark}
            />
            <TargetProgress
              type="Month"
              target={monthlyTarget}
              current={currentMonthEarnings}
              hourlyRate={hourlyRate}
              dark={isDark}
            />
          </div>
        </div>

        <div className="relative z-10">
          <MotivationCard
            currentEarnings={displayAmount}
            hourlyRate={hourlyRate}
            isWorking={isWorking}
            quoteIndex={motivationIndex}
            onNextQuote={() => setMotivationIndex((i) => i + 1)}
            dark={isDark}
          />
        </div>
      </div>
    </div>
  );
}
