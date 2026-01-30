import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Play, Pause, RefreshCw, Settings, Wallet, Target, Sun, Moon } from 'lucide-react';

const STORAGE_KEY = 'ems_earnTrackState';
const THEME_KEY = 'ems_earnTrackTheme';

/**
 * Quotes: loaded from this array (no API). "Get Motivation" shows one; refresh cycles to next (quoteIndex % length).
 * Tracking: Start sets sessionStartTime = Date.now(). requestAnimationFrame runs updateEarnings: earnings = (now - sessionStartTime)/3600000 * hourlyRate; setCurrentSessionEarnings(earnings). Stop pushes { startTime, endTime, earnings, durationSeconds } to sessions and clears session. Total = totalSavedEarnings + sum(sessions.earnings) + currentSessionEarnings. State persisted to localStorage on change.
 */
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
    ? 'bg-gray-800/60 border-gray-700/50'
    : 'bg-white/90 border-gray-200 shadow-sm';
  const labelClass = dark ? 'text-gray-400' : 'text-gray-500';
  const valueClass = dark ? 'text-gray-100' : 'text-gray-900';
  const mutedClass = dark ? 'text-gray-500' : 'text-gray-400';
  const barBgClass = dark ? 'bg-gray-900' : 'bg-gray-200';
  const tipClass = dark ? 'text-gray-500' : 'text-gray-500';
  const successClass = dark ? 'text-green-600 font-bold' : 'text-green-700 font-bold';

  return (
    <div className={`border rounded-xl p-4 flex-1 min-w-[200px] ${cardClass}`}>
      <div className="flex justify-between items-center mb-2">
        <h3 className={`text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1.5 ${labelClass}`}>
          <Target className={`w-3 h-3 ${dark ? 'text-gray-400' : 'text-gray-500'}`} />
          {type}ly Goal
        </h3>
        <span className={`text-xs font-mono font-medium ${valueClass}`}>
          ${current.toFixed(0)} <span className={mutedClass}>/ ${target}</span>
        </span>
      </div>
      <div className={`h-1.5 w-full rounded-full overflow-hidden mb-2 ${barBgClass}`}>
        <div
          className="h-full bg-gradient-to-r from-gray-600 to-green-700 transition-all duration-500 ease-out"
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

/** Bottom bar: always shows current quote; refresh cycles to next. No button to show. */
function QuoteBar({ quoteIndex, onNextQuote, dark }) {
  const quote = MOTIVATION_QUOTES[quoteIndex % MOTIVATION_QUOTES.length];
  const barClass = dark ? 'bg-gray-800 border-t border-gray-700' : 'bg-gray-100 border-t border-gray-200';
  const textClass = dark ? 'text-gray-300' : 'text-gray-700';
  const tipClass = dark ? 'text-gray-500' : 'text-gray-600';

  return (
    <div className={`flex items-center justify-center gap-4 py-3 px-4 ${barClass}`}>
      <p className={`text-sm italic ${textClass}`}>"{quote.message}"</p>
      <span className={tipClass}>—</span>
      <span className={`text-xs font-medium ${tipClass}`}>Tip: {quote.tip}</span>
      <button
        onClick={onNextQuote}
        className={`p-1.5 rounded transition-colors ${dark ? 'text-gray-500 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-400 hover:text-gray-800 hover:bg-gray-200'}`}
        title="Next quote"
      >
        <RefreshCw className="w-3.5 h-3.5" />
      </button>
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
  const bgBase = isDark ? 'bg-gray-950 text-gray-100' : 'bg-gray-50 text-gray-900';
  const inputBase = 'w-[5.5rem] max-w-[6rem] border rounded py-1.5 px-2 text-xs focus:outline-none focus:ring-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';
  const inputClass = isDark
    ? `${inputBase} bg-gray-800 border-gray-600 text-white focus:border-gray-500`
    : `${inputBase} bg-white border-gray-300 text-gray-900 focus:border-gray-500`;
  const inputWithPrefix = isDark
    ? `${inputBase} bg-gray-800 border-gray-600 text-white focus:border-gray-500 pl-5`
    : `${inputBase} bg-white border-gray-300 text-gray-900 focus:border-gray-500 pl-5`;
  const headerIconBg = isWorking ? 'bg-green-700/30 text-green-600' : isDark ? 'bg-gray-800 text-gray-400' : 'bg-gray-200 text-gray-500';
  const settingsPanelClass = isDark ? 'bg-gray-800/95 border-gray-700' : 'bg-white border-gray-200 shadow';

  return (
    <div className={`flex flex-col min-h-full rounded-lg overflow-hidden ${bgBase}`}>
      <div className="flex flex-col flex-1 p-6 relative w-full max-w-4xl mx-auto">
        {/* Subtle grey ambient */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
          <div
            className={`absolute top-[-10%] left-[-10%] w-[180px] h-[180px] rounded-full blur-[80px] transition-opacity duration-700 ${
              isWorking ? 'opacity-20' : 'opacity-10'
            } ${isDark ? 'bg-gray-600' : 'bg-gray-300'}`}
          />
          <div
            className={`absolute bottom-[-10%] right-[-10%] w-[180px] h-[180px] rounded-full blur-[80px] transition-opacity duration-700 ${
              isWorking ? 'opacity-15' : 'opacity-10'
            } ${isDark ? 'bg-gray-600' : 'bg-gray-300'}`}
          />
        </div>

        {/* Header row: logo + title | theme + settings */}
        <div className="flex justify-between items-center mb-4 relative z-10">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-md ${headerIconBg}`}>
              <Wallet className="w-4 h-4" />
            </div>
            <h1 className={`text-sm font-bold tracking-wide ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
              EarnTrack Pro
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`p-2 rounded-lg transition-colors ${isDark ? 'text-gray-400 hover:text-gray-100 hover:bg-gray-800' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200'}`}
              title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={isDark ? 'text-gray-500 hover:text-gray-200 transition-colors' : 'text-gray-500 hover:text-gray-900 transition-colors'}
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Settings strip: single row, right-aligned under header; compact height */}
        <div className={`flex items-center justify-end mb-5 relative z-10 ${showSettings ? 'min-h-[3.25rem]' : 'min-h-0 overflow-hidden'}`}>
          {showSettings && (
            <div className={`flex flex-wrap items-end gap-3 border rounded-lg py-2.5 px-3 ${settingsPanelClass}`}>
              <div className="flex flex-col gap-0.5">
                <label className={`text-[10px] uppercase font-semibold tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Hourly Rate</label>
                <div className="relative">
                  <span className={`absolute left-2 top-1/2 -translate-y-1/2 text-xs pointer-events-none ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>$</span>
                  <input
                    type="number"
                    min={0}
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(Number(e.target.value) || 0)}
                    className={`w-[4.5rem] ${inputWithPrefix}`}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-0.5">
                <label className={`text-[10px] uppercase font-semibold tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Weekly Goal</label>
                <input
                  type="number"
                  min={0}
                  value={weeklyTarget || ''}
                  onChange={(e) => setWeeklyTarget(Number(e.target.value) || 0)}
                  placeholder="0"
                  className={`w-[4.5rem] text-center ${inputClass}`}
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className={`text-[10px] uppercase font-semibold tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Monthly Goal</label>
                <input
                  type="number"
                  min={0}
                  value={monthlyTarget || ''}
                  onChange={(e) => setMonthlyTarget(Number(e.target.value) || 0)}
                  placeholder="0"
                  className={`w-[4.5rem] text-center ${inputClass}`}
                />
              </div>
              <button
                onClick={handleReset}
                className="flex items-center gap-1 text-[10px] text-red-600 hover:bg-red-500/10 py-1.5 px-2 rounded self-end mb-0.5 transition-colors"
              >
                <RefreshCw className="w-3 h-3" /> Reset
              </button>
            </div>
          )}
        </div>

        {/* Main content - horizontal layout, consistent spacing */}
        <div className="flex-1 flex flex-row items-center justify-center gap-10 lg:gap-14 relative z-10 min-h-0">
          {/* Left: Total + Start/Stop + rate */}
          <div className="flex flex-col items-center shrink-0">
            <span className={`text-[10px] uppercase tracking-[0.2em] font-medium ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
              Total Earnings
            </span>
            <div className="relative mt-2 mb-4">
              <span className={`text-4xl sm:text-5xl font-bold font-mono tracking-tight ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                <span className={isDark ? 'text-gray-500 mr-1' : 'text-gray-400 mr-1'}>$</span>
                {formatMoney(displayAmount)}
              </span>
              {isWorking && (
                <span className="absolute -top-3 -right-6 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-600 opacity-60" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-700" />
                </span>
              )}
            </div>

            <button
              onClick={handleToggleWork}
              className={`
                rounded-full px-8 py-3 transition-all duration-300 transform active:scale-95
                ${
                  isWorking
                    ? 'bg-gray-700 border border-gray-500 text-gray-300 hover:bg-gray-600'
                    : 'bg-gray-600 hover:bg-gray-500 text-white'
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
            <div className={`mt-3 text-[10px] font-mono ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              ${hourlyRate} / hour
            </div>
          </div>

          {/* Right: Week + Month goals side by side */}
          <div className="flex flex-row gap-4 flex-1 max-w-[480px] min-w-0">
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

        {/* Bottom bar - quotes always visible */}
        <div className="mt-auto relative z-10 shrink-0">
          <QuoteBar
            quoteIndex={motivationIndex}
            onNextQuote={() => setMotivationIndex((i) => i + 1)}
            dark={isDark}
          />
        </div>
      </div>
    </div>
  );
}
