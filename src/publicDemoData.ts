import { buildMatches, type Profile } from './recommendationEngine.ts'

const base: Profile = {
  grade: 'Class 12', stream: 'Exploring options', country: 'India', state: '', city: '',
  geography: 'Open to discussing locations', relocate: 'Maybe', mode: 'On-campus',
  subjects: {}, bestSubjects: [], enjoyWeak: [], avoidSubjects: [],
  scoreBand: 'Prefer not to answer', consistency: '', mathComfort: 3,
  writingComfort: 3, labComfort: 3, examComfort: 3, skills: {}, activities: [],
  work: [], values: [], budget: 'Not discussed', scholarship: 'To discuss',
  nearHome: false, examWillingness: 'Open', duration: '', route: [], ideas: [], exclusions: [],
}

export const demoProfiles = {
  psychology: {
    name: 'Samira', label: 'Psychology + computing',
    description: 'Enjoys understanding people and building with technology.',
    profile: { ...base, subjects: { Psychology: 'love', 'Computer Science': 'love', Biology: 'like' },
      skills: { Empathy: 'enjoy', Coding: 'good', Research: 'enjoy' },
      work: ['Working with people', 'Working with ideas'], values: ['Creativity'] } as Profile,
  },
  environment: {
    name: 'Kabir', label: 'History + chemistry',
    description: 'Connects scientific questions with society and public impact.',
    profile: { ...base, subjects: { History: 'love', Chemistry: 'love', Geography: 'like' },
      skills: { Writing: 'enjoy', Research: 'good' },
      work: ['Creating public impact'], values: ['Social impact'] } as Profile,
  },
  enterprise: {
    name: 'Ira', label: 'Economics + design',
    description: 'Likes combining creative ideas with practical business thinking.',
    profile: { ...base, subjects: { Economics: 'love', 'Business Studies': 'like', Design: 'love' },
      skills: { 'Visual design': 'enjoy', Entrepreneurship: 'good' },
      work: ['Designing things', 'Building businesses'], values: ['Income potential', 'Creativity'] } as Profile,
  },
} as const

export type DemoProfileId = keyof typeof demoProfiles
export const demoSubjectChoices = ['Psychology', 'Computer Science', 'History', 'Chemistry', 'Economics', 'Design', 'Mathematics', 'Biology']
export const demoSteps = ['Meet a student', 'Explore directions', 'Review a roadmap', 'Take the next step']

export function initialDemoProfile(id: string | null): DemoProfileId {
  return id && Object.hasOwn(demoProfiles, id) ? id as DemoProfileId : 'psychology'
}

export function demoDirections(profile: Profile) {
  // This is the same exploration engine used by the staff diagnostic.
  // Internal ranking values are never presented as admission chances or scores.
  return buildMatches(profile).slice(0, 3)
}

const experiments: Record<string, string> = {
  'Psychology, behaviour & UX research': 'Sketch an app improvement and ask two volunteers how they would use it. Record observations, not sensitive personal details.',
  'Environmental policy & sustainability': 'Choose a local environmental question and compare two public sources. Write down the evidence and the questions still open.',
  'Commerce, finance & entrepreneurship': 'Sketch a small business idea: who it helps, how it works and what assumptions need testing.',
  'Design & visual communication': 'Create two versions of a poster or interface and explain the choices behind each.',
  'Software & data systems': 'Build a small tool using fictional data. Explain the problem, the design and what you would improve.',
  'Law, policy & public affairs': 'Compare two public arguments about a policy question. Write a short, evidence-based response.',
  'Health, community & allied care': 'Compare the everyday work of two health or community-support roles using official professional sources.',
  'Applied engineering & technical operations': 'Draw a proposed improvement to an everyday system and explain how you would safely test the idea.',
  'Media, writing & communication': 'Create a short article or storyboard using public information and explain who it is for.',
}

export function sampleRoadmap(direction: string) {
  return [
    { title: 'Explore', timing: 'First conversation',
      action: `Discuss what appeals to the student about ${direction.toLowerCase()}. Keep an alternative direction open.`,
      output: 'Two directions to investigate and questions to answer.' },
    { title: 'Test an interest', timing: 'Before the next meeting',
      action: experiments[direction] || 'Try a small project related to the direction and reflect on the experience.',
      output: 'A small piece of work and the student’s reflection.' },
    { title: 'Check the route', timing: 'With a counsellor',
      action: 'Compare exact programme requirements, affordability and application notices using current official sources.',
      output: 'A source-checked shortlist. Missing facts stay open questions.' },
    { title: 'Review and adapt', timing: 'Next guidance meeting',
      action: 'Review the work, constraints and alternatives together, then agree a dated next step.',
      output: 'A revised plan with a staff owner and a follow-up.' },
  ]
}

export type DemoTask = { id: string; title: string; done: boolean }
export function initialDemoTasks(): DemoTask[] {
  return [
    { id: 'explore', title: 'Compare two directions with the counsellor', done: false },
    { id: 'project', title: 'Try a small project and record a reflection', done: false },
    { id: 'sources', title: 'Check programme requirements on the official source', done: false },
  ]
}
