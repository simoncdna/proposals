/**
 * The formats a person picks for how Claude presents its proposals, the rule each one sends Claude, and the guard
 * that holds Claude to it when it asks a question with previews.
 */

export const FORMATS = ['visual', 'artifact', 'terminal', 'default'] as const
export type Format = (typeof FORMATS)[number]

export const DESCRIPTIONS: Record<Format, string> = {
  visual: 'visuals → artifact, choices → terminal',
  artifact: 'every proposal → artifact',
  terminal: 'everything in the terminal',
  default: 'Claude as usual',
}

export const isFormat = (value: unknown): value is Format => FORMATS.includes(value as Format)

export type Settings = {
  format: Format
  instructions: Partial<Record<Format, string>>
  isHidden: boolean
}

/** Settings from what the store holds, each value the store lacks or holds malformed taken from the defaults. */
export const settingsOf = (format: unknown, instructions: unknown, isHidden: unknown): Settings => ({
  format: isFormat(format) ? format : 'visual',
  instructions:
    typeof instructions === 'object' && instructions !== null
      ? Object.fromEntries(
          Object.entries(instructions).filter(([key, text]) => isFormat(key) && typeof text === 'string'),
        )
      : {},
  isHidden: isHidden === true,
})

const HEADER = `# How to present proposals
The person chose how you present proposals: options, designs, plans or comparisons you offer them to choose from or react to. Follow this over any default habit, including a tool description that suggests ASCII mockups in AskUserQuestion previews.`

const RULES: Record<Exclude<Format, 'default'>, string> = {
  visual: `- Anything visual (interface mockups, screen layouts, design variants, palettes, logos): publish it in an artifact with the variants side by side, then ask for the choice with AskUserQuestion, its options in text only, no preview. Never draw a mockup in the terminal, in a reply or in a preview.
- A choice that is not visual (an approach, a library, a scope, wording): ask it in the terminal with AskUserQuestion.`,
  artifact: `- Every proposal with options, visual or not: publish an artifact that lays the options out, then ask for the choice with AskUserQuestion, its options in text only, no preview. Never draw a mockup in the terminal.`,
  terminal: `- Keep every proposal in the terminal: ask with AskUserQuestion, and show visual options as ASCII mockups in its previews. Publish an artifact for a proposal only when the person asks for one.`,
}

/**
 * The system prompt section for `format`, or `undefined` for `default`, which leaves Claude as it is.
 * Empty `instructions` add nothing, leaving the layout and style of each proposal to Claude.
 */
export const ruleFor = (format: Format, instructions: string): string | undefined => {
  if (format === 'default') return undefined
  const own = instructions ? `\nThe person's own instructions for presenting proposals, to follow: ${instructions}` : ''
  return `${HEADER}\n${RULES[format]}${own}`
}

// A preview that draws an interface: a box-drawing top-right corner, or an ASCII frame edge such as +----+.
// A directory tree (├── └──) has neither, so it passes.
const MOCKUP = /[┐╮╗]|\+[-=]{3,}\+/

type Question = { options: ReadonlyArray<{ preview?: string }> }

/**
 * The refusal Claude reads when its question breaks the format's rule, or `undefined` when it may be asked:
 * `visual` refuses a preview that draws an interface, `artifact` refuses any preview.
 */
export const refusalFor = (format: Format, questions: readonly Question[]): string | undefined => {
  const previews = questions.flatMap(question => question.options.map(option => option.preview ?? '')).filter(Boolean)
  const isBreaking =
    format === 'artifact' ? previews.length > 0 : format === 'visual' && previews.some(preview => MOCKUP.test(preview))
  if (!isBreaking) return undefined
  const what = format === 'artifact' ? 'options are not previewed in the terminal' : 'mockups are not drawn in the terminal'
  return `The person chose the "${format}" format for proposals, so ${what}. Publish the options in an artifact, then ask again with text-only options and no preview.`
}

export type Command =
  | { kind: 'status' }
  | { kind: 'hide' }
  | { kind: 'show' }
  | { kind: 'set'; format: Format; instructions?: string }
  | { kind: 'unknown'; word: string }

/**
 * Reads what follows `/proposals`. After a format, `-` clears its instructions, other text replaces them, and
 * nothing keeps them.
 */
export const parseArgs = (args: string): Command => {
  const text = args.trim()
  if (!text) return { kind: 'status' }
  const space = text.search(/\s/)
  const word = (space < 0 ? text : text.slice(0, space)).toLowerCase()
  const rest = space < 0 ? '' : text.slice(space).trim()
  if (word === 'hide' || word === 'show') return { kind: word }
  if (!isFormat(word)) return { kind: 'unknown', word }
  if (!rest) return { kind: 'set', format: word }
  return { kind: 'set', format: word, instructions: rest === '-' ? '' : rest }
}

export const USAGE = `/proposals                          the format and its instructions
/proposals <format> [instructions]  pick a format; - clears its instructions
/proposals hide | show              hide or show the row above the prompt
Formats: ${FORMATS.join(' · ')}`
