import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { DESCRIPTIONS, FORMATS, isFormat, parseArgs, refusalFor, ruleFor, settingsOf, USAGE } from './proposals'
import type { Format, Settings } from './proposals'

const MAUVE = '#cba6f7'

// In the store rather than the session's state, so the choice holds in every session and every project
const settingsFrom = async ($: EngineInterface): Promise<Settings> =>
  settingsOf(await $.store.get('format'), await $.store.get('instructions'), await $.store.get('isHidden'))

const summary = ({ format, instructions }: Settings) =>
  `Format: ${format} (${DESCRIPTIONS[format]})\nInstructions: ${instructions[format] || 'Claude decides'}`

// Whether the row holds the instructions field; the session's own, so every session starts with it closed
const isEditing = atom({ plugin: 'proposals', key: 'isEditing' } as const, false)

// The format under the band's focus ring, whose description the row shows until it is picked or the ring moves on
const focused = atom({ plugin: 'proposals', key: 'focused' } as const, null as Format | null)

async function pick($: EngineInterface, format: Format) {
  await $.store.set('format', format)
  await update($, isEditing, () => false)
  await update($, focused, () => null)
}

async function saveInstructions($: EngineInterface, format: Format, text: string) {
  const { instructions } = await settingsFrom($)
  await $.store.set('instructions', { ...instructions, [format]: text.trim() })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'proposals',
      description: 'Pick how Claude presents its proposals',
      argumentHint: '[visual|artifact|terminal|default] [instructions] | hide | show',
      immediate: true,
    })
    return next(e)
  })

  on('command.run', { command: 'proposals' }, async ($, e) => {
    const command = parseArgs(e.args)
    const settings = await settingsFrom($)
    switch (command.kind) {
      case 'status':
        return { text: `${summary(settings)}\n\n${USAGE}` }
      case 'hide':
        await $.store.set('isHidden', true)
        return {
          text: `Proposals row hidden in every session. The format stays ${settings.format}. /proposals show brings the row back.`,
        }
      case 'show':
        await $.store.set('isHidden', false)
        return { text: 'Proposals row shown.' }
      case 'unknown':
        return { text: `"${command.word}" is not a format.\n\n${USAGE}` }
      case 'set':
        await pick($, command.format)
        if (command.instructions !== undefined) await saveInstructions($, command.format, command.instructions)
        return { text: summary(await settingsFrom($)) }
    }
  })

  on('ui.focus', async ($, e, next) => {
    if (e.component === 'AbovePrompt') {
      const format = e.plugin === 'proposals' ? e.element?.replace(/^format-/, '') : undefined
      await update($, focused, () => (isFormat(format) ? format : null))
    }
    return next(e)
  })

  // The band reports no loss of the keyboard, so a sent prompt is what takes the description away
  on('prompt.submit', async ($, e, next) => {
    await update($, focused, () => null)
    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const { format, instructions } = await settingsFrom($)
    const text = ruleFor(format, instructions[format] ?? '')
    if (!text) return composed
    return { sections: [...composed.sections, { id: 'proposals:rule', text, scope: 'session' as const }] }
  })

  // The rule alone does not stop Claude from drawing mockups in a question's previews; this refuses such a question.
  // A guard that fails lets the question through: a broken guard must not block every question.
  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    const deny = refusalFor((await settingsFrom($)).format, e.questions)
    return deny ? { deny } : next(e)
  }).catch(($, e, next) => next(e))

  // Above the prompt: the formats, then the active one's instructions, empty leaving the details to Claude
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const settings = await settingsFrom($)
    const theirs = await next(e)
    if (settings.isHidden) return theirs

    const { format } = settings
    const own = settings.instructions[format] ?? ''
    const isEditingNow = await read($, isEditing)
    const hint = await read($, focused)
    const elements = $.ui.resolve(e)
    const { Box, Button, Text } = elements
    const Input = 'Input' in elements ? elements.Input : undefined

    const formats = (
      <Box flexDirection="row" columnGap={2}>
        <Text dimColor>{'Proposals'.padEnd(12)}</Text>
        {FORMATS.map(each => (
          <Button key={`format-${each}`} plain dimColor={each !== format} onPress={() => pick($, each)}>
            {each === format ? (
              <Text color={MAUVE} bold>
                {`● ${each}`}
              </Text>
            ) : (
              `○ ${each}`
            )}
          </Button>
        ))}
        {hint ? <Text dimColor>{DESCRIPTIONS[hint]}</Text> : null}
      </Box>
    )

    const label = <Text dimColor>{'Instructions'.padEnd(12)}</Text>
    const instructions =
      format === 'default' ? (
        <Box flexDirection="row" columnGap={2}>
          {label}
          <Text dimColor>mod off, no rule sent to Claude</Text>
        </Box>
      ) : isEditingNow && Input ? (
        <Box flexDirection="row" columnGap={2}>
          {label}
          <Input
            key="instructions"
            value={own}
            placeholder="empty = Claude decides"
            submitLabel="save"
            autoFocus
            onSubmit={async (text: string) => {
              await saveInstructions($, format, text)
              await update($, isEditing, () => false)
            }}
          />
        </Box>
      ) : (
        <Box flexDirection="row" columnGap={2}>
          {label}
          {own ? (
            <Text>{own}</Text>
          ) : (
            <Text dimColor italic>
              Claude decides
            </Text>
          )}
          <Button
            key="edit"
            hotkey="e"
            plain
            dimColor
            onPress={async () => {
              await update($, isEditing, () => true)
              // Moving the ring is a convenience: where it cannot move, the field is still there to click
              await $.ui.focus({ requestId: e.requestId, key: 'instructions' }).catch(() => undefined)
            }}
          >
            edit
          </Button>
        </Box>
      )

    const row = (
      <Box flexDirection="column">
        {formats}
        {instructions}
      </Box>
    )
    return theirs ? (
      <Box flexDirection="column">
        {theirs}
        {row}
      </Box>
    ) : (
      row
    )
  })
}
