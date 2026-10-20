import { expect, mock, test } from 'claude-code/testing'

import { parseArgs, refusalFor, ruleFor } from '../hooks/proposals'

const BAND = {
  plugin: 'proposals',
  component: 'AbovePrompt',
  requestId: 'band',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 12,
    bodyColumns: 140,
    scroll: { offset: 0, bodyRows: 11 },
    view: {},
  },
} as const

const MOCKUP = '╭─ Pane ──╮\n│ visual  │\n╰─────────╯'
const ASCII_MOCKUP = '+--------+\n| visual |\n+--------+'
const TREE = 'src\n├── a.ts\n└── b.ts'

const COMPOSE = {
  model: 'claude-opus-5-5',
  promptModel: 'claude-opus-5-5',
  surfaces: ['terminal'],
  tools: ['AskUserQuestion'],
  outputStyle: null,
  traits: [],
} as const

const run = (args: string) => ({
  command: 'proposals',
  args,
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 120 },
}) as const

const focusOn = (element: string) =>
  ({ component: 'AbovePrompt', requestId: 'band', plugin: 'proposals', element, origin: { kind: 'person' } }) as const

const ask = (preview: string) => ({
  tool: 'AskUserQuestion' as const,
  questions: [
    {
      question: 'Which one?',
      header: 'Pick',
      multiSelect: false,
      options: [
        { label: 'A', description: 'a', preview },
        { label: 'B', description: 'b' },
      ],
    },
  ],
})

test('the command reads a format, its instructions, hide and show', async () => {
  expect(parseArgs('')).toEqual({ kind: 'status' })
  expect(parseArgs('Artifact  side by side, dark')).toEqual({
    kind: 'set',
    format: 'artifact',
    instructions: 'side by side, dark',
  })
  expect(parseArgs('visual -')).toEqual({ kind: 'set', format: 'visual', instructions: '' })
  expect(parseArgs('terminal')).toEqual({ kind: 'set', format: 'terminal' })
  expect(parseArgs('hide')).toEqual({ kind: 'hide' })
  expect(parseArgs('pane')).toEqual({ kind: 'unknown', word: 'pane' })
})

test('the rule carries the instructions, and default sends no rule', async () => {
  expect(ruleFor('default', 'dark')).toBeUndefined()
  expect(ruleFor('visual', '')).not.toContain('own instructions')
  expect(ruleFor('artifact', 'dark')).toContain('to follow: dark')
})

test('visual refuses a drawn mockup and lets a tree through; artifact refuses any preview', async () => {
  expect(refusalFor('visual', ask(MOCKUP).questions)).toContain('artifact')
  expect(refusalFor('visual', ask(ASCII_MOCKUP).questions)).toContain('artifact')
  expect(refusalFor('visual', ask(TREE).questions)).toBeUndefined()
  expect(refusalFor('artifact', ask(TREE).questions)).toContain('artifact')
  expect(refusalFor('terminal', ask(MOCKUP).questions)).toBeUndefined()
  expect(refusalFor('default', ask(MOCKUP).questions)).toBeUndefined()
})

test('the command sets the format, the rule follows it, and the guard holds Claude to it', async ($, on) => {
  mock.store(on)
  on('command.register', () => ({ value: { command: 'proposals' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.compose', () => ({ sections: [] }))
  on('tool.call', () => ({ result: {} }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  expect((await $.prompt.compose(COMPOSE)).sections.map(section => section.id)).toEqual(['proposals:rule'])
  expect(await $.tool.call(ask(MOCKUP))).toHaveProperty('deny')
  expect(await $.tool.call(ask(TREE))).not.toHaveProperty('deny')

  await $.command.run(run('default'))
  expect((await $.prompt.compose(COMPOSE)).sections).toEqual([])
  expect(await $.tool.call(ask(MOCKUP))).not.toHaveProperty('deny')

  await $.command.run(run('artifact dark, side by side'))
  expect((await $.prompt.compose(COMPOSE)).sections[0]?.text).toContain('dark, side by side')
  expect(await $.tool.call(ask(TREE))).toHaveProperty('deny')
})

test('the row picks a format and edits its instructions, on every surface that takes input', async ($, on) => {
  mock.store(on)
  on('ui.render', ($, e) => {
    // The engine's own band, empty here
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /● visual/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Claude decides/ })).toBeDefined()

    await ui.press({ key: 'format-terminal' })
    expect(await ui.find({ type: 'Text', text: /● terminal/ })).toBeDefined()

    await ui.press({ key: 'edit' })
    await ui.input({ key: 'instructions', text: '  3 options max ' })
    expect((await ui.find({ type: 'Text', text: /3 options/ }))?.text).toBe('3 options max')

    await ui.press({ key: 'edit' })
    await ui.input({ key: 'instructions', text: '' })
    expect(await ui.find({ type: 'Text', text: /Claude decides/ })).toBeDefined()
    await ui.press({ key: 'format-visual' })
    await ui.unmount()
  }
})

test('hide takes the row away and show brings it back', async ($, on) => {
  mock.store(on)
  on('command.register', () => ({ value: { command: 'proposals' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  await $.command.run(run('hide'))
  const hidden = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await hidden.find({ type: 'Text', text: /Proposals/ })).toBeUndefined()
  await hidden.unmount()

  await $.command.run(run('show'))
  const shown = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await shown.find({ type: 'Text', text: /Proposals/ })).toBeDefined()
  await shown.unmount()
})

test('the row describes the format under the focus ring, and only that one', async ($, on) => {
  mock.store(on)
  on('ui.focus', () => ({}))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /every proposal/ })).toBeUndefined()

  await $.ui.focus(focusOn('format-artifact'))
  expect(await ui.find({ type: 'Text', text: /every proposal → artifact/ })).toBeDefined()

  await $.ui.focus(focusOn('edit'))
  expect(await ui.find({ type: 'Text', text: /every proposal/ })).toBeUndefined()
  await ui.unmount()
})
