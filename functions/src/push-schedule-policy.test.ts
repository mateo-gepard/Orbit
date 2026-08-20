import assert from 'node:assert/strict';
import test from 'node:test';
import { hasOnlyBackgroundBriefingScheduleFields } from './push-schedule-policy.js';

const briefingSchedule = {
  morningEnabled: true,
  morningTime: '08:00',
  eveningEnabled: false,
  eveningTime: '21:00',
  timezoneOffset: -120,
  timezone: 'Europe/Madrid',
};

test('background push accepts only generic briefing schedule metadata', () => {
  assert.equal(hasOnlyBackgroundBriefingScheduleFields(briefingSchedule), true);
});

test('background push rejects habit settings and private item payloads', () => {
  assert.equal(hasOnlyBackgroundBriefingScheduleFields({
    ...briefingSchedule,
    habitReminders: true,
  }), false);
  assert.equal(hasOnlyBackgroundBriefingScheduleFields({
    ...briefingSchedule,
    habitId: 'habit-one',
    habitTitle: 'Private habit title',
    habitTime: '07:30',
  }), false);
});
