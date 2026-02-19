'use client';

import { useSettingsStore, type Language } from './settings-store';

// ═══════════════════════════════════════════════════════════
// ORBIT — Lightweight i18n
// ═══════════════════════════════════════════════════════════

export type TranslationKey = keyof typeof en;

// ── Hockey / Medical mode overrides (German only) ──────────
// When hockeyMode is on, these keys replace the normal German
// translations to give the app a fun hockey + medical vibe.

const hockeyOverrides: Partial<Record<TranslationKey, string>> = {
  // ── Greetings (medical visite style) ─────────────────────
  'greeting.morning': 'Guten Morgen, Dr.',
  'greeting.afternoon': 'Mahlzeit, Dr.',
  'greeting.evening': 'Guten Abend, Dr.',

  // ── Types (hockey/medical terms) ─────────────────────────
  'type.task': 'Spielzug',
  'type.project': 'Saison',
  'type.habit': 'Training',
  'type.event': 'Anpfiff',
  'type.goal': 'Meisterschaft',
  'type.note': 'Rezept',

  // ── Inbox ────────────────────────────────────────────────
  'inbox.zero': 'Sauberes Eis! 🏒',
  'inbox.zeroDesc': 'Alles verarbeitet. Die Eisfläche ist frei für neue Spielzüge.',

  // ── Status ───────────────────────────────────────────────
  'status.active': 'Im Spiel',
  'status.waiting': 'Auf der Bank',
  'status.done': 'Tor! ✓',
  'status.archived': 'Ruhestand',
  'status.active.desc': 'Wird gerade gespielt',
  'status.waiting.desc': 'Sitzt auf der Ersatzbank',
  'status.done.desc': 'Erfolgreich abgeschlossen — TOOOR!',
  'status.archived.desc': 'Karriere beendet',

  // ── Priority (triage) ───────────────────────────────────
  'priority.high': 'Notfall 🚨',
  'priority.medium': 'Dringend',
  'priority.low': 'Wartezimmer',
  'priority.none': 'Keine Triage',

  // ── Habits ───────────────────────────────────────────────
  'habits.streak': 'Siegesserie',
  'habits.noHabits': 'Kein Training geplant',
  'habits.noHabitsTap': 'Tippe auf + um dein erstes Training zu starten',

  // ── Dashboard ────────────────────────────────────────────
  'dashboard.tasks': 'Spielzüge',
  'dashboard.habitsLabel': 'Training',
  'dashboard.projectsLabel': 'Saisons',
  'dashboard.nothingScheduled': 'Spielfrei — genieße die Pause, Dr.',
  'dashboard.noTasksPast': 'Kein Spiel an diesem Tag',
  'dashboard.noHabitsScheduled': 'Trainingsfreier Tag',

  // ── Today page ───────────────────────────────────────────
  'today.tasks': 'Spielzüge',
  'today.habits': 'Training',
  'today.events': 'Anpfiffe',
  'today.noTasks': 'Kein Spielzug für heute — die Bank ist voll',
  'today.noHabits': 'Heute kein Training geplant',
  'today.overdue': 'Nachspielzeit ⏱️',

  // ── Goals page ───────────────────────────────────────────
  'goals.noGoals': 'Noch keine Meisterschaften',
  'goals.noGoalsDesc': 'Definiere Meisterschaften und verknüpfe Spielzüge für den Pokal.',

  // ── Projects page ────────────────────────────────────────
  'projects.newProject': 'Neue Saison',
  'projects.noProjects': 'Noch keine Saisons',
  'projects.addTask': 'Spielzug hinzufügen',

  // ── Onboarding ───────────────────────────────────────────
  'onboarding.title': 'Anpfiff! 🏒',
  'onboarding.description': 'Drücke ⌘K um deinen ersten Spielzug zu starten, Dr.',
  'onboarding.cta': 'Erstes Bully',

  // ── Command bar ──────────────────────────────────────────
  'commandBar.placeholder': 'Spielzug ansagen...',
  'commandBar.tip': 'Tipp: Nutze #tag !notfall @saison und Daten wie morgen oder 15.03',

  // ── Item row ─────────────────────────────────────────────
  'itemRow.doneSwipe': 'TOR!',

  // ── Common ───────────────────────────────────────────────
  'common.done': 'Tor!',
  'common.overdue': 'Nachspielzeit',

  // ── Notes ────────────────────────────────────────────────
  'notes.takeANote': 'Rezept schreiben...',
  'notes.noNotes': 'Noch keine Rezepte',
  'notes.noNotesDesc': 'Schreibe Rezepte, Diagnosen und Behandlungspläne.',
  'notes.titlePlaceholder': 'Diagnose...',
  'notes.contentPlaceholder': 'Rezept schreiben... (nutze - oder • für Listen)',

  // ── Archive ──────────────────────────────────────────────
  'archive.subtitle': 'Abgeschlossene Spiele und Ruhestand',
  'archive.noCompleted': 'Noch keine Tore geschossen',
  'archive.noCompletedDesc': 'Erledigte Spielzüge erscheinen hier',

  // ── Navigation (fun labels) ──────────────────────────────
  'nav.inbox': 'Kabine',
  'nav.tasks': 'Spielzüge',
  'nav.habits': 'Training',
  'nav.goals': 'Meisterschaften',
  'nav.notes': 'Rezepte',
  'nav.archive': 'Ruhestand',
  'nav.projects': 'Saisons',
  'nav.today': 'Spieltag',
  'nav.calendar': 'Spielplan',

  // ── Mobile nav ───────────────────────────────────────────
  'mobile.tasks': 'Spielzüge',
  'mobile.habits': 'Training',
  'mobile.notes': 'Rezepte',
};

// ── English (default) ──────────────────────────────────────

