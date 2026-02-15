'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  GraduationCap,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Plus,
  X,
  Settings,
  BarChart3,
  BookOpen,
  Target,
  Shield,
  ArrowLeft,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAbiturStore } from '@/lib/abitur-store';
import {
  ALL_SUBJECTS,
  SEMESTERS,
  getSubject,
  getPointsColor,
  getPointsBg,
  pointsToGrade,
  pointsToLabel,
  isDeficit,
  calculateAbitur,
  calculateNeededAverage,
  checkFieldCoverage,
  totalPointsToGrade,
  type Semester,
  type AbiturProfile,
  type SubjectDefinition,
} from '@/lib/abitur';

type AbiturView = 'dashboard' | 'grades' | 'exams' | 'hurdles' | 'settings';

export default function AbiturPage() {
  const { profile, setGrade, setExamPoints, setSeminarPaperPoints, setSeminarPresentationPoints } = useAbiturStore();
  const [view, setView] = useState<AbiturView>('dashboard');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const result = useMemo(() => calculateAbitur(profile), [profile]);

  const projection = useMemo(
    () => ({
      for10: calculateNeededAverage(profile, 1.0),
      for15: calculateNeededAverage(profile, 1.5),
      for20: calculateNeededAverage(profile, 2.0),
      for25: calculateNeededAverage(profile, 2.5),
      for30: calculateNeededAverage(profile, 3.0),
    }),
    [profile]
  );

  const enteredGrades = useMemo(
    () => profile.grades.filter((g) => g.points !== null),
    [profile.grades]
  );

  const totalGradeSlots = useMemo(
    () => profile.subjects.filter((s) => s !== 'psem').length * 4,
    [profile.subjects]
  );

  const enteredExams = useMemo(
    () => profile.exams.filter((e) => e.points !== null),
    [profile.exams]
  );

  const fieldCoverage = useMemo(
    () => checkFieldCoverage(profile.examSubjects.filter(Boolean)),
    [profile.examSubjects]
  );

  if (!hydrated) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-2">
          <GraduationCap className="h-6 w-6 text-violet-500 mx-auto animate-pulse" />
          <p className="text-[12px] text-muted-foreground/40">Lade Abitur-Daten...</p>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // SETTINGS VIEW
  // ═══════════════════════════════════════════════════════════

  if (view === 'settings') {
    return (
      <SettingsView
        profile={profile}
        onBack={() => setView('dashboard')}
      />
    );
  }

  // ═══════════════════════════════════════════════════════════
  // MAIN DASHBOARD
  // ═══════════════════════════════════════════════════════════

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <GraduationCap className="h-5 w-5 text-violet-500" strokeWidth={1.5} />
          <h1 className="text-xl font-semibold tracking-tight">Abitur Tracker</h1>
          <span className="text-[11px] text-muted-foreground/40 font-mono ml-1">{profile.schoolYear}</span>
        </div>
        <button
          onClick={() => setView('settings')}
          className="text-muted-foreground/40 hover:text-foreground transition-colors"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>

      {/* ── Score Overview ── */}
      <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
        {/* Top strip */}
        <div className={cn(
          'px-5 py-3 flex items-center justify-between',
          result.passed ? 'bg-emerald-600 dark:bg-emerald-700' : result.totalPoints >= 300 ? 'bg-amber-600 dark:bg-amber-700' : 'bg-violet-600 dark:bg-violet-700'
        )}>
          <span className="text-[12px] font-semibold text-white/90">
            {result.passed ? 'Bestanden' : result.totalPoints >= 300 ? 'Hürden prüfen' : 'In Bearbeitung'}
          </span>
          <span className="text-[11px] text-white/60 font-mono">
            Semester {profile.currentSemester}
          </span>
        </div>

        {/* Score body */}
        <div className="p-5">
          <div className="flex items-start gap-8">
            {/* Big grade */}
            <div className="text-center">
              <p className="text-5xl font-black tabular-nums tracking-tight leading-none">
                {enteredGrades.length > 0 ? result.finalGrade.toFixed(1) : '—'}
              </p>
              <p className="text-[10px] text-muted-foreground/40 mt-1.5 uppercase tracking-widest">
                {enteredGrades.length > 0 ? pointsToLabel(Math.round(result.blockI.average)) : 'Noch keine Noten'}
              </p>
            </div>

            {/* Points breakdown */}
            <div className="flex-1 space-y-3">
              {/* Block I */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-muted-foreground/50">
                    Block I — Halbjahresleistungen
                  </span>
                  <span className="text-[12px] font-semibold tabular-nums">
                    {result.blockI.totalPoints} / {result.blockI.maxPoints}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-foreground/[0.05] overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      result.blockI.totalPoints >= 200 ? 'bg-violet-500' : 'bg-red-400'
                    )}
                    style={{ width: `${Math.min(100, (result.blockI.totalPoints / result.blockI.maxPoints) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Block II */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-muted-foreground/50">
                    Block II — Abiturprüfungen
                  </span>
                  <span className="text-[12px] font-semibold tabular-nums">
                    {result.blockII.totalPoints} / {result.blockII.maxPoints}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-foreground/[0.05] overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      result.blockII.totalPoints >= 100 ? 'bg-violet-500' : 'bg-red-400'
                    )}
                    style={{ width: `${Math.min(100, (result.blockII.totalPoints / result.blockII.maxPoints) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Total */}
              <div className="flex items-center justify-between pt-1 border-t border-border/20">
                <span className="text-[11px] text-muted-foreground/50">Gesamt</span>
                <span className="text-[13px] font-bold tabular-nums">
                  {result.totalPoints} / {result.maxPoints} Punkte
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Quick Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Noten eingetragen"
          value={`${enteredGrades.length} / ${totalGradeSlots}`}
          sub={`${Math.round((enteredGrades.length / Math.max(1, totalGradeSlots)) * 100)}%`}
          color="text-violet-500"
        />
        <StatCard
          label="Durchschnitt"
          value={enteredGrades.length > 0 ? (enteredGrades.reduce((s, g) => s + (g.points ?? 0), 0) / enteredGrades.length).toFixed(1) : '—'}
          sub={enteredGrades.length > 0 ? `≈ Note ${pointsToGrade(Math.round(enteredGrades.reduce((s, g) => s + (g.points ?? 0), 0) / enteredGrades.length))}` : ''}
          color="text-sky-500"
        />
        <StatCard
          label="Unterpunktungen"
          value={`${result.blockI.deficitCount}`}
          sub={`max. 8 erlaubt`}
          color={result.blockI.deficitCount > 6 ? 'text-red-500' : result.blockI.deficitCount > 4 ? 'text-amber-500' : 'text-emerald-500'}
        />
        <StatCard
          label="Prüfungen"
          value={`${enteredExams.length} / 5`}
          sub={enteredExams.length > 0 ? `Ø ${(enteredExams.reduce((s, e) => s + (e.points ?? 0), 0) / enteredExams.length).toFixed(1)} P.` : 'ausstehend'}
          color="text-amber-500"
        />
      </div>

      {/* ── Navigation Tabs ── */}
      <div className="flex rounded-xl bg-foreground/[0.03] p-0.5">
        {([
          { id: 'grades' as const, label: 'Noten', icon: BookOpen },
          { id: 'exams' as const, label: 'Prüfungen', icon: Target },
          { id: 'hurdles' as const, label: 'Hürden', icon: Shield },
        ]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setView(view === id ? 'dashboard' : id)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-[12px] font-medium transition-all',
              view === id
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground/40 hover:text-muted-foreground/60'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Grades Grid ── */}
      {(view === 'dashboard' || view === 'grades') && (
        <GradesGrid profile={profile} onSetGrade={setGrade} />
      )}

      {/* ── Exam Section ── */}
      {(view === 'dashboard' || view === 'exams') && (
        <ExamsSection
          profile={profile}
          result={result}
          onSetExamPoints={setExamPoints}
          onSetSeminarPaper={setSeminarPaperPoints}
          onSetSeminarPresentation={setSeminarPresentationPoints}
        />
      )}

      {/* ── Hurdles Section ── */}
      {(view === 'dashboard' || view === 'hurdles') && (
        <HurdlesSection result={result} fieldCoverage={fieldCoverage} />
      )}

      {/* ── Grade Projection ── */}
      {view === 'dashboard' && enteredGrades.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-wider mb-2.5">
            Notenprojektion
          </p>
          <div className="rounded-xl border border-border/40 overflow-hidden">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border/20">
                  <th className="text-left px-3 py-2 text-[10px] text-muted-foreground/40 font-medium uppercase">Ziel</th>
                  <th className="text-center px-3 py-2 text-[10px] text-muted-foreground/40 font-medium uppercase">Ø Noten nötig</th>
                  <th className="text-center px-3 py-2 text-[10px] text-muted-foreground/40 font-medium uppercase">Ø Prüfungen</th>
                  <th className="text-center px-3 py-2 text-[10px] text-muted-foreground/40 font-medium uppercase">Erreichbar</th>
                </tr>
              </thead>
              <tbody>
                {([
                  { label: '1,0', data: projection.for10 },
                  { label: '1,5', data: projection.for15 },
                  { label: '2,0', data: projection.for20 },
                  { label: '2,5', data: projection.for25 },
                  { label: '3,0', data: projection.for30 },
                ]).map(({ label, data }) => (
                  <tr key={label} className="border-b border-border/10 last:border-0">
                    <td className="px-3 py-2 font-semibold">{label}</td>
                    <td className={cn('text-center px-3 py-2 tabular-nums', getPointsColor(Math.round(data.neededBlockIAvg)))}>
                      {data.neededBlockIAvg.toFixed(1)} P.
                    </td>
                    <td className={cn('text-center px-3 py-2 tabular-nums', getPointsColor(Math.round(data.neededExamAvg)))}>
                      {data.neededExamAvg.toFixed(1)} P.
                    </td>
                    <td className="text-center px-3 py-2">
                      {data.achievable ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 inline" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-red-400 inline" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// GRADES GRID
// ═══════════════════════════════════════════════════════════

function GradesGrid({
  profile,
  onSetGrade,
}: {
  profile: AbiturProfile;
  onSetGrade: (subjectId: string, semester: Semester, points: number | null) => void;
}) {
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const subjects = profile.subjects
    .map((id) => getSubject(id))
    .filter((s): s is SubjectDefinition => !!s && s.id !== 'psem');

  // Group by field
  const field1 = subjects.filter((s) => s.field === 1);
  const field2 = subjects.filter((s) => s.field === 2);
  const field3 = subjects.filter((s) => s.field === 3);
  const field0 = subjects.filter((s) => s.field === 0);

  const getGrade = (subjectId: string, semester: Semester): number | null => {
    const g = profile.grades.find((g) => g.subjectId === subjectId && g.semester === semester);
    return g?.points ?? null;
  };

  const subjectAverage = (subjectId: string): number | null => {
    const grades = SEMESTERS.map((s) => getGrade(subjectId, s)).filter((g): g is number => g !== null);
    if (grades.length === 0) return null;
    return grades.reduce((a, b) => a + b, 0) / grades.length;
  };

  const handleCellClick = (subjectId: string, semester: Semester) => {
    const cellKey = `${subjectId}-${semester}`;
    const currentGrade = getGrade(subjectId, semester);
    setEditingCell(cellKey);
    setEditValue(currentGrade !== null ? String(currentGrade) : '');
  };

  const handleCellSubmit = (subjectId: string, semester: Semester) => {
    const trimmed = editValue.trim();
    if (trimmed === '') {
      onSetGrade(subjectId, semester, null);
    } else {
      const val = parseInt(trimmed, 10);
      if (!isNaN(val) && val >= 0 && val <= 15) {
        onSetGrade(subjectId, semester, val);
      }
    }
    setEditingCell(null);
  };

  const renderFieldGroup = (label: string, fieldSubjects: SubjectDefinition[], fieldNum: number) => {
    if (fieldSubjects.length === 0) return null;
    const fieldColors: Record<number, string> = {
      1: 'border-l-sky-500',
      2: 'border-l-amber-500',
      3: 'border-l-emerald-500',
      0: 'border-l-muted-foreground/30',
    };

    return (
      <div key={fieldNum}>
        <p className="text-[9px] text-muted-foreground/30 uppercase tracking-widest mb-1.5 mt-4 first:mt-0">
          {label}
        </p>
        {fieldSubjects.map((subject) => {
          const isExamSubject = profile.examSubjects.includes(subject.id);
          const isLF = profile.leistungsfach === subject.id;
          const avg = subjectAverage(subject.id);

          return (
            <div
              key={subject.id}
              className={cn(
                'flex items-center border-l-2 mb-0.5 rounded-r-lg transition-colors',
                fieldColors[fieldNum],
                isLF && 'bg-violet-500/[0.04]'
              )}
            >
              {/* Subject name */}
              <div className="w-28 lg:w-36 px-2.5 py-1.5 shrink-0 flex items-center gap-1.5">
                <span className={cn('text-[12px] truncate', isLF ? 'font-bold text-violet-500' : isExamSubject ? 'font-semibold' : '')}>
                  {subject.shortName}
                </span>
                {isLF && <span className="text-[8px] bg-violet-500/15 text-violet-500 px-1 rounded font-bold">LF</span>}
                {isExamSubject && !isLF && <span className="text-[8px] bg-foreground/5 text-muted-foreground/40 px-1 rounded">P</span>}
              </div>

              {/* Semester cells */}
              {SEMESTERS.map((semester) => {
                const cellKey = `${subject.id}-${semester}`;
                const points = getGrade(subject.id, semester);
                const isEditing = editingCell === cellKey;

                return (
                  <div key={semester} className="flex-1 px-0.5">
                    {isEditing ? (
                      <input
                        type="number"
                        min={0}
                        max={15}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => handleCellSubmit(subject.id, semester)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCellSubmit(subject.id, semester);
                          if (e.key === 'Escape') setEditingCell(null);
                        }}
                        autoFocus
                        className="w-full h-8 rounded-md border border-violet-500/40 bg-transparent text-center text-[13px] font-semibold tabular-nums focus:outline-none"
                      />
                    ) : (
                      <button
                        onClick={() => handleCellClick(subject.id, semester)}
                        className={cn(
                          'w-full h-8 rounded-md text-[13px] font-semibold tabular-nums transition-all',
                          points !== null ? getPointsBg(points) : 'hover:bg-foreground/[0.03]',
                          points !== null ? getPointsColor(points) : 'text-muted-foreground/15',
                          points !== null && isDeficit(points) && 'ring-1 ring-inset ring-red-400/30',
                        )}
                      >
                        {points !== null ? points : '·'}
                      </button>
                    )}
                  </div>
                );
              })}

              {/* Average */}
              <div className="w-12 text-center shrink-0">
                <span className={cn('text-[11px] tabular-nums font-medium', avg !== null ? getPointsColor(Math.round(avg)) : 'text-muted-foreground/15')}>
                  {avg !== null ? avg.toFixed(1) : '—'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div>
      <p className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-wider mb-2.5">
        Halbjahresleistungen
      </p>
      <div className="rounded-xl border border-border/40 p-3 overflow-x-auto">
        {/* Header */}
        <div className="flex items-center mb-2">
          <div className="w-28 lg:w-36 shrink-0" />
          {SEMESTERS.map((s) => (
            <div key={s} className="flex-1 text-center">
              <span className={cn(
                'text-[10px] font-medium uppercase tracking-wider',
                s === profile.currentSemester ? 'text-violet-500' : 'text-muted-foreground/30'
              )}>
                {s}
              </span>
            </div>
          ))}
          <div className="w-12 text-center shrink-0">
            <span className="text-[10px] text-muted-foreground/30 font-medium">Ø</span>
          </div>
        </div>

        {renderFieldGroup('Aufgabenfeld I — Sprachen & Kunst', field1, 1)}
        {renderFieldGroup('Aufgabenfeld II — Gesellschaft', field2, 2)}
        {renderFieldGroup('Aufgabenfeld III — MINT', field3, 3)}
        {renderFieldGroup('Weitere', field0, 0)}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// EXAMS SECTION
// ═══════════════════════════════════════════════════════════

function ExamsSection({
  profile,
  result,
  onSetExamPoints,
  onSetSeminarPaper,
  onSetSeminarPresentation,
}: {
  profile: AbiturProfile;
  result: ReturnType<typeof calculateAbitur>;
  onSetExamPoints: (subjectId: string, points: number | null) => void;
  onSetSeminarPaper: (points: number | null) => void;
  onSetSeminarPresentation: (points: number | null) => void;
}) {
  const [editingExam, setEditingExam] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const examLabels = ['Schriftlich: Deutsch', 'Schriftlich: Mathematik', 'Schriftlich: Leistungsfach', 'Kolloquium 1', 'Kolloquium 2'];

  return (
    <div>
      <p className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-wider mb-2.5">
        Abiturprüfungen
      </p>
      <div className="rounded-xl border border-border/40 overflow-hidden">
        {profile.exams.map((exam, i) => {
          const subject = getSubject(exam.subjectId);
          const isEditing = editingExam === exam.subjectId;
          const weighted = exam.points !== null ? exam.points * 4 : null;

          return (
            <div
              key={i}
              className={cn(
                'flex items-center gap-3 px-4 py-3 border-b border-border/20 last:border-0',
                i < 3 ? 'bg-foreground/[0.01]' : ''
              )}
            >
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium truncate">
                  {subject ? subject.name : exam.subjectId ? exam.subjectId : '— Fach wählen —'}
                </p>
                <p className="text-[10px] text-muted-foreground/40">{examLabels[i]}</p>
              </div>

              <div className="flex items-center gap-3">
                {isEditing ? (
                  <input
                    type="number"
                    min={0}
                    max={15}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => {
                      const val = parseInt(editValue, 10);
                      if (!isNaN(val) && val >= 0 && val <= 15) {
                        onSetExamPoints(exam.subjectId, val);
                      } else if (editValue.trim() === '') {
                        onSetExamPoints(exam.subjectId, null);
                      }
                      setEditingExam(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      if (e.key === 'Escape') setEditingExam(null);
                    }}
                    autoFocus
                    className="w-14 h-8 rounded-md border border-violet-500/40 bg-transparent text-center text-[13px] font-semibold tabular-nums focus:outline-none"
                  />
                ) : (
                  <button
                    onClick={() => {
                      if (!exam.subjectId) return;
                      setEditingExam(exam.subjectId);
                      setEditValue(exam.points !== null ? String(exam.points) : '');
                    }}
                    className={cn(
                      'w-14 h-8 rounded-md text-[13px] font-semibold tabular-nums transition-all',
                      exam.points !== null ? getPointsBg(exam.points) : 'bg-foreground/[0.03]',
                      exam.points !== null ? getPointsColor(exam.points) : 'text-muted-foreground/20'
                    )}
                  >
                    {exam.points !== null ? exam.points : '·'}
                  </button>
                )}

                <div className="w-16 text-right">
                  <span className="text-[11px] text-muted-foreground/40 tabular-nums">
                    {weighted !== null ? `×4 = ${weighted}` : ''}
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        {/* Block II total */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-foreground/[0.02] border-t border-border/30">
          <span className="text-[11px] text-muted-foreground/50 font-medium">Block II Gesamt</span>
          <span className="text-[13px] font-bold tabular-nums">
            {result.blockII.totalPoints} / 300
          </span>
        </div>
      </div>

      {/* Seminar */}
      <div className="mt-3 rounded-xl border border-border/40 p-4 space-y-3">
        <p className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-wider">
          W-Seminar
        </p>
        {profile.seminarTopicTitle && (
          <p className="text-[12px] text-muted-foreground/60 italic">&ldquo;{profile.seminarTopicTitle}&rdquo;</p>
        )}
        <div className="flex gap-4">
          <SeminarInput
            label="Seminararbeit"
            value={profile.seminarPaperPoints}
            onChange={onSetSeminarPaper}
          />
          <SeminarInput
            label="Präsentation"
            value={profile.seminarPresentationPoints}
            onChange={onSetSeminarPresentation}
          />
        </div>
      </div>
    </div>
  );
}

function SeminarInput({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState('');

  if (editing) {
    return (
      <div className="flex-1">
        <p className="text-[10px] text-muted-foreground/40 mb-1">{label}</p>
        <input
          type="number"
          min={0}
          max={15}
          value={editVal}
          onChange={(e) => setEditVal(e.target.value)}
          onBlur={() => {
            const val = parseInt(editVal, 10);
            if (!isNaN(val) && val >= 0 && val <= 15) onChange(val);
            else if (editVal.trim() === '') onChange(null);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setEditing(false);
          }}
          autoFocus
          className="w-full h-8 rounded-md border border-violet-500/40 bg-transparent text-center text-[13px] font-semibold tabular-nums focus:outline-none"
        />
      </div>
    );
  }

  return (
    <div className="flex-1">
      <p className="text-[10px] text-muted-foreground/40 mb-1">{label}</p>
      <button
        onClick={() => { setEditVal(value !== null ? String(value) : ''); setEditing(true); }}
        className={cn(
          'w-full h-8 rounded-md text-[13px] font-semibold tabular-nums transition-all',
          value !== null ? getPointsBg(value) : 'bg-foreground/[0.03]',
          value !== null ? getPointsColor(value) : 'text-muted-foreground/20'
        )}
      >
        {value !== null ? value : '·'}
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// HURDLES SECTION
// ═══════════════════════════════════════════════════════════

function HurdlesSection({
  result,
  fieldCoverage,
}: {
  result: ReturnType<typeof calculateAbitur>;
  fieldCoverage: ReturnType<typeof checkFieldCoverage>;
}) {
  return (
    <div>
      <p className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-wider mb-2.5">
        Zulassungshürden
      </p>
      <div className="rounded-xl border border-border/40 overflow-hidden">
        {result.hurdles.map((hurdle) => (
          <div
            key={hurdle.id}
            className={cn(
              'flex items-center gap-3 px-4 py-3 border-b border-border/20 last:border-0',
              !hurdle.passed && 'bg-red-500/[0.03]'
            )}
          >
            {hurdle.passed ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 text-red-500 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium">{hurdle.label}</p>
              <p className="text-[10px] text-muted-foreground/40">{hurdle.description}</p>
            </div>
          </div>
        ))}

        {/* Field coverage */}
        <div className={cn(
          'flex items-center gap-3 px-4 py-3 border-t border-border/30',
          !fieldCoverage.allCovered && 'bg-amber-500/[0.03]'
        )}>
          {fieldCoverage.allCovered ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-medium">Aufgabenfeldabdeckung</p>
            <div className="flex gap-2 mt-1">
              {([
                { label: 'AF I', ok: fieldCoverage.field1 },
                { label: 'AF II', ok: fieldCoverage.field2 },
                { label: 'AF III', ok: fieldCoverage.field3 },
              ]).map(({ label, ok }) => (
                <span
                  key={label}
                  className={cn(
                    'text-[9px] font-medium px-1.5 py-0.5 rounded',
                    ok ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-400'
                  )}
                >
                  {label} {ok ? '✓' : '✗'}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SETTINGS VIEW
// ═══════════════════════════════════════════════════════════

function SettingsView({ profile, onBack }: { profile: AbiturProfile; onBack: () => void }) {
  const {
    setStudentName, setSchoolYear, setCurrentSemester,
    setLeistungsfach, setSeminarTopicTitle,
    addSubject, removeSubject, setExamSubject, resetProfile,
  } = useAbiturStore();

  const [showAddSubject, setShowAddSubject] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const availableSubjects = ALL_SUBJECTS.filter(
    (s) => !profile.subjects.includes(s.id) && s.id !== 'psem'
  );

  const lfOptions = ALL_SUBJECTS.filter((s) => s.canBeLF && s.id !== 'deu' && s.id !== 'mat');

  const colloquiumOptions = profile.subjects
    .map((id) => getSubject(id))
    .filter((s): s is SubjectDefinition =>
      !!s && !['deu', 'mat', profile.leistungsfach].includes(s.id) && s.id !== 'psem' && s.id !== 'wsem'
    );

  return (
    <div className="p-4 lg:p-8 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-muted-foreground/40 hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <Settings className="h-4 w-4 text-violet-500" />
        <h1 className="text-lg font-semibold tracking-tight">Einstellungen</h1>
      </div>

      {/* Profile */}
      <SettingsSection title="Profil">
        <SettingsField label="Name">
          <input
            value={profile.studentName}
            onChange={(e) => setStudentName(e.target.value)}
            placeholder="Dein Name"
            className="w-full rounded-lg border border-border/40 bg-transparent px-3 py-2 text-[13px] placeholder:text-muted-foreground/25 focus:outline-none focus:border-violet-500/40"
          />
        </SettingsField>
        <SettingsField label="Schuljahr">
          <input
            value={profile.schoolYear}
            onChange={(e) => setSchoolYear(e.target.value)}
            placeholder="2025/2027"
            className="w-full rounded-lg border border-border/40 bg-transparent px-3 py-2 text-[13px] placeholder:text-muted-foreground/25 focus:outline-none focus:border-violet-500/40"
          />
        </SettingsField>
        <SettingsField label="Aktuelles Halbjahr">
          <div className="flex gap-2">
            {SEMESTERS.map((s) => (
              <button
                key={s}
                onClick={() => setCurrentSemester(s)}
                className={cn(
                  'flex-1 rounded-lg py-2 text-[12px] font-medium transition-all border',
                  s === profile.currentSemester
                    ? 'bg-violet-500/10 border-violet-500/25 text-violet-600 dark:text-violet-400'
                    : 'border-border/40 text-muted-foreground/50 hover:border-border/60'
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </SettingsField>
      </SettingsSection>

      {/* Leistungsfach */}
      <SettingsSection title="Leistungsfach">
        <p className="text-[10px] text-muted-foreground/40 mb-2">
          Dein gewähltes Leistungsfach (5 Wochenstunden, schriftliche Abiturprüfung)
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          {lfOptions.filter((s) => profile.subjects.includes(s.id)).map((s) => (
            <button
              key={s.id}
              onClick={() => setLeistungsfach(s.id)}
              className={cn(
                'rounded-lg px-3 py-2 text-[12px] font-medium transition-all border text-left',
                s.id === profile.leistungsfach
                  ? 'bg-violet-500/10 border-violet-500/25 text-violet-600 dark:text-violet-400'
                  : 'border-border/40 text-muted-foreground/50 hover:border-border/60'
              )}
            >
              {s.shortName}
            </button>
          ))}
        </div>
      </SettingsSection>

      {/* Exam Subjects (Colloquiums) */}
      <SettingsSection title="Kolloquien (Prüfungsfächer 4 & 5)">
        <p className="text-[10px] text-muted-foreground/40 mb-2">
          Wähle deine beiden mündlichen Prüfungsfächer. Fächer I, II und III müssen abgedeckt sein.
        </p>
        {([3, 4] as const).map((idx) => (
          <div key={idx} className="mb-2">
            <p className="text-[10px] text-muted-foreground/30 mb-1">Kolloquium {idx - 2}</p>
            <div className="flex flex-wrap gap-1.5">
              {colloquiumOptions.map((s) => {
                const isSelected = profile.examSubjects[idx] === s.id;
                const isUsedElsewhere = profile.examSubjects.includes(s.id) && !isSelected;
                return (
                  <button
                    key={s.id}
                    onClick={() => !isUsedElsewhere && setExamSubject(idx, s.id)}
                    disabled={isUsedElsewhere}
                    className={cn(
                      'rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all border',
                      isSelected
                        ? 'bg-violet-500/10 border-violet-500/25 text-violet-600 dark:text-violet-400'
                        : isUsedElsewhere
                          ? 'border-border/20 text-muted-foreground/20 cursor-not-allowed'
                          : 'border-border/40 text-muted-foreground/50 hover:border-border/60'
                    )}
                  >
                    {s.shortName}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </SettingsSection>

      {/* Subjects */}
      <SettingsSection title="Fächerbelegung">
        <div className="flex flex-wrap gap-1.5 mb-3">
          {profile.subjects.map((id) => {
            const subject = getSubject(id);
            if (!subject) return null;
            const isMandatory = ['deu', 'mat'].includes(id) || id === profile.leistungsfach || profile.examSubjects.includes(id);
            return (
              <div
                key={id}
                className={cn(
                  'flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium border',
                  isMandatory ? 'border-violet-500/20 bg-violet-500/5 text-violet-600 dark:text-violet-400' : 'border-border/40 text-muted-foreground/60'
                )}
              >
                <span>{subject.shortName}</span>
                {!isMandatory && (
                  <button onClick={() => removeSubject(id)} className="text-muted-foreground/30 hover:text-red-400 transition-colors">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}
          <button
            onClick={() => setShowAddSubject(!showAddSubject)}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium border border-dashed border-border/40 text-muted-foreground/40 hover:text-violet-500 hover:border-violet-500/30 transition-colors"
          >
            <Plus className="h-3 w-3" />
            Fach
          </button>
        </div>
        {showAddSubject && availableSubjects.length > 0 && (
          <div className="rounded-xl border border-border/40 p-3 space-y-1">
            {availableSubjects.map((s) => (
              <button
                key={s.id}
                onClick={() => { addSubject(s.id); setShowAddSubject(false); }}
                className="w-full text-left flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] hover:bg-foreground/[0.03] transition-colors"
              >
                <Plus className="h-3 w-3 text-violet-500" />
                <span>{s.name}</span>
                <span className="text-[10px] text-muted-foreground/30 ml-auto">AF {s.field || '—'}</span>
              </button>
            ))}
          </div>
        )}
      </SettingsSection>

      {/* W-Seminar */}
      <SettingsSection title="W-Seminar">
        <SettingsField label="Thema">
          <input
            value={profile.seminarTopicTitle}
            onChange={(e) => setSeminarTopicTitle(e.target.value)}
            placeholder="Thema der Seminararbeit"
            className="w-full rounded-lg border border-border/40 bg-transparent px-3 py-2 text-[13px] placeholder:text-muted-foreground/25 focus:outline-none focus:border-violet-500/40"
          />
        </SettingsField>
      </SettingsSection>

      {/* Reset */}
      <div className="pt-4 border-t border-border/20">
        {confirmReset ? (
          <div className="flex items-center gap-3">
            <p className="text-[12px] text-red-400">Wirklich alle Daten zurücksetzen?</p>
            <button
              onClick={() => { resetProfile(); setConfirmReset(false); onBack(); }}
              className="text-[12px] text-red-500 font-medium hover:text-red-400 transition-colors"
            >
              Ja, zurücksetzen
            </button>
            <button
              onClick={() => setConfirmReset(false)}
              className="text-[12px] text-muted-foreground/40 hover:text-foreground transition-colors"
            >
              Abbrechen
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmReset(true)}
            className="text-[12px] text-muted-foreground/40 hover:text-red-400 transition-colors"
          >
            Alle Daten zurücksetzen
          </button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Shared Helpers
// ═══════════════════════════════════════════════════════════

function StatCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="rounded-xl border border-border/40 p-3">
      <p className={cn('text-xl font-bold tabular-nums', color)}>{value}</p>
      <p className="text-[10px] text-muted-foreground/40 mt-0.5">{label}</p>
      <p className="text-[9px] text-muted-foreground/25 mt-0.5">{sub}</p>
    </div>
  );
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-wider mb-2.5">{title}</p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function SettingsField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] text-muted-foreground/40 mb-1 block">{label}</label>
      {children}
    </div>
  );
}
