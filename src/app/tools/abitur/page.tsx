'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useAbiturStore } from '@/lib/abitur-store';
import {
  ALL_SUBJECTS,
  SEMESTERS,
  SEMESTER_LABELS,
  type Semester,
  type SubjectDefinition,
  getSubject,
  isEingebracht,
  canToggle,
  isMandatory,
  countAllEinbringungen,
  calculateAbitur,
  calculateNeededAverage,
  checkFieldCoverage,
  getPointsColor,
  getPointsBg,
  isDeficit,
  pointsToGrade,
  type AbiturProfile,
  type AbiturResult,
} from '@/lib/abitur';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  GraduationCap,
  ChevronRight,
  ChevronLeft,
  Check,
  Lock,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Target,
  BarChart3,
  BookOpen,
  Settings,
  XCircle,
  Info,
  ArrowLeft,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════

export default function AbiturPage() {
  const profile = useAbiturStore((s) => s.profile);

  if (!profile.onboardingComplete) return <OnboardingWizard />;
  return <AbiturDashboard />;
}

// ═══════════════════════════════════════════════════════════
// Onboarding Wizard
// ═══════════════════════════════════════════════════════════

function OnboardingWizard() {
  const { setSubjects, setLeistungsfach, setExamSubject, completeOnboarding } = useAbiturStore();
  const profile = useAbiturStore((s) => s.profile);

  const [step, setStep] = useState(0);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(profile.subjects);
  const [lf, setLf] = useState(profile.leistungsfach);
  const [exam4, setExam4] = useState(profile.examSubjects[3] || '');
  const [exam5, setExam5] = useState(profile.examSubjects[4] || '');

  const mandatoryIds = ['deu', 'mat', 'wsem', 'psem'];
  const lfOptions = ALL_SUBJECTS.filter((s) => s.canBeLF);

  const groupedOptional = useMemo(() => {
    const cats: Record<string, SubjectDefinition[]> = {};
    ALL_SUBJECTS.forEach((s) => {
      if (mandatoryIds.includes(s.id)) return;
      const c = s.category;
      if (!cats[c]) cats[c] = [];
      cats[c].push(s);
    });
    return cats;
  }, []);

  const catLabels: Record<string, string> = {
    language: 'Sprachen',
    art: 'Musische Fächer',
    social: 'Gesellschaftswiss.',
    stem: 'Naturwiss. & Mathe',
    sport: 'Sport',
    seminar: 'Seminare',
  };

  const toggleSubject = (id: string) => {
    if (mandatoryIds.includes(id)) return;
    setSelectedSubjects((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const finish = () => {
    setSubjects(selectedSubjects);
    setLeistungsfach(lf);
    setExamSubject(3, exam4);
    setExamSubject(4, exam5);
    completeOnboarding();
  };

  const steps = [
    // Step 0: Welcome
    <div key="welcome" className="flex flex-col items-center gap-6 text-center">
      <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center">
        <GraduationCap className="h-10 w-10 text-primary" />
      </div>
      <div>
        <h2 className="text-2xl font-bold">Abitur Tracker</h2>
        <p className="text-muted-foreground mt-2 max-w-md">
          Behalte den Überblick über deine Qualifikationsphase. Wähle deine Fächer, Prüfungen und verwalte deine Einbringungen.
        </p>
      </div>
    </div>,

    // Step 1: Select subjects
    <div key="subjects" className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-bold">Deine Fächer</h2>
        <p className="text-sm text-muted-foreground">Pflichtfächer sind vorausgewählt</p>
      </div>
      <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2">
        {Object.entries(groupedOptional).map(([cat, subs]) => (
          <div key={cat}>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              {catLabels[cat] || cat}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {subs.map((s) => {
                const selected = selectedSubjects.includes(s.id);
                const mandatory = mandatoryIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() => toggleSubject(s.id)}
                    disabled={mandatory}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all text-left',
                      selected
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border hover:border-primary/50',
                      mandatory && 'opacity-60 cursor-not-allowed'
                    )}
                  >
                    <div
                      className={cn(
                        'h-4 w-4 rounded border flex items-center justify-center shrink-0',
                        selected ? 'bg-primary border-primary' : 'border-muted-foreground/40'
                      )}
                    >
                      {selected && <Check className="h-3 w-3 text-primary-foreground" />}
                    </div>
                    <span className="truncate">{s.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>,

    // Step 2: Leistungsfach
    <div key="lf" className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-bold">Leistungsfach (LF)</h2>
        <p className="text-sm text-muted-foreground">
          Dein 3. schriftliches Abiturfach neben Deutsch und Mathematik
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 max-h-[50vh] overflow-y-auto pr-2">
        {lfOptions
          .filter((s) => selectedSubjects.includes(s.id))
          .map((s) => (
            <button
              key={s.id}
              onClick={() => setLf(s.id)}
              className={cn(
                'rounded-lg border px-3 py-3 text-sm transition-all text-left',
                lf === s.id
                  ? 'border-primary bg-primary/10 text-primary font-medium'
                  : 'border-border hover:border-primary/50'
              )}
            >
              {s.name}
            </button>
          ))}
      </div>
    </div>,

    // Step 3: Colloquium subjects (4th + 5th exam)
    <div key="exams" className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-bold">Kolloquiumsfächer</h2>
        <p className="text-sm text-muted-foreground">
          Wähle dein 4. und 5. Prüfungsfach (mündlich)
        </p>
      </div>
      {[
        { label: '4. Prüfungsfach', val: exam4, setVal: setExam4 },
        { label: '5. Prüfungsfach', val: exam5, setVal: setExam5 },
      ].map((row) => (
        <div key={row.label} className="space-y-2">
          <p className="text-sm font-medium">{row.label}</p>
          <div className="grid grid-cols-2 gap-2 max-h-[20vh] overflow-y-auto pr-1">
            {selectedSubjects
              .filter((id) => id !== 'deu' && id !== 'mat' && id !== lf && id !== 'wsem' && id !== 'psem')
              .filter((id) => id !== (row === arguments[0] ? exam5 : exam4))
              .map((id) => {
                const s = getSubject(id);
                if (!s) return null;
                return (
                  <button
                    key={id}
                    onClick={() => row.setVal(id)}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-sm transition-all text-left',
                      row.val === id
                        ? 'border-primary bg-primary/10 text-primary font-medium'
                        : 'border-border hover:border-primary/50'
                    )}
                  >
                    {s.name}
                  </button>
                );
              })}
          </div>
        </div>
      ))}
    </div>,
  ];

  const canNext =
    step === 0 ||
    (step === 1 && selectedSubjects.length >= 8) ||
    (step === 2 && lf !== '') ||
    (step === 3 && exam4 !== '' && exam5 !== '');

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] p-4">
      <Card className="w-full max-w-lg">
        <CardContent className="pt-6 pb-4 space-y-6">
          {/* Progress */}
          <div className="flex items-center gap-1 justify-center">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  i <= step ? 'bg-primary w-8' : 'bg-muted w-4'
                )}
              />
            ))}
          </div>

          {steps[step]}

          {/* Nav */}
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="ghost"
              onClick={() => setStep((s) => s - 1)}
              disabled={step === 0}
              size="sm"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Zurück
            </Button>
            {step < 3 ? (
              <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext} size="sm">
                Weiter
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={finish} disabled={!canNext} size="sm">
                <Check className="h-4 w-4 mr-1" />
                Fertig
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Main Dashboard
// ═══════════════════════════════════════════════════════════

type View = Semester | 'overview' | 'settings';

function AbiturDashboard() {
  const profile = useAbiturStore((s) => s.profile);
  const [view, setView] = useState<View>('overview');

  const result = useMemo(() => calculateAbitur(profile), [profile]);

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <GraduationCap className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Abitur Tracker</h1>
            <p className="text-xs text-muted-foreground">{profile.schoolYear}</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setView('settings')}>
          <Settings className="h-4 w-4" />
        </Button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-muted/50 rounded-xl p-1 overflow-x-auto">
        <TabBtn active={view === 'overview'} onClick={() => setView('overview')}>
          Gesamt
        </TabBtn>
        {SEMESTERS.map((s) => (
          <TabBtn key={s} active={view === s} onClick={() => setView(s)}>
            {SEMESTER_LABELS[s]}
          </TabBtn>
        ))}
      </div>

      {/* Content */}
      {view === 'settings' ? (
        <SettingsView onBack={() => setView('overview')} />
      ) : view === 'overview' ? (
        <OverviewTab result={result} profile={profile} />
      ) : (
        <SemesterTab semester={view as Semester} result={result} profile={profile} />
      )}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap',
        active ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {children}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════
// Overview Tab
// ═══════════════════════════════════════════════════════════

function OverviewTab({ result, profile }: { result: AbiturResult; profile: AbiturProfile }) {
  const projection = useMemo(() => calculateNeededAverage(profile, 1.0), [profile]);
  const einCount = countAllEinbringungen(profile);

  return (
    <div className="space-y-4">
      {/* Score Hero */}
      <Card>
        <CardContent className="pt-6 pb-5">
          <div className="text-center space-y-1">
            <p className="text-5xl font-black tracking-tight">{result.finalGrade.toFixed(1)}</p>
            <p className="text-sm text-muted-foreground">
              {result.totalPoints} / {result.maxPoints} Punkte
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-5">
            <MiniStat label="Block I" value={`${result.blockI.totalPoints}`} sub={`/ ${result.blockI.maxPoints}`} ok={result.blockI.passed} />
            <MiniStat label="Block II" value={`${result.blockII.totalPoints}`} sub={`/ ${result.blockII.maxPoints}`} ok={result.blockII.passed} />
          </div>
        </CardContent>
      </Card>

      {/* Einbringungen count */}
      <Card>
        <CardContent className="py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Einbringungen</span>
          </div>
          <span className={cn('text-sm font-bold', einCount >= 40 ? 'text-emerald-500' : 'text-amber-500')}>
            {einCount} / 40
          </span>
        </CardContent>
      </Card>

      {/* Semester overview cards */}
      <div className="grid grid-cols-2 gap-3">
        {result.semesterStats.map((ss) => (
          <Card key={ss.semester}>
            <CardContent className="py-4 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">{SEMESTER_LABELS[ss.semester]}</p>
              <div className="flex items-end gap-2">
                <p className="text-2xl font-bold">{ss.allAverage !== null ? ss.allAverage.toFixed(1) : '—'}</p>
                <p className="text-xs text-muted-foreground mb-1">Ø Alle</p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Ø Eingebrachte:</span>
                <span className="font-medium">{ss.eingebrachteAverage !== null ? ss.eingebrachteAverage.toFixed(1) : '—'}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {ss.enteredCount}/{ss.totalSubjects} Noten · {ss.einbringungCount} eingebracht · {ss.deficits} Defizite
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Hurdles */}
      <HurdlesSection hurdles={result.hurdles} />

      {/* Projection */}
      <Card>
        <CardContent className="py-4 space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-medium">Prognose für 1,0</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center p-2 rounded-lg bg-muted/50">
              <p className="text-lg font-bold">{projection.neededBlockIAvg.toFixed(1)}</p>
              <p className="text-xs text-muted-foreground">Ø Noten nötig</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-muted/50">
              <p className="text-lg font-bold">{projection.neededExamAvg.toFixed(1)}</p>
              <p className="text-xs text-muted-foreground">Ø Prüfungen nötig</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Exams section */}
      <ExamsSection profile={profile} />
    </div>
  );
}

function MiniStat({ label, value, sub, ok }: { label: string; value: string; sub: string; ok: boolean }) {
  return (
    <div className={cn('rounded-lg p-3 text-center', ok ? 'bg-emerald-500/10' : 'bg-red-500/10')}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold">
        {value} <span className="text-xs font-normal text-muted-foreground">{sub}</span>
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Semester Tab
// ═══════════════════════════════════════════════════════════

function SemesterTab({ semester, result, profile }: { semester: Semester; result: AbiturResult; profile: AbiturProfile }) {
  const ss = result.semesterStats.find((s) => s.semester === semester)!;
  const { setGrade, toggleEinbringung } = useAbiturStore();

  const subjects = profile.subjects.filter((id) => id !== 'psem');

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-2xl font-bold">{ss.allAverage !== null ? ss.allAverage.toFixed(1) : '—'}</p>
            <p className="text-xs text-muted-foreground">Ø Alle</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-2xl font-bold">{ss.eingebrachteAverage !== null ? ss.eingebrachteAverage.toFixed(1) : '—'}</p>
            <p className="text-xs text-muted-foreground">Ø Eingebr.</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <p className={cn('text-2xl font-bold', ss.deficits > 0 ? 'text-red-500' : 'text-emerald-500')}>{ss.deficits}</p>
            <p className="text-xs text-muted-foreground">Defizite</p>
          </CardContent>
        </Card>
      </div>

      {/* Grade rows */}
      <Card>
        <CardContent className="py-2 divide-y divide-border">
          {subjects.map((subjectId) => {
            const subj = getSubject(subjectId);
            if (!subj) return null;
            const grade = profile.grades.find((g) => g.subjectId === subjectId && g.semester === semester);
            const pts = grade?.points ?? null;
            const mandatory = isMandatory(subjectId, profile);
            const eingebracht = isEingebracht(subjectId, semester, profile);
            const toggleable = canToggle(subjectId, profile);

            return (
              <div key={subjectId} className="flex items-center gap-3 py-2.5">
                {/* Einbringung toggle */}
                <button
                  onClick={() => toggleable && toggleEinbringung(subjectId, semester)}
                  disabled={!toggleable}
                  className={cn(
                    'h-5 w-5 rounded border flex items-center justify-center shrink-0 transition-all',
                    eingebracht
                      ? mandatory
                        ? 'bg-primary/20 border-primary/40'
                        : 'bg-primary border-primary'
                      : 'border-muted-foreground/30 hover:border-primary/50',
                    !toggleable && 'cursor-not-allowed'
                  )}
                  title={mandatory ? 'Pflichteinbringung' : eingebracht ? 'Eingebracht (klicken zum Entfernen)' : 'Nicht eingebracht (klicken zum Einbringen)'}
                >
                  {eingebracht && (mandatory ? <Lock className="h-3 w-3 text-primary" /> : <Check className="h-3 w-3 text-primary-foreground" />)}
                </button>

                {/* Subject name */}
                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm font-medium truncate', !eingebracht && pts !== null && 'text-muted-foreground')}>
                    {subj.name}
                  </p>
                </div>

                {/* Points input */}
                <PointsInput
                  value={pts}
                  onChange={(v) => setGrade(subjectId, semester, v)}
                  dimmed={!eingebracht}
                />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground flex items-center gap-1">
        <Info className="h-3 w-3" />
        <Lock className="h-3 w-3" /> = Pflichteinbringung (D, M, LF, Prüfungsfächer). Checkbox = freiwillige Einbringung.
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Points Input
// ═══════════════════════════════════════════════════════════

function PointsInput({ value, onChange, dimmed }: { value: number | null; onChange: (v: number | null) => void; dimmed?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [tmp, setTmp] = useState('');

  const startEdit = () => {
    setTmp(value !== null ? String(value) : '');
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    const n = parseInt(tmp);
    if (tmp === '' || tmp === '-') onChange(null);
    else if (!isNaN(n) && n >= 0 && n <= 15) onChange(n);
  };

  if (editing) {
    return (
      <input
        autoFocus
        type="text"
        inputMode="numeric"
        value={tmp}
        onChange={(e) => setTmp(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        className="w-12 h-8 rounded-md border text-center text-sm font-mono bg-background focus:outline-none focus:ring-2 focus:ring-primary"
      />
    );
  }

  return (
    <button
      onClick={startEdit}
      className={cn(
        'w-12 h-8 rounded-md text-center text-sm font-mono font-bold transition-all',
        value !== null ? getPointsBg(value) : 'bg-muted/50',
        value !== null ? getPointsColor(value) : 'text-muted-foreground/40',
        dimmed && 'opacity-50'
      )}
    >
      {value !== null ? value.toString().padStart(2, '0') : '—'}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════
// Exams Section
// ═══════════════════════════════════════════════════════════

function ExamsSection({ profile }: { profile: AbiturProfile }) {
  const { setExamPoints } = useAbiturStore();

  return (
    <Card>
      <CardContent className="py-4 space-y-3">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-medium">Abiturprüfungen</p>
        </div>
        <div className="space-y-2">
          {profile.exams.map((exam, i) => {
            const s = getSubject(exam.subjectId);
            if (!s) return (
              <div key={i} className="flex items-center justify-between py-1.5 text-sm text-muted-foreground">
                <span>{i + 1}. Prüfung — nicht gewählt</span>
              </div>
            );
            return (
              <div key={exam.subjectId} className="flex items-center justify-between py-1.5">
                <div>
                  <p className="text-sm font-medium">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{exam.examType === 'written' ? 'Schriftlich' : 'Kolloquium'}</p>
                </div>
                <PointsInput value={exam.points} onChange={(v) => setExamPoints(exam.subjectId, v)} />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════
// Hurdles Section
// ═══════════════════════════════════════════════════════════

function HurdlesSection({ hurdles }: { hurdles: AbiturResult['hurdles'] }) {
  const failed = hurdles.filter((h) => !h.passed);
  const passed = hurdles.filter((h) => h.passed);

  return (
    <Card>
      <CardContent className="py-4 space-y-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-medium">Hürden</p>
          {failed.length === 0 ? (
            <span className="text-xs bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-full ml-auto">
              Alle bestanden
            </span>
          ) : (
            <span className="text-xs bg-red-500/10 text-red-500 px-2 py-0.5 rounded-full ml-auto">
              {failed.length} offen
            </span>
          )}
        </div>
        <div className="space-y-1.5">
          {failed.map((h) => (
            <HurdleRow key={h.id} hurdle={h} />
          ))}
          {passed.map((h) => (
            <HurdleRow key={h.id} hurdle={h} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function HurdleRow({ hurdle }: { hurdle: AbiturResult['hurdles'][0] }) {
  return (
    <div className={cn('flex items-center gap-2 py-1 text-sm', hurdle.passed ? 'text-muted-foreground' : 'text-foreground')}>
      {hurdle.passed ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
      ) : (
        <XCircle className="h-4 w-4 text-red-500 shrink-0" />
      )}
      <span className="flex-1">{hurdle.label}</span>
      <span className="text-xs text-muted-foreground font-mono">{hurdle.description}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Settings View
// ═══════════════════════════════════════════════════════════

function SettingsView({ onBack }: { onBack: () => void }) {
  const profile = useAbiturStore((s) => s.profile);
  const {
    setStudentName, setSchoolYear, setCurrentSemester, setLeistungsfach,
    setSubjects, setExamSubject, setSeminarTopic, setSeminarPaperPoints,
    setSeminarPresentationPoints, resetProfile,
  } = useAbiturStore();

  const [confirmReset, setConfirmReset] = useState(false);
  const lfOptions = ALL_SUBJECTS.filter((s) => s.canBeLF && profile.subjects.includes(s.id));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-bold">Einstellungen</h2>
      </div>

      <SettingsSection title="Persönlich">
        <SettingsField label="Name">
          <input
            value={profile.studentName}
            onChange={(e) => setStudentName(e.target.value)}
            placeholder="Dein Name"
            className="w-full bg-transparent text-sm outline-none"
          />
        </SettingsField>
        <SettingsField label="Schuljahr">
          <input
            value={profile.schoolYear}
            onChange={(e) => setSchoolYear(e.target.value)}
            placeholder="2025/2027"
            className="w-full bg-transparent text-sm outline-none"
          />
        </SettingsField>
        <SettingsField label="Aktuelles Halbjahr">
          <select
            value={profile.currentSemester}
            onChange={(e) => setCurrentSemester(e.target.value as Semester)}
            className="bg-transparent text-sm outline-none"
          >
            {SEMESTERS.map((s) => (
              <option key={s} value={s}>{SEMESTER_LABELS[s]}</option>
            ))}
          </select>
        </SettingsField>
      </SettingsSection>

      <SettingsSection title="Leistungsfach">
        <SettingsField label="LF (3. Schriftliches)">
          <select
            value={profile.leistungsfach}
            onChange={(e) => setLeistungsfach(e.target.value)}
            className="bg-transparent text-sm outline-none"
          >
            {lfOptions.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </SettingsField>
      </SettingsSection>

      <SettingsSection title="Prüfungsfächer">
        {profile.examSubjects.map((sid, i) => (
          <SettingsField key={i} label={`${i + 1}. Prüfung${i < 3 ? ' (schriftl.)' : ' (Kolloquium)'}`}>
            {i < 3 ? (
              <span className="text-sm text-muted-foreground">{getSubject(sid)?.name || '—'}</span>
            ) : (
              <select
                value={sid}
                onChange={(e) => setExamSubject(i, e.target.value)}
                className="bg-transparent text-sm outline-none"
              >
                <option value="">Wählen...</option>
                {profile.subjects
                  .filter((id) => id !== 'deu' && id !== 'mat' && id !== profile.leistungsfach && id !== 'wsem' && id !== 'psem')
                  .map((id) => {
                    const s = getSubject(id);
                    return s ? <option key={id} value={id}>{s.name}</option> : null;
                  })}
              </select>
            )}
          </SettingsField>
        ))}
      </SettingsSection>

      <SettingsSection title="W-Seminar">
        <SettingsField label="Thema">
          <input
            value={profile.seminarTopicTitle}
            onChange={(e) => setSeminarTopic(e.target.value)}
            placeholder="Seminarthema"
            className="w-full bg-transparent text-sm outline-none"
          />
        </SettingsField>
        <SettingsField label="Seminararbeit (0-15)">
          <PointsInput value={profile.seminarPaperPoints} onChange={setSeminarPaperPoints} />
        </SettingsField>
        <SettingsField label="Präsentation (0-15)">
          <PointsInput value={profile.seminarPresentationPoints} onChange={setSeminarPresentationPoints} />
        </SettingsField>
      </SettingsSection>

      <SettingsSection title="Daten">
        {confirmReset ? (
          <div className="flex items-center gap-2 py-2">
            <p className="text-sm text-red-500 flex-1">Alle Daten löschen?</p>
            <Button size="sm" variant="destructive" onClick={() => { resetProfile(); setConfirmReset(false); }}>
              Ja, löschen
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmReset(false)}>
              Abbrechen
            </Button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmReset(true)}
            className="w-full text-left text-sm text-red-500 py-2 hover:bg-red-500/5 rounded-lg px-2 transition-colors"
          >
            Alle Daten zurücksetzen
          </button>
        )}
      </SettingsSection>
    </div>
  );
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="py-3 space-y-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{title}</p>
        {children}
      </CardContent>
    </Card>
  );
}

function SettingsField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="text-right">{children}</div>
    </div>
  );
}