const en = {
  // ── Navigation ───────────────────────────────────────────
  'nav.dashboard': 'Dashboard',
  'nav.today': 'Today',
  'nav.tasks': 'Tasks',
  'nav.inbox': 'Inbox',
  'nav.organize': 'Organize',
  'nav.projects': 'Projects',
  'nav.habits': 'Habits',
  'nav.goals': 'Goals',
  'nav.capture': 'Capture',
  'nav.notes': 'Notes',
  'nav.calendar': 'Calendar',
  'nav.files': 'Files',
  'nav.archive': 'Archive',
  'nav.toolbox': 'Toolbox',
  'nav.allTools': 'All Tools',
  'nav.areas': 'Areas',
  'nav.settings': 'Settings',

  // ── Mobile nav ───────────────────────────────────────────
  'mobile.home': 'Home',
  'mobile.tasks': 'Tasks',
  'mobile.habits': 'Habits',
  'mobile.notes': 'Notes',
  'mobile.toolbox': 'Toolbox',

  // ── Sidebar ──────────────────────────────────────────────
  'sidebar.quickAdd': 'Quick add...',
  'sidebar.manageTags': 'Manage tags',
  'sidebar.doneTags': 'Done managing',
  'sidebar.addTag': 'Add tag',
  'sidebar.newTagPlaceholder': 'new tag...',
  'sidebar.localMode': 'Local mode',
  'sidebar.signOut': 'Sign out',

  // ── Common ───────────────────────────────────────────────
  'common.new': 'New',
  'common.create': 'Create',
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'common.archive': 'Archive',
  'common.restore': 'Restore',
  'common.rename': 'Rename',
  'common.search': 'Search',
  'common.viewAll': 'View all',
  'common.done': 'Done',
  'common.or': 'or',
  'common.on': 'On',
  'common.off': 'Off',
  'common.days': 'days',
  'common.min': 'min',
  'common.sent': 'Sent!',
  'common.saved': 'Saved',
  'common.export': 'Export',
  'common.import': 'Import',
  'common.today': 'Today',
  'common.overdue': 'Overdue',

  // ── Types ────────────────────────────────────────────────
  'type.task': 'Task',
  'type.project': 'Project',
  'type.habit': 'Habit',
  'type.event': 'Event',
  'type.goal': 'Goal',
  'type.note': 'Note',

  // ── Status ───────────────────────────────────────────────
  'status.inbox': 'Inbox',
  'status.active': 'Active',
  'status.waiting': 'Waiting',
  'status.done': 'Done',
  'status.archived': 'Archived',
  'status.active.desc': 'Currently working on this',
  'status.waiting.desc': 'Blocked or waiting for someone',
  'status.done.desc': 'Completed',
  'status.archived.desc': 'No longer relevant',

  // ── Priority ─────────────────────────────────────────────
  'priority.high': 'High',
  'priority.medium': 'Medium',
  'priority.low': 'Low',
  'priority.none': 'No Priority',

  // ── Frequency / Timeframe ─────────────────────────────────
  'frequency.daily': 'daily',
  'frequency.weekly': 'weekly',
  'frequency.custom': 'custom',
  'timeframe.quarterly': 'quarterly',
  'timeframe.yearly': 'yearly',
  'timeframe.longterm': 'longterm',

  // ── Note subtypes ────────────────────────────────────────
  'noteSubtype.general': 'general',
  'noteSubtype.idea': 'idea',
  'noteSubtype.principle': 'principle',
  'noteSubtype.plan': 'plan',
  'noteSubtype.journal': 'journal',

  // ── Greetings ────────────────────────────────────────────
  'greeting.morning': 'Good morning',
  'greeting.afternoon': 'Good afternoon',
  'greeting.evening': 'Good evening',

  // ── Dashboard ────────────────────────────────────────────
  'dashboard.events': 'Events',
  'dashboard.nothingScheduled': 'Nothing scheduled for this day',
  'dashboard.noTasksPast': 'No tasks were scheduled for this day',
  'dashboard.noHabitsScheduled': 'No habits scheduled',
  'dashboard.tasks': 'tasks',
  'dashboard.habitsLabel': 'habits',
  'dashboard.projectsLabel': 'projects',

  // ── Dashboard date context ───────────────────────────────
  'date.past': 'Past',
  'date.future': 'Future',
  'date.today': 'Today',
  'date.previousDay': 'Previous day',
  'date.nextDay': 'Next day',

  // ── Onboarding ───────────────────────────────────────────
  'onboarding.title': 'Start your orbit',
  'onboarding.description': 'Press ⌘K to create your first task, habit, or project.',
  'onboarding.cta': 'Create something',

  // ── Tasks page ───────────────────────────────────────────
  'tasks.searchPlaceholder': 'Search tasks...',
  'tasks.noTasks': 'No tasks',
  'tasks.noMatchSearch': 'No tasks match your search',
  'tasks.noCompleted': 'No completed tasks',
  'tasks.noActiveHint': 'No active tasks — use ⌘K to create one',
  'tasks.clearFilters': 'Clear filters',

  // ── Filter / Sort / Group ────────────────────────────────
  'filter.active': 'Active',
  'filter.completed': 'Completed',
  'filter.all': 'All',
  'sort.dueDate': 'Due Date',
  'sort.priority': 'Priority',
  'sort.newest': 'Newest',
  'sort.title': 'Title',
  'group.none': 'No Grouping',
  'group.byProject': 'By Project',
  'group.byGoal': 'By Goal',
  'group.byPriority': 'By Priority',
  'group.byDueDate': 'By Due Date',
  'group.byTag': 'By Tag',
  'group.allTasks': 'All Tasks',
  'group.noProject': 'No Project',
  'group.noGoal': 'No Goal',
  'group.noPriority': 'No Priority',
  'group.noDueDate': 'No Due Date',
  'group.untagged': 'Untagged',
  'group.highPriority': 'High Priority',
  'group.mediumPriority': 'Medium Priority',
  'group.lowPriority': 'Low Priority',

  // ── Inbox ────────────────────────────────────────────────
  'inbox.swipeHint': '← Swipe right to activate · Swipe left to delete →',
  'inbox.activate': 'Activate',
  'inbox.zero': 'Inbox zero',
  'inbox.zeroDesc': 'All items processed. Press ⌘K to add new ones.',

  // ── Today page ───────────────────────────────────────────
  'today.overdue': 'Overdue',
  'today.tasks': 'Tasks',
  'today.events': 'Events',
  'today.habits': 'Habits',
  'today.noTasks': 'No tasks for today',
  'today.noHabits': 'No habits scheduled',

  // ── Habits page ──────────────────────────────────────────
  'habits.week': 'Week',
  'habits.month': 'Month',
  'habits.streak': 'Streak',
  'habits.noHabits': 'No habits yet',
  'habits.noHabitsTap': 'Tap + to create your first habit',
  'habits.previousMonth': 'Previous month',
  'habits.nextMonth': 'Next month',

  // ── Goals page ───────────────────────────────────────────
  'goals.thisQuarter': 'This Quarter',
  'goals.thisYear': 'This Year',
  'goals.longterm': 'Long-term',
  'goals.noGoals': 'No goals yet',
  'goals.noGoalsDesc': 'Define goals and link tasks to track progress toward what matters.',

  // ── Projects page ────────────────────────────────────────
  'projects.grid': 'Grid',
  'projects.kanban': 'Kanban',
  'projects.newProject': 'New Project',
  'projects.noProjects': 'No projects yet',
  'projects.createToStart': 'Create one to get started',
  'projects.addTask': 'Add task',
  'projects.milestones': 'Milestones',
  'kanban.inProgress': 'In Progress',
  'kanban.waiting': 'Waiting',
  'kanban.done': 'Done',

  // ── Calendar ─────────────────────────────────────────────
  'calendar.importFromGoogle': 'Import from Google',
  'calendar.import': 'Import',
  'calendar.importing': 'Importing...',
  'calendar.noEventsMonth': 'No events this month',
  'calendar.eventsThisMonth': 'Events this month',
  'calendar.multiDay': 'Multi-day',
  'calendar.noEventsOrTasks': 'No events or tasks for this day',
  'calendar.wk': 'Wk',
  'calendar.untitledEvent': 'Untitled Event',

  // ── Notes page ───────────────────────────────────────────
  'notes.all': 'All',
  'notes.ideas': 'Ideas',
  'notes.principles': 'Principles',
  'notes.plans': 'Plans',
  'notes.journal': 'Journal',
  'notes.titlePlaceholder': 'Note title...',
  'notes.contentPlaceholder': 'Take a note... (use - or • for bullets, 1. 2. 3. for numbered lists)',
  'notes.saveHint': '⌘↵ save · esc cancel',
  'notes.takeANote': 'Take a note...',
  'notes.noNotes': 'No notes yet',
  'notes.noNotesDesc': 'Capture ideas, principles, plans, and reflections.',
  'notes.untitled': 'Untitled',

  // ── Archive ──────────────────────────────────────────────
  'archive.subtitle': 'View completed and archived items',
  'archive.completedTab': 'Completed',
  'archive.archivedTab': 'Archived',
  'archive.uncomplete': 'Uncomplete',
  'archive.noCompleted': 'No completed items',
  'archive.noCompletedDesc': 'Completed tasks and goals will appear here',
  'archive.archiveEmpty': 'Archive is empty',
  'archive.archiveEmptyDesc': 'Archived items will appear here',

  // ── Item row ─────────────────────────────────────────────
  'itemRow.waiting': 'Waiting',
  'itemRow.today': 'today',
  'itemRow.todayBtn': 'Today',
  'itemRow.removeBtn': 'Remove',
  'itemRow.doneSwipe': 'Done',

  // ── Detail panel ─────────────────────────────────────────
  'detail.changeType': 'Change Type',
  'detail.changeStatus': 'Change Status',
  'detail.linksRelations': 'Links & Relations',
  'detail.frequency': 'Frequency',
  'detail.timeframe': 'Timeframe',
  'detail.category': 'Category',
  'detail.priority': 'Priority',
  'detail.startDate': 'Start Date',
  'detail.startTime': 'Start Time',
  'detail.endDate': 'End Date',
  'detail.endTime': 'End Time',
  'detail.successMetric': 'Success Metric',
  'detail.checklist': 'Checklist',
  'detail.notes': 'Notes',
  'detail.tags': 'Tags',
  'detail.parent': 'Parent',
  'detail.addToToday': 'Add to Today',
  'detail.viewLinkGraph': 'View link graph',
  'detail.itemDetails': 'Item Details',
  'detail.titlePlaceholder': 'Title…',
  'detail.metricPlaceholder': 'How will you measure success?',
  'detail.checklistPlaceholder': 'Add checklist item…',
  'detail.notesPlaceholder': 'Write your thoughts…',
  'detail.timePlaceholder': 'Time',
  'detail.syncing': 'Syncing...',
  'detail.syncedToCalendar': 'Synced to Calendar ✓',
  'detail.syncToGoogle': 'Sync to Google Calendar',
  'detail.syncFailed': 'Failed to sync with Google Calendar.',

  // ── Command bar ──────────────────────────────────────────
  'commandBar.placeholder': 'What do you need?',
  'commandBar.tags': 'Tags',
  'commandBar.priority': 'Priority',
  'commandBar.linkTo': 'Link to',
  'commandBar.results': 'Results',
  'commandBar.commands': 'Commands',
  'commandBar.createTag': 'Create tag',
  'commandBar.createTags': 'Create tags',
  'commandBar.tip': 'Tip: Use #tag !high @project and dates like tomorrow or 15.03',

  // ── Login screen ─────────────────────────────────────────
  'login.welcome': 'Welcome to ORBIT',
  'login.tagline': 'Your personal system for tasks, habits, goals, and ideas.',
  'login.continueGoogle': 'Continue with Google',
  'login.signInEmail': 'Sign in with Email',
  'login.signInEmailLink': 'Sign in with Email Link',
  'login.tryWithout': 'Try without account',
  'login.createAccount': 'Create Account',
  'login.createAccountDesc': 'Set up your account to sync across devices.',
  'login.emailLinkDesc': "We'll send a passwordless sign-in link to your email.",
  'login.checkInbox': 'Check your Inbox',
  'login.sendSignInLink': 'Send Sign-in Link',
  'login.signIn': 'Sign In',
  'login.back': '← Back',
  'login.backToLogin': '← Back to login',
  'login.usePasswordInstead': 'Use password instead',
  'login.dontHaveAccount': "Don't have an account? Sign up",
  'login.alreadyHaveAccount': 'Already have an account? Sign in',
  'login.localModeNote': 'Local mode stores everything in your browser. No account needed.',
  'login.dataEncrypted': 'Your data is encrypted and synced securely via Firebase.',
  'login.namePlaceholder': 'Display name (optional)',
  'login.emailPlaceholder': 'Email',
  'login.passwordPlaceholder': 'Password',

  // ── Auth errors ──────────────────────────────────────────
  'error.userNotFound': 'No account with that email.',
  'error.wrongPassword': 'Incorrect password.',
  'error.invalidEmail': 'Invalid email address.',
  'error.emailInUse': 'Email already registered. Try signing in.',
  'error.weakPassword': 'Password must be at least 6 characters.',
  'error.invalidCredential': 'Invalid email or password.',
  'error.tooManyRequests': 'Too many attempts. Try again later.',
  'error.generic': 'Something went wrong. Please try again.',

  // ── Settings ─────────────────────────────────────────────
  'settings.title': 'Settings',
  'settings.profile': 'Profile',
  'settings.appearance': 'Appearance',
  'settings.languageRegion': 'Language & Region',
  'settings.general': 'General',
  'settings.notifications': 'Notifications',
  'settings.calendar': 'Calendar',
  'settings.shortcuts': 'Keyboard Shortcuts',
  'settings.privacy': 'Privacy & Security',
  'settings.accessibility': 'Accessibility',
  'settings.dataStorage': 'Data & Storage',
  'settings.user': 'User',
  'settings.demoMode': 'Demo Mode',
  'settings.displayName': 'Display Name',
  'settings.displayNameDesc': 'How you appear in the app',
  'settings.yourNamePlaceholder': 'Your name',
  'settings.email': 'Email',
  'settings.emailDesc': 'Linked to your account',
  'settings.bio': 'Bio',
  'settings.bioDesc': 'Short description about yourself',
  'settings.bioPlaceholder': 'A few words...',
  'settings.timezone': 'Timezone',
  'settings.timezoneDesc': 'Used for scheduling and due dates',
  'settings.signOut': 'Sign out',
  'settings.theme': 'Theme',
  'settings.themeDesc': 'Choose how Orbit looks',
  'settings.light': 'Light',
  'settings.dark': 'Dark',
  'settings.system': 'System',
  'settings.accentColor': 'Accent Color',
  'settings.accentColorDesc': 'Primary tint throughout the UI',
  'settings.density': 'Density',
  'settings.densityDesc': 'Comfortable shows more whitespace',
  'settings.comfortable': 'Comfortable',
  'settings.compact': 'Compact',
  'settings.sidebarBadges': 'Sidebar Badges',
  'settings.sidebarBadgesDesc': 'Show count badges on navigation items',
  'settings.animations': 'Animations',
  'settings.animationsDesc': 'Enable UI transitions and motion effects',
  'settings.language': 'Language',
  'settings.english': 'English',
  'settings.deutsch': 'Deutsch',
  'settings.dateFormat': 'Date Format',
  'settings.timeFormat': 'Time Format',
  'settings.weekStartsOn': 'Week Starts On',
  'settings.monday': 'Monday',
  'settings.sunday': 'Sunday',
  'settings.startPage': 'Start Page',
  'settings.startPageDesc': 'Which page to show when you open Orbit',
  'settings.confirmDelete': 'Confirm Before Delete',
  'settings.confirmDeleteDesc': 'Show a warning before deleting items',
  'settings.archiveInstead': 'Archive Instead of Delete',
  'settings.archiveInsteadDesc': 'Move items to archive rather than permanently deleting',
  'settings.autoArchive': 'Auto-Archive Completed',
  'settings.autoArchiveDesc': 'Archive tasks after a set number of days',
  'settings.enableNotif': 'Enable Notifications',
  'settings.enableNotifDesc': 'Allow Orbit to send push notifications',
  'settings.notifSound': 'Notification Sound',
  'settings.morningBriefing': 'Morning Briefing',
  'settings.morningBriefingDesc': 'Your day at a glance — tasks, events, habits',
  'settings.eveningBriefing': 'Evening Briefing',
  'settings.eveningBriefingDesc': 'Review your day — what you crushed, what\'s left',
  'settings.testMorning': 'Test Morning',
  'settings.testEvening': 'Test Evening',
  'settings.briefings': 'Briefings',
  'settings.reminders': 'Reminders',
  'settings.taskReminders': 'Task Reminders',
  'settings.taskRemindersDesc': 'Remind before tasks are due',
  'settings.minBefore': 'min before',
  'settings.habitReminders': 'Habit Reminders',
  'settings.habitRemindersDesc': 'Daily reminders for active habits',
  'settings.weeklyReview': 'Weekly Review',
  'settings.weeklyReviewDesc': 'Scheduled weekly summary',
  'settings.calendarSync': 'Google Calendar Sync',
  'settings.calendarSyncDesc': 'Sync events with your Google Calendar',
  'settings.defaultDuration': 'Default Event Duration',
  'settings.defaultDurationDesc': 'When creating events without specifying length',
  'settings.showWeekNumbers': 'Show Week Numbers',
  'settings.showWeekNumbersDesc': 'Display ISO week numbers in calendar views',
  'settings.showDeclined': 'Show Declined Events',
  'settings.showDeclinedDesc': 'Display events you\'ve declined',
  'settings.commandBar': 'Open command bar',
  'settings.toggleSidebar': 'Toggle sidebar',
  'settings.closePanel': 'Close panel / dialog',
  'settings.submitConfirm': 'Submit / confirm',
  'settings.navigateList': 'Navigate list items',
  'settings.toggleDarkMode': 'Toggle dark mode',
  'settings.shortcutsComingSoon': 'Custom shortcut configuration coming soon.',
  'settings.analytics': 'Usage Analytics',
  'settings.analyticsDesc': 'Help improve Orbit by sharing anonymous usage data',
  'settings.crashReports': 'Crash Reports',
  'settings.crashReportsDesc': 'Automatically send crash logs for debugging',
  'settings.showPhoto': 'Show Profile Photo',
  'settings.showPhotoDesc': 'Display your Google profile picture in the sidebar',
  'settings.privacyNote': 'Your data is stored securely in Firebase with end-to-end authentication. Only you can access your items. Orbit never sells or shares personal data.',
  'settings.reduceMotion': 'Reduce Motion',
  'settings.reduceMotionDesc': 'Minimize animations and transitions',
  'settings.highContrast': 'High Contrast',
  'settings.highContrastDesc': 'Increase contrast for better readability',
  'settings.fontSize': 'Font Size',
  'settings.fontSizeDesc': 'Adjust base text size throughout the app',
  'settings.small': 'Small',
  'settings.default': 'Default',
  'settings.large': 'Large',
  'settings.autoBackup': 'Auto Backup',
  'settings.autoBackupDesc': 'Periodically back up your data to cloud storage',
  'settings.exportSettings': 'Export Settings',
  'settings.exportSettingsDesc': 'Download all settings as a JSON file',
  'settings.importSettings': 'Import Settings',
  'settings.importSettingsDesc': 'Restore settings from a JSON backup',
  'settings.dangerZone': 'Danger Zone',
  'settings.resetAll': 'Reset All Settings',
  'settings.resetAllDesc': 'Restore every setting to its default value',
  'settings.confirmReset': 'Confirm Reset',
  'settings.reset': 'Reset',
  'settings.deleteAccount': 'Delete Account',
  'settings.deleteAccountDesc': 'Permanently delete your account and all data',
  'settings.deleting': 'Deleting...',
  'settings.yesDeleteEverything': 'Yes, delete everything',
  'settings.version': 'ORBIT v1.0.0 · Made with focus',
  'settings.syncedLocally': 'Settings synced locally',
  'settings.syncedFirebase': 'Settings synced with Firebase',

  // ── Easter Eggs ──────────────────────────────────────────
  'settings.easterEggs': 'Easter Eggs',
  'settings.hockeyMode': 'Hockey & Medizin Mode',
  'settings.hockeyModeDesc': 'Transform Orbit into a hockey rink meets hospital. Tasks become plays, habits become training, and completions trigger goal celebrations.',
  'settings.hockeyPreview': 'Active changes',
  'settings.hockeyFeature1': 'TOR! animation when completing tasks',
  'settings.hockeyFeature2': 'Medical triage priority labels (Notfall, Dringend, Wartezimmer)',
  'settings.hockeyFeature3': 'Hockey-themed notifications with game commentary',
  'settings.hockeyFeature4': 'All labels transform to hockey & medical terms',

  // ── Login extras ─────────────────────────────────────────
  'login.emailLinkSentDesc': 'Open the link in the email to sign in. You can close this tab.',
  'login.emailLinkSentNote': 'The sign-in link expires after a short time.',
  'login.checkInboxFor': 'We sent a sign-in link to {email}. Click the link in the email to sign in.',
} as const;

