export type Editing = boolean
export type Focused = 'visual' | 'artifact' | 'terminal' | 'default' | null

declare module 'claude-code' {
  interface PluginState {
    proposals: { isEditing: Editing; focused: Focused }
  }
}