// ── German ─────────────────────────────────────────────────

const de: Record<TranslationKey, string> = {
  // ── Navigation ───────────────────────────────────────────
  'nav.dashboard': 'Dashboard',
  'nav.today': 'Heute',
  'nav.tasks': 'Aufgaben',
  'nav.inbox': 'Eingang',
  'nav.organize': 'Organisieren',
  'nav.projects': 'Projekte',
  'nav.habits': 'Gewohnheiten',
  'nav.goals': 'Ziele',
  'nav.capture': 'Erfassen',
  'nav.notes': 'Notizen',
  'nav.calendar': 'Kalender',
  'nav.files': 'Dateien',
  'nav.archive': 'Archiv',
  'nav.toolbox': 'Toolbox',
  'nav.allTools': 'Alle Tools',
  'nav.areas': 'Bereiche',
  'nav.settings': 'Einstellungen',

  // ── Mobile nav ───────────────────────────────────────────
  'mobile.home': 'Home',
  'mobile.tasks': 'Aufgaben',
  'mobile.habits': 'Habits',
  'mobile.notes': 'Notizen',
  'mobile.toolbox': 'Toolbox',

  // ── Sidebar ──────────────────────────────────────────────
  'sidebar.quickAdd': 'Schnell hinzufügen...',
  'sidebar.manageTags': 'Tags verwalten',
  'sidebar.doneTags': 'Fertig',
  'sidebar.addTag': 'Tag hinzufügen',
  'sidebar.newTagPlaceholder': 'neuer Tag...',
  'sidebar.localMode': 'Lokaler Modus',
  'sidebar.signOut': 'Abmelden',

  // ── Common ───────────────────────────────────────────────
  'common.new': 'Neu',
  'common.create': 'Erstellen',
  'common.save': 'Speichern',
  'common.cancel': 'Abbrechen',
  'common.delete': 'Löschen',
  'common.archive': 'Archivieren',
  'common.restore': 'Wiederherstellen',
  'common.rename': 'Umbenennen',
  'common.search': 'Suchen',
  'common.viewAll': 'Alle anzeigen',
  'common.done': 'Erledigt',
  'common.or': 'oder',
  'common.on': 'An',
  'common.off': 'Aus',
  'common.days': 'Tage',
  'common.min': 'Min',
  'common.sent': 'Gesendet!',
  'common.saved': 'Gespeichert',
  'common.export': 'Exportieren',
  'common.import': 'Importieren',
  'common.today': 'Heute',
  'common.overdue': 'Überfällig',

  // ── Types ────────────────────────────────────────────────
  'type.task': 'Aufgabe',
  'type.project': 'Projekt',
  'type.habit': 'Gewohnheit',
  'type.event': 'Termin',
  'type.goal': 'Ziel',
  'type.note': 'Notiz',

  // ── Status ───────────────────────────────────────────────
  'status.inbox': 'Eingang',
  'status.active': 'Aktiv',
  'status.waiting': 'Wartend',
  'status.done': 'Erledigt',
  'status.archived': 'Archiviert',
  'status.active.desc': 'Wird gerade bearbeitet',
  'status.waiting.desc': 'Blockiert oder wartet auf jemanden',
  'status.done.desc': 'Abgeschlossen',
  'status.archived.desc': 'Nicht mehr relevant',

  // ── Priority ─────────────────────────────────────────────
  'priority.high': 'Hoch',
  'priority.medium': 'Mittel',
  'priority.low': 'Niedrig',
  'priority.none': 'Keine Priorität',

  // ── Frequency / Timeframe ─────────────────────────────────
  'frequency.daily': 'täglich',
  'frequency.weekly': 'wöchentlich',
  'frequency.custom': 'benutzerdefiniert',
  'timeframe.quarterly': 'quartal',
  'timeframe.yearly': 'jährlich',
  'timeframe.longterm': 'langfristig',

  // ── Note subtypes ────────────────────────────────────────
  'noteSubtype.general': 'allgemein',
  'noteSubtype.idea': 'Idee',
  'noteSubtype.principle': 'Prinzip',
  'noteSubtype.plan': 'Plan',
  'noteSubtype.journal': 'Tagebuch',

  // ── Greetings ────────────────────────────────────────────
  'greeting.morning': 'Guten Morgen',
  'greeting.afternoon': 'Guten Tag',
  'greeting.evening': 'Guten Abend',

  // ── Dashboard ────────────────────────────────────────────
  'dashboard.events': 'Termine',
  'dashboard.nothingScheduled': 'Nichts geplant für diesen Tag',
  'dashboard.noTasksPast': 'Keine Aufgaben für diesen Tag geplant',
  'dashboard.noHabitsScheduled': 'Keine Gewohnheiten geplant',
  'dashboard.tasks': 'Aufgaben',
  'dashboard.habitsLabel': 'Gewohnheiten',
  'dashboard.projectsLabel': 'Projekte',

  // ── Dashboard date context ───────────────────────────────
  'date.past': 'Vergangen',
  'date.future': 'Zukunft',
  'date.today': 'Heute',
  'date.previousDay': 'Vorheriger Tag',
  'date.nextDay': 'Nächster Tag',

  // ── Onboarding ───────────────────────────────────────────
  'onboarding.title': 'Starte deinen Orbit',
  'onboarding.description': 'Drücke ⌘K um deine erste Aufgabe, Gewohnheit oder dein erstes Projekt zu erstellen.',
  'onboarding.cta': 'Etwas erstellen',

  // ── Tasks page ───────────────────────────────────────────
  'tasks.searchPlaceholder': 'Aufgaben suchen...',
  'tasks.noTasks': 'Keine Aufgaben',
  'tasks.noMatchSearch': 'Keine Aufgaben gefunden',
  'tasks.noCompleted': 'Keine erledigten Aufgaben',
  'tasks.noActiveHint': 'Keine aktiven Aufgaben — nutze ⌘K zum Erstellen',
  'tasks.clearFilters': 'Filter zurücksetzen',

  // ── Filter / Sort / Group ────────────────────────────────
  'filter.active': 'Aktiv',
  'filter.completed': 'Erledigt',
  'filter.all': 'Alle',
  'sort.dueDate': 'Fälligkeitsdatum',
  'sort.priority': 'Priorität',
  'sort.newest': 'Neueste',
  'sort.title': 'Titel',
  'group.none': 'Keine Gruppierung',
  'group.byProject': 'Nach Projekt',
  'group.byGoal': 'Nach Ziel',
  'group.byPriority': 'Nach Priorität',
  'group.byDueDate': 'Nach Fälligkeitsdatum',
  'group.byTag': 'Nach Tag',
  'group.allTasks': 'Alle Aufgaben',
  'group.noProject': 'Kein Projekt',
  'group.noGoal': 'Kein Ziel',
  'group.noPriority': 'Keine Priorität',
  'group.noDueDate': 'Kein Fälligkeitsdatum',
  'group.untagged': 'Ohne Tag',
  'group.highPriority': 'Hohe Priorität',
  'group.mediumPriority': 'Mittlere Priorität',
  'group.lowPriority': 'Niedrige Priorität',

  // ── Inbox ────────────────────────────────────────────────
  'inbox.swipeHint': '← Nach rechts wischen: aktivieren · Nach links: löschen →',
  'inbox.activate': 'Aktivieren',
  'inbox.zero': 'Eingang leer',
  'inbox.zeroDesc': 'Alle Einträge verarbeitet. Drücke ⌘K für neue.',

  // ── Today page ───────────────────────────────────────────
  'today.overdue': 'Überfällig',
  'today.tasks': 'Aufgaben',
  'today.events': 'Termine',
  'today.habits': 'Gewohnheiten',
  'today.noTasks': 'Keine Aufgaben für heute',
  'today.noHabits': 'Keine Gewohnheiten geplant',

  // ── Habits page ──────────────────────────────────────────
  'habits.week': 'Woche',
  'habits.month': 'Monat',
  'habits.streak': 'Serie',
  'habits.noHabits': 'Noch keine Gewohnheiten',
  'habits.noHabitsTap': 'Tippe auf + um deine erste Gewohnheit zu erstellen',
  'habits.previousMonth': 'Vorheriger Monat',
  'habits.nextMonth': 'Nächster Monat',

  // ── Goals page ───────────────────────────────────────────
  'goals.thisQuarter': 'Dieses Quartal',
  'goals.thisYear': 'Dieses Jahr',
  'goals.longterm': 'Langfristig',
  'goals.noGoals': 'Noch keine Ziele',
  'goals.noGoalsDesc': 'Definiere Ziele und verknüpfe Aufgaben, um deinen Fortschritt zu verfolgen.',

  // ── Projects page ────────────────────────────────────────
  'projects.grid': 'Raster',
  'projects.kanban': 'Kanban',
  'projects.newProject': 'Neues Projekt',
  'projects.noProjects': 'Noch keine Projekte',
  'projects.createToStart': 'Erstelle eines zum Starten',
  'projects.addTask': 'Aufgabe hinzufügen',
  'projects.milestones': 'Meilensteine',
  'kanban.inProgress': 'In Arbeit',
  'kanban.waiting': 'Wartend',
  'kanban.done': 'Erledigt',

  // ── Calendar ─────────────────────────────────────────────
  'calendar.importFromGoogle': 'Aus Google importieren',
  'calendar.import': 'Importieren',
  'calendar.importing': 'Importiere...',
  'calendar.noEventsMonth': 'Keine Termine diesen Monat',
  'calendar.eventsThisMonth': 'Termine diesen Monat',
  'calendar.multiDay': 'Mehrtägig',
  'calendar.noEventsOrTasks': 'Keine Termine oder Aufgaben für diesen Tag',
  'calendar.wk': 'KW',
  'calendar.untitledEvent': 'Ohne Titel',

  // ── Notes page ───────────────────────────────────────────
  'notes.all': 'Alle',
  'notes.ideas': 'Ideen',
  'notes.principles': 'Prinzipien',
  'notes.plans': 'Pläne',
  'notes.journal': 'Tagebuch',
  'notes.titlePlaceholder': 'Titel der Notiz...',
  'notes.contentPlaceholder': 'Notiz schreiben... (nutze - oder • für Listen, 1. 2. 3. für Aufzählungen)',
  'notes.saveHint': '⌘↵ speichern · esc abbrechen',
  'notes.takeANote': 'Notiz erstellen...',
  'notes.noNotes': 'Noch keine Notizen',
  'notes.noNotesDesc': 'Halte Ideen, Prinzipien, Pläne und Gedanken fest.',
  'notes.untitled': 'Ohne Titel',

  // ── Archive ──────────────────────────────────────────────
  'archive.subtitle': 'Erledigte und archivierte Einträge',
  'archive.completedTab': 'Erledigt',
  'archive.archivedTab': 'Archiviert',
  'archive.uncomplete': 'Zurücksetzen',
  'archive.noCompleted': 'Keine erledigten Einträge',
  'archive.noCompletedDesc': 'Erledigte Aufgaben und Ziele erscheinen hier',
  'archive.archiveEmpty': 'Archiv ist leer',
  'archive.archiveEmptyDesc': 'Archivierte Einträge erscheinen hier',

  // ── Item row ─────────────────────────────────────────────
  'itemRow.waiting': 'Wartend',
  'itemRow.today': 'heute',
  'itemRow.todayBtn': 'Heute',
  'itemRow.removeBtn': 'Entfernen',
  'itemRow.doneSwipe': 'Erledigt',

  // ── Detail panel ─────────────────────────────────────────
  'detail.changeType': 'Typ ändern',
  'detail.changeStatus': 'Status ändern',
  'detail.linksRelations': 'Verknüpfungen',
  'detail.frequency': 'Häufigkeit',
  'detail.timeframe': 'Zeitraum',
  'detail.category': 'Kategorie',
  'detail.priority': 'Priorität',
  'detail.startDate': 'Startdatum',
  'detail.startTime': 'Startzeit',
  'detail.endDate': 'Enddatum',
  'detail.endTime': 'Endzeit',
  'detail.successMetric': 'Erfolgskriterium',
  'detail.checklist': 'Checkliste',
  'detail.notes': 'Notizen',
  'detail.tags': 'Tags',
  'detail.parent': 'Übergeordnet',
  'detail.addToToday': 'Zu Heute hinzufügen',
  'detail.viewLinkGraph': 'Verknüpfungsgraph anzeigen',
  'detail.itemDetails': 'Details',
  'detail.titlePlaceholder': 'Titel…',
  'detail.metricPlaceholder': 'Wie misst du den Erfolg?',
  'detail.checklistPlaceholder': 'Punkt hinzufügen…',
  'detail.notesPlaceholder': 'Deine Gedanken…',
  'detail.timePlaceholder': 'Zeit',
  'detail.syncing': 'Synchronisiere...',
  'detail.syncedToCalendar': 'Mit Kalender synchronisiert ✓',
  'detail.syncToGoogle': 'Mit Google Kalender synchronisieren',
  'detail.syncFailed': 'Synchronisation mit Google Kalender fehlgeschlagen.',

  // ── Command bar ──────────────────────────────────────────
  'commandBar.placeholder': 'Was brauchst du?',
  'commandBar.tags': 'Tags',
  'commandBar.priority': 'Priorität',
  'commandBar.linkTo': 'Verknüpfen mit',
  'commandBar.results': 'Ergebnisse',
  'commandBar.commands': 'Befehle',
  'commandBar.createTag': 'Tag erstellen',
  'commandBar.createTags': 'Tags erstellen',
  'commandBar.tip': 'Tipp: Nutze #tag !hoch @projekt und Daten wie morgen oder 15.03',

  // ── Login screen ─────────────────────────────────────────
  'login.welcome': 'Willkommen bei ORBIT',
  'login.tagline': 'Dein persönliches System für Aufgaben, Gewohnheiten, Ziele und Ideen.',
  'login.continueGoogle': 'Weiter mit Google',
  'login.signInEmail': 'Mit E-Mail anmelden',
  'login.signInEmailLink': 'Mit E-Mail-Link anmelden',
  'login.tryWithout': 'Ohne Konto testen',
  'login.createAccount': 'Konto erstellen',
  'login.createAccountDesc': 'Erstelle ein Konto um geräteübergreifend zu synchronisieren.',
  'login.emailLinkDesc': 'Wir senden dir einen Anmelde-Link per E-Mail.',
  'login.checkInbox': 'Prüfe deinen Posteingang',
  'login.sendSignInLink': 'Anmelde-Link senden',
  'login.signIn': 'Anmelden',
  'login.back': '← Zurück',
  'login.backToLogin': '← Zurück zur Anmeldung',
  'login.usePasswordInstead': 'Stattdessen Passwort verwenden',
  'login.dontHaveAccount': 'Kein Konto? Registrieren',
  'login.alreadyHaveAccount': 'Bereits ein Konto? Anmelden',
  'login.localModeNote': 'Lokaler Modus speichert alles im Browser. Kein Konto nötig.',
  'login.dataEncrypted': 'Deine Daten werden verschlüsselt und sicher über Firebase synchronisiert.',
  'login.namePlaceholder': 'Anzeigename (optional)',
  'login.emailPlaceholder': 'E-Mail',
  'login.passwordPlaceholder': 'Passwort',

  // ── Auth errors ──────────────────────────────────────────
  'error.userNotFound': 'Kein Konto mit dieser E-Mail.',
  'error.wrongPassword': 'Falsches Passwort.',
  'error.invalidEmail': 'Ungültige E-Mail-Adresse.',
  'error.emailInUse': 'E-Mail bereits registriert. Versuche dich anzumelden.',
  'error.weakPassword': 'Passwort muss mindestens 6 Zeichen haben.',
  'error.invalidCredential': 'Ungültige E-Mail oder Passwort.',
  'error.tooManyRequests': 'Zu viele Versuche. Bitte später erneut versuchen.',
  'error.generic': 'Etwas ist schiefgelaufen. Bitte erneut versuchen.',

  // ── Settings ─────────────────────────────────────────────
  'settings.title': 'Einstellungen',
  'settings.profile': 'Profil',
  'settings.appearance': 'Darstellung',
  'settings.languageRegion': 'Sprache & Region',
  'settings.general': 'Allgemein',
  'settings.notifications': 'Benachrichtigungen',
  'settings.calendar': 'Kalender',
  'settings.shortcuts': 'Tastenkürzel',
  'settings.privacy': 'Datenschutz',
  'settings.accessibility': 'Barrierefreiheit',
  'settings.dataStorage': 'Daten & Speicher',
  'settings.user': 'Benutzer',
  'settings.demoMode': 'Demo-Modus',
  'settings.displayName': 'Anzeigename',
  'settings.displayNameDesc': 'Wie du in der App erscheinst',
  'settings.yourNamePlaceholder': 'Dein Name',
  'settings.email': 'E-Mail',
  'settings.emailDesc': 'Mit deinem Konto verknüpft',
  'settings.bio': 'Bio',
  'settings.bioDesc': 'Kurze Beschreibung über dich',
  'settings.bioPlaceholder': 'Ein paar Worte...',
  'settings.timezone': 'Zeitzone',
  'settings.timezoneDesc': 'Für Planung und Fälligkeitsdaten',
  'settings.signOut': 'Abmelden',
  'settings.theme': 'Design',
  'settings.themeDesc': 'Wähle das Aussehen von Orbit',
  'settings.light': 'Hell',
  'settings.dark': 'Dunkel',
  'settings.system': 'System',
  'settings.accentColor': 'Akzentfarbe',
  'settings.accentColorDesc': 'Primäre Farbe in der gesamten Oberfläche',
  'settings.density': 'Dichte',
  'settings.densityDesc': 'Komfortabel zeigt mehr Weißraum',
  'settings.comfortable': 'Komfortabel',
  'settings.compact': 'Kompakt',
  'settings.sidebarBadges': 'Seitenleisten-Badges',
  'settings.sidebarBadgesDesc': 'Zähler bei Navigationselementen anzeigen',
  'settings.animations': 'Animationen',
  'settings.animationsDesc': 'UI-Übergänge und Bewegungseffekte aktivieren',
  'settings.language': 'Sprache',
  'settings.english': 'English',
  'settings.deutsch': 'Deutsch',
  'settings.dateFormat': 'Datumsformat',
  'settings.timeFormat': 'Zeitformat',
  'settings.weekStartsOn': 'Woche beginnt am',
  'settings.monday': 'Montag',
  'settings.sunday': 'Sonntag',
  'settings.startPage': 'Startseite',
  'settings.startPageDesc': 'Welche Seite beim Öffnen angezeigt wird',
  'settings.confirmDelete': 'Vor dem Löschen bestätigen',
  'settings.confirmDeleteDesc': 'Warnung anzeigen bevor Einträge gelöscht werden',
  'settings.archiveInstead': 'Archivieren statt Löschen',
  'settings.archiveInsteadDesc': 'Einträge archivieren statt endgültig löschen',
  'settings.autoArchive': 'Erledigte automatisch archivieren',
  'settings.autoArchiveDesc': 'Aufgaben nach einer bestimmten Anzahl Tage archivieren',
  'settings.enableNotif': 'Benachrichtigungen aktivieren',
  'settings.enableNotifDesc': 'Orbit erlauben Push-Benachrichtigungen zu senden',
  'settings.notifSound': 'Benachrichtigungston',
  'settings.morningBriefing': 'Morgen-Briefing',
  'settings.morningBriefingDesc': 'Dein Tag auf einen Blick — Aufgaben, Termine, Gewohnheiten',
  'settings.eveningBriefing': 'Abend-Briefing',
  'settings.eveningBriefingDesc': 'Tagesrückblick — was du geschafft hast, was noch offen ist',
  'settings.testMorning': 'Morgen testen',
  'settings.testEvening': 'Abend testen',
  'settings.briefings': 'Briefings',
  'settings.reminders': 'Erinnerungen',
  'settings.taskReminders': 'Aufgaben-Erinnerungen',
  'settings.taskRemindersDesc': 'Vor Fälligkeit erinnern',
  'settings.minBefore': 'Min vorher',
  'settings.habitReminders': 'Gewohnheits-Erinnerungen',
  'settings.habitRemindersDesc': 'Tägliche Erinnerungen für aktive Gewohnheiten',
  'settings.weeklyReview': 'Wochenrückblick',
  'settings.weeklyReviewDesc': 'Geplante wöchentliche Zusammenfassung',
  'settings.calendarSync': 'Google Kalender Sync',
  'settings.calendarSyncDesc': 'Termine mit Google Kalender synchronisieren',
  'settings.defaultDuration': 'Standard-Termindauer',
  'settings.defaultDurationDesc': 'Beim Erstellen von Terminen ohne Zeitangabe',
  'settings.showWeekNumbers': 'Kalenderwochen anzeigen',
  'settings.showWeekNumbersDesc': 'ISO-Kalenderwochen in Kalenderansichten anzeigen',
  'settings.showDeclined': 'Abgelehnte Termine anzeigen',
  'settings.showDeclinedDesc': 'Abgelehnte Termine darstellen',
  'settings.commandBar': 'Befehlsleiste öffnen',
  'settings.toggleSidebar': 'Seitenleiste umschalten',
  'settings.closePanel': 'Panel / Dialog schließen',
  'settings.submitConfirm': 'Absenden / bestätigen',
  'settings.navigateList': 'Listeneinträge navigieren',
  'settings.toggleDarkMode': 'Dunkelmodus umschalten',
  'settings.shortcutsComingSoon': 'Benutzerdefinierte Tastenkürzel kommen bald.',
  'settings.analytics': 'Nutzungsanalyse',
  'settings.analyticsDesc': 'Hilf Orbit mit anonymen Nutzungsdaten zu verbessern',
  'settings.crashReports': 'Absturzberichte',
  'settings.crashReportsDesc': 'Automatisch Fehlerprotokolle zur Analyse senden',
  'settings.showPhoto': 'Profilbild anzeigen',
  'settings.showPhotoDesc': 'Google-Profilbild in der Seitenleiste anzeigen',
  'settings.privacyNote': 'Deine Daten werden sicher in Firebase mit End-to-End-Authentifizierung gespeichert. Nur du hast Zugriff auf deine Einträge. Orbit verkauft oder teilt niemals persönliche Daten.',
  'settings.reduceMotion': 'Bewegung reduzieren',
  'settings.reduceMotionDesc': 'Animationen und Übergänge minimieren',
  'settings.highContrast': 'Hoher Kontrast',
  'settings.highContrastDesc': 'Kontrast für bessere Lesbarkeit erhöhen',
  'settings.fontSize': 'Schriftgröße',
  'settings.fontSizeDesc': 'Basis-Textgröße in der gesamten App anpassen',
  'settings.small': 'Klein',
  'settings.default': 'Standard',
  'settings.large': 'Groß',
  'settings.autoBackup': 'Automatisches Backup',
  'settings.autoBackupDesc': 'Daten regelmäßig in die Cloud sichern',
  'settings.exportSettings': 'Einstellungen exportieren',
  'settings.exportSettingsDesc': 'Alle Einstellungen als JSON-Datei herunterladen',
  'settings.importSettings': 'Einstellungen importieren',
  'settings.importSettingsDesc': 'Einstellungen aus einem JSON-Backup wiederherstellen',
  'settings.dangerZone': 'Gefahrenzone',
  'settings.resetAll': 'Alle Einstellungen zurücksetzen',
  'settings.resetAllDesc': 'Jede Einstellung auf den Standardwert zurücksetzen',
  'settings.confirmReset': 'Zurücksetzen bestätigen',
  'settings.reset': 'Zurücksetzen',
  'settings.deleteAccount': 'Konto löschen',
  'settings.deleteAccountDesc': 'Konto und alle Daten dauerhaft löschen',
  'settings.deleting': 'Lösche...',
  'settings.yesDeleteEverything': 'Ja, alles löschen',
  'settings.version': 'ORBIT v1.0.0 · Made with focus',
  'settings.syncedLocally': 'Einstellungen lokal gespeichert',
  'settings.syncedFirebase': 'Einstellungen mit Firebase synchronisiert',

  // ── Easter Eggs ──────────────────────────────────────────
  'settings.easterEggs': 'Easter Eggs',
  'settings.hockeyMode': 'Eishockey & Medizin Modus',
  'settings.hockeyModeDesc': 'Verwandle Orbit in eine Eisbahn trifft Krankenhaus. Aufgaben werden Spielzüge, Gewohnheiten werden Training, und abgeschlossene Aufgaben lösen Tor-Jubel aus.',
  'settings.hockeyPreview': 'Aktive Änderungen',
  'settings.hockeyFeature1': 'TOR!-Animation beim Abschließen von Aufgaben',
  'settings.hockeyFeature2': 'Medizinische Triage-Prioritäten (Notfall, Dringend, Wartezimmer)',
  'settings.hockeyFeature3': 'Eishockey-Benachrichtigungen im Sport-Kommentarstil',
  'settings.hockeyFeature4': 'Alle Labels werden zu Hockey- & Medizin-Begriffen',

  // ── Login extras ─────────────────────────────────────────
  'login.emailLinkSentDesc': 'Öffnen Sie den Link in der E-Mail, um sich anzumelden. Sie können diesen Tab schließen.',
  'login.emailLinkSentNote': 'Der Anmelde-Link läuft nach kurzer Zeit ab.',
  'login.checkInboxFor': 'Wir haben einen Anmelde-Link an {email} gesendet. Klicken Sie auf den Link in der E-Mail.',
};

// ── Translation map ────────────────────────────────────────

const translations: Record<Language, Record<TranslationKey, string>> = { en, de };

/**
 * Get all translations for a language.
 */
export function getTranslations(lang: Language): Record<TranslationKey, string> {
  return translations[lang] ?? en;
}

/**
 * Translate a single key.
 */
export function t(key: TranslationKey, lang: Language): string {
  return translations[lang]?.[key] ?? en[key] ?? key;
}

/**
 * React hook — returns a `t(key)` function bound to the current language.
 * When hockeyMode is on and language is German, applies hockey/medical overrides.
 */
export function useTranslation() {
  const lang = useSettingsStore((s) => s.settings.language);
  const hockeyMode = useSettingsStore((s) => s.settings.hockeyMode);
  return {
    t: (key: TranslationKey) => {
      // Hockey mode only applies to German
      if (hockeyMode && lang === 'de' && key in hockeyOverrides) {
        return hockeyOverrides[key]!;
      }
      return t(key, lang);
    },
    lang,
    hockeyMode: hockeyMode && lang === 'de',
  };
}
